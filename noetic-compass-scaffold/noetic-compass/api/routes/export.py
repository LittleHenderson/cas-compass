"""GET /assessments/export — retrieve stored assessments for the authenticated user."""

from __future__ import annotations

import csv
import io
import json
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from api.store import get_assessments
from api.utils.csv_safety import csv_download_headers, sanitize_csv_row

router = APIRouter(tags=["export"])


class ExportResponse(BaseModel):
    """Paginated list of persisted assessments."""

    assessments: list[dict[str, Any]]
    count: int
    limit: int
    offset: int


@router.get(
    "/assessments/export",
    response_model=None,
    responses={200: {"model": ExportResponse}},
)
async def export_assessments(
    request: Request,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    format: str = Query(default="json", pattern="^(json|csv)$"),
) -> ExportResponse | PlainTextResponse:
    """Return saved assessments for the authenticated API key as JSON or CSV."""
    api_key: str = getattr(getattr(request, "state", None), "api_key", "default")
    records = await get_assessments(api_key=api_key, limit=limit, offset=offset)
    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "timestamp", "text", "composite", "certification", "response_json"])
        for record in records:
            resp_obj = record.get("response") if isinstance(record.get("response"), dict) else {}
            nccs = resp_obj.get("nccs") if isinstance(resp_obj.get("nccs"), dict) else {}
            writer.writerow(
                sanitize_csv_row(
                    [
                        record.get("id", ""),
                        record.get("timestamp", "") or "",
                        record.get("text", ""),
                        nccs.get("composite", ""),
                        nccs.get("certification", ""),
                        json.dumps(resp_obj, sort_keys=True, ensure_ascii=False),
                    ]
                )
            )
        return PlainTextResponse(
            buf.getvalue(),
            media_type="text/csv",
            headers=csv_download_headers("assessments.csv"),
        )
    return ExportResponse(
        assessments=records,
        count=len(records),
        limit=limit,
        offset=offset,
    )
