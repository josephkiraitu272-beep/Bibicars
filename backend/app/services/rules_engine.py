"""
BIBI Cars — Rules Engine (real, DB-backed)

Replaces the previous hardcoded/stub endpoints for:
  * Scoring rules   (db.scoring_rules)
  * Routing rules   (db.routing_rules)
  * Cadence engine  (db.cadence_definitions, db.cadence_runs)

Everything here is *pure* logic + thin Mongo accessors so the FastAPI routes
in server.py stay tiny and the evaluation logic is unit-testable and reusable
(e.g. lead scoring is also consumed by the manager insights endpoint).

No mock data. Defaults are *seeded once* into Mongo on first read (mirrors the
legal_policy pattern) so an admin can immediately edit/extend them and the
edits persist.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ════════════════════════════════════════════════════════════════════════════
#  CONDITION EVALUATION  (shared by scoring + routing)
# ════════════════════════════════════════════════════════════════════════════
def _coerce(a: Any, b: Any):
    """Best-effort numeric coercion so 'value > 30000' works on strings."""
    try:
        return float(a), float(b)
    except (TypeError, ValueError):
        return a, b


def evaluate_condition(cond: Optional[Dict[str, Any]], entity: Dict[str, Any]) -> bool:
    """
    Evaluate a single ``{field, operator, value}`` condition against an entity
    dict (lead / deal). Unknown operators or missing fields → False (safe).

    Supported operators: exists, not_exists, eq, ne, gt, gte, lt, lte,
    contains, in.
    """
    if not cond or not isinstance(cond, dict):
        return False
    field = cond.get("field")
    op = (cond.get("operator") or "exists").lower()
    target = cond.get("value")
    if not field:
        return False

    actual = entity.get(field)

    if op == "exists":
        return actual not in (None, "", [], {})
    if op == "not_exists":
        return actual in (None, "", [], {})
    if actual is None:
        return False

    if op in ("eq", "=="):
        return str(actual).lower() == str(target).lower()
    if op in ("ne", "!="):
        return str(actual).lower() != str(target).lower()
    if op in ("gt", ">"):
        a, b = _coerce(actual, target); return a > b
    if op in ("gte", ">="):
        a, b = _coerce(actual, target); return a >= b
    if op in ("lt", "<"):
        a, b = _coerce(actual, target); return a < b
    if op in ("lte", "<="):
        a, b = _coerce(actual, target); return a <= b
    if op == "contains":
        return str(target).lower() in str(actual).lower()
    if op == "in":
        opts = target if isinstance(target, (list, tuple)) else str(target).split(",")
        return str(actual).lower() in [str(o).strip().lower() for o in opts]
    return False


# ════════════════════════════════════════════════════════════════════════════
#  SCORING RULES
# ════════════════════════════════════════════════════════════════════════════
SCORING_DEFAULTS: List[Dict[str, Any]] = [
    {"code": "s1", "name": "Fast Lead Response", "scoreType": "lead_score",
     "description": "Lead contacted within 15 minutes",
     "points": 10, "condition": {"field": "response_time_min", "operator": "lt", "value": 15},
     "isActive": True},
    {"code": "s2", "name": "Referral Source", "scoreType": "lead_score",
     "description": "Lead came from a referral",
     "points": 15, "condition": {"field": "source", "operator": "eq", "value": "referral"},
     "isActive": True},
    {"code": "s3", "name": "High Deal Value", "scoreType": "deal_score",
     "description": "Deal value above €30,000",
     "points": 20, "condition": {"field": "value", "operator": "gt", "value": 30000},
     "isActive": True},
    {"code": "s4", "name": "Strong Manager Conversion", "scoreType": "manager_score",
     "description": "Manager conversion rate above 30%",
     "points": 25, "condition": {"field": "conversion_rate", "operator": "gt", "value": 0.3},
     "isActive": False},
]


async def list_scoring_rules(db) -> List[Dict[str, Any]]:
    rows = await db.scoring_rules.find({}, {"_id": 0}).to_list(length=1000)
    if not rows:
        seed = [{**r, "created_at": _now(), "updated_at": _now(), "system": True}
                for r in SCORING_DEFAULTS]
        try:
            await db.scoring_rules.insert_many([dict(s) for s in seed])
        except Exception:
            pass
        rows = await db.scoring_rules.find({}, {"_id": 0}).to_list(length=1000)
    return rows


async def create_scoring_rule(db, data: Dict[str, Any]) -> Dict[str, Any]:
    code = (data.get("code") or f"s_{uuid.uuid4().hex[:8]}").strip()
    doc = {
        "code": code,
        "name": data.get("name") or code,
        "scoreType": data.get("scoreType") or "lead_score",
        "description": data.get("description") or "",
        "points": int(data.get("points") or 0),
        "condition": data.get("condition") or {},
        "isActive": bool(data.get("isActive", True)),
        "created_at": _now(), "updated_at": _now(), "system": False,
    }
    await db.scoring_rules.update_one({"code": code}, {"$set": doc}, upsert=True)
    return doc


async def update_scoring_rule(db, code: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    existing = await db.scoring_rules.find_one({"code": code}, {"_id": 0})
    if not existing:
        return None
    patch = {k: v for k, v in data.items() if k in
             ("name", "scoreType", "description", "points", "condition", "isActive")}
    if "points" in patch and patch["points"] is not None:
        patch["points"] = int(patch["points"])
    patch["updated_at"] = _now()
    await db.scoring_rules.update_one({"code": code}, {"$set": patch})
    return await db.scoring_rules.find_one({"code": code}, {"_id": 0})


async def delete_scoring_rule(db, code: str) -> bool:
    res = await db.scoring_rules.delete_one({"code": code})
    return res.deleted_count > 0


async def toggle_scoring_rule(db, code: str, is_active: Optional[bool] = None) -> Optional[Dict[str, Any]]:
    existing = await db.scoring_rules.find_one({"code": code}, {"_id": 0})
    if not existing:
        return None
    new_val = (not existing.get("isActive")) if is_active is None else bool(is_active)
    await db.scoring_rules.update_one({"code": code}, {"$set": {"isActive": new_val, "updated_at": _now()}})
    return await db.scoring_rules.find_one({"code": code}, {"_id": 0})


async def evaluate_entity_score(db, entity: Dict[str, Any], score_type: str = "lead_score") -> Dict[str, Any]:
    """
    Apply all *active* rules of ``score_type`` to ``entity`` and return the
    total score + which rules matched. This is REAL scoring — used by the
    manager insights endpoint.
    """
    rules = await list_scoring_rules(db)
    total = 0
    matched: List[Dict[str, Any]] = []
    for r in rules:
        if r.get("scoreType") != score_type or not r.get("isActive"):
            continue
        if evaluate_condition(r.get("condition"), entity):
            pts = int(r.get("points") or 0)
            total += pts
            matched.append({"code": r.get("code"), "name": r.get("name"), "points": pts})
    return {"score": total, "matched_rules": matched, "evaluated": len([r for r in rules if r.get("scoreType") == score_type and r.get("isActive")])}


# ════════════════════════════════════════════════════════════════════════════
#  ROUTING RULES
# ════════════════════════════════════════════════════════════════════════════
ROUTING_DEFAULTS: List[Dict[str, Any]] = [
    {"id": "r1", "name": "High Value Leads", "type": "lead_value",
     "condition": {"field": "value", "operator": "gt", "value": 50000},
     "action": "assign_senior", "priority": 1, "isActive": True},
    {"id": "r2", "name": "Referral Leads", "type": "source",
     "condition": {"field": "source", "operator": "eq", "value": "referral"},
     "action": "assign_available", "priority": 2, "isActive": True},
]


async def list_routing_rules(db) -> List[Dict[str, Any]]:
    rows = await db.routing_rules.find({}, {"_id": 0}).to_list(length=1000)
    if not rows:
        seed = [{**r, "created_at": _now(), "updated_at": _now(), "system": True}
                for r in ROUTING_DEFAULTS]
        try:
            await db.routing_rules.insert_many([dict(s) for s in seed])
        except Exception:
            pass
        rows = await db.routing_rules.find({}, {"_id": 0}).to_list(length=1000)
    return sorted(rows, key=lambda r: r.get("priority", 999))


async def create_routing_rule(db, data: Dict[str, Any]) -> Dict[str, Any]:
    rid = (data.get("id") or f"r_{uuid.uuid4().hex[:8]}").strip()
    doc = {
        "id": rid,
        "name": data.get("name") or rid,
        "type": data.get("type") or "lead_value",
        "condition": data.get("condition") or {},
        "action": data.get("action") or "assign_available",
        "priority": int(data.get("priority") or 99),
        "isActive": bool(data.get("isActive", True)),
        "created_at": _now(), "updated_at": _now(), "system": False,
    }
    await db.routing_rules.update_one({"id": rid}, {"$set": doc}, upsert=True)
    return doc


async def update_routing_rule(db, rid: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    existing = await db.routing_rules.find_one({"id": rid}, {"_id": 0})
    if not existing:
        return None
    patch = {k: v for k, v in data.items() if k in
             ("name", "type", "condition", "action", "priority", "isActive")}
    if "priority" in patch and patch["priority"] is not None:
        patch["priority"] = int(patch["priority"])
    patch["updated_at"] = _now()
    await db.routing_rules.update_one({"id": rid}, {"$set": patch})
    return await db.routing_rules.find_one({"id": rid}, {"_id": 0})


async def delete_routing_rule(db, rid: str) -> bool:
    res = await db.routing_rules.delete_one({"id": rid})
    return res.deleted_count > 0


async def toggle_routing_rule(db, rid: str, is_active: Optional[bool] = None) -> Optional[Dict[str, Any]]:
    existing = await db.routing_rules.find_one({"id": rid}, {"_id": 0})
    if not existing:
        return None
    new_val = (not existing.get("isActive")) if is_active is None else bool(is_active)
    await db.routing_rules.update_one({"id": rid}, {"$set": {"isActive": new_val, "updated_at": _now()}})
    return await db.routing_rules.find_one({"id": rid}, {"_id": 0})


async def routing_queue_status(db) -> Dict[str, Any]:
    """Real queue snapshot computed from leads."""
    try:
        pending = await db.leads.count_documents(
            {"$and": [
                {"$or": [{"managerId": {"$in": [None, ""]}}, {"managerId": {"$exists": False}}]},
                {"status": {"$nin": ["converted", "dead", "lost", "unqualified", "customer"]}},
            ]}
        )
        assigned = await db.leads.count_documents(
            {"managerId": {"$nin": [None, ""]}, "status": {"$in": ["new", "contacted", "qualification", "qualified"]}}
        )
        processing = await db.leads.count_documents({"status": "in_progress"})
    except Exception:
        pending = assigned = processing = 0
    return {"pending": pending, "assigned": assigned, "processing": processing}


# ════════════════════════════════════════════════════════════════════════════
#  CADENCE ENGINE
# ════════════════════════════════════════════════════════════════════════════
CADENCE_DEFAULTS: List[Dict[str, Any]] = [
    {"id": "c1", "name": "New Lead Follow-up",
     "description": "Automated follow-up sequence for new leads",
     "isActive": True,
     "steps": [
         {"order": 1, "delay": 0, "action": "notification", "template": "new_lead_welcome"},
         {"order": 2, "delay": 3600, "action": "task", "template": "first_call"},
         {"order": 3, "delay": 86400, "action": "telegram", "template": "follow_up_message"},
     ]},
    {"id": "c2", "name": "Deal Stalled Alert",
     "description": "Alert when a deal has not progressed",
     "isActive": False,
     "steps": [{"order": 1, "delay": 172800, "action": "alert", "template": "deal_stalled"}]},
]


async def list_cadence_definitions(db) -> List[Dict[str, Any]]:
    rows = await db.cadence_definitions.find({}, {"_id": 0}).to_list(length=1000)
    if not rows:
        seed = [{**c, "created_at": _now(), "updated_at": _now(), "system": True}
                for c in CADENCE_DEFAULTS]
        try:
            await db.cadence_definitions.insert_many([dict(s) for s in seed])
        except Exception:
            pass
        rows = await db.cadence_definitions.find({}, {"_id": 0}).to_list(length=1000)
    return rows


async def create_cadence(db, data: Dict[str, Any]) -> Dict[str, Any]:
    cid = (data.get("id") or f"c_{uuid.uuid4().hex[:8]}").strip()
    doc = {
        "id": cid,
        "name": data.get("name") or cid,
        "description": data.get("description") or "",
        "isActive": bool(data.get("isActive", True)),
        "steps": data.get("steps") or [],
        "created_at": _now(), "updated_at": _now(), "system": False,
    }
    await db.cadence_definitions.update_one({"id": cid}, {"$set": doc}, upsert=True)
    return doc


async def update_cadence(db, cid: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    existing = await db.cadence_definitions.find_one({"id": cid}, {"_id": 0})
    if not existing:
        return None
    patch = {k: v for k, v in data.items() if k in ("name", "description", "isActive", "steps")}
    patch["updated_at"] = _now()
    await db.cadence_definitions.update_one({"id": cid}, {"$set": patch})
    return await db.cadence_definitions.find_one({"id": cid}, {"_id": 0})


async def delete_cadence(db, cid: str) -> bool:
    res = await db.cadence_definitions.delete_one({"id": cid})
    return res.deleted_count > 0


async def toggle_cadence(db, cid: str, is_active: Optional[bool] = None) -> Optional[Dict[str, Any]]:
    existing = await db.cadence_definitions.find_one({"id": cid}, {"_id": 0})
    if not existing:
        return None
    new_val = (not existing.get("isActive")) if is_active is None else bool(is_active)
    await db.cadence_definitions.update_one({"id": cid}, {"$set": {"isActive": new_val, "updated_at": _now()}})
    return await db.cadence_definitions.find_one({"id": cid}, {"_id": 0})


async def list_cadence_runs(db) -> List[Dict[str, Any]]:
    return await db.cadence_runs.find({"status": "active"}, {"_id": 0}).sort("startedAt", -1).to_list(length=500)


async def get_cadence_run(db, run_id: str) -> Optional[Dict[str, Any]]:
    return await db.cadence_runs.find_one({"id": run_id}, {"_id": 0})


async def stop_cadence_run(db, run_id: str) -> bool:
    res = await db.cadence_runs.update_one(
        {"id": run_id}, {"$set": {"status": "stopped", "stoppedAt": _now()}}
    )
    return res.modified_count > 0
