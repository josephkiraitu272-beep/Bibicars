"""
BIBI Cars — Risk & Alerts metrics (real, DB-backed)

Replaces the previous static stubs:
  * /api/owner-dashboard        (was all-zeros)
  * /api/risk/manager/{id}      (was static "low"/10)
  * /api/risk/daily-check       (was no-op)
  * /api/alerts , /api/alerts/critical  (was empty)

Every number is computed from live collections (deals, deposits, invoices,
shipments, leads, login_audit, integration_configs, staff). All queries are
defensive (try/except → 0) so a missing collection never 500s the dashboard.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

TERMINAL_DEAL_STAGES = {"delivered", "cancelled", "refunded", "closed_won", "closed_lost", "closed", "lost"}
TERMINAL_LEAD_STATUSES = {"converted", "customer", "dead", "lost", "unqualified"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_dt(v: Any):
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


async def _count(coro_factory, default: int = 0) -> int:
    try:
        return await coro_factory
    except Exception:
        return default


# ── individual signals ──────────────────────────────────────────────────────
async def count_critical_invoices(db) -> int:
    try:
        n = await db.invoices.count_documents({"status": {"$in": ["overdue"]}})
        # also: sent/unpaid invoices past their due date
        now_iso = _now().isoformat()
        n += await db.invoices.count_documents({
            "status": {"$in": ["sent", "unpaid", "pending"]},
            "$or": [{"dueDate": {"$lt": now_iso}}, {"due_date": {"$lt": now_iso}}, {"due_at": {"$lt": now_iso}}],
        })
        return n
    except Exception:
        return 0


async def count_risky_shipments(db) -> int:
    """Shipments that are not delivered/cancelled and have stalled (>7d since update)."""
    try:
        cutoff = (_now() - timedelta(days=7)).isoformat()
        shipments = await db.shipments.find({}, {"_id": 0, "delivery": 1, "status": 1, "updated_at": 1, "updatedAt": 1}).to_list(length=5000)
        risky = 0
        for sh in shipments:
            delivery = sh.get("delivery") or {}
            milestone = (delivery.get("current_milestone") or sh.get("status") or "").lower()
            if milestone in ("delivered", "cancelled") or delivery.get("cancelled"):
                continue
            last = sh.get("updated_at") or sh.get("updatedAt")
            if last and str(last) < cutoff:
                risky += 1
        return risky
    except Exception:
        return 0


async def count_suspicious_sessions(db) -> int:
    """Failed login attempts in the last 24h."""
    try:
        since = (_now() - timedelta(hours=24)).isoformat()
        return await db.login_audit.count_documents({"event": "login", "success": False, "at": {"$gte": since}})
    except Exception:
        return 0


async def count_integrations_down(db) -> int:
    try:
        return await db.integration_configs.count_documents({"$or": [{"health": "down"}, {"status": "error"}, {"status": "down"}]})
    except Exception:
        return 0


async def compute_underperformers(db, limit: int = 5) -> List[Dict[str, Any]]:
    """Managers with >=5 deals and a low win-rate (<15%)."""
    try:
        staff = await db.staff.find({"role": {"$in": ["manager", "team_lead"]}}, {"_id": 0, "id": 1, "managerId": 1, "name": 1, "full_name": 1, "email": 1}).to_list(length=500)
        out = []
        for s in staff:
            mid = s.get("id") or s.get("managerId") or s.get("email")
            if not mid:
                continue
            total = await db.deals.count_documents({"$or": [{"managerId": mid}, {"manager_id": mid}]})
            if total < 5:
                continue
            won = await db.deals.count_documents({"$or": [{"managerId": mid}, {"manager_id": mid}], "stage": {"$in": ["closed_won", "delivered"]}})
            win_rate = won / total if total else 0
            if win_rate < 0.15:
                out.append({
                    "id": mid,
                    "name": s.get("name") or s.get("full_name") or s.get("email"),
                    "deals": total, "won": won, "win_rate": round(win_rate, 3),
                })
        out.sort(key=lambda x: x["win_rate"])
        return out[:limit]
    except Exception:
        return []


# ── public aggregates ───────────────────────────────────────────────────────
async def owner_dashboard(db) -> Dict[str, Any]:
    return {
        "risk": {
            "suspiciousSessions": await count_suspicious_sessions(db),
            "criticalInvoices": await count_critical_invoices(db),
            "riskyShipments": await count_risky_shipments(db),
            "integrationsDown": await count_integrations_down(db),
        },
        "people": {
            "underperformers": await compute_underperformers(db),
        },
    }


async def manager_risk(db, manager_id: str) -> Dict[str, Any]:
    """Per-manager risk score (0-100) computed from real signals."""
    now = _now()
    factors: List[Dict[str, Any]] = []
    score = 0
    mq = {"$or": [{"managerId": manager_id}, {"manager_id": manager_id}]}

    # 1) stuck deals (>7d, non-terminal)
    try:
        deals = await db.deals.find(mq, {"_id": 0, "stage": 1, "updated_at": 1, "stage_updated_at": 1, "created_at": 1}).to_list(length=2000)
    except Exception:
        deals = []
    stuck = 0
    for d in deals:
        if (d.get("stage") or "").lower() in TERMINAL_DEAL_STAGES:
            continue
        last = _to_dt(d.get("stage_updated_at")) or _to_dt(d.get("updated_at")) or _to_dt(d.get("created_at"))
        if last and (now - last).days > 7:
            stuck += 1
    if stuck:
        pts = min(40, stuck * 8)
        score += pts
        factors.append({"factor": "stuck_deals", "count": stuck, "points": pts,
                        "detail": f"{stuck} deal(s) with no progress for 7+ days"})

    # 2) pending deposits >3d
    deal_ids = []
    try:
        deal_ids = [d2.get("id") for d2 in await db.deals.find(mq, {"_id": 0, "id": 1}).to_list(length=2000) if d2.get("id")]
    except Exception:
        pass
    pending_dep = 0
    if deal_ids:
        try:
            deps = await db.deposits.find({"deal_id": {"$in": deal_ids}, "status": "pending"}, {"_id": 0, "created_at": 1}).to_list(length=2000)
            for dep in deps:
                created = _to_dt(dep.get("created_at"))
                if created and (now - created).days > 3:
                    pending_dep += 1
        except Exception:
            pass
    if pending_dep:
        pts = min(30, pending_dep * 10)
        score += pts
        factors.append({"factor": "pending_deposits", "count": pending_dep, "points": pts,
                        "detail": f"{pending_dep} deposit(s) pending for 3+ days"})

    # 3) leads without first response (>1d)
    no_resp = 0
    try:
        leads = await db.leads.find(mq, {"_id": 0, "status": 1, "first_contact_at": 1, "last_contact_at": 1, "created_at": 1}).to_list(length=3000)
        for l in leads:
            if (l.get("status") or "").lower() in TERMINAL_LEAD_STATUSES:
                continue
            if l.get("first_contact_at") or l.get("last_contact_at"):
                continue
            created = _to_dt(l.get("created_at"))
            if created and (now - created).days >= 1:
                no_resp += 1
    except Exception:
        pass
    if no_resp:
        pts = min(30, no_resp * 5)
        score += pts
        factors.append({"factor": "unanswered_leads", "count": no_resp, "points": pts,
                        "detail": f"{no_resp} lead(s) without first response for 24h+"})

    score = min(100, score)
    level = "low" if score < 30 else ("medium" if score < 60 else "high")
    recs = []
    if stuck:
        recs.append("Review and progress stalled deals")
    if pending_dep:
        recs.append("Chase pending deposits")
    if no_resp:
        recs.append("Respond to new leads within SLA")

    return {
        "riskLevel": level,
        "riskScore": score,
        "entityType": "manager",
        "managerId": manager_id,
        "factors": factors,
        "recommendations": recs,
    }


async def build_alerts(db, critical_only: bool = False, limit: int = 50) -> List[Dict[str, Any]]:
    """Construct a real alert feed from live operational signals."""
    now = _now()
    alerts: List[Dict[str, Any]] = []

    # overdue invoices
    try:
        now_iso = now.isoformat()
        async for inv in db.invoices.find(
            {"$or": [{"status": "overdue"},
                     {"status": {"$in": ["sent", "unpaid", "pending"]},
                      "$or": [{"dueDate": {"$lt": now_iso}}, {"due_date": {"$lt": now_iso}}, {"due_at": {"$lt": now_iso}}]}]},
            {"_id": 0, "id": 1, "amount": 1, "total": 1, "customerId": 1, "managerId": 1},
        ).limit(50):
            alerts.append({
                "id": f"inv_{inv.get('id')}",
                "severity": "critical",
                "type": "overdue_invoice",
                "title": "Overdue invoice",
                "message": f"Invoice {inv.get('id')} is overdue (€{inv.get('total') or inv.get('amount') or 0})",
                "entityId": inv.get("id"), "entityType": "invoice",
                "managerId": inv.get("managerId"),
            })
    except Exception:
        pass

    # stuck deals (>7d)
    try:
        async for d in db.deals.find({"stage": {"$nin": list(TERMINAL_DEAL_STAGES)}},
                                     {"_id": 0, "id": 1, "title": 1, "stage": 1, "updated_at": 1, "stage_updated_at": 1, "managerId": 1}).limit(300):
            last = _to_dt(d.get("stage_updated_at")) or _to_dt(d.get("updated_at"))
            if last and (now - last).days > 7:
                alerts.append({
                    "id": f"deal_{d.get('id')}",
                    "severity": "warning",
                    "type": "stuck_deal",
                    "title": "Deal stalled",
                    "message": f"Deal '{d.get('title') or d.get('id')}' stuck {(now - last).days}d at '{d.get('stage')}'",
                    "entityId": d.get("id"), "entityType": "deal",
                    "managerId": d.get("managerId"),
                })
    except Exception:
        pass

    if critical_only:
        alerts = [a for a in alerts if a["severity"] == "critical"]
    # sort critical first
    alerts.sort(key=lambda a: 0 if a["severity"] == "critical" else 1)
    return alerts[:limit]


async def daily_check(db) -> Dict[str, Any]:
    """Run the risk sweep and persist a snapshot to db.risk_checks."""
    od = await owner_dashboard(db)
    alerts = await build_alerts(db, limit=200)
    snapshot = {
        "id": f"riskchk_{int(now_ts())}",
        "at": _now().isoformat(),
        "risk": od["risk"],
        "underperformers": len(od["people"]["underperformers"]),
        "alerts_total": len(alerts),
        "critical_total": len([a for a in alerts if a["severity"] == "critical"]),
    }
    try:
        await db.risk_checks.insert_one(dict(snapshot))
    except Exception:
        pass
    return {"success": True, "snapshot": snapshot}


def now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()
