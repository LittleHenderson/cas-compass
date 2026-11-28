"""Tests for the fail-closed X-Atlas-Worker-Token auth gate (app/auth.py).

By default (env var unset or blank), every non-health endpoint MUST fail closed.
Tokenless access is permitted ONLY when ATLAS_LIVE_ALLOW_INSECURE_LOCAL_DEV=1
AND LIVE_TRACE_USE_FAKE=1 are explicitly set on a loopback host.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.auth import (
    INSECURE_LOCAL_DEV_ENV,
    USE_FAKE_ENV,
    WORKER_HOST_ENV,
    WORKER_TOKEN_ENV,
    WORKER_TOKEN_HEADER,
)
from app.main import create_app

_TOKEN = "s3cret-worker-token"
_SESSION_BODY = {"prompt": "A warm coffee cup on the table.", "seed": 42}


@pytest.fixture()
def fresh_client() -> TestClient:
    """A TestClient over a freshly constructed app (picks up current env)."""
    return TestClient(create_app())


def test_auth_fails_closed_by_default_when_token_missing(monkeypatch, fresh_client):
    monkeypatch.delenv(WORKER_TOKEN_ENV, raising=False)
    monkeypatch.delenv(INSECURE_LOCAL_DEV_ENV, raising=False)
    r = fresh_client.post("/sessions", json=_SESSION_BODY)
    assert r.status_code == 503, r.text
    assert "not configured" in r.json()["detail"].lower()


def test_auth_fails_closed_when_token_blank(monkeypatch, fresh_client):
    # Whitespace-only token counts as "not configured" and MUST fail closed.
    monkeypatch.setenv(WORKER_TOKEN_ENV, "   ")
    monkeypatch.delenv(INSECURE_LOCAL_DEV_ENV, raising=False)
    r = fresh_client.post("/sessions", json=_SESSION_BODY)
    assert r.status_code == 503, r.text


def test_explicit_insecure_local_dev_bypass_requires_fake_mode_and_loopback(monkeypatch, fresh_client):
    monkeypatch.delenv(WORKER_TOKEN_ENV, raising=False)
    monkeypatch.setenv(INSECURE_LOCAL_DEV_ENV, "1")
    monkeypatch.setenv(USE_FAKE_ENV, "1")
    monkeypatch.setenv(WORKER_HOST_ENV, "127.0.0.1")
    r = fresh_client.post("/sessions", json=_SESSION_BODY)
    assert r.status_code == 200, r.text

    # Non-loopback host MUST reject even with insecure local dev flag set.
    monkeypatch.setenv(WORKER_HOST_ENV, "0.0.0.0")
    r_non_loopback = fresh_client.post("/sessions", json=_SESSION_BODY)
    assert r_non_loopback.status_code == 503

    # Real mode (LIVE_TRACE_USE_FAKE=0) MUST reject even on loopback.
    monkeypatch.setenv(WORKER_HOST_ENV, "127.0.0.1")
    monkeypatch.setenv(USE_FAKE_ENV, "0")
    r_real_mode = fresh_client.post("/sessions", json=_SESSION_BODY)
    assert r_real_mode.status_code == 503


def test_protected_route_rejects_missing_token(monkeypatch, fresh_client):
    monkeypatch.setenv(WORKER_TOKEN_ENV, _TOKEN)
    r = fresh_client.post("/sessions", json=_SESSION_BODY)
    assert r.status_code == 401
    body = r.json()
    assert body["header"] == WORKER_TOKEN_HEADER


def test_protected_route_rejects_wrong_token(monkeypatch, fresh_client):
    monkeypatch.setenv(WORKER_TOKEN_ENV, _TOKEN)
    r = fresh_client.post(
        "/sessions",
        json=_SESSION_BODY,
        headers={WORKER_TOKEN_HEADER: "not-the-token"},
    )
    assert r.status_code == 401


def test_protected_route_accepts_correct_token(monkeypatch, fresh_client):
    monkeypatch.setenv(WORKER_TOKEN_ENV, _TOKEN)
    r = fresh_client.post(
        "/sessions",
        json=_SESSION_BODY,
        headers={WORKER_TOKEN_HEADER: _TOKEN},
    )
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("path", ["/health", "/health/realmode"])
def test_health_paths_exempt_even_with_token_set(monkeypatch, fresh_client, path):
    # RunPod health checks + the API real-mode proxy must work without the
    # secret, so health endpoints are exempt from the token gate.
    monkeypatch.setenv(WORKER_TOKEN_ENV, _TOKEN)
    r = fresh_client.get(path)
    assert r.status_code == 200, r.text


def test_token_compare_is_whitespace_tolerant_on_header(monkeypatch, fresh_client):
    # A header value with surrounding whitespace still matches; this mirrors the
    # strip() applied to the configured secret.
    monkeypatch.setenv(WORKER_TOKEN_ENV, _TOKEN)
    r = fresh_client.post(
        "/sessions",
        json=_SESSION_BODY,
        headers={WORKER_TOKEN_HEADER: f"  {_TOKEN}  "},
    )
    assert r.status_code == 200, r.text
