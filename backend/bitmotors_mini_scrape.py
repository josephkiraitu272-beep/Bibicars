"""One-shot Bitmotors mini-scrape for share-card testing.

* Fetches ONLY 1 catalogue page (limit 5 cards) — no autonomous worker.
* Picks the FIRST VIN with an image, then runs full detail parse on it.
* Saves the enriched doc into `vin_data_bitmotors` + `vin_data` so the
  `/api/og/vin/{VIN}` endpoint has real content.
* Prints the fields the OG snapshot builder actually consumes so we can
  see gaps at a glance.

Safe under 2 GB cgroup — closes httpx client immediately, no bg tasks.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

sys.path.insert(0, "/app/backend")

import httpx  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402
import motor.motor_asyncio  # noqa: E402

from bitmotors_scraper import (  # noqa: E402
    HEADERS, parse_catalogue_card, parse_detail_page,
    normalize_result, calculate_quality, find_detail_url,
)


async def main():
    db = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)

    # ── 1) Fetch 1 catalogue page ─────────────────────────────────────
    print("[1/3] Fetching bidmotors.bg/en/catalogue?page=1 …")
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        r = await client.get("https://bidmotors.bg/en/catalogue", headers=HEADERS)
        print(f"      status: {r.status_code}, size: {len(r.text)/1024:.1f}kB")
        soup = BeautifulSoup(r.text, "html.parser")
        cards = soup.select("article.car-card")
        print(f"      cards found: {len(cards)}")

        # Parse first 5 catalogue cards to seed VINs
        catalogue_docs = []
        for c in cards[:5]:
            v = parse_catalogue_card(c)
            if v and v.get("vin"):
                catalogue_docs.append(v)
        if not catalogue_docs:
            print("      NO VINs in catalogue — bailing out")
            return

        print(f"      seeded {len(catalogue_docs)} VINs:")
        for v in catalogue_docs:
            print(f"        · {v.get('vin')} — {v.get('title') or v.get('make')} {v.get('year','')}")

        # ── 2) Enrich ONE VIN with full details ──────────────────────
        target = None
        for v in catalogue_docs:
            if v.get("detail_url"):
                target = v
                break
        if not target:
            target = catalogue_docs[0]

        vin = target["vin"]
        detail_url = target.get("detail_url")
        if not detail_url:
            detail_url = await find_detail_url(client, vin)
        if not detail_url:
            print(f"      no detail URL for {vin} — abort")
            return

        print(f"\n[2/3] Fetching detail: {detail_url}")
        dr = await client.get(detail_url, headers=HEADERS)
        print(f"      status: {dr.status_code}, size: {len(dr.text)/1024:.1f}kB")
        parsed = parse_detail_page(dr.text, detail_url)
        parsed.setdefault("vin", vin)
        normalized = normalize_result(parsed)
        quality, filled, conf = calculate_quality(normalized)

        doc = {
            **normalized,
            "quality": quality,
            "fields_filled": filled,
            "confidence": conf,
            "source": "bitmotors",
            "updated_at": now,
            "created_at": now,
        }
        # Write into BOTH the source-specific and the mainline collection
        # so the OG endpoint sees real data.
        await db.vin_data_bitmotors.replace_one({"vin": vin}, doc, upsert=True)
        await db.vin_data.replace_one({"vin": vin}, doc, upsert=True)
        # And save the shortened catalogue rows for the other 4 VINs
        # (skip the target — its full doc was just saved above).
        for v in catalogue_docs:
            if v["vin"] == vin:
                continue
            v["updated_at"] = now
            v.setdefault("created_at", now)
            v.setdefault("source", "bitmotors")
            await db.vin_data_bitmotors.replace_one({"vin": v["vin"]}, v, upsert=True)
            await db.vin_data.replace_one({"vin": v["vin"]}, v, upsert=True)

    # ── 3) Print the fields OG snapshot builder consumes ─────────────
    print("\n[3/3] Field audit — OG snapshot inputs vs available data:")
    OG_FIELDS = [
        "vin", "title", "make", "model", "year", "trim",
        "price", "currency", "images", "lot", "auction",
        "odometer", "mileage", "mileageUnit",
        # NEW / previously missing per user report:
        "engine", "engine_type", "fuel", "fuelType",
        "location", "state", "port",
        "totalPrice", "estimatedTotalPrice", "total_price",
        "customs", "delivery", "delivery_price",
        "damage", "color", "transmission", "drivetrain",
    ]
    stored = await db.vin_data.find_one({"vin": vin}, {"_id": 0})
    print(f"\nStored doc for {vin} has {len(stored)} keys:")
    for f in OG_FIELDS:
        val = stored.get(f)
        mark = "✓" if val not in (None, "", 0, "0", []) else "·"
        preview = str(val)[:70] if val else "—"
        print(f"    {mark} {f:22} {preview}")

    print(f"\nAll doc keys: {sorted(stored.keys())}")
    print(f"\n[DONE] Try: curl -sIL https://backend-preview-14.preview.emergentagent.com/api/og/vin/{vin}")


if __name__ == "__main__":
    asyncio.run(main())
