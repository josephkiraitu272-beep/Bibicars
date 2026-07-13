"""
Lead Forms / Form Builder — HTTP surface
=========================================

Admin plane (require_admin):  /api/admin/lead-forms/*
Public plane (no auth):       /api/public/forms/*

The public ``/submit`` endpoint doubles as the webhook URL advertised in
the admin UI. All submissions flow through
``lead_forms_service.ingest_submission`` → real CRM lead.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request

from security import require_admin, get_current_user_optional, is_staff
from app.core.db_runtime import get_db
import app.services.lead_forms as svc

logger = logging.getLogger("bibi.lead_forms.router")

admin_router = APIRouter(
    prefix="/api/admin/lead-forms",
    tags=["admin-lead-forms"],
    dependencies=[Depends(require_admin)],
)

public_router = APIRouter(prefix="/api/public/forms", tags=["public-lead-forms"])


# Reserved slugs — can never be used as a form's public slug because they
# collide with real routes in the SPA (bibicars.bg/{slug}).
RESERVED_SLUGS: set = {
    "admin", "api", "cabinet", "manager", "team", "security", "login", "logout",
    "auth", "callback", "signup", "register", "signin", "signout",
    "catalog", "calculator", "cars", "car", "vin", "vin-check", "search",
    "blog", "collections", "about", "contacts", "privacy", "terms", "cookies",
    "conditions", "quote", "f", "p", "assets", "static", "public",
    "favicon.ico", "robots.txt", "sitemap.xml", "manifest.json",
    "index", "home", "app", "dashboard", "profile", "settings",
}


def _db():
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    return db


def _strip(doc: Dict[str, Any]) -> Dict[str, Any]:
    if doc:
        doc.pop("_id", None)
    return doc


# ══════════════════════════════════════════════════════════════════════
# META — templates + field registry (for the builder UI)
# ══════════════════════════════════════════════════════════════════════
@admin_router.get("/meta/templates")
async def list_templates():
    out = []
    for key, tpl in svc.TEMPLATES.items():
        out.append({
            "key": key,
            "labels": tpl["labels"],
            "lead_source": tpl.get("lead_source"),
            "fields": tpl["fields"],
            "content": tpl["content"],
        })
    return {"templates": out}


@admin_router.get("/meta/field-registry")
async def field_registry():
    out = []
    for key, meta in svc.FIELD_REGISTRY.items():
        out.append({
            "key": key,
            "type": meta["type"],
            "group": meta.get("group"),
            "labels": meta["labels"],
            "options": meta.get("options"),
        })
    return {"fields": out, "custom_types": list(svc.CUSTOM_FIELD_TYPES), "languages": list(svc.LANGS)}


# ══════════════════════════════════════════════════════════════════════
# ADMIN CRUD
# ══════════════════════════════════════════════════════════════════════
@admin_router.get("")
async def list_forms(status: Optional[str] = None, limit: int = 200,
                     user: Dict[str, Any] = Depends(require_admin)):
    db = _db()
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    items = await db.lead_forms.find(q).sort("created_at", -1).to_list(max(1, min(limit, 500)))
    for it in items:
        _strip(it)
    return {"items": items, "total": len(items)}


@admin_router.post("")
async def create_form(payload: Dict[str, Any] = Body(...),
                      user: Dict[str, Any] = Depends(require_admin)):
    db = _db()
    doc = svc.build_form_document(payload, created_by=(user.get("email") or user.get("id") or ""))
    # ensure slug uniqueness
    while await db.lead_forms.find_one({"slug": doc["slug"]}):
        doc["slug"] = svc.slugify(doc["name"])
    await db.lead_forms.insert_one(dict(doc))
    _strip(doc)
    return {"ok": True, "form": doc}


@admin_router.get("/{form_id}")
async def get_form(form_id: str):
    db = _db()
    doc = await db.lead_forms.find_one({"id": form_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Form not found")
    return {"form": _strip(doc)}


@admin_router.put("/{form_id}")
async def update_form(form_id: str, payload: Dict[str, Any] = Body(...)):
    db = _db()
    doc = await db.lead_forms.find_one({"id": form_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Form not found")
    _strip(doc)
    # Slug edit → validate against reserved words + uniqueness BEFORE applying.
    if "slug" in payload:
        raw = str(payload["slug"] or "").strip().lower()
        cleaned = svc._SLUG_RE.sub("-", raw).strip("-")[:60]
        if not cleaned:
            raise HTTPException(status_code=400, detail={
                "error": "invalid_slug",
                "message": "Slug cannot be empty. Use letters, numbers and dashes.",
            })
        if len(cleaned) < 2:
            raise HTTPException(status_code=400, detail={
                "error": "invalid_slug",
                "message": "Slug must be at least 2 characters.",
            })
        if cleaned in RESERVED_SLUGS:
            raise HTTPException(status_code=400, detail={
                "error": "reserved_slug",
                "message": f"'{cleaned}' is reserved. Pick a different short name (e.g. promo, offer, deals).",
            })
        if cleaned != doc.get("slug"):
            exists = await db.lead_forms.find_one({"slug": cleaned, "id": {"$ne": form_id}})
            if exists:
                raise HTTPException(status_code=409, detail={
                    "error": "slug_taken",
                    "message": f"'{cleaned}' is already used by another form. Pick a different one.",
                })
        payload["slug"] = cleaned
    doc = svc.apply_updates(doc, payload)
    await db.lead_forms.update_one({"id": form_id}, {"$set": {
        k: v for k, v in doc.items() if k not in ("id", "created_at", "created_by")
    }})
    return {"ok": True, "form": doc}


@admin_router.delete("/{form_id}")
async def delete_form(form_id: str):
    db = _db()
    res = await db.lead_forms.delete_one({"id": form_id})
    return {"ok": True, "deleted": res.deleted_count}


@admin_router.post("/{form_id}/publish")
async def publish_form(form_id: str, payload: Dict[str, Any] = Body(default={})):
    db = _db()
    doc = await db.lead_forms.find_one({"id": form_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Form not found")
    new_status = (payload.get("status") or "published").strip()
    if new_status not in ("draft", "published", "disabled"):
        new_status = "published"
    await db.lead_forms.update_one(
        {"id": form_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    doc["status"] = new_status
    return {"ok": True, "status": new_status, "slug": doc.get("slug")}


@admin_router.post("/{form_id}/duplicate")
async def duplicate_form(form_id: str, user: Dict[str, Any] = Depends(require_admin)):
    db = _db()
    doc = await db.lead_forms.find_one({"id": form_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Form not found")
    _strip(doc)
    clone = dict(doc)
    clone["id"] = svc.gen_id()
    clone["name"] = f"{doc.get('name')} (copy)"
    clone["slug"] = svc.slugify(clone["name"])
    clone["status"] = "draft"
    clone["counters"] = svc.empty_counters()
    now = datetime.now(timezone.utc).isoformat()
    clone["created_at"] = now
    clone["updated_at"] = now
    clone["created_by"] = user.get("email") or user.get("id") or ""
    await db.lead_forms.insert_one(dict(clone))
    _strip(clone)
    return {"ok": True, "form": clone}


@admin_router.get("/{form_id}/analytics")
async def form_analytics(form_id: str):
    db = _db()
    doc = await db.lead_forms.find_one({"id": form_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Form not found")
    _strip(doc)
    data = await svc.compute_analytics(db, doc)
    # Recent submissions (leads created via this form)
    recent = await db.leads.find(
        {"form_id": form_id}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "status": 1,
                               "source": 1, "campaign": 1, "created_at": 1, "managerId": 1}
    ).sort("created_at", -1).to_list(20)
    return {"analytics": data, "recent_leads": recent}


# ══════════════════════════════════════════════════════════════════════
# PUBLIC — render / track / submit
# ══════════════════════════════════════════════════════════════════════
@public_router.get("/{slug}")
async def public_get_form(slug: str, preview: bool = False,
                          user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)):
    db = _db()
    doc = await db.lead_forms.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=404, detail="Form not found")
    if doc.get("status") != "published":
        # Staff can PREVIEW an unpublished (draft/disabled) form from the admin
        # panel via ?preview=1 — the shared axios auth header carries their JWT.
        # Anonymous visitors still get the normal "not available" guard.
        if not (preview and is_staff(user)):
            raise HTTPException(status_code=403, detail="Form is not available")
    return {"form": svc.public_view(doc)}


@public_router.post("/{slug}/track")
async def public_track(slug: str, payload: Dict[str, Any] = Body(default={})):
    db = _db()
    doc = await db.lead_forms.find_one({"slug": slug})
    if not doc or doc.get("status") != "published":
        return {"ok": True}  # never leak state to public trackers
    event = (payload.get("event") or "").strip().lower()
    if event not in ("view", "start"):
        return {"ok": True}
    meta = {
        "utm": svc.pick_utm(payload.get("utm")),
        "channel": svc.detect_channel(svc.pick_utm(payload.get("utm")),
                                      payload.get("fbclid") or "", payload.get("gclid") or "",
                                      payload.get("referrer") or ""),
        "language": payload.get("language") or doc.get("language"),
        "device": (payload.get("device") or "")[:16],
    }
    await svc.record_event(db, doc, event, meta=meta)
    return {"ok": True}


@public_router.post("/{slug}/submit")
async def public_submit(slug: str, request: Request, payload: Dict[str, Any] = Body(...),
                        preview: bool = False,
                        user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)):
    db = _db()
    doc = await db.lead_forms.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=404, detail={
            "error": "not_found",
            "message": "Form not found",
        })
    # Staff can TEST-submit a draft form from the builder via ?preview=1.
    # We still validate everything the same way, but skip persisting the lead
    # / notifications — so the admin can flow through the whole UX safely.
    is_preview = bool(preview and is_staff(user))
    if doc.get("status") != "published" and not is_preview:
        raise HTTPException(status_code=403, detail={
            "error": "not_published",
            "message": ("This form is a draft. Publish it before it can accept "
                        "submissions, or open it with ?preview=1 as an admin to test."),
        })
    _strip(doc)

    values: Dict[str, Any] = payload.get("values") or {}
    if not isinstance(values, dict):
        raise HTTPException(status_code=400, detail="Invalid values")

    # ── Anti-spam ────────────────────────────────────────────────────
    # 1) Honeypot: a hidden field that real users never fill.
    if (payload.get("_hp") or values.get("_hp") or "").strip():
        logger.info("[lead_forms] honeypot triggered slug=%s", slug)
        return {"ok": True, "spam": True}  # silently accept, do nothing
    # 2) Min fill-time: submissions faster than 1.5s are almost always bots.
    try:
        rendered_at = float(payload.get("_t") or 0)
        if rendered_at and (time.time() * 1000 - rendered_at) < 1500:
            logger.info("[lead_forms] too-fast submit slug=%s", slug)
            return {"ok": True, "spam": True}
    except (TypeError, ValueError):
        pass

    # ── Required-field validation ────────────────────────────────────
    missing: List[str] = []
    for f in doc.get("fields", []):
        if f.get("required"):
            key = f.get("key")
            v = values.get(key)
            if v is None or (isinstance(v, str) and not v.strip()) or v is False:
                missing.append(key)
    if missing:
        raise HTTPException(status_code=400, detail={"error": "missing_required", "fields": missing})

    # ── Phone-format validation (Bulgarian: +359 followed by 9 digits) ──
    # Same rule as the site lead form; enforced server-side so it also
    # guards non-UI sources (webhook / future Meta Lead Ads ingest).
    bad_phone: List[str] = []
    for f in doc.get("fields", []):
        key = f.get("key")
        ftype = f.get("type") or svc.FIELD_REGISTRY.get(key, {}).get("type")
        if ftype == "phone":
            raw = values.get(key)
            if raw is None or (isinstance(raw, str) and not raw.strip()):
                continue  # empty & not required → skip (required handled above)
            is_valid, normalized = svc.normalize_phone_bg(str(raw))
            if not is_valid:
                bad_phone.append(key)
            else:
                values[key] = normalized  # store the normalized (E.164) value
    if bad_phone:
        raise HTTPException(status_code=400, detail={"error": "invalid_phone", "fields": bad_phone})

    # Basic contact sanity: need a phone or email at minimum.
    if not (values.get("phone") or values.get("email")):
        raise HTTPException(status_code=400, detail={
            "error": "missing_contact",
            "message": "Phone or email is required.",
        })

    # ── Build meta (never shown to client) ───────────────────────────
    utm = svc.pick_utm(payload.get("utm"))
    ua = request.headers.get("user-agent", "") if request else ""
    try:
        ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
              or (request.client.host if request and request.client else ""))
    except Exception:
        ip = ""
    fbclid = (payload.get("fbclid") or "")[:200]
    gclid = (payload.get("gclid") or "")[:200]
    referrer = (payload.get("referrer") or (request.headers.get("referer") if request else "") or "")[:400]
    meta = {
        "utm": utm,
        "fbclid": fbclid,
        "gclid": gclid,
        "referrer": referrer,
        "landing_url": (payload.get("landing_url") or "")[:400],
        "language": (payload.get("language") or doc.get("language")),
        "device": svc.device_from_ua(ua),
        "user_agent": ua[:400],
        "ip": ip,
        "channel": svc.detect_channel(utm, fbclid, gclid, referrer),
    }

    # In preview mode we validate the whole flow but never write to the DB
    # or fire notifications, so admins can safely dry-run a draft form.
    if is_preview:
        ty = doc.get("thankyou") or {"behaviour": "message"}
        return {
            "ok": True,
            "preview": True,
            "lead_id": None,
            "duplicate": False,
            "thankyou": ty,
            "success_message": (doc.get("content") or {}).get("success"),
        }

    try:
        result = await svc.ingest_submission(db, doc, values, meta)
    except Exception as e:
        logger.exception("[lead_forms] submit failed slug=%s: %s", slug, e)
        raise HTTPException(status_code=500, detail={
            "error": "server_error",
            "message": f"Could not save your request: {type(e).__name__}",
        })

    ty = doc.get("thankyou") or {"behaviour": "message"}
    return {
        "ok": True,
        "lead_id": result.get("lead_id"),
        "duplicate": result.get("duplicate", False),
        "thankyou": ty,
        "success_message": (doc.get("content") or {}).get("success"),
    }
