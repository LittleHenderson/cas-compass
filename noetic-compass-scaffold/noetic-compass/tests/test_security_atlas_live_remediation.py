"""Security regression tests for Finding #5 on the Atlas LIVE API proxy.

Covers:
- Atomic quota reservation under synchronized concurrent /atlas/live/session bursts
  (per-IP and per-invite limits cannot be exceeded by racing the worker await).
- Failed worker creation releases ONLY its own reserved slot.
- Bounded in-memory IP/invite tracking dicts.
- Trusted-proxy-only X-Forwarded-For handling (spoofed XFF ignored from untrusted peers).
- Unique jti on stream JWTs, bounded server-side registry, and atomic one-time
  consumption rejecting both sequential and synchronized concurrent replays.
- Finite httpx.Timeout, finite overall stream duration deadline, and clean
  upstream iterator cancellation on client disconnect.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
from jose import jwt
import pytest

from api.main import app
from api.routes import atlas_live


@pytest.fixture(autouse=True)
def _reset_atlas_live_security_state(monkeypatch: pytest.MonkeyPatch) -> None:
    atlas_live._ip_opens.clear()
    atlas_live._code_opens.clear()
    atlas_live._STREAM_TOKENS.clear()
    monkeypatch.delenv("ATLAS_LIVE_TRUSTED_PROXIES", raising=False)
    monkeypatch.delenv("NC_TRUSTED_PROXIES", raising=False)
    monkeypatch.delenv("ATLAS_LIVE_MAX_STREAM_SECONDS", raising=False)
    monkeypatch.setattr(atlas_live.settings, "atlas_live_invite_codes", "alpha-code,beta-code")
    monkeypatch.setattr(atlas_live.settings, "atlas_live_worker_url", "https://worker.example")
    monkeypatch.setattr(atlas_live.settings, "atlas_live_worker_token", "test-worker-secret-0123456789")
    monkeypatch.setattr(atlas_live.settings, "atlas_live_session_rate_limit_per_ip_hour", 3)
    monkeypatch.setattr(atlas_live.settings, "atlas_live_invite_daily_limit", 10)


@pytest.mark.asyncio
async def test_concurrent_burst_cannot_exceed_per_ip_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(atlas_live.settings, "atlas_live_session_rate_limit_per_ip_hour", 2)
    monkeypatch.setattr(atlas_live.settings, "atlas_live_invite_daily_limit", 50)

    entered = 0
    release = asyncio.Event()
    worker_calls = 0

    async def slow_create_worker_session(req):
        nonlocal entered, worker_calls
        worker_calls += 1
        entered += 1
        if entered >= 2:
            release.set()
        await asyncio.wait_for(release.wait(), timeout=2.0)
        return {"session_id": f"sid-{worker_calls}", "events_url": f"/sessions/sid-{worker_calls}/events"}

    monkeypatch.setattr(atlas_live, "_create_worker_session", slow_create_worker_session)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        responses = await asyncio.gather(
            *[
                async_client.post(
                    "/atlas/live/session",
                    headers={"X-Atlas-Invite-Code": "alpha-code"},
                    json={"prompt": f"burst-{idx}"},
                )
                for idx in range(10)
            ]
        )

    statuses = [r.status_code for r in responses]
    assert statuses.count(200) == 2
    assert statuses.count(429) == 8
    assert worker_calls == 2


@pytest.mark.asyncio
async def test_concurrent_burst_cannot_exceed_per_invite_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(atlas_live.settings, "atlas_live_session_rate_limit_per_ip_hour", 50)
    monkeypatch.setattr(atlas_live.settings, "atlas_live_invite_daily_limit", 3)
    monkeypatch.setenv("ATLAS_LIVE_TRUSTED_PROXIES", "127.0.0.1")

    entered = 0
    release = asyncio.Event()
    worker_calls = 0

    async def slow_create_worker_session(req):
        nonlocal entered, worker_calls
        worker_calls += 1
        entered += 1
        if entered >= 3:
            release.set()
        await asyncio.wait_for(release.wait(), timeout=2.0)
        return {"session_id": f"inv-{worker_calls}", "events_url": f"/sessions/inv-{worker_calls}/events"}

    monkeypatch.setattr(atlas_live, "_create_worker_session", slow_create_worker_session)

    transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 12345))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        responses = await asyncio.gather(
            *[
                async_client.post(
                    "/atlas/live/session",
                    headers={
                        "X-Atlas-Invite-Code": "alpha-code",
                        "X-Forwarded-For": f"198.51.100.{idx + 1}",
                    },
                    json={"prompt": f"invite-burst-{idx}"},
                )
                for idx in range(10)
            ]
        )

    statuses = [r.status_code for r in responses]
    assert statuses.count(200) == 3
    assert statuses.count(429) == 7
    assert worker_calls == 3


@pytest.mark.asyncio
async def test_failed_worker_creation_releases_only_its_own_slot(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(atlas_live.settings, "atlas_live_session_rate_limit_per_ip_hour", 2)
    monkeypatch.setattr(atlas_live.settings, "atlas_live_invite_daily_limit", 2)

    async def mixed_worker_session(req):
        if req.prompt == "fail-http":
            raise atlas_live.HTTPException(status_code=502, detail="worker failed")
        if req.prompt == "fail-empty-sid":
            return {"session_id": ""}
        return {"session_id": f"ok-{req.prompt}", "events_url": "/sessions/ok/events"}

    monkeypatch.setattr(atlas_live, "_create_worker_session", mixed_worker_session)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        r_ok1, r_fail1 = await asyncio.gather(
            async_client.post(
                "/atlas/live/session",
                headers={"X-Atlas-Invite-Code": "alpha-code"},
                json={"prompt": "good-1"},
            ),
            async_client.post(
                "/atlas/live/session",
                headers={"X-Atlas-Invite-Code": "alpha-code"},
                json={"prompt": "fail-http"},
            ),
        )
        assert r_ok1.status_code == 200
        assert r_fail1.status_code == 502

        # Empty session_id must also fail with 502 and release its slot.
        r_fail2 = await async_client.post(
            "/atlas/live/session",
            headers={"X-Atlas-Invite-Code": "alpha-code"},
            json={"prompt": "fail-empty-sid"},
        )
        assert r_fail2.status_code == 502

        # Exactly 1 slot remains (good-1 stayed counted, both failures were released).
        r_ok2 = await async_client.post(
            "/atlas/live/session",
            headers={"X-Atlas-Invite-Code": "alpha-code"},
            json={"prompt": "good-2"},
        )
        assert r_ok2.status_code == 200

        r_blocked = await async_client.post(
            "/atlas/live/session",
            headers={"X-Atlas-Invite-Code": "alpha-code"},
            json={"prompt": "good-3"},
        )
        assert r_blocked.status_code == 429


def test_untrusted_x_forwarded_for_cannot_bypass_per_ip_limit(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(atlas_live.settings, "atlas_live_session_rate_limit_per_ip_hour", 2)

    async def fake_create_worker_session(req):
        return {"session_id": "sid-xff", "events_url": "/sessions/sid-xff/events"}

    monkeypatch.setattr(atlas_live, "_create_worker_session", fake_create_worker_session)

    # Direct peer in TestClient is "testclient" (not a trusted proxy):
    # rotating X-Forwarded-For MUST NOT bypass per-IP quota.
    for idx in range(2):
        resp = client.post(
            "/atlas/live/session",
            headers={
                "X-Atlas-Invite-Code": "alpha-code",
                "X-Forwarded-For": f"203.0.113.{idx + 1}",
            },
            json={"prompt": "spoof"},
        )
        assert resp.status_code == 200

    blocked = client.post(
        "/atlas/live/session",
        headers={
            "X-Atlas-Invite-Code": "alpha-code",
            "X-Forwarded-For": "203.0.113.99",
        },
        json={"prompt": "spoof-bypass"},
    )
    assert blocked.status_code == 429


def test_trusted_proxy_uses_rightmost_untrusted_xff_hop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ATLAS_LIVE_TRUSTED_PROXIES", "10.0.0.0/8")

    # Attacker supplies leftmost "1.1.1.1"; trusted proxy appends real client "198.51.100.7".
    req = SimpleNamespace(
        client=SimpleNamespace(host="10.0.1.9"),
        headers={"x-forwarded-for": "1.1.1.1, 198.51.100.7, 10.0.2.4"},
    )
    assert atlas_live._client_ip(req) == "198.51.100.7"

    # Untrusted peer cannot spoof via X-Forwarded-For.
    untrusted_req = SimpleNamespace(
        client=SimpleNamespace(host="198.51.100.50"),
        headers={"x-forwarded-for": "1.1.1.1"},
    )
    assert atlas_live._client_ip(untrusted_req) == "198.51.100.50"


def test_ip_tracking_store_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(atlas_live, "_MAX_TRACKED_IPS", 5)
    monkeypatch.setattr(atlas_live.settings, "atlas_live_invite_daily_limit", 100)

    for idx in range(20):
        atlas_live._reserve_abuse_slot(f"198.51.100.{idx}", "alpha-code")

    assert len(atlas_live._ip_opens) <= 5


@pytest.mark.asyncio
async def test_stream_token_has_unique_jti_and_rejects_concurrent_and_sequential_replays(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stream_calls = 0
    stream_entered = asyncio.Event()
    release_stream = asyncio.Event()

    async def fake_create_worker_session(req):
        return {"session_id": "worker-sid-replay", "events_url": "/sessions/worker-sid-replay/events"}

    async def slow_iter_worker_events(session_id):
        nonlocal stream_calls
        stream_calls += 1
        stream_entered.set()
        await asyncio.wait_for(release_stream.wait(), timeout=2.0)
        yield b'event: complete\ndata: {"type":"complete","total_tokens":1}\n\n'

    monkeypatch.setattr(atlas_live, "_create_worker_session", fake_create_worker_session)
    monkeypatch.setattr(atlas_live, "_iter_worker_events", slow_iter_worker_events)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        create_resp = await async_client.post(
            "/atlas/live/session",
            headers={"X-Atlas-Invite-Code": "alpha-code"},
            json={"prompt": "one-time token"},
        )
        assert create_resp.status_code == 200
        body = create_resp.json()
        token = body["stream_token"]
        stream_url = body["stream_url"]

        claims = jwt.decode(
            token,
            atlas_live._token_secret(),
            algorithms=[atlas_live.settings.jwt_algorithm],
        )
        assert claims["sub"] == "atlas-live-stream"
        assert claims["sid"] == "worker-sid-replay"
        assert isinstance(claims.get("jti"), str) and len(claims["jti"]) >= 16

        async def _open_stream():
            async with async_client.stream("GET", stream_url) as resp:
                data = await resp.aread()
                return resp.status_code, data

        # Fire 6 concurrent requests with the exact same stream token.
        tasks = [asyncio.create_task(_open_stream()) for _ in range(6)]
        await asyncio.wait_for(stream_entered.wait(), timeout=2.0)
        release_stream.set()
        results = await asyncio.gather(*tasks)

        statuses = [status for status, _ in results]
        assert statuses.count(200) == 1
        assert statuses.count(409) == 5
        assert stream_calls == 1

        # Subsequent sequential replay MUST also be rejected with 409.
        replay = await async_client.get(stream_url)
        assert replay.status_code == 409
        assert stream_calls == 1


def test_stream_token_without_jti_or_unregistered_jti_rejected(client) -> None:
    exp = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
    no_jti_token = jwt.encode(
        {"sub": "atlas-live-stream", "sid": "sid-forged", "exp": exp},
        atlas_live._token_secret(),
        algorithm=atlas_live.settings.jwt_algorithm,
    )
    resp_no_jti = client.get(f"/atlas/live/session/sid-forged/events?stream_token={no_jti_token}")
    assert resp_no_jti.status_code == 403

    unknown_jti_token = jwt.encode(
        {"sub": "atlas-live-stream", "sid": "sid-forged", "jti": "never-issued-jti", "exp": exp},
        atlas_live._token_secret(),
        algorithm=atlas_live.settings.jwt_algorithm,
    )
    resp_unknown = client.get(f"/atlas/live/session/sid-forged/events?stream_token={unknown_jti_token}")
    assert resp_unknown.status_code == 403


@pytest.mark.asyncio
async def test_worker_stream_uses_finite_timeout_and_enforces_overall_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class _SlowStreamResponse:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            captured["stream_closed"] = True
            return False

        async def aiter_bytes(self):
            yield b"event: manifest\ndata: {}\n\n"
            await asyncio.sleep(5.0)
            yield b"event: token\ndata: {}\n\n"

    class _FakeAsyncClient:
        def __init__(self, *args, timeout=None, **kwargs):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            captured["client_closed"] = True
            return False

        def stream(self, method, url, **kwargs):
            return _SlowStreamResponse()

    monkeypatch.setattr(atlas_live.httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setenv("ATLAS_LIVE_MAX_STREAM_SECONDS", "0.05")

    chunks = [chunk async for chunk in atlas_live._iter_worker_events("sid-timeout")]

    timeout = captured["timeout"]
    assert isinstance(timeout, httpx.Timeout)
    assert timeout.connect is not None and timeout.connect > 0
    assert timeout.read is not None and timeout.read > 0
    assert timeout.write is not None and timeout.write > 0
    assert captured.get("stream_closed") is True
    assert captured.get("client_closed") is True
    combined = b"".join(chunks).decode("utf-8")
    assert "event: error" in combined
    assert "timed out" in combined or "maximum duration" in combined


@pytest.mark.asyncio
async def test_client_disconnect_closes_upstream_iterator_cleanly() -> None:
    closed = False

    async def upstream():
        nonlocal closed
        try:
            yield b"chunk-1"
            yield b"chunk-2"
            yield b"chunk-3"
        finally:
            closed = True

    calls = 0

    class _DisconnectingRequest:
        async def is_disconnected(self) -> bool:
            nonlocal calls
            calls += 1
            # Connected for chunk-1, disconnected thereafter.
            return calls >= 3

    received = [
        chunk
        async for chunk in atlas_live._stream_with_disconnect(_DisconnectingRequest(), upstream())
    ]

    assert received == [b"chunk-1"]
    assert closed is True
