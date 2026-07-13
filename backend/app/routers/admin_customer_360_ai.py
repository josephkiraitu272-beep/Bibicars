"""BIBI Cars — Wave 2B — Customer 360 AI Insights + AI Name Detection
====================================================================

Two features attached to the already-shipped Wave 2A-CI (Call Intelligence)
pipeline:

  1. **Customer 360 rollup**  (`GET /api/admin/customers/{cid}/call-intelligence/summary`)
     Aggregates all `call_intelligence` docs tied to a customer (directly by
     `customer_id`, or transitively via the customer's leads) into a single
     compact payload that the Overview360 card can render without loading
     each call.

  2. **AI Name Detection**  (`POST /api/admin/leads/{lid}/detect-name`)
     For leads that came from Ringostat/Viber/Webform without a real name
     (Ringostat only gives the phone), scan the transcripts of that lead's
     calls to guess the customer's first/last name. Uses:
       - a **regex heuristic** first (works offline, no OpenAI needed) —
         matches BG/RU/UK/EN self-introduction patterns
       - falls back to **OpenAI** if a key is configured and the heuristic
         is inconclusive
     Returns a suggestion; the frontend then lets the manager review + apply
     via the regular `PUT /api/leads/{lid}` endpoint.

Both endpoints are protected by the same `require_manager_or_admin` guard
used by the rest of `/api/admin/calls/*`.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.core.db_runtime import get_db
from app.routers.admin_call_intelligence import require_manager_or_admin  # reuse

logger = logging.getLogger("bibi.customer_360_ai")

router = APIRouter(prefix="/api/admin", tags=["customer-360-ai"])


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _serialize(doc: Any) -> Any:
    """Recursively convert ObjectId + datetime for JSON safety."""
    if doc is None:
        return None
    if isinstance(doc, dict):
        return {k: _serialize(v) for k, v in doc.items() if k != "_id"}
    if isinstance(doc, list):
        return [_serialize(x) for x in doc]
    if isinstance(doc, datetime):
        return doc.isoformat()
    return doc


async def _lead_ids_for_customer(db, customer_id: str) -> List[str]:
    ids: List[str] = []
    async for lead in db.leads.find(
        {"$or": [{"customer_id": customer_id}, {"customerId": customer_id}]},
        {"id": 1, "_id": 1},
    ):
        lid = lead.get("id") or lead.get("_id")
        if lid:
            ids.append(str(lid))
    return ids


# ═══════════════════════════════════════════════════════════════════════════
# 1) Customer 360 → AI Insights rollup
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/customers/{customer_id}/call-intelligence/summary",
            summary="Aggregate all AI call analyses for a customer")
async def customer_ai_summary(
    customer_id: str,
    days: int = Query(90, ge=1, le=365, description="Look-back window (days)"),
    user=Depends(require_manager_or_admin),
) -> Dict[str, Any]:
    db = get_db()
    if db is None:
        raise HTTPException(500, "database not available")

    since = datetime.now(timezone.utc) - timedelta(days=days)
    lead_ids = await _lead_ids_for_customer(db, customer_id)

    # Match by customer_id OR any of the customer's lead ids.
    query: Dict[str, Any] = {
        "$or": [
            {"customer_id": customer_id},
            {"customerId":  customer_id},
        ]
    }
    if lead_ids:
        query["$or"].append({"lead_id":  {"$in": lead_ids}})
        query["$or"].append({"leadId":   {"$in": lead_ids}})

    # Only recent
    query["$and"] = [{"$or": query.pop("$or")}, {"created_at": {"$gte": since}}]

    docs: List[Dict[str, Any]] = []
    async for d in db.call_intelligence.find(query).sort("created_at", -1).limit(200):
        docs.append(d)

    if not docs:
        return {
            "success": True,
            "customer_id": customer_id,
            "window_days": days,
            "total_calls": 0,
            "at_risk": False,
        }

    # ── Aggregates ─────────────────────────────────────────────────────
    sentiment_counter = Counter()
    intent_counter    = Counter()
    prob_counter      = Counter()
    languages         = Counter()
    top_objections    = Counter()
    top_risks         = Counter()
    top_vehicle_prefs = Counter()
    open_actions: List[Dict[str, Any]] = []
    agreements: List[str] = []
    confidences: List[float] = []

    for d in docs:
        if d.get("sentiment"):        sentiment_counter[d["sentiment"]] += 1
        if d.get("purchase_intent"):  intent_counter[d["purchase_intent"]] += 1
        if d.get("deal_probability"): prob_counter[d["deal_probability"]] += 1
        if d.get("language"):         languages[d["language"]] += 1
        if isinstance(d.get("confidence"), (int, float)):
            confidences.append(float(d["confidence"]))
        for o in (d.get("objections") or []):
            if isinstance(o, str) and o.strip():
                top_objections[o.strip()] += 1
        for r in (d.get("risks") or []):
            if isinstance(r, str) and r.strip():
                top_risks[r.strip()] += 1
        for v in (d.get("vehicle_preferences") or []):
            if isinstance(v, str) and v.strip():
                top_vehicle_prefs[v.strip()] += 1
        for a in (d.get("agreements") or []):
            if isinstance(a, str) and a.strip():
                agreements.append(a.strip())
        for na in (d.get("next_actions") or []):
            if isinstance(na, dict) and na.get("action"):
                open_actions.append({
                    "action":     na.get("action"),
                    "owner":      na.get("owner") or None,
                    "due_date":   na.get("due_date"),
                    "call_id":    d.get("call_id"),
                    "created_at": d.get("created_at").isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at"),
                })

    latest = docs[0]

    # At-risk if any recent call is negative sentiment with medium+ intent
    at_risk = False
    at_risk_reasons: List[str] = []
    for d in docs[:5]:
        sentiment = (d.get("sentiment") or "").lower()
        intent    = (d.get("purchase_intent") or "").lower()
        if sentiment == "negative" and intent in {"medium", "high", "very_high"}:
            at_risk = True
            at_risk_reasons.append(
                f"Negative sentiment with {intent.replace('_', ' ')} intent on call {d.get('call_id')}"
            )
        if any("конкурент" in (r or "").lower() or "другаде" in (r or "").lower() or "competitor" in (r or "").lower()
               for r in (d.get("risks") or [])):
            at_risk = True
            at_risk_reasons.append("Competitor risk mentioned")

    return {
        "success": True,
        "customer_id":  customer_id,
        "window_days":  days,
        "total_calls":  len(docs),
        "last_analyzed_at": latest.get("created_at").isoformat() if isinstance(latest.get("created_at"), datetime) else latest.get("created_at"),
        "latest": {
            "call_id":         latest.get("call_id"),
            "summary":         latest.get("summary"),
            "sentiment":       latest.get("sentiment"),
            "purchase_intent": latest.get("purchase_intent"),
            "deal_probability": latest.get("deal_probability"),
            "language":        latest.get("language"),
            "confidence":      latest.get("confidence"),
        },
        "sentiment_breakdown":  dict(sentiment_counter),
        "intent_breakdown":     dict(intent_counter),
        "probability_breakdown": dict(prob_counter),
        "languages":            dict(languages),
        "top_objections":       [{"text": t, "count": c} for t, c in top_objections.most_common(5)],
        "top_risks":            [{"text": t, "count": c} for t, c in top_risks.most_common(5)],
        "top_vehicle_prefs":    [{"text": t, "count": c} for t, c in top_vehicle_prefs.most_common(8)],
        "agreements_recent":    agreements[:6],
        "open_next_actions":    open_actions[:8],
        "avg_confidence":       (sum(confidences) / len(confidences)) if confidences else None,
        "at_risk":              at_risk,
        "at_risk_reasons":      at_risk_reasons[:3],
    }


# ═══════════════════════════════════════════════════════════════════════════
# 2) AI Name Detection from call transcripts
# ═══════════════════════════════════════════════════════════════════════════

# Words that should NEVER be treated as a person's name (company names, roles,
# vehicle brands often follow "I'm looking for X" in transcripts).
_STOP_TOKENS = {
    "bibi", "cars", "auto", "мениджър", "manager", "менеджер", "менеджера",
    "клиент", "customer", "потребителя", "здравейте", "здраво", "hello",
    "здравствуйте", "auction", "аукцион", "здрасти", "hi",
    # Common car brands so "Търся BMW X5" isn't misread as "я BMW"
    "bmw", "audi", "vw", "volkswagen", "mercedes", "ford", "kia", "hyundai",
    "toyota", "tesla", "nissan", "porsche", "lexus", "mazda", "skoda", "honda",
    "peugeot", "renault", "opel", "seat", "chevrolet", "mini", "volvo",
}

# Multilingual self-introduction patterns.
# Group 1 must capture the name(s). We take up to 3 Cyrillic/Latin words.
# NOTE: for standalone Russian "я" we require it NOT to be preceded by another
# Cyrillic letter (otherwise "Търся BMW" is falsely matched as "я BMW").
_NAME_PATTERNS: List[re.Pattern[str]] = [
    # Bulgarian
    re.compile(r"(?i)казвам\s+се\s+([A-ZЁА-ЯЇІЄҐ][a-zёа-яїієґ'’\-]+(?:\s+[A-ZЁА-ЯЇІЄҐ][a-zёа-яїієґ'’\-]+){0,2})"),
    re.compile(r"(?i)(?<![A-Za-zА-Яа-яЁёЇїІіЄєҐґ])аз\s+съм\s+([A-ZЁА-ЯЇІЄҐ][a-zёа-яїієґ'’\-]+(?:\s+[A-ZЁА-ЯЇІЄҐ][a-zёа-яїієґ'’\-]+){0,2})"),
    # Russian
    re.compile(r"(?i)меня\s+зовут\s+([A-ZЁА-Я][a-zёа-я'’\-]+(?:\s+[A-ZЁА-Я][a-zёа-я'’\-]+){0,2})"),
    re.compile(r"(?i)(?<![A-Za-zА-Яа-яЁёЇїІіЄєҐґ])я\s+([A-ZЁА-Я][a-zёа-я'’\-]{2,})\b"),
    # Ukrainian
    re.compile(r"(?i)мене\s+звати\s+([A-ZЁА-ЯЇІЄҐ][a-zёа-яїієґ'’\-]+(?:\s+[A-ZЁА-ЯЇІЄҐ][a-zёа-яїієґ'’\-]+){0,2})"),
    re.compile(r"(?i)мене\s+звуть\s+([A-ZЁА-ЯЇІЄҐ][a-zёа-яїієґ'’\-]+(?:\s+[A-ZЁА-ЯЇІЄҐ][a-zёа-яїієґ'’\-]+){0,2})"),
    # English
    re.compile(r"(?i)my\s+name\s+is\s+([A-Z][a-z'’\-]+(?:\s+[A-Z][a-z'’\-]+){0,2})"),
    re.compile(r"(?i)this\s+is\s+([A-Z][a-z'’\-]+(?:\s+[A-Z][a-z'’\-]+){0,2})"),
    re.compile(r"(?i)\bi[’']?m\s+([A-Z][a-z'’\-]{2,}(?:\s+[A-Z][a-z'’\-]+){0,2})"),
]


def _clean_candidate(raw: str) -> Optional[Dict[str, str]]:
    parts = [p for p in re.split(r"\s+", raw.strip()) if p]
    if not parts:
        return None
    # Reject if any token is in the stop-list, is all-caps (abbreviation /
    # brand), or too short.
    for p in parts:
        if p.lower() in _STOP_TOKENS:
            return None
        if len(p) < 2:
            return None
        # ALL-CAPS Latin (BMW, VIN, USA) is almost always not a name.
        if p.isupper() and re.fullmatch(r"[A-Z]{2,}", p):
            return None
    first = parts[0]
    last  = " ".join(parts[1:]) if len(parts) > 1 else ""
    return {"first_name": first, "last_name": last}


def _detect_name_via_regex(transcript: str) -> Optional[Dict[str, Any]]:
    """Try each regex pattern; return the first plausible match with confidence."""
    if not transcript:
        return None
    for pat in _NAME_PATTERNS:
        m = pat.search(transcript)
        if not m:
            continue
        cand = _clean_candidate(m.group(1))
        if cand:
            return {
                **cand,
                "matched_snippet": m.group(0)[:120],
                "confidence": 0.75,  # regex is moderately confident
                "source": "regex",
            }
    return None


async def _detect_name_via_openai(transcript: str) -> Optional[Dict[str, Any]]:
    """Ask OpenAI to extract the customer's name from the transcript."""
    from app.services.call_intelligence import resolve_api_key, resolve_analyze_model
    key = await resolve_api_key()
    if not key:
        return None
    model = await resolve_analyze_model()

    prompt = (
        "You are a data extraction assistant for a car-import CRM.\n"
        "Read the phone-call transcript and return ONLY the CUSTOMER's real personal "
        "name (not the manager/agent/company). If no name is stated, return an empty "
        "string. Respond in strict JSON: "
        '{"first_name": "...", "last_name": "...", "confidence": 0..1, '
        '"evidence": "short quote"}.\n\n'
        f"Transcript:\n{transcript[:6000]}"
    )
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=key)
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            response_format={"type": "json_object"},
            max_tokens=300,
        )
        import json as _json
        content = resp.choices[0].message.content or "{}"
        data = _json.loads(content)
        first = (data.get("first_name") or "").strip()
        last  = (data.get("last_name") or "").strip()
        if not first and not last:
            return None
        return {
            "first_name": first,
            "last_name":  last,
            "confidence": float(data.get("confidence") or 0.6),
            "matched_snippet": (data.get("evidence") or "")[:200],
            "source": "openai",
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("[name-detect] OpenAI extraction failed: %s", e)
        return None


@router.post("/leads/{lead_id}/detect-name",
             summary="Suggest the customer's name based on call transcripts")
async def detect_lead_name(
    lead_id: str,
    apply: bool = Query(False, description="If true — apply the suggestion to the lead"),
    user=Depends(require_manager_or_admin),
) -> Dict[str, Any]:
    db = get_db()
    if db is None:
        raise HTTPException(500, "database not available")

    lead = await db.leads.find_one({"id": lead_id}) or await db.leads.find_one({"_id": lead_id})
    if not lead:
        raise HTTPException(404, f"lead '{lead_id}' not found")

    # Collect all calls linked to this lead (by lead_id, or by customer_id).
    call_query: Dict[str, Any] = {"$or": [{"lead_id": lead_id}, {"leadId": lead_id}]}
    if lead.get("customer_id") or lead.get("customerId"):
        cid = lead.get("customer_id") or lead.get("customerId")
        call_query["$or"].extend([{"customer_id": cid}, {"customerId": cid}])
    # Also match by phone as a fallback (Ringostat call may not have lead_id yet)
    if lead.get("phone"):
        call_query["$or"].append({"phone": lead["phone"]})

    call_ids: List[str] = []
    async for c in db.ringostat_calls.find(call_query, {"call_id": 1}):
        cid = c.get("call_id")
        if cid:
            call_ids.append(cid)

    if not call_ids:
        return {
            "success": False,
            "reason":  "no_calls",
            "message": "This lead has no linked calls to analyse yet.",
            "lead_id": lead_id,
        }

    transcripts: List[Dict[str, Any]] = []
    async for tr in db.call_transcripts.find({"call_id": {"$in": call_ids}}).sort("created_at", -1):
        if tr.get("full_text"):
            transcripts.append(tr)

    if not transcripts:
        return {
            "success": False,
            "reason":  "no_transcripts",
            "message": "The linked calls have no transcripts yet — trigger Call Intelligence first.",
            "call_ids": call_ids,
            "lead_id": lead_id,
        }

    # Try regex first on each transcript (newest first)
    suggestion: Optional[Dict[str, Any]] = None
    based_on_call: Optional[str] = None
    for tr in transcripts:
        s = _detect_name_via_regex(tr["full_text"])
        if s:
            suggestion = s
            based_on_call = tr.get("call_id")
            break

    # If regex missed, try OpenAI on the newest transcript only (token budget)
    if not suggestion:
        s = await _detect_name_via_openai(transcripts[0]["full_text"])
        if s:
            suggestion = s
            based_on_call = transcripts[0].get("call_id")

    if not suggestion:
        return {
            "success": False,
            "reason":  "no_name_found",
            "message": ("No self-introduction was detected in any transcript. "
                        "Ask the manager to enter the name manually."),
            "call_ids": call_ids,
            "lead_id": lead_id,
        }

    result: Dict[str, Any] = {
        "success":       True,
        "lead_id":       lead_id,
        "based_on_call": based_on_call,
        "suggestion":    suggestion,
    }

    if apply:
        first = suggestion.get("first_name") or lead.get("firstName") or ""
        last  = suggestion.get("last_name")  or lead.get("lastName")  or ""
        full  = f"{first} {last}".strip()
        patch = {
            "firstName": first,
            "lastName":  last,
            "name":      full,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "name_source": "ai_call_transcript",
            "name_source_call_id": based_on_call,
        }
        await db.leads.update_one({"id": lead_id}, {"$set": patch})
        # Also mirror onto the linked customer (if any).
        cid = lead.get("customer_id") or lead.get("customerId")
        if cid:
            await db.customers.update_one(
                {"$or": [{"id": cid}, {"_id": cid}]},
                {"$set": {
                    "firstName": first,
                    "lastName":  last,
                    "name":      full,
                    "fullName":  full,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "name_source": "ai_call_transcript",
                }},
            )

        # ── Customer Timeline (audit trail) ────────────────────────────
        # Best-effort: never fail the request if timeline logging breaks.
        try:
            from app.services import customer_timeline as _tl
            timeline_customer = cid or lead_id  # fall back to lead if no customer
            actor_info = _tl.extract_actor(user) if hasattr(_tl, "extract_actor") else None
            await _tl.record_event(
                customer_id=str(timeline_customer),
                kind="ai_name_detected",
                title=f"AI detected customer name: {full}",
                body=(f"Extracted from call transcript {based_on_call}. "
                      f"Source: {suggestion.get('source')} · "
                      f"Confidence: {int((suggestion.get('confidence') or 0) * 100)}%"),
                ref={"collection": "leads", "id": lead_id,
                     "url": f"/admin/leads/{lead_id}/360"},
                actor=actor_info,
                meta={
                    "first_name":       first,
                    "last_name":        last,
                    "confidence":       suggestion.get("confidence"),
                    "source":           suggestion.get("source"),
                    "matched_snippet":  suggestion.get("matched_snippet"),
                    "based_on_call_id": based_on_call,
                },
            )
        except Exception as _e:  # noqa: BLE001
            logger.warning("[name-detect] timeline log failed: %s", _e)

        result["applied"] = True
        result["patched_lead"] = _serialize(await db.leads.find_one({"id": lead_id}))
    else:
        result["applied"] = False

    return result


# ═══════════════════════════════════════════════════════════════════════════
# 3) Missing-data diagnostics — why is the name blank?
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/leads/{lead_id}/name-diagnostics",
            summary="Explain why the lead's name is missing and how to fill it")
async def lead_name_diagnostics(
    lead_id: str,
    user=Depends(require_manager_or_admin),
) -> Dict[str, Any]:
    db = get_db()
    if db is None:
        raise HTTPException(500, "database not available")

    lead = await db.leads.find_one({"id": lead_id}) or await db.leads.find_one({"_id": lead_id})
    if not lead:
        raise HTTPException(404, f"lead '{lead_id}' not found")

    reasons: List[str] = []
    remedies: List[Dict[str, Any]] = []

    first = (lead.get("firstName") or "").strip()
    last  = (lead.get("lastName")  or "").strip()
    if first or last:
        return {
            "success":  True,
            "lead_id":  lead_id,
            "has_name": True,
            "reasons":  [],
            "remedies": [],
        }

    source = (lead.get("source") or "").lower()
    if source in ("ringostat", "call", "phone"):
        reasons.append("Lead was created from an inbound phone call — Ringostat "
                       "delivers only the caller number, no name.")
    elif source in ("viber",):
        reasons.append("Lead was created from a Viber contact — the messaging "
                       "provider does not expose display names for unsaved contacts.")
    elif source in ("webform", "landing", "site"):
        reasons.append("The webform submission arrived without a name field filled in.")
    else:
        reasons.append(f"Lead source '{source or 'unknown'}' did not carry a name.")

    # How many calls / transcripts do we have?
    calls_cnt = await db.ringostat_calls.count_documents(
        {"$or": [{"lead_id": lead_id}, {"leadId": lead_id}]}
    )
    tr_cnt = 0
    if calls_cnt:
        call_ids = [c["call_id"] async for c in db.ringostat_calls.find(
            {"$or": [{"lead_id": lead_id}, {"leadId": lead_id}]}, {"call_id": 1}
        )]
        tr_cnt = await db.call_transcripts.count_documents({"call_id": {"$in": call_ids}})

    if calls_cnt and tr_cnt:
        remedies.append({
            "kind":  "ai_detect",
            "label": "Try to detect the name from AI-transcribed calls",
            "endpoint": f"/api/admin/leads/{lead_id}/detect-name",
            "hint":  f"{tr_cnt} transcript(s) available",
        })
    elif calls_cnt and not tr_cnt:
        remedies.append({
            "kind":  "run_ci",
            "label": "Run Call Intelligence on the linked call(s) first",
            "hint":  f"{calls_cnt} call(s) linked but not yet analysed",
        })

    remedies.append({
        "kind":  "manual_edit",
        "label": "Enter the name manually",
        "endpoint": f"/api/leads/{lead_id}",
        "method":   "PUT",
        "payload_example": {"firstName": "Иван", "lastName": "Петров"},
    })

    return {
        "success":   True,
        "lead_id":   lead_id,
        "has_name":  False,
        "source":    source or None,
        "phone":     lead.get("phone"),
        "reasons":   reasons,
        "remedies":  remedies,
        "calls_linked":       calls_cnt,
        "transcripts_ready":  tr_cnt,
    }
