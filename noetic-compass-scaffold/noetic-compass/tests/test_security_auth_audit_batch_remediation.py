"""Security regression tests for Findings #1, #4, #6, and #8.

Covers:
- Finding #1: Public audit throttling before public bypass, bounded IP maps,
  bounded in-memory audit sessions (count, TTL, aggregate bytes), and no server
  LLM key or hosted live-worker fallback for anonymous audit runs.
- Finding #4: Removal of VITE_AUTH_MINT_SECRET from browser source, unconditional
  operator authorization on private CRM/support routes (even when accounts_enabled
  is False), and unguessable legacy session principals preventing namespace
  impersonation.
- Finding #6: Elimination of the shared ``anon`` audit-session bucket in favor of
  per-session high-entropy capability tokens (SHA-256 stored only) and empty list
  output for identity-less callers.
- Finding #8: Tight BatchRequest item/per-text/aggregate/concurrency limits,
  global bounded batch semaphore, work-based quota debiting (len(texts)),
  cancellation cleanup, finite interactive monthly cap, and non-mock anonymous
  fanout denial.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from jose import jwt
from pydantic import ValidationError

from api.config import settings
from api.dependencies.authz import require_verified_role
from api.errors import LLMError
from api.llm_connectors.mock_connector import MockLLMConnector
from api.llm_connectors.registry import get_connector
from api.middleware.auth import JWTAuthMiddleware, create_token
from api.middleware.rate_limit import (
    DEFAULT_INTERACTIVE_MONTHLY_LIMIT,
    MonthlyCounter,
    RateLimitMiddleware,
)
from api.models import (
    BatchRequest,
    MAX_BATCH_CONCURRENCY,
    MAX_BATCH_ITEMS,
    MAX_BATCH_TEXT_LENGTH,
    MAX_BATCH_TOTAL_CHARS,
    NccsResponse,
    WrapResponse,
)
from api.routes import batch as batch_routes
from api.routes import cas_harness_audit as audit_routes
from api.routes import crm as crm_routes
from api.routes import support as support_routes
from api.services import cas_harness_audit_sessions as audit_sessions
from api.services.crm.privacy import (
    CRM_PRIVACY_NOTICE_PRESENT_STATUS,
    CRMPrivacyNoticeContract,
)
from api.services.support_tickets import (
    InMemorySupportTicketStore,
    SupportTicketService,
)


def _audit_payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "model_id": "openai:gpt-4.1-mini",
        "audit_mode": "BALANCED",
        "prompt": f"Security audit prompt {uuid4().hex}",
        "selected_modules": ["active_trace"],
    }
    base.update(overrides)
    return base


def _fake_wrap_response() -> WrapResponse:
    return WrapResponse(
        nccs=NccsResponse(
            operator_profile=18.0,
            domain_coherence=16.0,
            drive_rpm_integrity=14.0,
            pathway_quality=8.0,
            inversion_resistance=12.0,
            composite=68.0,
            certification="Silver",
        ),
        stages=[],
    )


def _reset_app_public_audit_buckets(app_obj) -> None:
    current = getattr(app_obj, "middleware_stack", None)
    while current is not None and not isinstance(current, RateLimitMiddleware):
        current = getattr(current, "app", None)
    if isinstance(current, RateLimitMiddleware):
        current.reset_public_audit_buckets_for_tests()


@pytest.fixture(autouse=True)
def _clean_audit_state(client):
    audit_sessions.reset_audit_sessions_for_tests()
    _reset_app_public_audit_buckets(client.app)
    yield
    audit_sessions.reset_audit_sessions_for_tests()
    _reset_app_public_audit_buckets(client.app)


# =============================================================================
# Finding #1: Public audit throttling, bounded state, and credential isolation
# =============================================================================


def test_public_audit_paths_throttled_before_public_bypass(monkeypatch) -> None:
    monkeypatch.setattr(settings, "accounts_enabled", False)
    isolated = FastAPI()

    @isolated.post("/api/cas-harness/audit/session")
    def create_stub() -> dict[str, str]:
        return {"audit_id": "cas-audit-1"}

    @isolated.get("/api/cas-harness/audit/sessions")
    def list_stub() -> dict[str, list]:
        return {"sessions": []}

    @isolated.post("/api/cas-harness/audit/target/verify")
    def verify_stub() -> dict[str, bool]:
        return {"ok": True}

    @isolated.post("/api/cas-harness/audit/scale-plan")
    def plan_stub() -> dict[str, bool]:
        return {"ok": True}

    isolated.add_middleware(
        RateLimitMiddleware,
        public_audit_session_rpm=2,
        public_audit_utility_rpm=2,
    )
    isolated.add_middleware(JWTAuthMiddleware)

    with TestClient(isolated) as tc:
        # Session bucket caps at 2 requests before hitting 429.
        assert tc.post("/api/cas-harness/audit/session").status_code == 200
        assert tc.get("/api/cas-harness/audit/sessions").status_code == 200
        throttled_session = tc.post("/api/cas-harness/audit/session")
        assert throttled_session.status_code == 429
        assert "public audit session" in throttled_session.json()["detail"].lower()
        assert throttled_session.headers["cache-control"].startswith("no-store")

        # Utility bucket (/target/verify, /scale-plan) caps at 2 before hitting 429.
        assert tc.post("/api/cas-harness/audit/target/verify").status_code == 200
        assert tc.post("/api/cas-harness/audit/scale-plan").status_code == 200
        throttled_util = tc.post("/api/cas-harness/audit/target/verify")
        assert throttled_util.status_code == 429
        assert "public audit endpoint" in throttled_util.json()["detail"].lower()


def test_rate_limit_maps_evict_at_bound(monkeypatch) -> None:
    monkeypatch.setattr("api.middleware.rate_limit._MAX_BUCKETS", 5)
    isolated = FastAPI()
    limiter = RateLimitMiddleware(isolated)
    for i in range(12):
        limiter._consume_sensitive_bucket(key=f"ip:{i}", rpm=10)
        limiter._get_bucket(f"api-key:{i}")
    assert len(limiter.sensitive_buckets) <= 5
    assert len(limiter.buckets) <= 5

    counter = MonthlyCounter(max_keys=4)
    for i in range(10):
        counter.increment(f"k:{i}")
    assert len(counter.counts) <= 4


def test_in_memory_audit_sessions_enforce_count_ttl_and_byte_bounds(
    client, monkeypatch
) -> None:
    # Count limit + HTTP 429 mapping
    monkeypatch.setattr(audit_sessions, "MAX_IN_MEMORY_SESSIONS", 2)
    r1 = client.post("/api/cas-harness/audit/session", json=_audit_payload())
    r2 = client.post("/api/cas-harness/audit/session", json=_audit_payload())
    r3 = client.post("/api/cas-harness/audit/session", json=_audit_payload())
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 429
    assert "capacity" in r3.json()["detail"].lower()
    assert r3.headers.get("retry-after") == "60"

    # TTL eviction frees room when old records expire
    first_id = r1.json()["audit_id"]
    expired_ts = (
        datetime.now(UTC)
        - timedelta(seconds=audit_sessions.IN_MEMORY_SESSION_TTL_SECONDS + 10)
    ).isoformat()
    audit_sessions._SESSIONS[first_id].created_at = expired_ts

    r4 = client.post("/api/cas-harness/audit/session", json=_audit_payload())
    assert r4.status_code == 200
    assert first_id not in audit_sessions._SESSIONS

    # Aggregate byte bound enforcement
    audit_sessions.reset_audit_sessions_for_tests()
    monkeypatch.setattr(audit_sessions, "MAX_IN_MEMORY_SESSIONS", 50)
    monkeypatch.setattr(audit_sessions, "MAX_IN_MEMORY_SESSION_BYTES", 500)
    oversized = client.post("/api/cas-harness/audit/session", json=_audit_payload())
    assert oversized.status_code == 429
    assert "memory budget" in oversized.json()["detail"].lower()


@pytest.mark.parametrize(
    "provider",
    ["openai", "anthropic", "google", "meta", "xai", "deepseek", "qwen"],
)
def test_get_connector_refuses_server_key_fallback_when_disallowed(
    provider: str, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "sk-server-openai")
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-server-anthropic")
    monkeypatch.setattr(settings, "google_api_key", "sk-server-google")
    monkeypatch.setattr(settings, "meta_api_base_url", "https://meta.internal/v1")
    monkeypatch.setattr(settings, "meta_api_key", "sk-server-meta")
    monkeypatch.setattr(settings, "xai_api_key", "sk-server-xai")
    monkeypatch.setattr(settings, "deepseek_api_key", "sk-server-deepseek")
    monkeypatch.setattr(settings, "qwen_api_key", "sk-server-qwen")

    with pytest.raises(LLMError, match="BYOK"):
        get_connector(provider, allow_server_credentials=False)

    # Mock provider remains allowed without server credentials.
    assert isinstance(get_connector("mock", allow_server_credentials=False), MockLLMConnector)


def test_anonymous_audit_run_blocks_server_provider_keys_and_hosted_live_worker(
    client, monkeypatch, tmp_path
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "sk-server-must-never-be-used")
    monkeypatch.setattr(settings, "atlas_live_worker_url", "http://worker.internal:18080")
    monkeypatch.setattr(settings, "atlas_live_worker_token", "worker-secret")
    monkeypatch.setenv("CAS_HARNESS_EVIDENCE_PACKET_STORE_DIR", str(tmp_path / "packets"))
    monkeypatch.setenv("CAS_HARNESS_HARVEST_STORE_DIR", str(tmp_path / "harvest"))

    # 1. Anonymous closed-API run without BYOK -> 403 Forbidden (never touches server key).
    closed_created = client.post(
        "/api/cas-harness/audit/session",
        json={
            "model_id": "gpt-4",
            "provider": "openai",
            "endpoint_url": "https://api.openai.com/v1/chat/completions",
            "audit_mode": "BALANCED",
            "prompt": "Try to burn server OpenAI key anonymously.",
            "selected_modules": ["active_trace"],
        },
    )
    assert closed_created.status_code == 200
    closed_id = closed_created.json()["audit_id"]
    closed_token = closed_created.headers["X-Audit-Session-Token"]

    denied_closed = client.post(
        f"/api/cas-harness/audit/session/{closed_id}/run",
        headers={"X-Audit-Session-Token": closed_token},
    )
    assert denied_closed.status_code == 403
    assert "byok" in denied_closed.json()["detail"].lower()

    # 2. Anonymous hosted open-weight live worker run -> 403 Forbidden.
    hosted_created = client.post(
        "/api/cas-harness/audit/session",
        json={
            "model_id": "EleutherAI/pythia-160m",
            "audit_mode": "BALANCED",
            "prompt": "Try to burn hosted GPU worker anonymously.",
            "selected_modules": ["active_trace"],
        },
    )
    assert hosted_created.status_code == 200
    hosted_id = hosted_created.json()["audit_id"]
    hosted_token = hosted_created.headers["X-Audit-Session-Token"]

    denied_hosted = client.post(
        f"/api/cas-harness/audit/session/{hosted_id}/run",
        headers={"X-Audit-Session-Token": hosted_token},
    )
    assert denied_hosted.status_code == 403
    assert "authentication is required" in denied_hosted.json()["detail"].lower()


# =============================================================================
# Finding #6: Per-session capability isolation (no shared "anon" bucket)
# =============================================================================


def test_anonymous_sessions_store_only_hash_and_isolate_independent_callers(client) -> None:
    payload = _audit_payload(prompt="Sensitive anonymous prompt")
    created_a = client.post("/api/cas-harness/audit/session", json=payload)
    created_b = client.post("/api/cas-harness/audit/session", json=payload)
    assert created_a.status_code == 200
    assert created_b.status_code == 200

    id_a = created_a.json()["audit_id"]
    id_b = created_b.json()["audit_id"]
    token_a = created_a.headers["X-Audit-Session-Token"]
    token_b = created_b.headers["X-Audit-Session-Token"]
    assert id_a != id_b
    assert token_a != token_b
    assert created_a.headers["cache-control"] == "no-store"

    # Stored record keeps only SHA-256 digest and unique anon:<audit_id> owner_key.
    stored_a = audit_sessions._SESSIONS[id_a]
    assert stored_a.owner_key == f"anon:{id_a}"
    assert stored_a.capability_token_sha256 is not None
    assert stored_a.capability_token_sha256 != token_a
    assert token_a not in repr(stored_a)

    # Identity-less / invalid-bearer listing returns empty list.
    assert client.get("/api/cas-harness/audit/sessions").json() == {"sessions": []}
    assert (
        client.get(
            "/api/cas-harness/audit/sessions",
            headers={"Authorization": "Bearer invalid.jwt.token"},
        ).json()
        == {"sessions": []}
    )

    # Cross-access (missing token, wrong token, or authenticated user without token) -> 404.
    auth_token = create_token(sub="other-user", api_key="other-key")
    for bad_headers in (
        {},
        {"X-Audit-Session-Token": token_b},
        {"Authorization": f"Bearer {auth_token}"},
    ):
        assert (
            client.get(
                f"/api/cas-harness/audit/session/{id_a}/status", headers=bad_headers
            ).status_code
            == 404
        )
        assert (
            client.post(
                f"/api/cas-harness/audit/session/{id_a}/run", headers=bad_headers
            ).status_code
            == 404
        )

    # Valid capability token works and never echoes the token back on status/run.
    ok_status = client.get(
        f"/api/cas-harness/audit/session/{id_a}/status",
        headers={"X-Audit-Session-Token": token_a},
    )
    assert ok_status.status_code == 200
    assert "session_access_token" not in ok_status.json()
    assert token_a not in ok_status.text


# =============================================================================
# Finding #4: Unconditional CRM/Support operator authz, legacy principals, no VITE secret
# =============================================================================


def test_require_verified_role_never_bypasses_when_accounts_disabled(monkeypatch) -> None:
    monkeypatch.setattr(settings, "accounts_enabled", False)
    gate = require_verified_role("operator", "admin", "owner")

    # Unauthenticated -> 401
    unauth_req = Request({"type": "http", "headers": [], "method": "GET", "path": "/x"})
    with pytest.raises(Exception) as unauth_exc:
        gate(unauth_req)
    assert getattr(unauth_exc.value, "status_code", None) == 401

    # Legacy accounts-off JWT (user set, no server-assigned role) -> 403
    legacy_req = Request({"type": "http", "headers": [], "method": "GET", "path": "/x"})
    legacy_req.state.user = "dashboard:session-1234"
    with pytest.raises(Exception) as legacy_exc:
        gate(legacy_req)
    assert getattr(legacy_exc.value, "status_code", None) == 403

    # Low-privilege role -> 403
    member_req = Request({"type": "http", "headers": [], "method": "GET", "path": "/x"})
    member_req.state.user = "member@example.com"
    member_req.state.role = "member"
    with pytest.raises(Exception) as member_exc:
        gate(member_req)
    assert getattr(member_exc.value, "status_code", None) == 403

    # Verified operator role -> allowed
    op_req = Request({"type": "http", "headers": [], "method": "GET", "path": "/x"})
    op_req.state.user = "op@example.com"
    op_req.state.role = "operator"
    assert gate(op_req) == "operator"


def test_legacy_accounts_off_jwt_blocked_on_all_private_crm_and_support_routes(
    client, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "accounts_enabled", False)
    client.app.state.crm_privacy_notice_contract = CRMPrivacyNoticeContract(
        publication_status=CRM_PRIVACY_NOTICE_PRESENT_STATUS,
        version="privacy-2026-07-15",
        content_sha256="d" * 64,
    ).validated()
    client.app.state.support_tickets = SupportTicketService(InMemorySupportTicketStore())

    # Public intake routes still work cleanly.
    lead_resp = client.post(
        "/api/crm/public/leads",
        json={"email": f"lead-{uuid4().hex}@example.com", "consent_to_contact": True},
    )
    assert lead_resp.status_code == 200
    lead_id = lead_resp.json()["lead_id"]

    ticket_resp = client.post(
        "/api/support/public/tickets",
        json={
            "email": f"sup-{uuid4().hex}@example.com",
            "subject": "Help",
            "message": "Need assistance",
            "consent_to_contact": True,
            "privacy_notice_version": "privacy-2026-07-15",
            "privacy_notice_content_sha256": "d" * 64,
        },
    )
    assert ticket_resp.status_code == 201
    ticket_id = ticket_resp.json()["ticket_id"]

    # Mint a legacy accounts-off JWT and verify EVERY private CRM/support route returns 403.
    minted = client.post("/auth/token", json={"username": "admin"})
    assert minted.status_code == 200
    legacy_headers = {"Authorization": f"Bearer {minted.json()['token']}"}

    assert client.get("/api/crm/leads", headers=legacy_headers).status_code == 403
    assert client.get(f"/api/crm/leads/{lead_id}", headers=legacy_headers).status_code == 403
    assert (
        client.patch(
            f"/api/crm/leads/{lead_id}/pipeline-status",
            json={"pipeline_status": "contacted"},
            headers=legacy_headers,
        ).status_code
        == 403
    )

    assert client.get("/api/support/tickets", headers=legacy_headers).status_code == 403
    assert (
        client.get(f"/api/support/tickets/{ticket_id}", headers=legacy_headers).status_code == 403
    )
    assert (
        client.post(
            f"/api/support/tickets/{ticket_id}/route",
            json={"owner": "attacker"},
            headers=legacy_headers,
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/support/tickets/{ticket_id}/acknowledge", headers=legacy_headers
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/support/tickets/{ticket_id}/resolve",
            json={"resolution_summary": "pwned"},
            headers=legacy_headers,
        ).status_code
        == 403
    )


def test_legacy_auth_token_prevents_namespace_impersonation_and_rejects_whitespace_secret(
    client, monkeypatch
) -> None:
    # Whitespace-only mint secret in non-debug mode must fail closed.
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "auth_mint_secret", "   ")
    refused = client.post(
        "/auth/token",
        json={"username": "victim"},
        headers={"X-Auth-Mint-Secret": "   "},
    )
    assert refused.status_code == 401

    # Valid mint secret mints distinct unguessable principals for the same username.
    monkeypatch.setattr(settings, "auth_mint_secret", "server-side-secret")
    t1 = client.post(
        "/auth/token",
        json={"username": "victim"},
        headers={"X-Auth-Mint-Secret": "server-side-secret"},
    ).json()["token"]
    t2 = client.post(
        "/auth/token",
        json={"username": "victim"},
        headers={"X-Auth-Mint-Secret": "server-side-secret"},
    ).json()["token"]
    c1 = jwt.decode(t1, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    c2 = jwt.decode(t2, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert c1["api_key"].startswith("dashboard:session-")
    assert c2["api_key"].startswith("dashboard:session-")
    assert c1["api_key"] != c2["api_key"]
    assert "victim" not in c1["api_key"]


def test_dashboard_source_contains_no_vite_auth_mint_secret() -> None:
    dashboard_src = Path(__file__).resolve().parents[1] / "dashboard" / "src"
    for rel in (
        "api/config.ts",
        "api/auth.ts",
        "api/client.ts",
        "pages/LoginPage.tsx",
    ):
        text = (dashboard_src / rel).read_text(encoding="utf-8")
        assert "VITE_AUTH_MINT_SECRET" not in text, f"Found VITE_AUTH_MINT_SECRET in {rel}"


# =============================================================================
# Finding #8: Batch bounds, work-based metering, global semaphore, cancellation
# =============================================================================


def test_batch_request_enforces_item_length_aggregate_and_concurrency_caps() -> None:
    # Default max_concurrency is 5
    req = BatchRequest(texts=["hello"])
    assert req.max_concurrency == 5

    # >50 items rejected
    with pytest.raises(ValidationError):
        BatchRequest(texts=["x"] * (MAX_BATCH_ITEMS + 1))

    # Empty string item rejected
    with pytest.raises(ValidationError):
        BatchRequest(texts=[""])

    # Single string > 10,000 chars rejected
    with pytest.raises(ValidationError):
        BatchRequest(texts=["a" * (MAX_BATCH_TEXT_LENGTH + 1)])

    # Aggregate total > 100,000 chars rejected (11 * 10,000 = 110,000)
    with pytest.raises(ValidationError):
        BatchRequest(texts=["a" * MAX_BATCH_TEXT_LENGTH for _ in range(11)])

    # Exact aggregate 100,000 chars accepted (10 * 10,000)
    exact = BatchRequest(texts=["a" * MAX_BATCH_TEXT_LENGTH for _ in range(10)])
    assert sum(len(t) for t in exact.texts) == MAX_BATCH_TOTAL_CHARS

    # max_concurrency > 10 rejected
    with pytest.raises(ValidationError):
        BatchRequest(texts=["hello"], max_concurrency=MAX_BATCH_CONCURRENCY + 1)


def test_batch_route_rejects_oversized_422_and_debits_work_units_before_tasks(
    monkeypatch,
) -> None:
    runner_calls = 0

    async def fake_run(self, text: str) -> WrapResponse:
        nonlocal runner_calls
        runner_calls += 1
        return _fake_wrap_response()

    monkeypatch.setattr("api.routes.batch.WrapPipelineRunner.run", fake_run)

    isolated = FastAPI()
    isolated.include_router(batch_routes.router)
    isolated.add_middleware(RateLimitMiddleware, rpm=100, interactive_monthly_limit=10)
    isolated.add_middleware(JWTAuthMiddleware)

    token = create_token(sub="dashboard:session-batch", api_key="dashboard:session-batch")
    headers = {"Authorization": f"Bearer {token}"}

    with TestClient(isolated) as tc:
        # Oversized aggregate payload -> 422 before any task runs.
        oversized = tc.post(
            "/batch",
            json={"texts": ["a" * 10_000 for _ in range(11)], "mock": True},
            headers=headers,
        )
        assert oversized.status_code == 422
        assert runner_calls == 0

        # Batch of 6 items succeeds and debits all 6 units from the 10-unit monthly budget.
        first = tc.post(
            "/batch",
            json={"texts": [f"item {i}" for i in range(6)], "mock": True},
            headers=headers,
        )
        assert first.status_code == 200, first.text
        assert first.json()["succeeded"] == 6
        assert runner_calls == 6

        # Second batch of 6 items exceeds the remaining 4 units -> 429 BEFORE any tasks start!
        second = tc.post(
            "/batch",
            json={"texts": [f"more {i}" for i in range(6)], "mock": True},
            headers=headers,
        )
        assert second.status_code == 429
        assert runner_calls == 6


def test_batch_route_blocks_anonymous_non_mock_server_key_fanout(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "sk-server-batch")
    isolated = FastAPI()
    isolated.include_router(batch_routes.router)

    # No auth middleware -> request.state has no authenticated principal.
    with TestClient(isolated) as tc:
        resp = tc.post(
            "/batch",
            json={"texts": ["hello"], "provider": "openai", "mock": False},
        )
        assert resp.status_code == 403


def test_batch_global_concurrency_and_cancellation_cleanup(monkeypatch) -> None:
    async def scenario() -> None:
        monkeypatch.setattr(batch_routes, "GLOBAL_BATCH_MAX_CONCURRENCY", 3)
        batch_routes._GLOBAL_SEMAPHORES.clear()

        in_flight = 0
        peak_in_flight = 0
        cancelled_count = 0

        async def slow_run(self, text: str) -> WrapResponse:
            nonlocal in_flight, peak_in_flight, cancelled_count
            in_flight += 1
            peak_in_flight = max(peak_in_flight, in_flight)
            try:
                await asyncio.sleep(0.03)
                return _fake_wrap_response()
            except asyncio.CancelledError:
                cancelled_count += 1
                raise
            finally:
                in_flight -= 1

        monkeypatch.setattr("api.routes.batch.WrapPipelineRunner.run", slow_run)

        def make_req() -> Request:
            req = Request({"type": "http", "headers": [], "method": "POST", "path": "/batch"})
            req.state.user = "batch-user"
            req.state.api_key = "batch-key"
            return req

        # Two parallel batch requests each asking for max_concurrency=5 must share the
        # global cap of 3.
        body = BatchRequest(texts=[f"t{i}" for i in range(6)], mock=True, max_concurrency=5)
        r1, r2 = await asyncio.gather(
            batch_routes.batch(body, make_req()),
            batch_routes.batch(body, make_req()),
        )
        assert r1.succeeded == 6 and r2.succeeded == 6
        assert peak_in_flight <= 3

        # Cancellation of an in-flight batch must cancel pending tasks cleanly.
        async def hanging_run(self, text: str) -> WrapResponse:
            nonlocal cancelled_count
            try:
                await asyncio.sleep(10.0)
                return _fake_wrap_response()
            except asyncio.CancelledError:
                cancelled_count += 1
                raise

        monkeypatch.setattr("api.routes.batch.WrapPipelineRunner.run", hanging_run)
        cancelled_count = 0
        cancel_body = BatchRequest(texts=["a", "b", "c"], mock=True, max_concurrency=3)
        task = asyncio.create_task(batch_routes.batch(cancel_body, make_req()))
        await asyncio.sleep(0.02)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert cancelled_count == 3

    asyncio.run(scenario())


def test_interactive_monthly_limit_default_is_finite() -> None:
    isolated = FastAPI()
    limiter = RateLimitMiddleware(isolated)
    assert DEFAULT_INTERACTIVE_MONTHLY_LIMIT > 0
    assert limiter.effective_monthly_limit("dashboard:session-abc") == DEFAULT_INTERACTIVE_MONTHLY_LIMIT
    assert limiter.effective_monthly_limit("account:acct-123") == DEFAULT_INTERACTIVE_MONTHLY_LIMIT
