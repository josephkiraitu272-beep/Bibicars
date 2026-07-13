"""
admin_openai_usage — /api/admin/integrations/openai/usage
==========================================================

Wave 2A-CI/2 (Jul 13, 2026) — real-money awareness endpoint.

Exposes a compact JSON rollup of OpenAI spend across canonical windows
(today · 7d · 30d · 90d · all-time) plus a per-model breakdown and the
most recent events. Backs the "OpenAI usage" panel on the Call
Intelligence Hub page.

Security: same posture as sibling admin endpoints — requires an
authenticated staff member; managers see the same numbers admins do
(spend is a team-level metric, not per-manager PII). If we later want
per-manager scoping we can add `?manager_id=…` here without breaking the
rest of the surface.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends

from security import require_manager_or_admin

from app.services import openai_usage as usage_service
from app.services import call_intelligence as ci_service


logger = logging.getLogger("bibi.admin_openai_usage")

router = APIRouter(prefix="/api/admin/integrations/openai", tags=["admin-openai-usage"])


def _db():
    from app.core.db_runtime import get_db
    return get_db()


@router.get("/usage")
async def openai_usage(_user=Depends(require_manager_or_admin)) -> Dict[str, Any]:
    """Return the OpenAI usage rollup for the Call Intelligence dashboard.

    Response shape (see ``openai_usage.usage_rollup``)::

        {
          success: true,
          openai_configured: bool,        # so the widget can hide itself when off
          transcribe_model:  str,
          analyze_model:     str,
          today / week / month / quarter / all_time: { requests, cost_usd, ... },
          by_model:  [{ model, kind, requests, cost_usd }, ...],
          recent:    [{ ts, model, kind, cost_usd, ... }, ...],
          pricing:   { chat, audio },
          currency:  "USD",
          version:   "table:v1",
          as_of:     ISO-8601
        }
    """
    db = _db()
    rollup = await usage_service.usage_rollup(db)
    # Enrich with resolved model names so the frontend can display "which
    # model your spend is based on" without a second request.
    try:
        rollup["openai_configured"] = bool(await ci_service.resolve_api_key())
    except Exception:  # noqa: BLE001
        rollup["openai_configured"] = False
    try:
        rollup["transcribe_model"] = await ci_service.resolve_transcribe_model()
    except Exception:  # noqa: BLE001
        rollup["transcribe_model"] = None
    try:
        rollup["analyze_model"] = await ci_service.resolve_analyze_model()
    except Exception:  # noqa: BLE001
        rollup["analyze_model"] = None
    rollup["success"] = True
    return rollup
