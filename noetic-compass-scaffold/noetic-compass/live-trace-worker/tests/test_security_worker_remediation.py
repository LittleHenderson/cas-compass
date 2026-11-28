"""Security regression tests for Findings #5 and #7 in live-trace-worker.

Covers:
- Finding #7: Fail-closed default auth when ATLAS_LIVE_WORKER_TOKEN is missing/blank/short,
  explicit loopback-only fake-mode dev opt-in, startup validation refusing real-mode or
  non-loopback tokenless launch, /health and /health/realmode readiness reporting (503
  when production auth is inactive), and RunPod start script fail-closed guard.
- Finding #5: Bounded worker _SESSIONS capacity and TTL expiry, atomic single-consumer
  SSE session consumption rejecting concurrent (409) and post-completion (404) replays,
  guaranteed removal in finally, and global generation concurrency semaphore enforcement.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import subprocess
import time

from fastapi.testclient import TestClient
import httpx
import pytest

from app.auth import (
    INSECURE_LOCAL_DEV_ENV,
    USE_FAKE_ENV,
    WORKER_HOST_ENV,
    WORKER_TOKEN_ENV,
    WORKER_TOKEN_HEADER,
    validate_startup_auth_config,
)
from app.main import create_app
from app.routes import live_trace
from app.runtime import event_stream, model_loader
from app.schemas.events import CompleteEvent, ManifestEvent

_VALID_TOKEN = "worker-prod-token-0123456789abcdef"
_SESSION_BODY = {"prompt": "Security remediation check.", "seed": 42, "max_new_tokens": 2}
_RUNPOD_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "runpod_start_atlas_live_worker.sh"


# ---------------------------------------------------------------------------
# Finding #7 — Fail-closed worker authentication & startup/health checks
# ---------------------------------------------------------------------------


def test_all_non_health_routes_fail_closed_when_token_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(WORKER_TOKEN_ENV, raising=False)
    monkeypatch.delenv(INSECURE_LOCAL_DEV_ENV, raising=False)
    client = TestClient(create_app())

    assert client.post("/sessions", json=_SESSION_BODY).status_code == 503
    assert client.post("/sessions/dump", json=_SESSION_BODY).status_code == 503
    assert client.get("/sessions/any-id/manifest").status_code == 503
    assert client.get("/sessions/any-id/events").status_code == 503


def test_short_worker_token_rejected_at_runtime_and_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(WORKER_TOKEN_ENV, "too-short")
    monkeypatch.delenv(INSECURE_LOCAL_DEV_ENV, raising=False)

    with pytest.raises(RuntimeError, match="at least 16 characters"):
        validate_startup_auth_config(host="127.0.0.1")

    client = TestClient(create_app())
    r = client.post(
        "/sessions",
        json=_SESSION_BODY,
        headers={WORKER_TOKEN_HEADER: "too-short"},
    )
    assert r.status_code == 503


def test_startup_validation_refuses_real_mode_without_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(WORKER_TOKEN_ENV, raising=False)
    monkeypatch.setenv(USE_FAKE_ENV, "0")
    monkeypatch.setenv(INSECURE_LOCAL_DEV_ENV, "1")
    monkeypatch.setenv(WORKER_HOST_ENV, "127.0.0.1")

    with pytest.raises(RuntimeError, match="real-model mode"):
        validate_startup_auth_config(host="127.0.0.1")

    # Lifespan must also fail startup with RuntimeError (nonzero uvicorn exit).
    with pytest.raises(RuntimeError):
        with TestClient(create_app()):
            pass


def test_startup_validation_refuses_non_loopback_without_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(WORKER_TOKEN_ENV, raising=False)
    monkeypatch.setenv(USE_FAKE_ENV, "1")
    monkeypatch.setenv(INSECURE_LOCAL_DEV_ENV, "1")

    with pytest.raises(RuntimeError, match="non-loopback"):
        validate_startup_auth_config(host="0.0.0.0")

    monkeypatch.setenv(WORKER_HOST_ENV, "0.0.0.0")
    with pytest.raises(RuntimeError, match="non-loopback"):
        with TestClient(create_app()):
            pass


def test_startup_validation_allows_explicit_loopback_fake_local_dev(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(WORKER_TOKEN_ENV, raising=False)
    monkeypatch.setenv(INSECURE_LOCAL_DEV_ENV, "1")
    monkeypatch.setenv(USE_FAKE_ENV, "1")
    monkeypatch.setenv(WORKER_HOST_ENV, "127.0.0.1")

    validate_startup_auth_config(host="127.0.0.1")
    validate_startup_auth_config(host="localhost")
    validate_startup_auth_config(host="::1")

    with TestClient(create_app()) as local_client:
        resp = local_client.post("/sessions", json=_SESSION_BODY)
        assert resp.status_code == 200


def test_health_and_realmode_report_auth_configured_and_fail_closed_without_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(WORKER_TOKEN_ENV, raising=False)
    monkeypatch.delenv(INSECURE_LOCAL_DEV_ENV, raising=False)
    monkeypatch.delenv("LIVE_TRACE_DEMO_MODE", raising=False)
    monkeypatch.delenv(USE_FAKE_ENV, raising=False)

    # Even if real weights are loaded, missing production auth must mark ready=False
    # and return HTTP 503 on /health/realmode.
    real_manifest = model_loader.PYTHIA_160M_MANIFEST.model_copy(update={"is_real_model": True})
    monkeypatch.setattr(
        model_loader,
        "_LOADED",
        model_loader.LoadedModel(manifest=real_manifest, model=object(), tokenizer=object()),
    )

    client = TestClient(create_app())
    h = client.get("/health")
    assert h.status_code == 200
    h_body = h.json()
    assert h_body["auth_configured"] is False
    assert h_body["ready"] is False

    rm = client.get("/health/realmode")
    assert rm.status_code == 503
    rm_body = rm.json()
    assert rm_body["auth_configured"] is False
    assert rm_body["ready"] is False
    assert rm_body["verdict"] == "NOT_REAL_PYTHIA_WEIGHTS"

    # Once a valid token is configured, both /health and /health/realmode report ready=True.
    monkeypatch.setenv(WORKER_TOKEN_ENV, _VALID_TOKEN)
    h_ok = client.get("/health")
    assert h_ok.status_code == 200
    assert h_ok.json()["auth_configured"] is True
    assert h_ok.json()["ready"] is True

    rm_ok = client.get("/health/realmode")
    assert rm_ok.status_code == 200
    assert rm_ok.json()["auth_configured"] is True
    assert rm_ok.json()["ready"] is True
    assert rm_ok.json()["verdict"] == "REAL_PYTHIA_WEIGHTS_LOADED"


def test_runpod_start_script_fails_closed_without_strong_token(tmp_path: Path) -> None:
    env_missing = {
        "PATH": "/usr/bin:/bin",
        "ATLAS_LIVE_RUN_DIR": str(tmp_path / "run-missing"),
    }
    res_missing = subprocess.run(
        ["bash", str(_RUNPOD_SCRIPT)],
        env=env_missing,
        capture_output=True,
        text=True,
        check=False,
    )
    assert res_missing.returncode != 0
    assert "ATLAS_LIVE_WORKER_TOKEN" in res_missing.stderr

    env_short = {
        "PATH": "/usr/bin:/bin",
        "ATLAS_LIVE_RUN_DIR": str(tmp_path / "run-short"),
        "ATLAS_LIVE_WORKER_TOKEN": "short-token-only-22chr",
    }
    res_short = subprocess.run(
        ["bash", str(_RUNPOD_SCRIPT)],
        env=env_short,
        capture_output=True,
        text=True,
        check=False,
    )
    assert res_short.returncode != 0
    assert "ATLAS_LIVE_WORKER_TOKEN" in res_short.stderr


# ---------------------------------------------------------------------------
# Finding #5 — Bounded single-use sessions & global concurrency semaphore
# ---------------------------------------------------------------------------


def test_worker_session_capacity_limit_enforced(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(live_trace.MAX_SESSIONS_ENV, "3")

    created_ids = []
    for idx in range(3):
        r = client.post("/sessions", json={"prompt": f"cap-{idx}", "seed": idx})
        assert r.status_code == 200
        created_ids.append(r.json()["session_id"])

    overflow = client.post("/sessions", json={"prompt": "cap-overflow", "seed": 99})
    assert overflow.status_code == 429
    assert len(live_trace._SESSIONS) == 3


def test_worker_session_ttl_prunes_expired_sessions(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(live_trace.MAX_SESSIONS_ENV, "1")
    monkeypatch.setenv(live_trace.SESSION_TTL_SECONDS_ENV, "0.05")

    r1 = client.post("/sessions", json=_SESSION_BODY)
    assert r1.status_code == 200
    sid1 = r1.json()["session_id"]

    # Immediately saturated while unexpired.
    assert client.post("/sessions", json=_SESSION_BODY).status_code == 429

    time.sleep(0.08)

    # Expired session is rejected on access and pruned on new creation.
    assert client.get(f"/sessions/{sid1}/events").status_code == 404
    r2 = client.post("/sessions", json=_SESSION_BODY)
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_worker_session_is_single_use_and_removed_after_completion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(WORKER_TOKEN_ENV, _VALID_TOKEN)
    app = create_app()

    stream_started = asyncio.Event()
    release_stream = asyncio.Event()
    stream_calls = 0

    async def slow_stream_trace(req, *, _slot_already_acquired=False):
        nonlocal stream_calls
        stream_calls += 1
        stream_started.set()
        await asyncio.wait_for(release_stream.wait(), timeout=2.0)
        yield ManifestEvent(manifest=model_loader.PYTHIA_160M_MANIFEST)
        yield CompleteEvent(total_tokens=0)

    monkeypatch.setattr(live_trace, "stream_trace", slow_stream_trace)

    transport = httpx.ASGITransport(app=app)
    headers = {WORKER_TOKEN_HEADER: _VALID_TOKEN}
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver", headers=headers
    ) as async_client:
        create_resp = await async_client.post("/sessions", json=_SESSION_BODY)
        assert create_resp.status_code == 200
        sid = create_resp.json()["session_id"]

        async def _consume():
            async with async_client.stream("GET", f"/sessions/{sid}/events") as resp:
                data = await resp.aread()
                return resp.status_code, data

        tasks = [asyncio.create_task(_consume()) for _ in range(6)]
        await asyncio.wait_for(stream_started.wait(), timeout=2.0)
        release_stream.set()
        results = await asyncio.gather(*tasks)

        statuses = [status for status, _ in results]
        assert statuses.count(200) == 1
        assert statuses.count(409) == 5
        assert stream_calls == 1

        # Session must be removed in finally block; replay returns 404.
        assert sid not in live_trace._SESSIONS
        assert event_stream.active_generation_count() == 0
        replay = await async_client.get(f"/sessions/{sid}/events")
        assert replay.status_code == 404


@pytest.mark.asyncio
async def test_worker_global_concurrency_semaphore_rejects_saturation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(WORKER_TOKEN_ENV, _VALID_TOKEN)
    monkeypatch.setenv(event_stream.MAX_CONCURRENT_STREAMS_ENV, "2")
    app = create_app()

    active_started = 0
    two_running = asyncio.Event()
    release_streams = asyncio.Event()

    async def gated_stream_trace(req, *, _slot_already_acquired=False):
        nonlocal active_started
        active_started += 1
        if active_started >= 2:
            two_running.set()
        await asyncio.wait_for(release_streams.wait(), timeout=2.0)
        yield ManifestEvent(manifest=model_loader.PYTHIA_160M_MANIFEST)
        yield CompleteEvent(total_tokens=0)

    monkeypatch.setattr(live_trace, "stream_trace", gated_stream_trace)

    transport = httpx.ASGITransport(app=app)
    headers = {WORKER_TOKEN_HEADER: _VALID_TOKEN}
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver", headers=headers
    ) as async_client:
        sids = []
        for idx in range(4):
            r = await async_client.post("/sessions", json={"prompt": f"conc-{idx}", "seed": idx})
            assert r.status_code == 200
            sids.append(r.json()["session_id"])

        async def _consume(sid: str) -> int:
            async with async_client.stream("GET", f"/sessions/{sid}/events") as resp:
                await resp.aread()
                return resp.status_code

        # Start 2 streams to saturate the global concurrency limit of 2.
        t1 = asyncio.create_task(_consume(sids[0]))
        t2 = asyncio.create_task(_consume(sids[1]))
        await asyncio.wait_for(two_running.wait(), timeout=2.0)
        assert event_stream.active_generation_count() == 2

        # Additional SSE stream AND /sessions/dump MUST be immediately rejected with 503.
        r_sat_sse = await async_client.get(f"/sessions/{sids[2]}/events")
        assert r_sat_sse.status_code == 503
        r_sat_dump = await async_client.post("/sessions/dump", json=_SESSION_BODY)
        assert r_sat_dump.status_code == 503

        release_streams.set()
        assert await t1 == 200
        assert await t2 == 200
        assert event_stream.active_generation_count() == 0

        # Once active streams finish, slots are released and sids[2] can run cleanly.
        assert await _consume(sids[2]) == 200
        assert event_stream.active_generation_count() == 0
