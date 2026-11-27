"""Fail-closed app-level auth for the live-trace worker.

Contract
--------
* ``ATLAS_LIVE_WORKER_TOKEN`` is **required by default** (minimum 16 characters
  at app level; production RunPod launcher enforces >= 24 characters).
  - Every non-health request MUST present ``X-Atlas-Worker-Token: <token>`` or
    receive HTTP 401 (when configured) / HTTP 503 (when missing or too short).
* Tokenless operation is permitted **only** when ALL of the following hold:
  1. ``ATLAS_LIVE_ALLOW_INSECURE_LOCAL_DEV=1`` is explicitly set.
  2. ``LIVE_TRACE_USE_FAKE=1`` is explicitly set (never in real-model mode).
  3. The configured listener host is loopback (``127.0.0.1``, ``localhost``,
     ``::1``).
* Exempt paths: ``/health`` and ``/health/realmode`` remain reachable for
  platform liveness/readiness probes and report ``auth_configured`` / ``ready``.
"""

from __future__ import annotations

import hmac
import ipaddress
import os
import sys

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from .runtime import model_loader

WORKER_TOKEN_ENV = "ATLAS_LIVE_WORKER_TOKEN"
WORKER_TOKEN_HEADER = "X-Atlas-Worker-Token"
INSECURE_LOCAL_DEV_ENV = "ATLAS_LIVE_ALLOW_INSECURE_LOCAL_DEV"
USE_FAKE_ENV = "LIVE_TRACE_USE_FAKE"
DEMO_MODE_ENV = "LIVE_TRACE_DEMO_MODE"
WORKER_HOST_ENV = "ATLAS_LIVE_WORKER_HOST"
MIN_WORKER_TOKEN_LENGTH = 16

# Health paths are reachable without the token so platform health checks and
# readiness probes can observe auth/model status. Keep this list tiny.
EXEMPT_PATHS: frozenset[str] = frozenset({"/health", "/health/realmode"})


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes"}


def _is_falsy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"0", "false", "no"}


def _configured_token() -> str:
    """Return the configured shared secret, or '' when unset/blank.

    Read at request/validation time (not import time) so tests and operators
    can toggle the env var without reconstructing the app.
    """
    return os.environ.get(WORKER_TOKEN_ENV, "").strip()


def auth_enabled() -> bool:
    """True when a valid non-empty ``ATLAS_LIVE_WORKER_TOKEN`` is configured."""
    return len(_configured_token()) >= MIN_WORKER_TOKEN_LENGTH


def _is_loopback_host(host: str | None) -> bool:
    if not host:
        return False
    normalized = host.strip().rstrip(".").lower()
    if normalized.startswith("[") and normalized.endswith("]"):
        normalized = normalized[1:-1]
    if normalized == "localhost":
        return True
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return False


def _extract_cli_host(argv: list[str] | None = None) -> str | None:
    args = sys.argv[1:] if argv is None else argv
    for idx, arg in enumerate(args):
        if arg == "--host" and idx + 1 < len(args):
            return args[idx + 1].strip()
        if arg.startswith("--host="):
            return arg.split("=", 1)[1].strip()
    return None


def resolve_listen_host(host: str | None = None) -> str:
    """Resolve the effective bind host from argument, env, or CLI flags."""
    if host is not None:
        return host.strip()
    for env_name in (WORKER_HOST_ENV, "UVICORN_HOST", "HOST"):
        val = os.environ.get(env_name, "").strip()
        if val:
            return val
    cli_host = _extract_cli_host()
    if cli_host:
        return cli_host
    return "127.0.0.1"


def _is_real_mode_requested() -> bool:
    """True unless fake/demo mode is explicitly requested and no real model is loaded."""
    loaded = model_loader._LOADED
    if loaded is not None and loaded.is_real:
        return True
    use_fake_raw = os.environ.get(USE_FAKE_ENV, "").strip()
    if _is_falsy(use_fake_raw):
        return True
    if _is_truthy(use_fake_raw):
        return False
    if _is_truthy(os.environ.get(DEMO_MODE_ENV, "")):
        return False
    return True


def insecure_local_dev_allowed(host: str | None = None) -> bool:
    """True ONLY when explicit insecure local-dev bypass is valid.

    Requires ALL of:
      * ``ATLAS_LIVE_ALLOW_INSECURE_LOCAL_DEV=1``
      * ``LIVE_TRACE_USE_FAKE=1`` (never allowed in real-model mode)
      * Loaded model singleton is not real
      * Effective listener host is loopback (``127.0.0.1``, ``localhost``, ``::1``)
    """
    if not _is_truthy(os.environ.get(INSECURE_LOCAL_DEV_ENV, "")):
        return False
    if not _is_truthy(os.environ.get(USE_FAKE_ENV, "")):
        return False
    loaded = model_loader._LOADED
    if loaded is not None and loaded.is_real:
        return False
    return _is_loopback_host(resolve_listen_host(host))


def validate_startup_auth_config(host: str | None = None) -> None:
    """Fail startup unless worker auth is properly configured or explicitly local-dev.

    Raises ``RuntimeError`` (causing uvicorn to exit nonzero) when:
      * ``ATLAS_LIVE_WORKER_TOKEN`` is set but shorter than ``MIN_WORKER_TOKEN_LENGTH``
      * Real-model mode (``LIVE_TRACE_USE_FAKE=0`` or default) lacks a valid token
      * Listener host is non-loopback (e.g. ``0.0.0.0``) without a valid token
      * Token is absent and ``ATLAS_LIVE_ALLOW_INSECURE_LOCAL_DEV=1`` +
        ``LIVE_TRACE_USE_FAKE=1`` on loopback is not explicitly active
    """
    token = _configured_token()
    effective_host = resolve_listen_host(host)

    if token:
        if len(token) < MIN_WORKER_TOKEN_LENGTH:
            raise RuntimeError(
                f"{WORKER_TOKEN_ENV} must be at least {MIN_WORKER_TOKEN_LENGTH} "
                f"characters long (got {len(token)})."
            )
        return

    if _is_real_mode_requested():
        raise RuntimeError(
            f"{WORKER_TOKEN_ENV} is required in real-model mode "
            f"(refusing to start without authentication)."
        )

    if not _is_loopback_host(effective_host):
        raise RuntimeError(
            f"{WORKER_TOKEN_ENV} is required when binding non-loopback host "
            f"{effective_host!r}."
        )

    if not insecure_local_dev_allowed(effective_host):
        raise RuntimeError(
            f"{WORKER_TOKEN_ENV} is not configured. Configure a shared secret "
            f"(>= {MIN_WORKER_TOKEN_LENGTH} chars), or for loopback-only fake-mode "
            f"development explicitly set {INSECURE_LOCAL_DEV_ENV}=1 and {USE_FAKE_ENV}=1."
        )


def _token_ok(presented: str | None, expected: str) -> bool:
    if not presented:
        return False
    # Constant-time compare to avoid leaking the secret via timing.
    return hmac.compare_digest(presented.strip(), expected)


class WorkerTokenMiddleware(BaseHTTPMiddleware):
    """Fail-closed shared-secret gate for all non-health worker endpoints."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        expected = _configured_token()
        if not expected:
            if insecure_local_dev_allowed():
                peer = request.client.host if request.client and request.client.host else ""
                if not peer or peer == "testclient" or _is_loopback_host(peer):
                    return await call_next(request)
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "Worker authentication token is not configured",
                    "header": WORKER_TOKEN_HEADER,
                },
            )

        if len(expected) < MIN_WORKER_TOKEN_LENGTH:
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "Worker authentication token is not configured",
                    "header": WORKER_TOKEN_HEADER,
                },
            )

        presented = request.headers.get(WORKER_TOKEN_HEADER)
        if not _token_ok(presented, expected):
            return JSONResponse(
                status_code=401,
                content={
                    "detail": "Missing or invalid Atlas worker token",
                    "header": WORKER_TOKEN_HEADER,
                },
            )
        return await call_next(request)
