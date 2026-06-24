"""
BIBI Cars — Wave 12C — Forecasting 360 configuration

*Deterministic* probability tables for the stage-conversion model. Default
values live here so that we can later promote them to an admin surface
(`/admin/settings/forecast`) without touching every aggregator.

The contract is intentionally tiny:

    from app.wave12.forecast_config import stage_probability, HORIZONS
    p = stage_probability("awaiting_deposit")    # → 0.35

Unknown stages fall back to ``DEFAULT_UNKNOWN`` so that brand-new stages
added by the team don't silently break the forecast.
"""
from __future__ import annotations
from typing import Dict, Tuple

# Probabilities are read as the chance an *open* deal at this stage will
# eventually generate revenue. They are *not* the chance of moving to the
# next stage. (A deal at "contract" has a 75% chance of closing as paid
# revenue.)
STAGE_PROBABILITY: Dict[str, float] = {
    "new":                  0.10,
    "lead":                 0.10,
    "qualification":        0.15,
    "contacted":            0.15,
    "negotiation":          0.25,
    "awaiting_deposit":     0.35,
    "deposit":              0.55,
    "deposit_paid":         0.60,
    "contract":             0.75,
    "contract_signed":      0.80,
    "payment":              0.85,
    "payment_received":     0.88,
    "in_transit":           0.85,
    "shipping":             0.85,
    "customs":              0.90,
    "ready_for_delivery":   0.95,
    "delivery":             0.95,
    "delivered":            1.00,
    # terminal/negative — explicit zeros so the forecaster never counts them
    "cancelled":            0.00,
    "refunded":             0.00,
    "closed_won":           1.00,
    "closed_lost":          0.00,
    "lost":                 0.00,
}

DEFAULT_UNKNOWN: float = 0.30  # safe middle if we see an unknown stage

# Forecast horizons (in days). The Overview tab uses 30/60/90; Cash Flow
# uses weeks; Pipeline + Capacity use months.
HORIZONS: Tuple[int, ...] = (30, 60, 90)
MAX_HORIZON: int = 90

# Cash-flow projection assumes a payment lands by ETA. If a deal has no
# ETA, we fall back to created_at + DEFAULT_PAYMENT_LAG_DAYS so the
# revenue is at least visible somewhere on the timeline.
DEFAULT_PAYMENT_LAG_DAYS: int = 30

# Capacity model — a single manager can comfortably run this many open
# deals at once. The capacity tab compares load_today vs this number to
# generate the utilisation %.
MANAGER_TARGET_OPEN_DEALS: int = 8

# Carrier capacity — same idea, for the Delivery side.
CARRIER_TARGET_OPEN_LOADS: int = 12

# Risk weights — used by /api/forecast/risk. Higher = more revenue at risk.
RISK_WEIGHT_BY_SEGMENT: Dict[str, float] = {
    "healthy":  0.00,
    "on_track": 0.00,
    "warning":  0.25,
    "delay_risk": 0.30,
    "at_risk":  0.60,
    "delayed":  0.55,
    "critical": 0.90,
}


def stage_probability(stage: str | None) -> float:
    """Return the close-probability for a given pipeline stage.

    Reads from the *runtime* table (admin-overridable via ops_policy), falling
    back to ``DEFAULT_UNKNOWN`` for unknown stages so we never silently drop
    revenue out of the forecast.
    """
    if not stage:
        return _RUNTIME["default_unknown_probability"]
    return _RUNTIME["stage_probability"].get(stage.lower(), _RUNTIME["default_unknown_probability"])


# ── runtime config (admin-overridable via app.services.ops_policy) ───────────
# These mutable values default to the constants above and are refreshed from
# the DB-backed Ops Policy before each forecast computation. Consumers MUST use
# the accessor functions below (not the ALL-CAPS constants) so admin edits take
# effect without a restart.
_RUNTIME: Dict[str, object] = {
    "default_unknown_probability": DEFAULT_UNKNOWN,
    "default_payment_lag_days": DEFAULT_PAYMENT_LAG_DAYS,
    "manager_target_open_deals": MANAGER_TARGET_OPEN_DEALS,
    "carrier_target_open_loads": CARRIER_TARGET_OPEN_LOADS,
    "stage_probability": dict(STAGE_PROBABILITY),
    "risk_weight_by_segment": dict(RISK_WEIGHT_BY_SEGMENT),
}


def refresh_from_policy(forecast_cfg: Dict[str, object]) -> None:
    """Update the runtime config from an Ops Policy 'forecast' section.
    Unknown / missing keys keep their current value (safe partial update)."""
    if not isinstance(forecast_cfg, dict):
        return
    for k in ("default_unknown_probability", "default_payment_lag_days",
              "manager_target_open_deals", "carrier_target_open_loads"):
        if forecast_cfg.get(k) is not None:
            _RUNTIME[k] = forecast_cfg[k]
    if isinstance(forecast_cfg.get("stage_probability"), dict) and forecast_cfg["stage_probability"]:
        _RUNTIME["stage_probability"] = {str(k).lower(): float(v) for k, v in forecast_cfg["stage_probability"].items()}
    if isinstance(forecast_cfg.get("risk_weight_by_segment"), dict) and forecast_cfg["risk_weight_by_segment"]:
        _RUNTIME["risk_weight_by_segment"] = {str(k).lower(): float(v) for k, v in forecast_cfg["risk_weight_by_segment"].items()}


def default_payment_lag_days() -> int:
    return int(_RUNTIME["default_payment_lag_days"])


def manager_target_open_deals() -> int:
    return int(_RUNTIME["manager_target_open_deals"])


def carrier_target_open_loads() -> int:
    return int(_RUNTIME["carrier_target_open_loads"])


def risk_weight(segment: str | None) -> float:
    return float(_RUNTIME["risk_weight_by_segment"].get((segment or "").lower(), 0.0))


__all__ = [
    "STAGE_PROBABILITY",
    "DEFAULT_UNKNOWN",
    "HORIZONS",
    "MAX_HORIZON",
    "DEFAULT_PAYMENT_LAG_DAYS",
    "MANAGER_TARGET_OPEN_DEALS",
    "CARRIER_TARGET_OPEN_LOADS",
    "RISK_WEIGHT_BY_SEGMENT",
    "stage_probability",
    "refresh_from_policy",
    "default_payment_lag_days",
    "manager_target_open_deals",
    "carrier_target_open_loads",
    "risk_weight",
]
