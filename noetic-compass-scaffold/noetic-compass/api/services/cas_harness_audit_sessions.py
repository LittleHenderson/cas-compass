"""CAS Harness audit sessions: exact in-memory dark path plus durable account-scoped path."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import json
import secrets
from threading import Lock
import uuid
from typing import Any, Literal

from api.services.cas_harness_verdict_runner import run_evidence_gated_verdict
from api.services.production.state_substrate import (
    LedgerRecord,
    StateStore,
    VersionConflict,
)


AuditStatus = Literal[
    "DRAFT",
    "VALIDATING",
    "RUNNING",
    "EVIDENCE_PENDING",
    "SCAFFOLD_PENDING_RUNNER",
    "EVIDENCE_READY",
    "COMPLETE",
    "FAILED",
]

ProviderRunPhase = Literal[
    "CLAIMED",
    "REQUEST_STARTED",
    "PROVIDER_COMPLETED",
    "EVIDENCE_PERSISTED",
    "FINALIZED",
    "ORPHANED",
]

ModelStatus = Literal["NOT_CONNECTED_MOCK"]
ProofChipStatus = Literal["verified", "present", "missing", "failed", "unavailable"]

_PROOF_CHIP_NAMES = {
    "model_proof": "Model proof",
    "cas_readout": "CAS readout",
    "causal_proof": "Causal proof",
    "control_proof": "Control proof",
    "output_proof": "Output proof",
    "packet_proof": "Packet proof",
}


@dataclass(frozen=True)
class AuditLifecycleEvent:
    status: AuditStatus
    message: str
    timestamp: str


@dataclass
class AuditSessionRecord:
    audit_id: str
    status: AuditStatus
    model_status: ModelStatus
    model_id: str | None
    endpoint_url: str | None
    provider: str | None
    audit_mode: str
    prompt_text: str | None
    scenario_text: str | None
    prompt_summary: str | None
    scenario_summary: str | None
    selected_modules: list[str]
    created_at: str
    updated_at: str
    # Phase-1 identity-scope stopgap: the requesting identity that owns this
    # session, captured from the JWT auth context at create time (``sub`` claim
    # and/or ``api_key``). It scopes list/get so one beta caller cannot see
    # another caller's audit sessions. This is an interim per-identity owner key;
    # it upgrades to a real ``tenant_id`` when the account/tenant model lands.
    # NOTE: not serialised by ``to_dict`` — owner identity is an internal access
    # control field, never part of the public audit-session response contract.
    owner_sub: str | None = None
    owner_api_key: str | None = None
    owner_key: str | None = None
    capability_token_sha256: str | None = None
    run_attempt_id: str | None = None
    run_lease_until: str | None = None
    run_fence: int = 0
    run_state: str | None = None
    # Account-mode provider crash-safety journal. These fields are internal and
    # durable: they never enter the public session response. The idempotency key
    # belongs to the logical audit run (not a lease holder), so it remains stable
    # across process restarts and safe lease reclaims.
    provider_run_phase: ProviderRunPhase | None = None
    provider_idempotency_key: str | None = None
    provider_result_checkpoint: dict[str, Any] | None = None
    provider_trace_id: str | None = None
    provider_reconciliation_detail: str | None = None
    verdict: str | None = None
    confidence: float | None = None
    evidence_packet_trace_id: str | None = None
    atlas_deep_link: str | None = None
    provenance_chips: list[dict[str, Any]] = field(default_factory=list)
    verifier_decision: dict[str, Any] | None = None
    audit_scope: dict[str, Any] | None = None
    lifecycle: list[AuditLifecycleEvent] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["lifecycle"] = [asdict(event) for event in self.lifecycle]
        # Owner identity and capability digests are internal access-control
        # fields; never leak them in the public audit-session response payload.
        payload.pop("owner_sub", None)
        payload.pop("owner_api_key", None)
        payload.pop("owner_key", None)
        payload.pop("capability_token_sha256", None)
        payload.pop("run_attempt_id", None)
        payload.pop("run_lease_until", None)
        payload.pop("run_fence", None)
        payload.pop("run_state", None)
        payload.pop("provider_run_phase", None)
        payload.pop("provider_idempotency_key", None)
        payload.pop("provider_result_checkpoint", None)
        payload.pop("provider_trace_id", None)
        payload.pop("provider_reconciliation_detail", None)
        return payload


MAX_IN_MEMORY_SESSIONS = 256
IN_MEMORY_SESSION_TTL_SECONDS = 3600
MAX_IN_MEMORY_SESSION_BYTES = 16 * 1024 * 1024

_SESSIONS: dict[str, AuditSessionRecord] = {}
_LOCK = Lock()
_DURABLE_STORE: StateStore | None = None
_DURABLE_KIND = "cas_audit_session"
_MAX_DURABLE_RETRIES = 12


class AuditSessionPersistenceUnavailable(RuntimeError):
    pass


class AuditSessionCapacityExceeded(RuntimeError):
    """Raised when the bounded in-memory audit session store is full."""


class AuditRunInProgress(RuntimeError):
    pass


class AuditRunReconciliationRequired(RuntimeError):
    """The provider outcome is ambiguous and an automatic retry is unsafe."""


@dataclass(frozen=True)
class ProviderRunClaim:
    run_attempt_id: str
    provider_idempotency_key: str
    phase: ProviderRunPhase
    result_checkpoint: dict[str, Any] | None = None
    provider_trace_id: str | None = None



def configure_audit_session_store(store: StateStore | None) -> None:
    """Install the lifespan-owned store; None preserves the exact process-local dark path."""
    global _DURABLE_STORE
    _DURABLE_STORE = store



# Sentinel identity values. The JWT auth middleware defaults an unauthenticated
# caller's ``sub``/``api_key`` to these strings, and other middleware mirrors the
# same defaults. For ownership we treat them as "no real identity": an
# unauthenticated session receives a unique per-session owner key + high-entropy
# capability token instead of a shared global bucket.
_ANONYMOUS_SUB = "anonymous"
_DEFAULT_API_KEY = "default"


def _normalize_identity(value: str | None) -> str | None:
    """Collapse blank / sentinel identity claims to ``None`` (no identity)."""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped or stripped in {_ANONYMOUS_SUB, _DEFAULT_API_KEY}:
        return None
    return stripped


def _owner_key(owner_sub: str | None, owner_api_key: str | None) -> str | None:
    """Build a stable owner key for authenticated callers, or ``None`` when unauthenticated.

    Absence of identity is never mapped to a shared principal bucket; anonymous
    sessions receive a unique ``anon:<audit_id>`` owner key and capability token.
    """
    sub = _normalize_identity(owner_sub)
    api_key = _normalize_identity(owner_api_key)
    if sub is None and api_key is None:
        return None
    return json.dumps({"sub": sub, "api_key": api_key}, sort_keys=True)


def _hash_capability_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _estimate_record_bytes(record: AuditSessionRecord) -> int:
    return len(json.dumps(asdict(record), default=str, ensure_ascii=True).encode("utf-8"))


def _evict_expired_sessions_locked(now: datetime | None = None) -> int:
    """Remove expired in-memory sessions while holding ``_LOCK``."""
    current = now or datetime.now(UTC)
    cutoff = current - timedelta(seconds=IN_MEMORY_SESSION_TTL_SECONDS)
    expired_ids: list[str] = []
    for audit_id, record in _SESSIONS.items():
        try:
            created = datetime.fromisoformat(record.created_at)
        except ValueError:
            expired_ids.append(audit_id)
            continue
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        if created < cutoff:
            expired_ids.append(audit_id)
    for audit_id in expired_ids:
        _SESSIONS.pop(audit_id, None)
    return len(expired_ids)


def reset_audit_sessions_for_tests() -> None:
    """Clear the in-process store; tests use this to avoid order coupling."""
    with _LOCK:
        _SESSIONS.clear()
    configure_audit_session_store(None)


def create_session_with_token(
    payload: dict[str, Any],
    *,
    owner_sub: str | None = None,
    owner_api_key: str | None = None,
    tenant_id: str | None = None,
    account_id: str | None = None,
) -> tuple[AuditSessionRecord, str | None]:
    """Create a session and return ``(record, raw_capability_token_or_none)``.

    Anonymous sessions receive a unique random ``audit_id``, a unique owner key
    ``anon:<audit_id>``, and a high-entropy capability token whose SHA-256 digest
    is stored on the record while the raw token is returned once to the caller.
    """
    caller_owner_key = _owner_key(owner_sub, owner_api_key)
    durable = _durable_context(tenant_id, account_id)
    raw_capability_token: str | None = None
    capability_token_sha256: str | None = None

    if durable:
        # Durable account-mode sessions are scoped by tenant_id + account_id.
        deterministic_key = caller_owner_key or f"account:{tenant_id}:{account_id}"
        audit_id = _audit_id_for(payload, owner_key=deterministic_key)
        record_owner_key: str | None = deterministic_key
    elif caller_owner_key is None:
        # Anonymous session: never share a bucket or collide across anonymous users.
        audit_id = f"cas-audit-{secrets.token_hex(8)}"
        raw_capability_token = secrets.token_urlsafe(32)
        capability_token_sha256 = _hash_capability_token(raw_capability_token)
        record_owner_key = f"anon:{audit_id}"
    else:
        audit_id = _audit_id_for(payload, owner_key=caller_owner_key)
        record_owner_key = caller_owner_key

    now = _utc_now()
    if durable:
        existing = _durable_get(audit_id, tenant_id, account_id)
        if existing is not None:
            return existing, None

    with _LOCK:
        if not durable:
            _evict_expired_sessions_locked()
            if caller_owner_key is not None:
                existing = _SESSIONS.get(audit_id)
                if existing is not None:
                    return existing, None
            if len(_SESSIONS) >= MAX_IN_MEMORY_SESSIONS:
                raise AuditSessionCapacityExceeded(
                    f"Audit session store capacity exceeded (max {MAX_IN_MEMORY_SESSIONS} active sessions)."
                )

        record = AuditSessionRecord(
            audit_id=audit_id,
            status="DRAFT",
            model_status="NOT_CONNECTED_MOCK",
            model_id=payload.get("model_id"),
            endpoint_url=payload.get("endpoint_url"),
            provider=payload.get("provider"),
            audit_mode=payload["audit_mode"],
            prompt_text=payload.get("prompt"),
            scenario_text=payload.get("scenario_text"),
            prompt_summary=_summary(payload.get("prompt")),
            scenario_summary=_summary(payload.get("scenario_text")),
            selected_modules=list(payload["selected_modules"]),
            created_at=now,
            updated_at=now,
            owner_sub=_normalize_identity(owner_sub),
            owner_api_key=_normalize_identity(owner_api_key),
            owner_key=record_owner_key,
            capability_token_sha256=capability_token_sha256,
            evidence_packet_trace_id=payload.get("evidence_packet_trace_id"),
            atlas_deep_link=_atlas_deep_link(payload.get("evidence_packet_trace_id")),
            verifier_decision=(
                dict(payload["verifier_decision"])
                if isinstance(payload.get("verifier_decision"), dict)
                else None
            ),
            provenance_chips=(
                list(payload["provenance_chips"])
                if isinstance(payload.get("provenance_chips"), list)
                else _provenance_chips()
            ),
            lifecycle=[
                AuditLifecycleEvent(
                    status="DRAFT",
                    message=_draft_message(payload.get("evidence_packet_trace_id")),
                    timestamp=now,
                )
            ],
        )
        if durable:
            assert _DURABLE_STORE is not None and tenant_id is not None and account_id is not None
            ledger = LedgerRecord.new(
                tenant_id=tenant_id,
                kind=_DURABLE_KIND,
                record_id=audit_id,
                payload=_durable_payload(record, account_id),
                parent_ids=(account_id,),
                source="cas_harness.audit_session",
                trace_id=audit_id,
            )
            try:
                _DURABLE_STORE.put(ledger, expected_version=0)
            except VersionConflict:
                concurrent = _durable_get(audit_id, tenant_id, account_id)
                if concurrent is not None:
                    return concurrent, None
                raise
        else:
            current_bytes = sum(_estimate_record_bytes(item) for item in _SESSIONS.values())
            new_bytes = _estimate_record_bytes(record)
            if current_bytes + new_bytes > MAX_IN_MEMORY_SESSION_BYTES:
                raise AuditSessionCapacityExceeded(
                    "Audit session store memory budget exceeded."
                )
            _SESSIONS[audit_id] = record
        return record, raw_capability_token


def create_session(
    payload: dict[str, Any],
    *,
    owner_sub: str | None = None,
    owner_api_key: str | None = None,
    tenant_id: str | None = None,
    account_id: str | None = None,
) -> AuditSessionRecord:
    record, _token = create_session_with_token(
        payload,
        owner_sub=owner_sub,
        owner_api_key=owner_api_key,
        tenant_id=tenant_id,
        account_id=account_id,
    )
    return record


def _owns(record: AuditSessionRecord, owner_key: str | None) -> bool:
    """True when ``record`` is owned by the authenticated caller ``owner_key``."""
    if owner_key is None or record.capability_token_sha256 is not None:
        return False
    record_key = _owner_key(record.owner_sub, record.owner_api_key)
    return record_key is not None and record_key == owner_key


def _matches_capability(record: AuditSessionRecord, capability_token: str | None) -> bool:
    if not record.capability_token_sha256 or not capability_token:
        return False
    presented_digest = _hash_capability_token(capability_token.strip())
    return hmac.compare_digest(presented_digest, record.capability_token_sha256)


def get_session(
    audit_id: str,
    *,
    owner_sub: str | None = None,
    owner_api_key: str | None = None,
    capability_token: str | None = None,
    tenant_id: str | None = None,
    account_id: str | None = None,
) -> AuditSessionRecord | None:
    """Return a session only if the caller owns it or presents its capability token.

    Fails CLOSED: a caller who does not own the session (or lacks the matching
    per-session capability token for an anonymous session) gets ``None``.
    """
    if _durable_context(tenant_id, account_id):
        return _durable_get(audit_id, tenant_id, account_id)
    owner_key = _owner_key(owner_sub, owner_api_key)
    with _LOCK:
        _evict_expired_sessions_locked()
        record = _SESSIONS.get(audit_id)
        if record is None:
            return None
        if record.capability_token_sha256 is not None:
            if not _matches_capability(record, capability_token):
                return None
            return record
        if not _owns(record, owner_key):
            return None
        return record


def list_sessions(
    *,
    owner_sub: str | None = None,
    owner_api_key: str | None = None,
    tenant_id: str | None = None,
    account_id: str | None = None,
) -> list[AuditSessionRecord]:
    """List only the sessions owned by an authenticated requesting identity.

    Identity-less callers always receive an empty list so anonymous sessions
    cannot be enumerated across independent visitors.
    """
    if _durable_context(tenant_id, account_id):
        return _durable_list(tenant_id, account_id)
    owner_key = _owner_key(owner_sub, owner_api_key)
    if owner_key is None:
        return []
    with _LOCK:
        _evict_expired_sessions_locked()
        owned = [record for record in _SESSIONS.values() if _owns(record, owner_key)]
    return sorted(owned, key=lambda session: session.created_at)


def claim_run_attempt(
    audit_id: str,
    *,
    tenant_id: str | None = None,
    account_id: str | None = None,
    lease_seconds: int = 300,
) -> str | None:
    """Atomically fence an external run so only one replica may spend at a time."""
    if _durable_context(tenant_id, account_id):
        claimed = _durable_update(
            audit_id,
            tenant_id,
            account_id,
            lambda record: _apply_run_claim(record, lease_seconds),
        )
        return claimed.run_attempt_id if claimed is not None else None
    with _LOCK:
        record = _SESSIONS.get(audit_id)
        if record is None:
            return None
        return _apply_run_claim(record, lease_seconds).run_attempt_id


def claim_provider_run(
    audit_id: str,
    *,
    tenant_id: str | None,
    account_id: str | None,
    lease_seconds: int = 300,
) -> ProviderRunClaim | None:
    """Claim or resume one durable account-mode external-provider operation.

    The logical provider idempotency key is created once and survives every
    safe reclaim. An expired ``REQUEST_STARTED`` lease is *not* reclaimable:
    the provider may have succeeded even though CAS never received the result,
    so the journal is durably moved to ``ORPHANED`` and automatic spend stops.
    """

    updated = _durable_update(
        audit_id,
        tenant_id,
        account_id,
        lambda record: _apply_provider_run_claim(record, lease_seconds),
    )
    if updated is None:
        return None
    if updated.provider_run_phase == "ORPHANED":
        raise AuditRunReconciliationRequired(
            updated.provider_reconciliation_detail
            or "provider outcome is ambiguous; automatic retry is blocked"
        )
    if (
        updated.run_attempt_id is None
        or updated.provider_idempotency_key is None
        or updated.provider_run_phase is None
    ):
        raise AuditSessionPersistenceUnavailable(
            "provider run checkpoint could not be claimed"
        )
    return ProviderRunClaim(
        run_attempt_id=updated.run_attempt_id,
        provider_idempotency_key=updated.provider_idempotency_key,
        phase=updated.provider_run_phase,
        result_checkpoint=_json_copy(updated.provider_result_checkpoint),
        provider_trace_id=updated.provider_trace_id,
    )


def mark_provider_request_started(
    audit_id: str,
    *,
    tenant_id: str | None,
    account_id: str | None,
    run_attempt_id: str,
) -> ProviderRunClaim | None:
    """Durably cross the no-return boundary immediately before provider I/O."""

    updated = _durable_update(
        audit_id,
        tenant_id,
        account_id,
        lambda record: _apply_provider_request_started(record, run_attempt_id),
    )
    return _provider_claim_from_record(updated)


def checkpoint_provider_completed(
    audit_id: str,
    *,
    tenant_id: str | None,
    account_id: str | None,
    run_attempt_id: str,
    result_checkpoint: dict[str, Any],
    trace_id: str,
) -> ProviderRunClaim | None:
    """Persist provider output before any Evidence Packet side effect begins."""

    checkpoint = _json_copy(result_checkpoint)
    if checkpoint is None:
        raise ValueError("provider result checkpoint must be a JSON object")
    updated = _durable_update(
        audit_id,
        tenant_id,
        account_id,
        lambda record: _apply_provider_completed(
            record,
            run_attempt_id=run_attempt_id,
            result_checkpoint=checkpoint,
            trace_id=trace_id,
        ),
    )
    return _provider_claim_from_record(updated)


def checkpoint_provider_evidence_persisted(
    audit_id: str,
    *,
    tenant_id: str | None,
    account_id: str | None,
    run_attempt_id: str,
    trace_id: str,
) -> ProviderRunClaim | None:
    """Record that packet/hash/harvest persistence finished for this output."""

    updated = _durable_update(
        audit_id,
        tenant_id,
        account_id,
        lambda record: _apply_provider_evidence_persisted(
            record, run_attempt_id=run_attempt_id, trace_id=trace_id
        ),
    )
    return _provider_claim_from_record(updated)


def finalize_provider_run(
    audit_id: str,
    *,
    tenant_id: str | None,
    account_id: str | None,
    run_attempt_id: str,
    trace_id: str,
) -> AuditSessionRecord | None:
    """Finalize only after the persisted evidence is attached to the session."""

    return _durable_update(
        audit_id,
        tenant_id,
        account_id,
        lambda record: _apply_provider_finalized(
            record, run_attempt_id=run_attempt_id, trace_id=trace_id
        ),
    )


def orphan_provider_run(
    audit_id: str,
    *,
    tenant_id: str | None,
    account_id: str | None,
    run_attempt_id: str,
    detail: str,
) -> AuditSessionRecord | None:
    """Fail closed after an ambiguous provider request; never authorize a replay."""

    return _durable_update(
        audit_id,
        tenant_id,
        account_id,
        lambda record: _apply_provider_orphaned(record, run_attempt_id, detail),
    )


def attach_runner_evidence(
    audit_id: str,
    *,
    evidence_packet_trace_id: str,
    proof_chips: list[dict[str, Any]],
    verifier_decision: dict[str, Any] | None = None,
    audit_scope: dict[str, Any] | None = None,
    message: str,
    tenant_id: str | None = None,
    account_id: str | None = None,
    run_attempt_id: str | None = None,
) -> AuditSessionRecord | None:
    """Attach live-run evidence before the verdict gate evaluates it."""

    if _durable_context(tenant_id, account_id):
        return _durable_update(
            audit_id,
            tenant_id,
            account_id,
            lambda record: _apply_evidence(
                record,
                evidence_packet_trace_id=evidence_packet_trace_id,
                proof_chips=proof_chips,
                verifier_decision=verifier_decision,
                audit_scope=audit_scope,
                message=message,
                run_attempt_id=run_attempt_id,
            ),
        )

    with _LOCK:
        record = _SESSIONS.get(audit_id)
        if record is None:
            return None
        return _apply_evidence(
            record,
            evidence_packet_trace_id=evidence_packet_trace_id,
            proof_chips=proof_chips,
            verifier_decision=verifier_decision,
            audit_scope=audit_scope,
            message=message,
            run_attempt_id=run_attempt_id,
        )


def fail_session(
    audit_id: str,
    *,
    message: str,
    tenant_id: str | None = None,
    account_id: str | None = None,
    run_attempt_id: str | None = None,
) -> AuditSessionRecord | None:
    """Move a session to FAILED when a real runner attempt errors."""

    if _durable_context(tenant_id, account_id):
        return _durable_update(
            audit_id,
            tenant_id,
            account_id,
            lambda record: _apply_failure(record, message, run_attempt_id),
        )

    with _LOCK:
        record = _SESSIONS.get(audit_id)
        if record is None:
            return None
        return _apply_failure(record, message, run_attempt_id)


def run_session(
    audit_id: str,
    *,
    tenant_id: str | None = None,
    account_id: str | None = None,
) -> AuditSessionRecord | None:
    if _durable_context(tenant_id, account_id):
        return _durable_update(audit_id, tenant_id, account_id, _apply_run)

    with _LOCK:
        record = _SESSIONS.get(audit_id)
        if record is None:
            return None

        if record.status in {"SCAFFOLD_PENDING_RUNNER", "EVIDENCE_PENDING", "COMPLETE", "FAILED"}:
            return record

        _append_event(
            record,
            status="VALIDATING",
            message="Input contract validated. License and external model billing are not active in M3.1.",
        )
        _append_event(
            record,
            status="RUNNING",
            message=(
                "M3 evidence-gated verdict runner started. It cannot ACCEPT without "
                "complete proof chips and an explicit verifier decision."
            ),
        )
        result = run_evidence_gated_verdict(
            evidence_packet_trace_id=record.evidence_packet_trace_id,
            proof_chips=record.provenance_chips,
            explicit_verifier_decision=record.verifier_decision,
        )
        record.verdict = result.verdict
        record.confidence = result.confidence
        _append_event(
            record,
            status=result.status,
            message=result.message,
        )
        return record


def _append_event(record: AuditSessionRecord, *, status: AuditStatus, message: str) -> None:
    now = _utc_now()
    record.status = status
    record.updated_at = now
    record.lifecycle.append(AuditLifecycleEvent(status=status, message=message, timestamp=now))


def _audit_id_for(payload: dict[str, Any], *, owner_key: str = "anon") -> str:
    public_payload = dict(payload)
    public_payload.pop("license_key", None)
    # Phase-1 identity-scope stopgap: bind the deterministic id to the owner key
    # so the same payload from two different callers yields two distinct sessions
    # and a record can never be co-owned. The owner key is identity-derived, so
    # the id reveals nothing about the payload of any other tenant.
    keyed_payload = {"owner_key": owner_key, "payload": public_payload}
    digest = hashlib.sha256(json.dumps(keyed_payload, sort_keys=True).encode("utf-8")).hexdigest()
    return f"cas-audit-{digest[:16]}"


def _provenance_chips() -> list[dict[str, str]]:
    return [
        _proof_chip(
            "model_proof",
            "missing",
            "No model connection or Evidence Packet model proof has been verified for this audit session yet.",
        ),
        _proof_chip(
            "cas_readout",
            "unavailable",
            "No CAS readout exists until an Evidence Packet or audit runner output is attached.",
        ),
        _proof_chip(
            "causal_proof",
            "unavailable",
            "No ablation or intervention evidence has been attached to this audit session yet.",
        ),
        _proof_chip(
            "control_proof",
            "unavailable",
            "No matched baseline/control evidence has been attached to this audit session yet.",
        ),
        _proof_chip(
            "output_proof",
            "unavailable",
            "No model output evidence has been attached to this audit session yet.",
        ),
        _proof_chip(
            "packet_proof",
            "missing",
            "No Evidence Packet has been attached to this audit session yet.",
        ),
    ]


def _proof_chip(chip_id: str, status: ProofChipStatus, detail: str) -> dict[str, str]:
    return {
        "id": chip_id,
        "name": _PROOF_CHIP_NAMES[chip_id],
        "status": status,
        "detail": detail,
    }


def _draft_message(evidence_packet_trace_id: str | None) -> str:
    if evidence_packet_trace_id:
        return (
            f"Audit session created with Evidence Packet {evidence_packet_trace_id}. "
            "No CAS runner has executed yet."
        )
    return "Audit session created. No CAS runner has executed yet."


def _atlas_deep_link(evidence_packet_trace_id: str | None) -> str | None:
    if not evidence_packet_trace_id:
        return None
    return f"/cockpit?trace_id={evidence_packet_trace_id}"


def _summary(value: str | None, *, limit: int = 180) -> str | None:
    if value is None:
        return None
    collapsed = " ".join(value.split())
    if len(collapsed) <= limit:
        return collapsed
    return f"{collapsed[: limit - 1]}..."


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _durable_context(tenant_id: str | None, account_id: str | None) -> bool:
    if tenant_id is None and account_id is None:
        return False
    if not tenant_id or not account_id or _DURABLE_STORE is None:
        raise AuditSessionPersistenceUnavailable(
            "account-scoped audit persistence is unavailable"
        )
    return True


def _durable_payload(record: AuditSessionRecord, account_id: str) -> dict[str, Any]:
    payload = asdict(record)
    payload["lifecycle"] = [asdict(event) for event in record.lifecycle]
    payload["_account_id"] = account_id
    return payload


def _record_from_durable(payload: dict[str, Any]) -> AuditSessionRecord:
    data = dict(payload)
    data.pop("_account_id", None)
    data["lifecycle"] = [
        AuditLifecycleEvent(**event)
        for event in data.get("lifecycle", [])
        if isinstance(event, dict)
    ]
    return AuditSessionRecord(**data)


def _durable_get(
    audit_id: str, tenant_id: str | None, account_id: str | None
) -> AuditSessionRecord | None:
    if not _durable_context(tenant_id, account_id):
        return None
    assert _DURABLE_STORE is not None and tenant_id is not None and account_id is not None
    ledger = _DURABLE_STORE.get(tenant_id, _DURABLE_KIND, audit_id)
    if ledger is None or str(ledger.payload.get("_account_id") or "") != account_id:
        return None
    return _record_from_durable(dict(ledger.payload))


def _durable_list(
    tenant_id: str | None, account_id: str | None
) -> list[AuditSessionRecord]:
    if not _durable_context(tenant_id, account_id):
        return []
    assert _DURABLE_STORE is not None and tenant_id is not None and account_id is not None
    records = [
        _record_from_durable(dict(ledger.payload))
        for ledger in _DURABLE_STORE.list(tenant_id, _DURABLE_KIND)
        if str(ledger.payload.get("_account_id") or "") == account_id
    ]
    return sorted(records, key=lambda record: record.created_at)


def _durable_update(
    audit_id: str,
    tenant_id: str | None,
    account_id: str | None,
    mutator,
) -> AuditSessionRecord | None:
    if not _durable_context(tenant_id, account_id):
        return None
    assert _DURABLE_STORE is not None and tenant_id is not None and account_id is not None
    last_conflict: VersionConflict | None = None
    for _ in range(_MAX_DURABLE_RETRIES):
        ledger = _DURABLE_STORE.get(tenant_id, _DURABLE_KIND, audit_id)
        if ledger is None or str(ledger.payload.get("_account_id") or "") != account_id:
            return None
        record = _record_from_durable(dict(ledger.payload))
        before = _durable_payload(record, account_id)
        updated = mutator(record)
        after = _durable_payload(updated, account_id)
        if after == before:
            return updated
        try:
            _DURABLE_STORE.put(
                ledger.with_payload(after), expected_version=ledger.version
            )
            return updated
        except VersionConflict as conflict:
            last_conflict = conflict
            continue
    assert last_conflict is not None
    raise last_conflict


def _apply_run_claim(
    record: AuditSessionRecord, lease_seconds: int
) -> AuditSessionRecord:
    now = datetime.now(UTC)
    if record.run_state == "RUNNING" and record.run_lease_until:
        try:
            lease_until = datetime.fromisoformat(record.run_lease_until)
        except ValueError:
            lease_until = now + timedelta(seconds=lease_seconds)
        if lease_until > now:
            raise AuditRunInProgress("audit run already in progress")
    record.run_attempt_id = uuid.uuid4().hex
    record.run_fence += 1
    record.run_state = "RUNNING"
    record.run_lease_until = (now + timedelta(seconds=lease_seconds)).isoformat()
    return record


def _apply_provider_run_claim(
    record: AuditSessionRecord, lease_seconds: int
) -> AuditSessionRecord:
    if lease_seconds <= 0:
        raise ValueError("lease_seconds must be positive")
    now = datetime.now(UTC)
    lease_active = False
    if record.run_state == "RUNNING" and record.run_lease_until:
        try:
            lease_active = datetime.fromisoformat(record.run_lease_until) > now
        except ValueError:
            # A corrupt deadline must not authorize another provider call.
            record.provider_run_phase = "ORPHANED"
            record.provider_reconciliation_detail = (
                "provider run lease deadline is invalid; automatic retry is blocked"
            )
            record.run_state = "ORPHANED"
            record.run_lease_until = None
            return record
    phase = record.provider_run_phase
    if lease_active:
        raise AuditRunInProgress("audit run already in progress")

    if (
        phase is None
        and record.run_state == "RUNNING"
        and record.run_attempt_id is not None
    ):
        # Upgrade safety for an in-flight record written by the pre-journal
        # release. CAS cannot know whether that old provider request succeeded,
        # so lease expiry must quarantine it instead of minting new authority.
        record.provider_run_phase = "ORPHANED"
        record.provider_reconciliation_detail = (
            "legacy in-flight provider attempt has no durable phase journal; "
            "automatic retry could repeat external spend"
        )
        record.run_state = "ORPHANED"
        record.run_lease_until = None
        return record

    if phase == "REQUEST_STARTED":
        record.provider_run_phase = "ORPHANED"
        record.provider_reconciliation_detail = (
            "the prior provider request crossed REQUEST_STARTED without a durable "
            "provider result; automatic retry could repeat external spend"
        )
        record.run_state = "ORPHANED"
        record.run_lease_until = None
        return record
    if phase == "ORPHANED":
        return record
    if phase == "FINALIZED":
        raise AuditRunInProgress("audit run is already finalized")

    if record.provider_idempotency_key is None:
        record.provider_idempotency_key = f"cas-run-{uuid.uuid4().hex}"
    if phase is None:
        record.provider_run_phase = "CLAIMED"
        record.provider_result_checkpoint = None
        record.provider_trace_id = None
        record.provider_reconciliation_detail = None
    record.run_attempt_id = uuid.uuid4().hex
    record.run_fence += 1
    record.run_state = "RUNNING"
    record.run_lease_until = (now + timedelta(seconds=lease_seconds)).isoformat()
    return record


def _apply_provider_request_started(
    record: AuditSessionRecord, run_attempt_id: str
) -> AuditSessionRecord:
    _require_current_provider_attempt(record, run_attempt_id)
    if record.provider_run_phase == "REQUEST_STARTED":
        return record
    if record.provider_run_phase != "CLAIMED":
        raise AuditRunInProgress(
            f"provider request cannot start from phase {record.provider_run_phase!r}"
        )
    record.provider_run_phase = "REQUEST_STARTED"
    record.updated_at = _utc_now()
    return record


def _apply_provider_completed(
    record: AuditSessionRecord,
    *,
    run_attempt_id: str,
    result_checkpoint: dict[str, Any],
    trace_id: str,
) -> AuditSessionRecord:
    _require_current_provider_attempt(record, run_attempt_id)
    if record.provider_run_phase == "PROVIDER_COMPLETED":
        if (
            record.provider_trace_id != trace_id
            or record.provider_result_checkpoint != result_checkpoint
        ):
            raise AuditRunInProgress("provider completion checkpoint conflicts")
        return record
    if record.provider_run_phase != "REQUEST_STARTED":
        raise AuditRunInProgress(
            f"provider completion cannot be recorded from phase {record.provider_run_phase!r}"
        )
    record.provider_result_checkpoint = _json_copy(result_checkpoint)
    record.provider_trace_id = trace_id
    record.provider_run_phase = "PROVIDER_COMPLETED"
    record.updated_at = _utc_now()
    return record


def _apply_provider_evidence_persisted(
    record: AuditSessionRecord, *, run_attempt_id: str, trace_id: str
) -> AuditSessionRecord:
    _require_current_provider_attempt(record, run_attempt_id)
    if record.provider_run_phase not in {"PROVIDER_COMPLETED", "EVIDENCE_PERSISTED"}:
        raise AuditRunInProgress(
            f"evidence cannot be persisted from phase {record.provider_run_phase!r}"
        )
    if record.provider_trace_id != trace_id:
        raise AuditRunInProgress("provider trace does not match the durable checkpoint")
    if record.provider_run_phase == "EVIDENCE_PERSISTED":
        return record
    record.provider_run_phase = "EVIDENCE_PERSISTED"
    record.updated_at = _utc_now()
    return record


def _apply_provider_finalized(
    record: AuditSessionRecord, *, run_attempt_id: str, trace_id: str
) -> AuditSessionRecord:
    if record.run_attempt_id != run_attempt_id:
        raise AuditRunInProgress("stale audit run attempt")
    if record.provider_run_phase == "FINALIZED":
        if record.provider_trace_id != trace_id:
            raise AuditRunInProgress("finalized provider trace conflicts")
        return record
    if record.provider_run_phase != "EVIDENCE_PERSISTED":
        raise AuditRunInProgress(
            f"provider run cannot finalize from phase {record.provider_run_phase!r}"
        )
    if (
        record.provider_trace_id != trace_id
        or record.evidence_packet_trace_id != trace_id
    ):
        raise AuditRunInProgress("provider evidence is not attached to this audit")
    record.provider_run_phase = "FINALIZED"
    record.provider_result_checkpoint = None
    record.provider_reconciliation_detail = None
    record.run_state = None
    record.run_lease_until = None
    record.updated_at = _utc_now()
    return record


def _apply_provider_orphaned(
    record: AuditSessionRecord, run_attempt_id: str, detail: str
) -> AuditSessionRecord:
    _require_current_provider_attempt(record, run_attempt_id)
    if record.provider_run_phase in {"PROVIDER_COMPLETED", "EVIDENCE_PERSISTED", "FINALIZED"}:
        # A durable result exists, so recovery must resume it rather than erase
        # it. The current request is ending, however, so release only its local
        # reconciliation lease; the next claimant gets a new fence and still
        # cannot call the provider from these phases.
        record.run_state = None
        record.run_lease_until = None
        record.updated_at = _utc_now()
        return record
    if record.provider_run_phase not in {"CLAIMED", "REQUEST_STARTED", "ORPHANED"}:
        raise AuditRunInProgress("provider run cannot be orphaned from its current phase")
    record.provider_run_phase = "ORPHANED"
    record.provider_reconciliation_detail = detail
    record.run_state = "ORPHANED"
    record.run_lease_until = None
    record.updated_at = _utc_now()
    return record


def _require_current_provider_attempt(
    record: AuditSessionRecord, run_attempt_id: str
) -> None:
    if record.run_state != "RUNNING" or record.run_attempt_id != run_attempt_id:
        raise AuditRunInProgress("stale audit run attempt")


def _provider_claim_from_record(
    record: AuditSessionRecord | None,
) -> ProviderRunClaim | None:
    if record is None:
        return None
    if (
        record.run_attempt_id is None
        or record.provider_idempotency_key is None
        or record.provider_run_phase is None
    ):
        raise AuditSessionPersistenceUnavailable(
            "provider run checkpoint is incomplete"
        )
    return ProviderRunClaim(
        run_attempt_id=record.run_attempt_id,
        provider_idempotency_key=record.provider_idempotency_key,
        phase=record.provider_run_phase,
        result_checkpoint=_json_copy(record.provider_result_checkpoint),
        provider_trace_id=record.provider_trace_id,
    )


def _json_copy(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if value is None:
        return None
    copied = json.loads(json.dumps(value, ensure_ascii=True, separators=(",", ":")))
    if not isinstance(copied, dict):
        raise ValueError("checkpoint must be a JSON object")
    return copied


def _apply_evidence(
    record: AuditSessionRecord,
    *,
    evidence_packet_trace_id: str,
    proof_chips: list[dict[str, Any]],
    verifier_decision: dict[str, Any] | None,
    audit_scope: dict[str, Any] | None,
    message: str,
    run_attempt_id: str | None,
) -> AuditSessionRecord:
    if run_attempt_id is not None and (
        record.run_state != "RUNNING" or record.run_attempt_id != run_attempt_id
    ):
        raise AuditRunInProgress("stale audit run attempt")
    if record.evidence_packet_trace_id:
        return record
    record.evidence_packet_trace_id = evidence_packet_trace_id
    record.atlas_deep_link = _atlas_deep_link(evidence_packet_trace_id)
    record.provenance_chips = list(proof_chips)
    record.verifier_decision = dict(verifier_decision) if verifier_decision else None
    record.audit_scope = dict(audit_scope) if audit_scope else None
    record.run_state = None
    record.run_lease_until = None
    _append_event(record, status="EVIDENCE_READY", message=message)
    return record


def _apply_failure(
    record: AuditSessionRecord, message: str, run_attempt_id: str | None
) -> AuditSessionRecord:
    if run_attempt_id is not None and (
        record.run_state != "RUNNING" or record.run_attempt_id != run_attempt_id
    ):
        raise AuditRunInProgress("stale audit run attempt")
    record.run_state = None
    record.run_lease_until = None
    _append_event(record, status="FAILED", message=message)
    return record


def _apply_run(record: AuditSessionRecord) -> AuditSessionRecord:
    if record.status in {"SCAFFOLD_PENDING_RUNNER", "EVIDENCE_PENDING", "COMPLETE", "FAILED"}:
        return record
    _append_event(
        record,
        status="VALIDATING",
        message="Input contract validated. License and external model billing are not active in M3.1.",
    )
    _append_event(
        record,
        status="RUNNING",
        message=(
            "M3 evidence-gated verdict runner started. It cannot ACCEPT without "
            "complete proof chips and an explicit verifier decision."
        ),
    )
    result = run_evidence_gated_verdict(
        evidence_packet_trace_id=record.evidence_packet_trace_id,
        proof_chips=record.provenance_chips,
        explicit_verifier_decision=record.verifier_decision,
    )
    record.verdict = result.verdict
    record.confidence = result.confidence
    _append_event(record, status=result.status, message=result.message)
    return record
