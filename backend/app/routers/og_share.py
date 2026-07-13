"""
og_share — server-rendered Open Graph preview for shared car links.
====================================================================

Purpose
-------
When a customer shares a car (Viber / Telegram / WhatsApp / Facebook / X…)
the sharing app's crawler fetches the URL and reads <meta property="og:*">
tags to build the rich preview card.

Our public site is a React SPA that only sets OG tags at run-time via the
`useSeo()` hook — invisible to non-JS crawlers.  So the crawler used to see
the *static* index.html with generic "BIBI Cars" branding instead of the
vehicle-specific photo + title + price.

This router serves a **plain HTML** page with a full Open-Graph payload for
each share record.  Real users hitting the same URL get an instant JS +
meta-refresh redirect to `/cars/<VIN>?share=<share_id>`, so the routing UX
is preserved end-to-end.

Endpoints
---------
* GET  /api/og/{share_id}        — HTML with OG tags + auto-redirect
* GET  /api/og/vin/{vin}         — Fallback OG page for direct VIN links
                                   (no share record needed, uses live data)

Mounted from server.py:
    from app.routers.og_share import router as _og_share_router
    fastapi_app.include_router(_og_share_router)
"""
from __future__ import annotations

import os
import re
from html import escape as _hesc
from typing import Any, Dict, Optional
from urllib.parse import quote as _urlquote

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core.db_runtime import get_db

router = APIRouter(prefix="/api/og", tags=["og-share"])


# ─────────────────────────── helpers ────────────────────────────────────
_BOT_UA_RE = re.compile(
    r"(bot|crawler|spider|scraper|preview|unfurl|fetch|"
    r"facebookexternalhit|facebot|twitterbot|whatsapp|viber|telegram|"
    r"slackbot|linkedinbot|discordbot|skype|pinterest|redditbot|"
    r"quora|embedly|iframely|google-inspection|bingbot|yandex|"
    r"vkshare|okru|applebot|duckduckbot|baiduspider)",
    re.IGNORECASE,
)


def _is_bot(request: Request) -> bool:
    """Best-effort UA heuristic — errs on the side of "yes, redirect" so
    real users never see the OG page for more than a blink."""
    ua = request.headers.get("user-agent", "") or ""
    return bool(_BOT_UA_RE.search(ua))


def _origin_from(request: Request) -> str:
    """Public origin — respect env override first, then request host."""
    env = (
        os.environ.get("PUBLIC_SITE_URL")
        or os.environ.get("SEO_PUBLIC_ORIGIN")
        or os.environ.get("PUBLIC_BASE_URL")
        or ""
    ).rstrip("/")
    if env:
        return env
    # Fall back to the host header — works in preview environments.
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    if host:
        return f"{proto}://{host}"
    return ""


def _fmt_price(price: Any, currency: Any = "EUR") -> Optional[str]:
    if price in (None, "", 0, "0"):
        return None
    try:
        num = float(str(price).replace(",", "").replace(" ", ""))
    except (TypeError, ValueError):
        return None
    if num <= 0:
        return None
    cur = (str(currency or "EUR")).upper()
    sym = "€" if cur == "EUR" else "$" if cur == "USD" else f"{cur} "
    return f"{sym}{int(round(num)):,}".replace(",", " ")


def _fmt_odometer(value: Any, unit: Any = "mi") -> Optional[str]:
    try:
        num = int(str(value).replace(",", "").replace(" ", "")) if value not in (None, "") else 0
    except (TypeError, ValueError):
        return None
    if num <= 0:
        return None
    u = str(unit or "mi").lower()
    u = "km" if u.startswith("k") else "mi"
    return f"{num:,} {u}".replace(",", " ")


def _build_title(snap: Dict[str, Any], vin: str) -> str:
    if snap.get("title"):
        return str(snap["title"])
    parts = [str(snap.get("year") or "").strip(),
             str(snap.get("make") or "").strip(),
             str(snap.get("model") or "").strip(),
             str(snap.get("trim") or "").strip()]
    head = " ".join(p for p in parts if p)
    if head:
        return head
    return f"Vehicle {vin}"


def _build_description(snap: Dict[str, Any], vin: str) -> str:
    bits: list[str] = []
    price = _fmt_price(snap.get("price"), snap.get("currency"))
    if price:
        bits.append(price)
    odo = _fmt_odometer(snap.get("odometer"), snap.get("odometer_unit"))
    if odo:
        bits.append(odo)
    if snap.get("auction_name"):
        bits.append(str(snap["auction_name"]).upper())
    if snap.get("lot_number"):
        bits.append(f"LOT {snap['lot_number']}")
    if vin:
        bits.append(f"VIN {vin}")
    head = " · ".join(bits)
    tail = "BIBI Cars — auction-to-keys car import from US & Korea to Bulgaria."
    if snap.get("description"):
        # Prefer the human description if available, cap for OG standards.
        d = str(snap["description"])[:280]
        return f"{head}. {d}" if head else d
    return f"{head}. {tail}" if head else tail


def _absolute_url(url: Any, origin: str) -> str:
    """Ensure the image URL is absolute — crawlers reject bare paths."""
    if not url:
        return ""
    s = str(url).strip()
    if s.startswith("//"):
        return "https:" + s
    if s.startswith(("http://", "https://")):
        return s
    if s.startswith("/") and origin:
        return f"{origin}{s}"
    return s


def _render_og_html(
    *,
    origin: str,
    canonical_url: str,
    title: str,
    description: str,
    image: Optional[str],
    vin: str,
    price: Optional[str],
    lot: Optional[str],
    auction: Optional[str],
    odo: Optional[str],
    year: Optional[Any],
    make: Optional[str],
    model: Optional[str],
    # ── Wave 2C: extended fields for the share preview ────────────────
    engine: Optional[str] = None,
    fuel: Optional[str] = None,
    location: Optional[str] = None,
    damage: Optional[str] = None,
    seller: Optional[str] = None,
    sale_date: Optional[str] = None,
    total_price: Optional[str] = None,
    color: Optional[str] = None,
    transmission: Optional[str] = None,
    drivetrain: Optional[str] = None,
    body_style: Optional[str] = None,
) -> str:
    """Assemble an HTML document optimized for social unfurl crawlers.

    Real users get an instant client-side redirect to the actual car page.
    Crawlers (no JS) read the OG payload from the head.
    """
    t = _hesc(title)
    d = _hesc(description)
    img_abs = _absolute_url(image or f"{origin}/og-image.png", origin)
    img_html = _hesc(img_abs)
    canon = _hesc(canonical_url)

    # Fallback OG image is the site-wide default.
    default_og = _hesc(f"{origin}/og-image.png") if origin else "/og-image.png"

    # Structured data — helps Google, LinkedIn, WhatsApp Business.
    struct_bits: list[str] = []
    if price:
        struct_bits.append(f'"offers": {{"@type":"Offer","priceCurrency":"EUR","price":"{_hesc(str(price).replace("€","").replace(" ",""))}"}}')
    struct_body = ",".join(struct_bits)
    struct_prefix = "," + struct_body if struct_body else ""

    # Small "user visible" body — shown briefly before redirect on real
    # browsers; also helps text-mode crawlers.
    price_pill = f'<span class="pill pill-price">{_hesc(price)}</span>' if price else ""
    total_pill = f'<span class="pill pill-total">Total {_hesc(total_price)}</span>' if total_price and total_price != price else ""
    odo_pill = f'<span class="pill">{_hesc(odo)}</span>' if odo else ""
    lot_pill = f'<span class="pill">LOT {_hesc(lot)}</span>' if lot else ""
    auc_pill = f'<span class="pill">{_hesc(str(auction).upper())}</span>' if auction else ""
    vin_pill = f'<span class="pill">VIN {_hesc(vin)}</span>' if vin else ""
    # Wave 2C — engine/fuel/location/damage/seller/color pills round out
    # the card so the previously reported "missing fields" bug is gone.
    engine_pill = f'<span class="pill">⚙ {_hesc(engine)}</span>' if engine else ""
    fuel_pill = f'<span class="pill">⛽ {_hesc(fuel)}</span>' if fuel and (not engine or fuel.lower() not in engine.lower()) else ""
    loc_pill = f'<span class="pill">📍 {_hesc(location)}</span>' if location else ""
    dmg_pill = f'<span class="pill pill-damage">{_hesc(damage)}</span>' if damage else ""
    seller_pill = f'<span class="pill">{_hesc(seller)}</span>' if seller else ""
    color_pill = f'<span class="pill">🎨 {_hesc(color)}</span>' if color else ""
    trans_pill = f'<span class="pill">{_hesc(transmission)}</span>' if transmission else ""
    dt_pill = f'<span class="pill">{_hesc(drivetrain)}</span>' if drivetrain else ""
    body_pill = f'<span class="pill">🚘 {_hesc(body_style)}</span>' if body_style else ""
    sd_pill = f'<span class="pill">📅 {_hesc(sale_date)}</span>' if sale_date else ""

    # JS-safe absolute URL for the redirect script. Escape backslashes and
    # double-quotes so we can safely embed inside a JS string literal.
    js_target = '"' + canonical_url.replace('\\', '\\\\').replace('"', '\\"') + '"'

    price_amount_meta = (
        f'<meta property="product:price:amount"   content="{_hesc(str(price).replace(chr(0x20AC),"").replace(" ",""))}" />\n'
        f'<meta property="product:price:currency" content="EUR" />'
    ) if price else ""

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="0; url={canon}" />
<title>{t}</title>
<meta name="description" content="{d}" />
<link rel="canonical" href="{canon}" />

<!-- Open Graph -->
<meta property="og:type"        content="product" />
<meta property="og:site_name"   content="BIBI Cars" />
<meta property="og:title"       content="{t}" />
<meta property="og:description" content="{d}" />
<meta property="og:url"         content="{canon}" />
<meta property="og:image"       content="{img_html}" />
<meta property="og:image:secure_url" content="{img_html}" />
<meta property="og:image:width"  content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt"    content="{t}" />
<meta property="og:locale"       content="en_US" />
<meta property="og:locale:alternate" content="bg_BG" />

<!-- Product-specific OG (Facebook/WhatsApp show a rich card) -->
{price_amount_meta}

<!-- Twitter card -->
<meta name="twitter:card"        content="summary_large_image" />
<meta name="twitter:title"       content="{t}" />
<meta name="twitter:description" content="{d}" />
<meta name="twitter:image"       content="{img_html}" />
<meta name="twitter:image:alt"   content="{t}" />

<!-- Viber-specific (some clients read this too) -->
<meta property="al:web:url" content="{canon}" />

<!-- Schema.org / JSON-LD — helps Google + LinkedIn + Slack -->
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Vehicle",
  "name": "{t}",
  "url": "{canon}",
  "image": "{img_html}",
  "vehicleIdentificationNumber": "{_hesc(vin)}",
  "brand": {{"@type":"Brand","name":"{_hesc(make or '')}"}},
  "model": "{_hesc(model or '')}",
  "modelDate": "{_hesc(str(year or ''))}"{struct_prefix}
}}
</script>

<style>
  html, body {{ margin:0; padding:0; background:#0a0a0a; color:#f4f4f5;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                             'Helvetica Neue', Arial, sans-serif; }}
  .wrap {{ max-width: 820px; margin: 0 auto; padding: 24px 20px 40px;
           display:flex; flex-direction:column; gap:16px; }}
  .brand {{ display:flex; align-items:center; gap:10px; color:#FEAE00;
            font-weight:800; letter-spacing:.4px; }}
  .brand span.dot {{ width:10px; height:10px; border-radius:50%; background:#FEAE00; display:inline-block; }}
  .card {{ background:#111113; border:1px solid #232326; border-radius:14px; overflow:hidden;
           box-shadow: 0 10px 30px rgba(0,0,0,.35); }}
  .card img {{ width:100%; height:auto; display:block; background:#000; }}
  .body {{ padding:18px 20px 22px; }}
  h1 {{ margin:0 0 8px; font-size:22px; line-height:1.25; font-weight:800; }}
  .desc {{ margin:0 0 14px; color:#a1a1aa; font-size:15px; line-height:1.5; }}
  .pills {{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; }}
  .pill {{ background:#18181B; border:1px solid #27272A; color:#e4e4e7;
           padding:4px 10px; border-radius:999px; font-size:12px; font-weight:600; }}
  .pill-price {{ background:#FEAE00; color:#0a0a0a; border-color:#FEAE00; font-size:13px; }}
  .pill-total {{ background:#22C55E; color:#0a0a0a; border-color:#22C55E; font-size:13px; }}
  .pill-damage {{ background:#7F1D1D; color:#FECACA; border-color:#991B1B; }}
  .cta {{ display:inline-flex; align-items:center; gap:10px; background:#FEAE00; color:#0a0a0a;
          padding:12px 20px; border-radius:12px; font-weight:800; text-decoration:none;
          font-size:15px; letter-spacing:.2px; }}
  .cta:hover {{ filter: brightness(.95); }}
  .redir {{ margin-top:16px; color:#71717a; font-size:12px; }}
  .redir a {{ color:#FEAE00; text-decoration: underline; }}
</style>
</head>
<body>
  <main class="wrap">
    <div class="brand"><span class="dot"></span>BIBI Cars</div>
    <article class="card">
      {f'<img src="{img_html}" alt="{t}" />' if img_abs and img_abs != default_og else ""}
      <div class="body">
        <h1>{t}</h1>
        <p class="desc">{d}</p>
        <div class="pills">{price_pill}{total_pill}{engine_pill}{fuel_pill}{trans_pill}{dt_pill}{body_pill}{odo_pill}{loc_pill}{dmg_pill}{color_pill}{sd_pill}{lot_pill}{auc_pill}{seller_pill}{vin_pill}</div>
        <a class="cta" href="{canon}">View this vehicle →</a>
      </div>
    </article>
    <p class="redir">Redirecting to <a href="{canon}">{canon}</a>…</p>
  </main>
  <script>
    // Instant redirect for real (non-crawler) browsers.
    (function () {{
      try {{
        var target = {js_target};
        // Small delay lets analytics beacons fire before navigation.
        setTimeout(function () {{ window.location.replace(target); }}, 60);
      }} catch (_e) {{ /* fall through to <meta refresh> */ }}
    }})();
  </script>
</body>
</html>
"""


# ─────────────────────────── endpoints ──────────────────────────────────
@router.api_route("/{share_id}", methods=["GET", "HEAD"], response_class=HTMLResponse)
async def og_share(share_id: str, request: Request) -> HTMLResponse:
    """Serve OG-tagged HTML for a shared car (Viber/Telegram/WhatsApp/…)."""
    db = get_db()
    share = await db.shares.find_one({"id": share_id}, {"_id": 0})
    if not share:
        # Unknown share — send crawlers to the site homepage instead of 404
        # so the message preview never looks broken.
        origin = _origin_from(request)
        home = f"{origin}/" if origin else "/"
        raise HTTPException(status_code=404, detail="share not found") if not origin else \
            HTTPException(status_code=302, headers={"Location": home})

    snap = share.get("snapshot") or {}
    vin = str(share.get("vin") or snap.get("vin") or "").upper()

    origin = _origin_from(request)
    canonical = f"{origin}/cars/{vin}?share={share_id}" if origin else f"/cars/{vin}?share={share_id}"

    title = _build_title(snap, vin)
    description = _build_description(snap, vin)
    image = snap.get("image")
    price = _fmt_price(snap.get("price"), snap.get("currency"))
    odo = _fmt_odometer(snap.get("odometer"), snap.get("odometer_unit"))

    html = _render_og_html(
        origin=origin,
        canonical_url=canonical,
        title=title,
        description=description,
        image=image,
        vin=vin,
        price=price,
        lot=snap.get("lot_number"),
        auction=snap.get("auction_name"),
        odo=odo,
        year=snap.get("year"),
        make=snap.get("make"),
        model=snap.get("model"),
        # Wave 2C — extended snapshot fields (share record may include these)
        engine=snap.get("engine"),
        fuel=snap.get("fuel"),
        location=snap.get("location"),
        damage=snap.get("damage"),
        seller=snap.get("seller"),
        sale_date=snap.get("sale_date"),
        total_price=_fmt_price(snap.get("total_price"), snap.get("total_currency") or snap.get("currency")),
        color=snap.get("color"),
        transmission=snap.get("transmission"),
        drivetrain=snap.get("drivetrain"),
        body_style=snap.get("body_style") or snap.get("bodyStyle") or snap.get("body_type"),
    )
    # No caching so a refreshed snapshot (edited manager copy, better image)
    # propagates to Viber immediately next time the link is unfurled.
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "public, max-age=300, s-maxage=300",  # 5 min
            "X-Robots-Tag":  "noindex, nofollow",  # this is an interstitial, not indexable
        },
    )


@router.api_route("/vin/{vin}", methods=["GET", "HEAD"], response_class=HTMLResponse)
async def og_by_vin(vin: str, request: Request) -> HTMLResponse:
    """Fallback: build an OG page directly from live VIN data — used when
    a link is shared without going through the share modal (deep-copy of
    the car URL). Best-effort — falls back to a generic page if the VIN
    is unknown, so previews never show a "broken" state."""
    db = get_db()
    vin_u = str(vin or "").upper().replace(" ", "").replace("-", "")
    origin = _origin_from(request)
    canonical = f"{origin}/cars/{vin_u}" if origin else f"/cars/{vin_u}"

    doc = None
    if vin_u:
        # Try the mainline collection first, then the fallback sources.
        for coll in ("vin_data", "vin_data_lemon", "vin_data_westmotors", "vin_data_bitmotors"):
            try:
                doc = await db[coll].find_one({"vin": vin_u}, {"_id": 0})
            except Exception:
                doc = None
            if doc:
                break

    snap: Dict[str, Any] = {}
    if doc:
        # Support both nested and flat shapes across our scrapers.
        v = doc.get("vehicle") or doc.get("data") or doc
        a = doc.get("auction") or {}
        # Wave 2C: bitmotors-style flat docs → surface engine/fuel/location/
        # damage/seller/prices so the share preview is no longer bare.
        snap = {
            "title": v.get("title") or " ".join(str(x) for x in [v.get("year"), v.get("make"), v.get("model")] if x),
            "make": v.get("make") or v.get("brand"),
            "model": v.get("model"),
            "year": v.get("year"),
            "trim": v.get("trim"),
            # Prefer explicit price fields, then estimated retail / current bid /
            # starting bid (bitmotors nomenclature).
            "price": (v.get("price") or v.get("current_bid")
                      or a.get("bidPriceRaw") or a.get("estimatedTotalPrice")
                      or v.get("estimated_total_price") or v.get("starting_bid")),
            "currency": (v.get("currency") or v.get("current_bid_currency")
                         or v.get("estimated_total_currency") or "USD"),
            "image": (v.get("images") or doc.get("images") or [None])[0]
                     if isinstance(v.get("images") or doc.get("images"), list) else None,
            "lot_number":  a.get("lot") or v.get("lot") or v.get("lot_number") or doc.get("lot_number"),
            "auction_name": a.get("auction") or v.get("auction_name") or doc.get("source"),
            "odometer": (doc.get("data") or {}).get("odometer") if isinstance(doc.get("data"), dict) else (v.get("odometer") or v.get("mileage")),
            "odometer_unit": (doc.get("data") or {}).get("odometer_unit") if isinstance(doc.get("data"), dict) else (v.get("odometer_unit") or v.get("mileageUnit")),
            # Extended (Wave 2C — fixes the "missing fields on shared card" bug)
            "engine":        v.get("engine") or v.get("engineType") or v.get("engine_type"),
            "fuel":          v.get("fuel_type") or v.get("fuel") or v.get("fuelType"),
            "location":      v.get("location") or v.get("state") or v.get("port"),
            "damage":        v.get("damage_primary") or v.get("primaryDamage") or v.get("damage"),
            "seller":        v.get("seller") or v.get("sellerName"),
            "sale_date":     v.get("sale_date") or v.get("saleDate") or a.get("saleDate"),
            "total_price":   v.get("estimated_total_price") or v.get("estimatedTotalPrice") or v.get("total_price") or v.get("totalPrice"),
            "total_currency": v.get("estimated_total_currency") or v.get("currency") or "USD",
            "color":         v.get("color") or v.get("colour"),
            "transmission":  v.get("transmission") or v.get("gearbox"),
            "drivetrain":    v.get("drivetrain") or v.get("drive"),
            "body_style":    v.get("body_style") or v.get("bodyStyle") or v.get("body_type") or v.get("bodyType"),
        }

    title = _build_title(snap, vin_u) if snap else f"Vehicle {vin_u} — BIBI Cars"
    description = _build_description(snap, vin_u) if snap else (
        "Pre-owned vehicle imported from US & Korean auctions by BIBI Cars. "
        "Transparent pricing in EUR, customs and delivery to Bulgaria included."
    )
    image = snap.get("image") if snap else None
    price = _fmt_price(snap.get("price"), snap.get("currency")) if snap else None
    odo = _fmt_odometer(snap.get("odometer"), snap.get("odometer_unit")) if snap else None

    html = _render_og_html(
        origin=origin,
        canonical_url=canonical,
        title=title,
        description=description,
        image=image,
        vin=vin_u,
        price=price,
        lot=snap.get("lot_number") if snap else None,
        auction=snap.get("auction_name") if snap else None,
        odo=odo,
        year=snap.get("year") if snap else None,
        make=snap.get("make") if snap else None,
        model=snap.get("model") if snap else None,
        # Wave 2C — extended fields
        engine=snap.get("engine") if snap else None,
        fuel=snap.get("fuel") if snap else None,
        location=snap.get("location") if snap else None,
        damage=snap.get("damage") if snap else None,
        seller=snap.get("seller") if snap else None,
        sale_date=snap.get("sale_date") if snap else None,
        total_price=_fmt_price(snap.get("total_price"), snap.get("total_currency")) if snap else None,
        color=snap.get("color") if snap else None,
        transmission=snap.get("transmission") if snap else None,
        drivetrain=snap.get("drivetrain") if snap else None,
        body_style=snap.get("body_style") if snap else None,
    )
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "public, max-age=300, s-maxage=300",
            "X-Robots-Tag":  "noindex, nofollow",
        },
    )
