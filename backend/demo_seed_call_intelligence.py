"""Seed demo Call Intelligence data so the already-implemented UI can be
demonstrated without a live OpenAI key.

Creates:
  * one demo customer  (demo-ci-cust-1)
  * one demo lead      (demo-ci-lead-1)
  * TWO ringostat_calls with recording_url + ai_summary mirror fields
  * TWO call_transcripts (Bulgarian sales dialogues)
  * TWO call_intelligence documents (full structured JSON envelope)

Idempotent — safe to run multiple times.

Usage:
  cd /app/backend && python demo_seed_call_intelligence.py
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

import motor.motor_asyncio  # noqa: E402


DEMO_CUSTOMER_ID = "demo-ci-cust-1"
DEMO_LEAD_ID     = "demo-ci-lead-1"
DEMO_MANAGER_ID  = "staff_admin_1783935059"  # the actual admin id from JWT
DEMO_MANAGER_NM  = "Admin"


CALL1_ID  = "demo-ci-call-1"
CALL2_ID  = "demo-ci-call-2"

TRANSCRIPT_1 = """Мениджър: Здравейте, обаждам се от BIBI Cars. Виждам, че сте оставили заявка за BMW X5.
Клиент: Да, здравейте. Търся BMW X5 от 2021 до 2023 година, дизел, задължително M-пакет.
Мениджър: Отлично. Какъв бюджет имате предвид?
Клиент: Между 45 и 55 хиляди евро. И до 100 000 километра пробег.
Мениджър: Разбирам. От САЩ или от Корея предпочитате?
Клиент: Не от САЩ — притеснявам се за историята. Германия или Корея.
Мениджър: Ясно. Мога до петък да Ви пратя три конкретни варианта. Става ли?
Клиент: Да, идеално. Ако намерите нещо подходящо, готов съм да сложа депозит още на място.
Мениджър: Прекрасно. Пиша Ви до петък, 15-и юли.
Клиент: Благодаря!"""

TRANSCRIPT_2 = """Клиент: Ало, обаждам се относно офертата за BMW X5, която ми пратихте вчера.
Мениджър: Здравейте. Разгледахте ли трите опции?
Клиент: Да, но цената на първата ми се вижда завишена. Три хиляди повече от очакваното.
Мениджър: Разбирам. Може ли да Ви пусна цена без M-пакет, но със същите допълнения?
Клиент: Не искам да свалям M-пакета. Мога да изчакам следваща седмица за нови оферти.
Мениджър: Ясно. Ще Ви пиша в понеделник, когато излезе новия аукцион.
Клиент: Добре, но ако не намерите — вероятно ще потърся другаде. Съжалявам.
Мениджър: Разбирам, ще направя всичко възможно."""

CI_1 = {
    "summary": "Клиент търси BMW X5 (2021-2023, дизел, M-пакет, до 100 000 км) с бюджет 45-55K€. Готов да плати депозит при подходяща оферта. Предпочита Германия/Корея, не САЩ. Мениджърът обеща 3 оферти до 15-и юли.",
    "language": "bg",
    "customer_intent": "Покупка на BMW X5 в близките 2 седмици",
    "budget": "45 000 – 55 000 €",
    "country": "Германия или Корея (не САЩ)",
    "vehicle_preferences": ["BMW X5", "2021-2023", "Дизел", "M-пакет", "≤ 100 000 км"],
    "objections": [],
    "agreements": ["3 оферти до петък 15.07", "Готовност за депозит"],
    "next_actions": [
        {"action": "Изпратете 3 конкретни оферти BMW X5 M-пакет от Германия/Корея", "due_date": "2026-07-15", "owner": "manager"},
        {"action": "Клиентът потвърждава депозит при подходяща оферта", "due_date": None, "owner": "customer"},
    ],
    "risks": ["Ако не намерим оферта до петък, клиентът може да загуби интерес"],
    "sentiment": "positive",
    "purchase_intent": "very_high",
    "deal_probability": "high",
    "confidence": 0.92,
    "model": "gpt-4o",
}

CI_2 = {
    "summary": "Клиентът смята цената на първата оферта за завишена (+3K€ над очакваното). Отказва компромиси по M-пакета. Заплашва да търси другаде, ако не получи нова оферта в понеделник.",
    "language": "bg",
    "customer_intent": "Иска по-добра ценова оферта за BMW X5 M-пакет",
    "budget": "≤ 45 000 € (възприема +3K като завишено)",
    "country": None,
    "vehicle_preferences": ["BMW X5", "M-пакет (не се отказва)"],
    "objections": ["Цената 3K€ над очакваното", "Отказ да свали M-пакета"],
    "agreements": ["Изчаква нова оферта в понеделник"],
    "next_actions": [
        {"action": "Изпратете нова оферта в понеделник от новия аукцион, задължително с M-пакет", "due_date": "2026-07-14", "owner": "manager"},
    ],
    "risks": [
        "Клиентът може да отиде при конкурент",
        "Ценово-чувствителен",
    ],
    "sentiment": "negative",
    "purchase_intent": "medium",
    "deal_probability": "medium",
    "confidence": 0.85,
    "model": "gpt-4o",
}


async def main():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name   = os.environ.get("DB_NAME", "bibi_cars")
    client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    now = datetime.now(timezone.utc)

    # ── Customer
    await db.customers.replace_one(
        {"_id": DEMO_CUSTOMER_ID},
        {
            "_id": DEMO_CUSTOMER_ID,
            "id":  DEMO_CUSTOMER_ID,
            "name": "Иван Петров (Demo)",
            "fullName": "Иван Петров",
            "phone": "+359 888 111 222",
            "email": "ivan.petrov.demo@bibi.cars",
            "language": "bg",
            "createdAt": now - timedelta(days=5),
            "updatedAt": now,
            "status": "active",
            "managerId": DEMO_MANAGER_ID,
            "manager_id": DEMO_MANAGER_ID,
            "carOfInterest": "BMW X5 2021-2023 diesel M-package",
            "tags": ["demo", "call-intelligence"],
        },
        upsert=True,
    )
    print("✓ customer upserted:", DEMO_CUSTOMER_ID)

    # ── Lead
    await db.leads.replace_one(
        {"_id": DEMO_LEAD_ID},
        {
            "_id": DEMO_LEAD_ID,
            "id":  DEMO_LEAD_ID,
            "name": "Иван Петров (Demo)",
            "fullName": "Иван Петров",
            "phone": "+359 888 111 222",
            "email": "ivan.petrov.demo@bibi.cars",
            "customerId": DEMO_CUSTOMER_ID,
            "customer_id": DEMO_CUSTOMER_ID,
            "stage": "qualified",
            "status": "in_progress",
            "managerId": DEMO_MANAGER_ID,
            "manager_id": DEMO_MANAGER_ID,
            "language": "bg",
            "carOfInterest": "BMW X5 2021-2023 diesel M-package",
            "budget": "45000-55000",
            "createdAt": now - timedelta(days=5),
            "updatedAt": now,
            "source": "manual",
        },
        upsert=True,
    )
    print("✓ lead upserted:", DEMO_LEAD_ID)

    # ── Calls (2)
    async def upsert_call(call_id, started_at, direction, duration, ci):
        await db.ringostat_calls.replace_one(
            {"call_id": call_id},
            {
                "_id":            str(uuid.uuid4()),
                "call_id":        call_id,
                "recording_url":  f"https://demo.bibi.cars/recordings/{call_id}.mp3",
                "duration":       duration,
                "direction":      direction,
                "manager_id":     DEMO_MANAGER_ID,
                "managerId":      DEMO_MANAGER_ID,
                "manager_name":   DEMO_MANAGER_NM,
                "lead_id":        DEMO_LEAD_ID,
                "customer_id":    DEMO_CUSTOMER_ID,
                "customerId":     DEMO_CUSTOMER_ID,
                "phone":          "+359 888 111 222",
                "started_at":     started_at,
                "startedAt":      started_at,
                "created_at":     started_at,
                "transcription_status": "ready",
                "intelligence_status":  "ready",
                "intelligence_updated_at": started_at + timedelta(minutes=1),
                "ai_summary":         ci["summary"],
                "ai_sentiment":       ci["sentiment"],
                "ai_purchase_intent": ci["purchase_intent"],
                "ai_next_action":     (ci["next_actions"][0]["action"] if ci["next_actions"] else None),
            },
            upsert=True,
        )

    call1_started = now - timedelta(days=3, hours=2)
    call2_started = now - timedelta(days=1, hours=4)
    await upsert_call(CALL1_ID, call1_started, "outbound", 138, CI_1)
    await upsert_call(CALL2_ID, call2_started, "inbound",  95,  CI_2)
    print("✓ ringostat_calls upserted:", CALL1_ID, CALL2_ID)

    # ── Transcripts
    async def upsert_transcript(call_id, text, started_at):
        await db.call_transcripts.replace_one(
            {"call_id": call_id},
            {
                "_id":       str(uuid.uuid4()),
                "call_id":   call_id,
                "full_text": text,
                "language":  "bg",
                "model":     "gpt-4o-transcribe",
                "segments":  [],
                "duration":  138 if call_id == CALL1_ID else 95,
                "created_at": started_at + timedelta(seconds=30),
            },
            upsert=True,
        )

    await upsert_transcript(CALL1_ID, TRANSCRIPT_1, call1_started)
    await upsert_transcript(CALL2_ID, TRANSCRIPT_2, call2_started)
    print("✓ call_transcripts upserted")

    # ── Intelligence docs
    async def upsert_ci(call_id, ci, started_at):
        doc = {
            "_id":         str(uuid.uuid4()),
            "call_id":     call_id,
            "lead_id":     DEMO_LEAD_ID,
            "customer_id": DEMO_CUSTOMER_ID,
            "manager_id":  DEMO_MANAGER_ID,
            "created_at":  started_at + timedelta(minutes=1),
            "analyzed_at": (started_at + timedelta(minutes=1)).isoformat(),
            **ci,
        }
        await db.call_intelligence.replace_one({"call_id": call_id}, doc, upsert=True)

    await upsert_ci(CALL1_ID, CI_1, call1_started)
    await upsert_ci(CALL2_ID, CI_2, call2_started)
    print("✓ call_intelligence upserted")

    # ── Verify counts
    ci_count  = await db.call_intelligence.count_documents({"customer_id": DEMO_CUSTOMER_ID})
    tr_count  = await db.call_transcripts.count_documents({"call_id": {"$in": [CALL1_ID, CALL2_ID]}})
    call_cnt  = await db.ringostat_calls.count_documents({"customer_id": DEMO_CUSTOMER_ID})
    print(f"\n=== Verification ===")
    print(f"  customers:          {'OK' if await db.customers.find_one({'_id': DEMO_CUSTOMER_ID}) else 'MISSING'}")
    print(f"  leads:              {'OK' if await db.leads.find_one({'_id': DEMO_LEAD_ID}) else 'MISSING'}")
    print(f"  ringostat_calls:    {call_cnt}")
    print(f"  call_transcripts:   {tr_count}")
    print(f"  call_intelligence:  {ci_count}")
    print(f"\nOpen: /customer360/{DEMO_CUSTOMER_ID}?tab=calls")


if __name__ == "__main__":
    asyncio.run(main())
