"""Atlas LIVE proxy routes.

Alpha contract:
Atlas Viewer UI -> noetic-compass-api -> private RunPod live-trace worker.

The browser never receives the RunPod URL. Session creation is gated by an
invite-code allowlist and lightweight in-memory abuse limits. The SSE route
uses a short-lived stream token because EventSource cannot send custom headers.
"""

from __future__ import annotations

import asyncio
from collections import OrderedDict, defaultdict, deque
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
import ipaddress
import os
import secrets
import threading
import time
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from api.config import settings
from api.services.atlas_live_worker_auth import atlas_worker_auth_headers
from api.services.atlas_live_worker_config import (
    WORKER_CONFIG_NOT_CONFIGURED,
    atlas_worker_target,
)


router = APIRouter(prefix="/atlas/live", tags=["atlas_live"])

INVITE_HEADER = "X-Atlas-Invite-Code"
_IP_WINDOW_SECONDS = 60 * 60
_CODE_WINDOW_SECONDS = 24 * 60 * 60
_MAX_TRACKED_IPS = 4096
_MAX_TRACKED_CODES = 1024
_MAX_STREAM_TOKENS = 4096
_DEFAULT_MAX_STREAM_SECONDS = 120.0

_LOCK = threading.Lock()
_ip_opens: dict[str, deque[tuple[float, str]]] = defaultdict(deque)
_code_opens: dict[str, deque[tuple[float, str]]] = defaultdict(deque)
# Maps jti -> (session_id, expires_at_unix, consumed)
_STREAM_TOKENS: OrderedDict[str, tuple[str, float, bool]] = OrderedDict()


class LiveSessionRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4096)
    model_id: str = Field(default="EleutherAI/pythia-160m")
    max_new_tokens: int = Field(default=24, ge=1, le=128)
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    seed: int | None = None
    probes: list[
        Literal[
            "active_trace",
            "blindspot_covers",
            # Legacy alias accepted for older SPA builds.
            "blindspots_f1",
            "mode7_attribution",
            "confidence_margin",
        ]
    ] = Field(default_factory=list)
    method_config: dict[str, Any] = Field(default_factory=dict)


class LiveSessionResponse(BaseModel):
    session_id: str
    mode: Literal["live"] = "live"
    model_id: str
    stream_url: str
    stream_token: str


def _allowed_codes() -> set[str]:
    return {
        code.strip()
        for code in settings.atlas_live_invite_codes.split(",")
        if code.strip()
    }


def _configured_trusted_proxies() -> list[str]:
    raw = (
        os.environ.get("ATLAS_LIVE_TRUSTED_PROXIES")
        or os.environ.get("NC_TRUSTED_PROXIES")
        or str(getattr(settings, "trusted_proxies", "") or "")
    )
    return [entry.strip() for entry in raw.split(",") if entry.strip()]


def _is_trusted_proxy(host: str) -> bool:
    candidate = host.strip()
    if not candidate:
        return False
    configured = _configured_trusted_proxies()
    if configured:
        for entry in configured:
            if entry == candidate:
                return True
            try:
                net = ipaddress.ip_network(entry, strict=False)
                if ipaddress.ip_address(candidate) in net:
                    return True
            except ValueError:
                continue
        return False
    # Without an explicit proxy allowlist, trust X-Forwarded-For only from
    # loopback proxies (127.0.0.1 / ::1), never from untrusted direct peers.
    try:
        return ipaddress.ip_address(candidate).is_loopback
    except ValueError:
        return False


def _client_ip(request: Request) -> str:
    peer = (request.client.host if request.client and request.client.host else "").strip()
    if not peer:
        return "unknown"
    if not _is_trusted_proxy(peer):
        return peer
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if not forwarded_for:
        return peer
    hops = [part.strip() for part in forwarded_for.split(",") if part.strip()]
    if not hops:
        return peer
    # Walk right-to-left and pick the rightmost hop not belonging to a trusted
    # proxy so attacker-supplied leftmost XFF entries cannot spoof client IP.
    for hop in reversed(hops):
        if not _is_trusted_proxy(hop):
            return hop
    return hops[0]


def _trim_window(bucket: deque[tuple[float, str]], now: float, seconds: int) -> None:
    while bucket and now - bucket[0][0] > seconds:
        bucket.popleft()


def _prune_tracked_store_locked(
    store: dict[str, deque[tuple[float, str]]],
    now: float,
    window_seconds: int,
    max_keys: int,
    keep_key: str,
) -> None:
    if len(store) < max_keys:
        return
    empty_keys: list[str] = []
    for key, bucket in list(store.items()):
        _trim_window(bucket, now, window_seconds)
        if not bucket and key != keep_key:
            empty_keys.append(key)
    for key in empty_keys:
        store.pop(key, None)

    if len(store) >= max_keys:
        evictable = [
            (bucket[-1][0] if bucket else 0.0, key)
            for key, bucket in store.items()
            if key != keep_key
        ]
        evictable.sort(key=lambda item: item[0])
        to_remove = len(store) - max_keys + 1
        for _, key in evictable[: max(0, to_remove)]:
            store.pop(key, None)


def _check_invite(code: str | None) -> str:
    if not code:
        raise HTTPException(status_code=401, detail="Missing Atlas LIVE invite code")
    allowed = _allowed_codes()
    if not allowed:
        raise HTTPException(status_code=503, detail="Atlas LIVE invite allowlist is not configured")
    if code not in allowed:
        raise HTTPException(status_code=403, detail="Invalid Atlas LIVE invite code")
    return code


def _reserve_abuse_slot(ip: str, code: str) -> str:
    """Atomically verify quotas and reserve one session slot under lock."""
    reservation_id = secrets.token_urlsafe(16)
    with _LOCK:
        now = time.time()

        ip_bucket = _ip_opens.get(ip)
        if ip_bucket is not None:
            _trim_window(ip_bucket, now, _IP_WINDOW_SECONDS)
            if not ip_bucket:
                _ip_opens.pop(ip, None)
                ip_bucket = None
        if ip_bucket is not None and len(ip_bucket) >= settings.atlas_live_session_rate_limit_per_ip_hour:
            raise HTTPException(status_code=429, detail="Atlas LIVE per-IP session limit exceeded")

        code_bucket = _code_opens.get(code)
        if code_bucket is not None:
            _trim_window(code_bucket, now, _CODE_WINDOW_SECONDS)
            if not code_bucket:
                _code_opens.pop(code, None)
                code_bucket = None
        if code_bucket is not None and len(code_bucket) >= settings.atlas_live_invite_daily_limit:
            raise HTTPException(status_code=429, detail="Atlas LIVE invite-code daily limit exceeded")

        if ip not in _ip_opens:
            _prune_tracked_store_locked(_ip_opens, now, _IP_WINDOW_SECONDS, _MAX_TRACKED_IPS, ip)
        if code not in _code_opens:
            _prune_tracked_store_locked(_code_opens, now, _CODE_WINDOW_SECONDS, _MAX_TRACKED_CODES, code)

        _ip_opens[ip].append((now, reservation_id))
        _code_opens[code].append((now, reservation_id))
    return reservation_id


def _release_abuse_slot(ip: str, code: str, reservation_id: str) -> None:
    """Release only the specified reservation token after a failed worker open."""
    with _LOCK:
        for store, key in ((_ip_opens, ip), (_code_opens, code)):
            bucket = store.get(key)
            if bucket is None:
                continue
            filtered = deque(entry for entry in bucket if entry[1] != reservation_id)
            if filtered:
                store[key] = filtered
            else:
                store.pop(key, None)


def _worker_base_url() -> str:
    target = atlas_worker_target()
    if target.allowed:
        return target.base_url
    detail = (
        "atlas_live_disabled"
        if target.error == WORKER_CONFIG_NOT_CONFIGURED
        else f"atlas_live_{target.error}"
    )
    raise HTTPException(status_code=503, detail=detail)


def _token_secret() -> str:
    return settings.jwt_secret


def _prune_stream_tokens_locked(now: float) -> None:
    expired = [jti for jti, (_, exp_ts, _) in _STREAM_TOKENS.items() if exp_ts <= now]
    for jti in expired:
        _STREAM_TOKENS.pop(jti, None)
    while len(_STREAM_TOKENS) >= _MAX_STREAM_TOKENS:
        # Prefer evicting already-consumed tokens before oldest unconsumed entries.
        consumed_jti = next(
            (jti for jti, (_, _, consumed) in _STREAM_TOKENS.items() if consumed),
            None,
        )
        if consumed_jti is not None:
            _STREAM_TOKENS.pop(consumed_jti, None)
        else:
            _STREAM_TOKENS.popitem(last=False)


def _create_stream_token(session_id: str) -> str:
    exp = datetime.now(tz=timezone.utc) + timedelta(
        minutes=settings.atlas_live_stream_token_minutes
    )
    jti = secrets.token_urlsafe(24)
    payload = {
        "sub": "atlas-live-stream",
        "sid": session_id,
        "jti": jti,
        "exp": exp,
    }
    token = jwt.encode(payload, _token_secret(), algorithm=settings.jwt_algorithm)
    with _LOCK:
        _prune_stream_tokens_locked(time.time())
        _STREAM_TOKENS[jti] = (session_id, exp.timestamp(), False)
    return token


def _verify_stream_token(session_id: str, token: str | None) -> str:
    """Validate and atomically consume a one-time stream JWT."""
    if not token:
        raise HTTPException(status_code=401, detail="Missing Atlas LIVE stream token")
    try:
        payload = jwt.decode(token, _token_secret(), algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Atlas LIVE stream token: {exc}") from exc
    if payload.get("sub") != "atlas-live-stream":
        raise HTTPException(status_code=403, detail="Invalid Atlas LIVE stream token subject")
    if payload.get("sid") != session_id:
        raise HTTPException(status_code=403, detail="Atlas LIVE stream token does not match session")
    jti = payload.get("jti")
    if not isinstance(jti, str) or not jti:
        raise HTTPException(status_code=403, detail="Atlas LIVE stream token missing jti")

    with _LOCK:
        now = time.time()
        _prune_stream_tokens_locked(now)
        record = _STREAM_TOKENS.get(jti)
        if record is None:
            raise HTTPException(status_code=403, detail="Atlas LIVE stream token is unknown or expired")
        stored_sid, exp_ts, consumed = record
        if stored_sid != session_id:
            raise HTTPException(status_code=403, detail="Atlas LIVE stream token does not match session")
        if consumed:
            raise HTTPException(status_code=409, detail="Atlas LIVE stream token has already been consumed")
        _STREAM_TOKENS[jti] = (stored_sid, exp_ts, True)
        _STREAM_TOKENS.move_to_end(jti)
    return jti


def _max_stream_seconds() -> float:
    raw = os.environ.get("ATLAS_LIVE_MAX_STREAM_SECONDS", "").strip()
    if raw:
        try:
            parsed = float(raw)
            if parsed > 0:
                return parsed
        except ValueError:
            pass
    return _DEFAULT_MAX_STREAM_SECONDS


def _stream_http_timeout() -> httpx.Timeout:
    base = float(settings.atlas_live_http_timeout_seconds)
    connect = min(10.0, base)
    return httpx.Timeout(connect=connect, read=base, write=base, pool=connect)


async def _create_worker_session(req: LiveSessionRequest) -> dict:
    timeout = httpx.Timeout(settings.atlas_live_http_timeout_seconds)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{_worker_base_url()}/sessions",
                json=req.model_dump(),
                headers=atlas_worker_auth_headers(),
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Atlas LIVE worker unreachable",
        ) from exc
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Atlas LIVE worker rejected session: HTTP {resp.status_code}",
        )
    return resp.json()


async def _iter_worker_events(session_id: str) -> AsyncIterator[bytes]:
    deadline = time.monotonic() + _max_stream_seconds()
    timeout = _stream_http_timeout()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "GET",
                f"{_worker_base_url()}/sessions/{session_id}/events",
                headers={
                    "Accept": "text/event-stream",
                    **atlas_worker_auth_headers(),
                },
            ) as resp:
                if resp.status_code >= 400:
                    payload = (
                        '{"type":"error","message":"Atlas LIVE worker stream failed",'
                        '"retryable":false}'
                    )
                    yield f"event: error\ndata: {payload}\n\n".encode()
                    return
                chunk_iter = resp.aiter_bytes()
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        payload = (
                            '{"type":"error","message":"Atlas LIVE stream exceeded maximum duration",'
                            '"retryable":false}'
                        )
                        yield f"event: error\ndata: {payload}\n\n".encode()
                        return
                    try:
                        chunk = await asyncio.wait_for(anext(chunk_iter), timeout=remaining)
                    except StopAsyncIteration:
                        return
                    yield chunk
    except (TimeoutError, asyncio.TimeoutError):
        payload = (
            '{"type":"error","message":"Atlas LIVE worker stream timed out",'
            '"retryable":false}'
        )
        yield f"event: error\ndata: {payload}\n\n".encode()
    except httpx.HTTPError:
        payload = (
            '{"type":"error","message":"Atlas LIVE worker stream connection failed",'
            '"retryable":true}'
        )
        yield f"event: error\ndata: {payload}\n\n".encode()


async def _stream_with_disconnect(
    request: Request,
    source: AsyncIterator[bytes],
) -> AsyncIterator[bytes]:
    """Forward upstream chunks while ensuring client disconnect closes upstream cleanly."""
    try:
        while True:
            if await request.is_disconnected():
                return
            try:
                chunk = await anext(source)
            except StopAsyncIteration:
                return
            if await request.is_disconnected():
                return
            yield chunk
    finally:
        aclose = getattr(source, "aclose", None)
        if callable(aclose):
            await aclose()


async def _proxy_worker_get(path: str) -> dict:
    """Proxy a worker health GET with an operator-readable 503 contract."""
    base = _worker_base_url()

    timeout = httpx.Timeout(settings.atlas_live_http_timeout_seconds)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(f"{base}{path}", headers=atlas_worker_auth_headers())
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503,
            detail="atlas_live_worker_unavailable",
        ) from exc

    if resp.status_code >= 400:
        raise HTTPException(
            status_code=503,
            detail="atlas_live_worker_unavailable",
        )

    try:
        return resp.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=503,
            detail="atlas_live_worker_unavailable",
        ) from exc


@router.get("/health")
async def live_health() -> dict:
    """Proxy worker /health for API-side liveness checks."""
    return await _proxy_worker_get("/health")


@router.get("/health/realmode")
async def live_health_realmode() -> dict:
    """Proxy worker /health/realmode for real Pythia weight verification."""
    return await _proxy_worker_get("/health/realmode")


@router.post("/session", response_model=LiveSessionResponse)
async def create_live_session(
    req: LiveSessionRequest,
    request: Request,
    invite_code: str | None = Header(default=None, alias=INVITE_HEADER),
) -> LiveSessionResponse:
    code = _check_invite(invite_code)
    ip = _client_ip(request)
    reservation_id = _reserve_abuse_slot(ip, code)

    try:
        worker_resp = await _create_worker_session(req)
        session_id = str(worker_resp.get("session_id") or "")
        if not session_id:
            raise HTTPException(status_code=502, detail="Atlas LIVE worker did not return a session_id")
    except BaseException:
        _release_abuse_slot(ip, code, reservation_id)
        raise

    token = _create_stream_token(session_id)
    stream_url = f"/atlas/live/session/{session_id}/events?stream_token={token}"
    return LiveSessionResponse(
        session_id=session_id,
        model_id=req.model_id,
        stream_url=stream_url,
        stream_token=token,
    )


@router.get("/session/{session_id}/events")
async def live_session_events(
    session_id: str,
    request: Request,
    stream_token: str | None = Query(default=None),
) -> StreamingResponse:
    _verify_stream_token(session_id, stream_token)
    return StreamingResponse(
        _stream_with_disconnect(request, _iter_worker_events(session_id)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
