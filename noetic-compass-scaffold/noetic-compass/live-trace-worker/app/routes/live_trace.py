"""Live-trace session endpoints.

POST /sessions                  -> create session, returns id + events URL
GET  /sessions/{id}/events      -> SSE stream of LiveTraceEvent payloads
GET  /sessions/{id}/manifest    -> snapshot manifest (no streaming)
POST /sessions/dump             -> debug helper, returns full event list JSON

The dispatcher in runtime.event_stream.stream_trace picks real vs fake
based on whether get_loaded_model().is_real. Routes here don't care.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
import threading
import time
import uuid
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..runtime import get_loaded_model, get_manifest, stream_trace
from ..runtime.billing_receipt import (
    WorkerBillingReceiptConfig,
    WorkerBillingReceiptError,
    begin_cuda_measurement,
    finish_cuda_measurement_receipt,
)
from ..runtime.event_stream import (
    release_generation_slot,
    reset_generation_slots_for_test,
    try_acquire_generation_slot,
)
from ..schemas.requests import CreateSessionRequest, CreateSessionResponse

router = APIRouter()

MAX_SESSIONS = 64
SESSION_TTL_SECONDS = 300.0
MAX_SESSIONS_ENV = "ATLAS_WORKER_MAX_SESSIONS"
SESSION_TTL_SECONDS_ENV = "ATLAS_WORKER_SESSION_TTL_SECONDS"


@dataclass
class _SessionEntry:
    req: CreateSessionRequest
    created_at: float
    consumed: bool = False


_SESSIONS_LOCK = threading.Lock()
_SESSIONS: dict[str, _SessionEntry] = {}


def _max_sessions() -> int:
    raw = os.environ.get(MAX_SESSIONS_ENV, "").strip()
    if raw:
        try:
            parsed = int(raw)
            if parsed >= 1:
                return parsed
        except ValueError:
            pass
    return MAX_SESSIONS


def _session_ttl_seconds() -> float:
    raw = os.environ.get(SESSION_TTL_SECONDS_ENV, "").strip()
    if raw:
        try:
            parsed = float(raw)
            if parsed > 0:
                return parsed
        except ValueError:
            pass
    return SESSION_TTL_SECONDS


def _prune_expired_sessions_locked(now: float) -> None:
    ttl = _session_ttl_seconds()
    stale_consumed_ttl = max(600.0, ttl * 2.0)
    expired = [
        sid
        for sid, entry in _SESSIONS.items()
        if (not entry.consumed and (now - entry.created_at) >= ttl)
        or (entry.consumed and (now - entry.created_at) >= stale_consumed_ttl)
    ]
    for sid in expired:
        _SESSIONS.pop(sid, None)


def _remove_session(session_id: str) -> None:
    with _SESSIONS_LOCK:
        _SESSIONS.pop(session_id, None)


def reset_sessions_for_test() -> None:
    """Test helper: clear in-memory session state and concurrency counters."""
    with _SESSIONS_LOCK:
        _SESSIONS.clear()
    reset_generation_slots_for_test()


@router.post("/sessions", response_model=CreateSessionResponse)
def create_session(req: CreateSessionRequest) -> CreateSessionResponse:
    try:
        get_manifest(req.model_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with _SESSIONS_LOCK:
        now = time.monotonic()
        _prune_expired_sessions_locked(now)
        if len(_SESSIONS) >= _max_sessions():
            raise HTTPException(
                status_code=429,
                detail="Worker session capacity exceeded",
            )
        session_id = str(uuid.uuid4())
        _SESSIONS[session_id] = _SessionEntry(
            req=req,
            created_at=now,
            consumed=False,
        )
    return CreateSessionResponse(
        session_id=session_id,
        events_url=f"/sessions/{session_id}/events",
    )


@router.get("/sessions/{session_id}/manifest")
def session_manifest(session_id: str) -> dict:
    with _SESSIONS_LOCK:
        _prune_expired_sessions_locked(time.monotonic())
        entry = _SESSIONS.get(session_id)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"session {session_id} not found")
        model_id = entry.req.model_id
    return get_manifest(model_id).model_dump()


async def _sse_iter(
    session_id: str,
    req: CreateSessionRequest,
    request: Request | None = None,
) -> AsyncIterator[bytes]:
    try:
        async for event in stream_trace(req, _slot_already_acquired=True):
            if request is not None and await request.is_disconnected():
                break
            payload = event.model_dump_json()
            yield f"event: {event.type}\ndata: {payload}\n\n".encode()
    finally:
        _remove_session(session_id)
        release_generation_slot()


@router.get("/sessions/{session_id}/events")
async def session_events(session_id: str, request: Request) -> StreamingResponse:
    with _SESSIONS_LOCK:
        _prune_expired_sessions_locked(time.monotonic())
        entry = _SESSIONS.get(session_id)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"session {session_id} not found")
        if entry.consumed:
            raise HTTPException(
                status_code=409,
                detail=f"session {session_id} has already been consumed",
            )
        if not try_acquire_generation_slot():
            raise HTTPException(
                status_code=503,
                detail="Worker concurrent stream capacity exceeded",
            )
        entry.consumed = True
        req = entry.req

    return StreamingResponse(
        _sse_iter(session_id, req, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sessions/dump")
async def dump_session(req: CreateSessionRequest) -> dict:
    """Non-SSE one-shot dump. Used by tests + curl checks."""
    try:
        get_manifest(req.model_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not try_acquire_generation_slot():
        raise HTTPException(
            status_code=503,
            detail="Worker concurrent stream capacity exceeded",
        )

    try:
        measurement_clock = None
        receipt_config = None
        if req.billing_measurement_context is not None:
            try:
                receipt_config = WorkerBillingReceiptConfig.from_environment()
                measurement_clock = begin_cuda_measurement(get_loaded_model())
            except WorkerBillingReceiptError as exc:
                raise HTTPException(
                    status_code=503,
                    detail="Trusted CUDA usage measurement is unavailable.",
                ) from exc

        events: list[dict] = []
        async for event in stream_trace(req, _slot_already_acquired=True):
            events.append(json.loads(event.model_dump_json()))
        response: dict[str, object] = {"events": events}
        if measurement_clock is not None and receipt_config is not None:
            try:
                response["billing_measurement_receipt"] = (
                    finish_cuda_measurement_receipt(
                        measurement_clock,
                        loaded_model=get_loaded_model(),
                        context=req.billing_measurement_context.model_dump(),
                        config=receipt_config,
                    )
                )
            except WorkerBillingReceiptError as exc:
                raise HTTPException(
                    status_code=503,
                    detail="Trusted CUDA usage measurement is unavailable.",
                ) from exc
        return response
    finally:
        release_generation_slot()
