"""In-memory tiered token bucket rate limiter (per API key)."""

from __future__ import annotations

import hashlib
import os
import re
from threading import Lock
import time

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from api.config import settings
from api.middleware.auth import (
    is_public_account_capability_request,
    is_public_acceptance_authority_request,
    is_public_acceptance_publication_authorization_request,
    is_public_human_attestation_request,
    is_public_path,
    is_public_support_privacy_notice_request,
)

# Tier definitions: (requests_per_minute, monthly_limit)
# monthly_limit=0 means unlimited (enterprise API keys only; interactive sessions always have a finite cap)
TIER_LIMITS: dict[str, tuple[int, int]] = {
    "community": (10, 50),
    "professional": (30, 500),
    "enterprise": (120, 0),
}
DASHBOARD_API_KEY_PREFIX = "dashboard:"
DEFAULT_INTERACTIVE_MONTHLY_LIMIT = 500
_MAX_BUCKETS = 10_000
_ANONYMOUS_EVIDENCE_SHARE_PATTERN = re.compile(
    r"^/evidence/shared/(?P<share_id>shr_[A-Za-z0-9_-]{20,64})$"
)
_EVIDENCE_SHARE_CLIENT_RPM = 120
_EVIDENCE_SHARE_CLIENT_AND_SHARE_RPM = 60
_ACCEPTANCE_AUTHORITY_CLIENT_RPM = 120
_ACCEPTANCE_PUBLICATION_AUTHORIZATION_CLIENT_RPM = 60
_HUMAN_ATTESTATION_CLIENT_RPM = 120
_PUBLIC_CAPABILITY_CLIENT_RPM = 120
_PUBLIC_SUPPORT_NOTICE_CLIENT_RPM = 120
_PUBLIC_AUDIT_SESSION_PREFIXES = (
    "/api/cas-harness/audit/session",
    "/api/cas-harness/audit/sessions",
)
_PUBLIC_AUDIT_UTILITY_PREFIXES = (
    "/api/cas-harness/audit/target/verify",
    "/api/cas-harness/audit/scale-plan",
)
_PUBLIC_AUDIT_SESSION_CLIENT_RPM = 30
_PUBLIC_AUDIT_UTILITY_CLIENT_RPM = 60


def _resolve_interactive_monthly_limit() -> int:
    """Resolve a finite monthly cap for interactive dashboard/account tokens."""
    configured = getattr(settings, "interactive_monthly_limit", None)
    if configured is None:
        raw_env = os.environ.get("NC_INTERACTIVE_MONTHLY_LIMIT", "").strip()
        if raw_env:
            try:
                configured = int(raw_env)
            except ValueError:
                configured = DEFAULT_INTERACTIVE_MONTHLY_LIMIT
        else:
            configured = DEFAULT_INTERACTIVE_MONTHLY_LIMIT
    return max(1, int(configured))


class TokenBucket:
    """Simple token bucket for rate limiting."""

    def __init__(self, rate: float, capacity: int):
        self.rate = rate  # tokens per second
        self.capacity = capacity
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()

    def consume(self, cost: float = 1.0) -> bool:
        if cost <= 0:
            return True
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last_refill = now

        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False


class MonthlyCounter:
    """Tracks monthly usage per API key with bounded key retention."""

    def __init__(self, max_keys: int = _MAX_BUCKETS) -> None:
        self.counts: dict[str, int] = {}
        self.month: int = time.gmtime().tm_mon
        self.max_keys = max(1, int(max_keys))

    def _roll_month_if_needed(self) -> None:
        current_month = time.gmtime().tm_mon
        if current_month != self.month:
            self.counts.clear()
            self.month = current_month

    def increment(self, key: str, cost: int = 1) -> int:
        self._roll_month_if_needed()
        if key not in self.counts and len(self.counts) >= self.max_keys:
            self.counts.pop(next(iter(self.counts)))
        self.counts[key] = self.counts.get(key, 0) + max(0, cost)
        return self.counts[key]

    def try_consume(self, key: str, *, cost: int = 1, limit: int = 0) -> tuple[bool, int]:
        self._roll_month_if_needed()
        if cost <= 0:
            return True, self.counts.get(key, 0)
        current = self.counts.get(key, 0)
        if limit > 0 and current + cost > limit:
            return False, current
        if key not in self.counts and len(self.counts) >= self.max_keys:
            self.counts.pop(next(iter(self.counts)))
        new_count = current + cost
        self.counts[key] = new_count
        return True, new_count

    def get_count(self, key: str) -> int:
        self._roll_month_if_needed()
        return self.counts.get(key, 0)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-API-key tiered rate limiting using token bucket + monthly cap."""

    def __init__(
        self,
        app,
        rpm: int | None = None,
        interactive_monthly_limit: int | None = None,
        public_audit_session_rpm: int = _PUBLIC_AUDIT_SESSION_CLIENT_RPM,
        public_audit_utility_rpm: int = _PUBLIC_AUDIT_UTILITY_CLIENT_RPM,
    ):  # type: ignore[no-untyped-def]
        super().__init__(app)
        tier = settings.rate_limit_tier.lower()
        _tier_rpm, self.monthly_limit = TIER_LIMITS.get(tier, TIER_LIMITS["community"])
        self.rpm = rpm or settings.rate_limit_rpm
        self.interactive_monthly_limit = (
            max(1, int(interactive_monthly_limit))
            if interactive_monthly_limit is not None
            else _resolve_interactive_monthly_limit()
        )
        self.public_audit_session_rpm = max(1, int(public_audit_session_rpm))
        self.public_audit_utility_rpm = max(1, int(public_audit_utility_rpm))
        self._lock = Lock()
        self.buckets: dict[str, TokenBucket] = {}
        self.monthly = MonthlyCounter(max_keys=_MAX_BUCKETS)
        self.sensitive_buckets: dict[str, TokenBucket] = {}
        self.sensitive_rpm = 60

    def _get_bucket(self, key: str) -> TokenBucket:
        bucket = self.buckets.get(key)
        if bucket is None:
            if len(self.buckets) >= _MAX_BUCKETS:
                self.buckets.pop(next(iter(self.buckets)))
            bucket = TokenBucket(
                rate=self.rpm / 60.0,
                capacity=self.rpm,
            )
            self.buckets[key] = bucket
        return bucket

    def _consume_sensitive_bucket(self, *, key: str, rpm: int) -> bool:
        with self._lock:
            bucket = self.sensitive_buckets.get(key)
            if bucket is None:
                if len(self.sensitive_buckets) >= _MAX_BUCKETS:
                    self.sensitive_buckets.pop(next(iter(self.sensitive_buckets)))
                bucket = TokenBucket(rate=rpm / 60.0, capacity=rpm)
                self.sensitive_buckets[key] = bucket
            return bucket.consume()

    def effective_monthly_limit(self, api_key: str) -> int:
        """Return the active monthly limit for ``api_key``.

        Interactive dashboard/account identities receive a finite, configurable
        monthly cap rather than an unlimited bypass.
        """
        if api_key.startswith((DASHBOARD_API_KEY_PREFIX, "account:")):
            return self.interactive_monthly_limit
        return self.monthly_limit

    def consume_work_units(self, api_key: str, additional_units: int) -> tuple[bool, str]:
        """Atomically debit additional per-item work units (e.g., for ``/batch``).

        The HTTP request itself already consumed 1 token/unit in ``dispatch``;
        callers pass ``additional_units = item_count - 1`` so total accounting
        equals ``item_count`` and fails closed before fan-out begins.
        """
        if additional_units <= 0:
            return True, ""
        with self._lock:
            monthly_limit = self.effective_monthly_limit(api_key)
            if monthly_limit > 0:
                current = self.monthly.get_count(api_key)
                if current + additional_units > monthly_limit:
                    return (
                        False,
                        f"Monthly limit exceeded ({monthly_limit} assessments). "
                        f"Upgrade tier or wait until next month.",
                    )
            bucket = self._get_bucket(api_key)
            if not bucket.consume(float(additional_units)):
                return (
                    False,
                    "Rate limit exceeded (per-minute batch work budget)",
                )
            if monthly_limit > 0:
                ok, _ = self.monthly.try_consume(
                    api_key, cost=additional_units, limit=monthly_limit
                )
                if not ok:
                    bucket.tokens = min(
                        float(bucket.capacity), bucket.tokens + float(additional_units)
                    )
                    return (
                        False,
                        f"Monthly limit exceeded ({monthly_limit} assessments). "
                        f"Upgrade tier or wait until next month.",
                    )
            return True, ""

    def reset_public_audit_buckets_for_tests(self) -> None:
        """Clear public audit IP buckets between isolated test cases."""
        with self._lock:
            for key in list(self.sensitive_buckets):
                if key.startswith("public-audit-"):
                    self.sensitive_buckets.pop(key, None)

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        if request.method == "OPTIONS":
            return await call_next(request)
        request.state.rate_limiter = self
        client_host = request.client.host if request.client is not None else "unknown"
        share_match = _ANONYMOUS_EVIDENCE_SHARE_PATTERN.fullmatch(request.url.path)
        if share_match is not None:
            # The bearer token is intentionally never part of a limiter key. A
            # client-wide bucket stops path cycling; a second, hashed-share
            # bucket limits repeated valid S3 reads without retaining a public
            # share identifier in middleware state.
            share_digest = hashlib.sha256(
                share_match.group("share_id").encode("ascii")
            ).hexdigest()[:24]
            allowed = self._consume_sensitive_bucket(
                key=f"evidence-share-client:{client_host}",
                rpm=_EVIDENCE_SHARE_CLIENT_RPM,
            )
            if allowed:
                allowed = self._consume_sensitive_bucket(
                    key=f"evidence-share:{client_host}:{share_digest}",
                    rpm=_EVIDENCE_SHARE_CLIENT_AND_SHARE_RPM,
                )
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded (evidence share)"},
                    headers={
                        "Cache-Control": "no-store, max-age=0",
                        "Pragma": "no-cache",
                    },
                )
            return await call_next(request)
        if is_public_acceptance_authority_request(
            request.url.path, request.method, request.url.query
        ):
            # Public verifier reads have no API key, so give them a bounded
            # client-IP bucket without retaining evidence bytes or credentials.
            if not self._consume_sensitive_bucket(
                key=f"acceptance-authority-client:{client_host}",
                rpm=_ACCEPTANCE_AUTHORITY_CLIENT_RPM,
            ):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded (acceptance authority)"},
                    headers={
                        "Cache-Control": "no-store, max-age=0",
                        "Pragma": "no-cache",
                    },
                )
            return await call_next(request)
        if is_public_acceptance_publication_authorization_request(
            request.url.path, request.method, request.url.query
        ):
            # A separate, tighter bucket prevents content-address cycling from
            # consuming the public gate-document allowance.
            if not self._consume_sensitive_bucket(
                key=f"acceptance-publication-authorization-client:{client_host}",
                rpm=_ACCEPTANCE_PUBLICATION_AUTHORIZATION_CLIENT_RPM,
            ):
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Rate limit exceeded (publication authorization)"
                    },
                    headers={
                        "Cache-Control": "no-store, max-age=0",
                        "Pragma": "no-cache",
                    },
                )
            return await call_next(request)
        if is_public_human_attestation_request(
            request.url.path, request.method, request.url.query
        ):
            if not self._consume_sensitive_bucket(
                key=f"human-attestation-client:{client_host}",
                rpm=_HUMAN_ATTESTATION_CLIENT_RPM,
            ):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded (human attestation)"},
                    headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
                )
            return await call_next(request)
        if is_public_account_capability_request(
            request.url.path, request.method, request.url.query
        ):
            # The startup handshake is anonymous but still bounded by client
            # IP.  Never put Authorization, query text, or response bytes in a
            # limiter key.
            if not self._consume_sensitive_bucket(
                key=f"public-capability-client:{client_host}",
                rpm=_PUBLIC_CAPABILITY_CLIENT_RPM,
            ):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded (public capability)"},
                    headers={
                        "Cache-Control": "no-store, max-age=0",
                        "Pragma": "no-cache",
                        "Expires": "0",
                        "X-Content-Type-Options": "nosniff",
                    },
                )
            return await call_next(request)
        if is_public_support_privacy_notice_request(
            request.url.path, request.method, request.url.query
        ):
            # The landing form needs a current server-owned notice identity
            # before it may submit PII. Keep this exact anonymous GET bounded
            # without retaining notice bytes or request headers in the key.
            if not self._consume_sensitive_bucket(
                key=f"public-support-notice-client:{client_host}",
                rpm=_PUBLIC_SUPPORT_NOTICE_CLIENT_RPM,
            ):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded (public support notice)"},
                    headers={
                        "Cache-Control": "no-store, max-age=0",
                        "Pragma": "no-cache",
                        "Expires": "0",
                        "X-Content-Type-Options": "nosniff",
                    },
                )
            return await call_next(request)
        sensitive_public = {
            "/auth/token": self.sensitive_rpm,
            "/accounts/bootstrap": self.sensitive_rpm,
            "/accounts/invite/redeem": self.sensitive_rpm,
            "/platform/tenants": self.sensitive_rpm,
            "/platform/billing/manual-comped-subscription": self.sensitive_rpm,
            # Signed provider deliveries can legitimately burst at renewal time,
            # but malformed-signature floods must not bypass all throttling.
            "/billing/webhook/stripe": 600,
        }
        if request.url.path in sensitive_public:
            key = f"{request.url.path}:{client_host}"
            if not self._consume_sensitive_bucket(
                key=key, rpm=sensitive_public[request.url.path]
            ):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded (credential endpoint)"},
                )
            return await call_next(request)
        # Throttle public audit/session endpoints BEFORE the generic public-path bypass
        # using a bounded per-IP token bucket so unauthenticated floods cannot exhaust
        # session state or compute.
        if any(request.url.path.startswith(p) for p in _PUBLIC_AUDIT_UTILITY_PREFIXES):
            if not self._consume_sensitive_bucket(
                key=f"public-audit-utility-client:{client_host}",
                rpm=self.public_audit_utility_rpm,
            ):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded (public audit endpoint)"},
                    headers={
                        "Cache-Control": "no-store, max-age=0",
                        "Pragma": "no-cache",
                    },
                )
            return await call_next(request)
        if is_public_path(request.url.path) and any(
            request.url.path.startswith(p) for p in _PUBLIC_AUDIT_SESSION_PREFIXES
        ):
            if not self._consume_sensitive_bucket(
                key=f"public-audit-session-client:{client_host}",
                rpm=self.public_audit_session_rpm,
            ):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded (public audit session)"},
                    headers={
                        "Cache-Control": "no-store, max-age=0",
                        "Pragma": "no-cache",
                    },
                )
            return await call_next(request)
        if is_public_path(request.url.path):
            return await call_next(request)

        api_key = getattr(request.state, "api_key", "default")

        with self._lock:
            # Per-minute rate limit
            bucket = self._get_bucket(api_key)
            if not bucket.consume():
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded (per-minute)"},
                )

            # Monthly cap (interactive dashboard/account sessions use a finite cap
            # rather than an unlimited 0 bypass).
            monthly_limit = self.effective_monthly_limit(api_key)
            if monthly_limit > 0:
                allowed, _ = self.monthly.try_consume(
                    api_key, cost=1, limit=monthly_limit
                )
                if not allowed:
                    return JSONResponse(
                        status_code=429,
                        content={
                            "detail": f"Monthly limit exceeded ({monthly_limit} assessments). "
                            f"Upgrade tier or wait until next month.",
                        },
                    )

        return await call_next(request)
