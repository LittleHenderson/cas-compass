"""POST /batch — batch assessment with bounded async concurrency and work-based metering."""

from __future__ import annotations

import asyncio
import weakref

from fastapi import APIRouter, HTTPException, Request

from api.llm_connectors.registry import get_connector
from api.models import BatchRequest, BatchResponse, WrapResponse
from api.pipeline.runner import WrapPipelineRunner

router = APIRouter()

GLOBAL_BATCH_MAX_CONCURRENCY = 16
_GLOBAL_SEMAPHORES: weakref.WeakKeyDictionary[
    asyncio.AbstractEventLoop, asyncio.Semaphore
] = weakref.WeakKeyDictionary()


def _get_global_batch_semaphore() -> asyncio.Semaphore:
    """Return a per-event-loop global concurrency semaphore shared across /batch calls."""
    loop = asyncio.get_running_loop()
    sem = _GLOBAL_SEMAPHORES.get(loop)
    if sem is None:
        sem = asyncio.Semaphore(GLOBAL_BATCH_MAX_CONCURRENCY)
        _GLOBAL_SEMAPHORES[loop] = sem
    return sem


def _is_authenticated_principal(request: Request) -> bool:
    """Return True when the request carries a real authenticated identity."""
    if getattr(request.state, "account_id", None):
        return True
    user = getattr(request.state, "user", None)
    api_key = getattr(request.state, "api_key", None)
    return (
        isinstance(user, str)
        and user.strip() not in {"", "anonymous"}
        and isinstance(api_key, str)
        and api_key.strip() not in {"", "default"}
    )


@router.post("/batch", response_model=BatchResponse)
async def batch(req: BatchRequest, request: Request) -> BatchResponse:
    """Run the wrap pipeline concurrently for a bounded, metered batch of texts."""
    provider = "mock" if req.mock else req.provider
    is_authenticated = _is_authenticated_principal(request)
    if provider != "mock" and not is_authenticated:
        raise HTTPException(
            status_code=403,
            detail="Authenticated identity is required for non-mock batch providers.",
        )

    # Debit work-based quota for the full batch BEFORE allocating tasks or calling providers.
    # RateLimitMiddleware already debited 1 unit for the HTTP request envelope.
    limiter = getattr(request.state, "rate_limiter", None)
    if limiter is not None:
        effective_key = str(getattr(request.state, "api_key", "default") or "default")
        allowed, detail = limiter.consume_work_units(
            effective_key, additional_units=len(req.texts) - 1
        )
        if not allowed:
            raise HTTPException(status_code=429, detail=detail)

    connector = get_connector(
        provider,
        model=req.model,
        allow_server_credentials=is_authenticated,
    )
    runner = WrapPipelineRunner(connector=connector, dial_config=req.dial_config)

    per_request_sem = asyncio.Semaphore(req.max_concurrency)
    global_sem = _get_global_batch_semaphore()

    async def process_one(text: str) -> WrapResponse | None:
        async with global_sem:
            async with per_request_sem:
                try:
                    return await runner.run(text)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    return None

    tasks = [asyncio.create_task(process_one(text)) for text in req.texts]
    try:
        raw_results = await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise

    results: list[WrapResponse] = []
    succeeded = 0
    failed = 0

    for r in raw_results:
        if r is not None:
            results.append(r)
            succeeded += 1
        else:
            failed += 1

    return BatchResponse(
        results=results,
        total=len(req.texts),
        succeeded=succeeded,
        failed=failed,
    )
