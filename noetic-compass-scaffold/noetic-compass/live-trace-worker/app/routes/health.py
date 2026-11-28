"""GET /health — RunPod health-checks + the API proxy preflight.

M2: surfaces whether real weights are loaded so the API proxy can
fail-fast (HTTP 503) if a caller asks for LIVE mode but the worker is
still in demo mode after warm_load.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response

from ..auth import auth_enabled, insecure_local_dev_allowed
from ..runtime import get_loaded_model
from ..runtime import model_loader

router = APIRouter()

REALMODE_PASS = "REAL_PYTHIA_WEIGHTS_LOADED"
REALMODE_FAIL = "NOT_REAL_PYTHIA_WEIGHTS"


@router.get("/health")
def health() -> dict:
    loaded = get_loaded_model()
    auth_configured = auth_enabled()
    ready = bool(auth_configured or insecure_local_dev_allowed())
    return {
        "status": "ok",
        "worker_version": loaded.manifest.worker_version,
        "model_id": loaded.manifest.model_id,
        "is_real_model": loaded.manifest.is_real_model,
        "model_loaded": loaded.is_real,
        "load_error": loaded.load_error,
        "auth_configured": auth_configured,
        "ready": ready,
    }


@router.get("/health/realmode")
def health_realmode() -> Response:
    """Cheap proof surface for whether real Pythia weights are live now.

    This intentionally does not call get_loaded_model() or warm_load().
    A cold worker must report NOT_REAL_PYTHIA_WEIGHTS until startup has
    actually loaded the model singleton. Production auth must also be active;
    without a configured worker token, readiness is false and HTTP 503 is
    returned.
    """
    fake_runtime_env = model_loader._is_demo_mode_forced()
    loaded = model_loader._LOADED
    manifest = loaded.manifest if loaded is not None else model_loader.PYTHIA_160M_MANIFEST
    manifest_is_real_model = bool(manifest.is_real_model)
    model_loaded = bool(
        loaded is not None
        and loaded.model is not None
        and loaded.tokenizer is not None
    )
    load_error = loaded.load_error if loaded is not None else None
    auth_configured = auth_enabled()

    is_real_model = (
        not fake_runtime_env
        and model_loaded
        and load_error is None
        and manifest_is_real_model
    )
    ready = bool(is_real_model and auth_configured)
    verdict = REALMODE_PASS if ready else REALMODE_FAIL

    payload = {
        "verdict": verdict,
        "is_real_model": is_real_model,
        "fake_runtime_env": fake_runtime_env,
        "model_loaded": model_loaded,
        "load_error": load_error,
        "manifest_is_real_model": manifest_is_real_model,
        "model_id": model_loader.PYTHIA_160M_MODEL_ID,
        "worker_version": manifest.worker_version,
        "auth_configured": auth_configured,
        "ready": ready,
    }
    return JSONResponse(
        status_code=200 if auth_configured else 503,
        content=payload,
    )
