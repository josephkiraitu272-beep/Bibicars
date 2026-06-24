"""
BIBI Cars — Operations Policy (admin-editable model parameters)

Single source of truth for the *tunable* coefficients/thresholds that were
previously hardcoded across the analytics modules:

  • forecast  — stage close-probabilities, payment lag, capacity targets,
                risk weights, unknown-stage fallback
  • sla       — Operations 360 SLA time thresholds
  • contract  — Contract-health grace / expiry windows

Stored in ``app_settings`` under key ``ops_policy`` (mirrors the legal_policy
pattern). The aggregators fetch these at request time so an admin can change
them in Admin → Settings and every downstream calculation updates immediately.

Defaults are sourced from the original modules so behaviour is unchanged until
an admin edits a value.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.wave12 import forecast_config as fc
from app.wave15 import contract_health as ch

logger = logging.getLogger("bibi.ops_policy")

COLLECTION = "app_settings"
SETTINGS_KEY = "ops_policy"


def build_defaults() -> Dict[str, Any]:
    return {
        "forecast": {
            "default_unknown_probability": fc.DEFAULT_UNKNOWN,
            "default_payment_lag_days": fc.DEFAULT_PAYMENT_LAG_DAYS,
            "manager_target_open_deals": fc.MANAGER_TARGET_OPEN_DEALS,
            "carrier_target_open_loads": fc.CARRIER_TARGET_OPEN_LOADS,
            "stage_probability": dict(fc.STAGE_PROBABILITY),
            "risk_weight_by_segment": dict(fc.RISK_WEIGHT_BY_SEGMENT),
        },
        "sla": {
            "lead_response_minutes": 15,
            "deal_stuck_days": 7,
            "deposit_pending_days": 3,
            "carrier_unassigned_days": 2,
            "customs_days": 14,
        },
        "contract": {
            "unsigned_grace_days": ch.UNSIGNED_GRACE_DAYS,
            "expiry_warn_days": ch.EXPIRY_WARN_DAYS,
        },
    }


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


async def get_policy(db) -> Dict[str, Any]:
    """Return the merged ops policy. Seeds defaults on first read."""
    defaults = build_defaults()
    try:
        doc = await db[COLLECTION].find_one({"key": SETTINGS_KEY}, {"_id": 0})
    except Exception as e:
        logger.warning("[ops_policy] read failed: %s", e)
        doc = None

    if doc and isinstance(doc.get("value"), dict):
        merged = _deep_merge(defaults, doc["value"])
        merged["updated_at"] = doc.get("updated_at")
        merged["updated_by"] = doc.get("updated_by")
        return merged

    now = datetime.now(timezone.utc).isoformat()
    try:
        await db[COLLECTION].update_one(
            {"key": SETTINGS_KEY},
            {"$set": {"key": SETTINGS_KEY, "value": defaults, "updated_at": now, "updated_by": "system"}},
            upsert=True,
        )
    except Exception as e:
        logger.warning("[ops_policy] seed failed: %s", e)
    return {**defaults, "updated_at": now, "updated_by": "system"}


async def set_policy(db, value: Dict[str, Any], by_email: Optional[str]) -> Dict[str, Any]:
    """Merge-update the ops policy (partial updates allowed)."""
    current = await get_policy(db)
    current.pop("updated_at", None)
    current.pop("updated_by", None)
    merged = _deep_merge(current, value or {})
    now = datetime.now(timezone.utc).isoformat()
    await db[COLLECTION].update_one(
        {"key": SETTINGS_KEY},
        {"$set": {"key": SETTINGS_KEY, "value": merged, "updated_at": now, "updated_by": by_email or "admin"}},
        upsert=True,
    )
    return {**merged, "updated_at": now, "updated_by": by_email or "admin"}


# ── consumers ───────────────────────────────────────────────────────────────
async def refresh_forecast(db) -> None:
    """Push the forecast section into the live forecast_config runtime."""
    pol = await get_policy(db)
    fc.refresh_from_policy(pol.get("forecast") or {})


async def get_sla_thresholds(db) -> Dict[str, Any]:
    pol = await get_policy(db)
    return {**build_defaults()["sla"], **(pol.get("sla") or {})}


async def get_contract_thresholds(db) -> Dict[str, Any]:
    pol = await get_policy(db)
    return {**build_defaults()["contract"], **(pol.get("contract") or {})}


async def refresh_contract(db) -> None:
    """Push the contract section into the live contract_health runtime."""
    pol = await get_policy(db)
    ch.refresh_from_policy(pol.get("contract") or {})
