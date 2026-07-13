"""
Lead Forms / Form Builder — service layer (business logic, no HTTP)
====================================================================

Native CRM lead-capture layer for Facebook / Instagram / Google Ads /
direct / referral traffic. A published form gets a public ``/f/{slug}``
landing page; every submission flows through the SAME lead pipeline the
rest of the CRM already uses:

    Ad -> Public Form -> Validation -> Deduplication -> Lead ->
    Routing -> SLA -> Manager Notification -> Analytics

Design rules honoured here:
  * Reuse existing ``leads`` collection + routing + SLA + notifications.
  * NO parallel "form_submissions to be imported later" entity.
  * ``ingest_submission()`` is the single intake function — a future
    Meta Lead Ads connector can call it with a normalized payload.
  * UTM / fbclid / gclid / referrer / device metadata captured, never
    shown to the client.
  * Deduplication by normalized phone then email; repeated submissions
    become attribution/activity on the existing lead (per duplicate
    policy) instead of blindly creating duplicates.
  * Tracking IDs only (Meta Pixel / Google Ads / GA4) — never secrets.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("bibi.lead_forms")

LANGS: Tuple[str, ...] = ("en", "bg", "uk")
DEFAULT_LANG = "en"

# Terminal lead statuses (mirror of lead_sla). Kept local to avoid a hard
# import dependency at module import time; reconciled lazily where needed.
TERMINAL_LEAD_STATUSES = {
    "converted", "lost", "rejected", "archived", "cancelled",
    "duplicate", "spam", "won", "closed",
}


# ══════════════════════════════════════════════════════════════════════
# FIELD REGISTRY — the configurable catalogue of fields an admin can add
# to a form. Each entry has a canonical type + trilingual labels. The
# admin toggles required/optional and ordering per-form; custom fields
# (text/select/checkbox/radio/textarea) are allowed on top.
# ══════════════════════════════════════════════════════════════════════
def _L(en: str, bg: str, uk: str) -> Dict[str, str]:
    return {"en": en, "bg": bg, "uk": uk}


FIELD_REGISTRY: Dict[str, Dict[str, Any]] = {
    "name":            {"type": "text",     "group": "contact", "labels": _L("Full name", "Пълно име", "Повне ім'я")},
    "firstName":       {"type": "text",     "group": "contact", "labels": _L("First name", "Име", "Ім'я")},
    "lastName":        {"type": "text",     "group": "contact", "labels": _L("Last name", "Фамилия", "Прізвище")},
    "phone":           {"type": "phone",    "group": "contact", "labels": _L("Phone", "Телефон", "Телефон")},
    "email":           {"type": "email",    "group": "contact", "labels": _L("Email", "Имейл", "Ел. пошта")},
    "country":         {"type": "country",  "group": "contact", "labels": _L("Country", "Държава", "Країна")},
    "city":            {"type": "text",     "group": "contact", "labels": _L("City", "Град", "Місто")},
    "brand":           {"type": "text",     "group": "vehicle", "labels": _L("Car brand", "Марка", "Марка авто")},
    "model":           {"type": "text",     "group": "vehicle", "labels": _L("Car model", "Модел", "Модель авто")},
    "yearFrom":        {"type": "number",   "group": "vehicle", "labels": _L("Year from", "Година от", "Рік від")},
    "yearTo":          {"type": "number",   "group": "vehicle", "labels": _L("Year to", "Година до", "Рік до")},
    "budgetFrom":      {"type": "number",   "group": "budget",  "labels": _L("Budget from (€)", "Бюджет от (€)", "Бюджет від (€)")},
    "budgetTo":        {"type": "number",   "group": "budget",  "labels": _L("Budget to (€)", "Бюджет до (€)", "Бюджет до (€)")},
    "fuel":            {"type": "select",   "group": "vehicle", "labels": _L("Fuel", "Гориво", "Паливо"),
                        "options": ["Electric", "Hybrid", "Diesel", "Petrol"]},
    "transmission":    {"type": "select",   "group": "vehicle", "labels": _L("Transmission", "Скорости", "Трансмісія"),
                        "options": ["Automatic", "Manual"]},
    "mileageMax":      {"type": "number",   "group": "vehicle", "labels": _L("Max mileage (km)", "Макс. пробег (км)", "Макс. пробіг (км)")},
    "purchaseType":    {"type": "select",   "group": "intent",  "labels": _L("Purchase type", "Тип покупка", "Тип покупки"),
                        "options": ["In stock", "On order", "Auction", "Leasing"]},
    "sourceCountry":   {"type": "select",   "group": "intent",  "labels": _L("Source country", "Държава на произход", "Країна походження"),
                        "options": ["USA", "Korea"]},
    "auctionInterest": {"type": "checkbox", "group": "intent",  "labels": _L("Interested in auction cars", "Интерес към аукционни автомобили", "Цікавлять аукціонні авто")},
    "leasingInterest": {"type": "checkbox", "group": "intent",  "labels": _L("Interested in leasing", "Интерес към лизинг", "Цікавить лізинг")},
    "carUrl":          {"type": "text",     "group": "vehicle", "labels": _L("Car link (URL)", "Линк към автомобил", "Посилання на авто")},
    "lotNumber":       {"type": "text",     "group": "vehicle", "labels": _L("Lot number", "Номер на лот", "Номер лоту")},
    "vin":             {"type": "text",     "group": "vehicle", "labels": _L("VIN", "VIN", "VIN")},
    "comment":         {"type": "textarea", "group": "extra",   "labels": _L("Comment", "Коментар", "Коментар")},
    "preferredContact":{"type": "select",   "group": "extra",   "labels": _L("Preferred contact", "Предпочитан контакт", "Бажаний контакт"),
                        "options": ["Phone", "Email", "WhatsApp", "Viber", "Telegram"]},
    "contactTime":     {"type": "select",   "group": "extra",   "labels": _L("Best time to contact", "Удобно време", "Зручний час"),
                        "options": ["Morning", "Afternoon", "Evening"]},
}

CUSTOM_FIELD_TYPES = ("text", "textarea", "select", "checkbox", "radio", "number", "email", "phone")

# ── High-converting widget presets ───────────────────────────────────
POPULAR_BRANDS = ["BMW", "Mercedes-Benz", "Audi", "Volkswagen", "Toyota",
                  "Ford", "Hyundai", "Kia", "Tesla", "Honda", "Nissan", "Lexus"]

# Numeric "chip" buckets: list of {value, label}
BUDGET_BUCKETS = [
    {"value": 10000, "label": "≤ €10k"}, {"value": 15000, "label": "€10–15k"},
    {"value": 20000, "label": "€15–20k"}, {"value": 30000, "label": "€20–30k"},
    {"value": 50000, "label": "€30–50k"}, {"value": 80000, "label": "€50k+"},
]
MILEAGE_BUCKETS = [
    {"value": 50000, "label": "≤ 50k km"}, {"value": 100000, "label": "≤ 100k km"},
    {"value": 150000, "label": "≤ 150k km"}, {"value": 200000, "label": "≤ 200k km"},
    {"value": 300000, "label": "Any"},
]
YEAR_BUCKETS = [
    {"value": 2015, "label": "2015+"}, {"value": 2018, "label": "2018+"},
    {"value": 2020, "label": "2020+"}, {"value": 2022, "label": "2022+"},
]

# ── Trilingual labels for registry SELECT option VALUES ──────────────
# The stored value stays canonical (English) so leads/CRM stay consistent
# regardless of the visitor's language; only the visible LABEL is localized.
OPTION_LABELS: Dict[str, Dict[str, str]] = {
    # sourceCountry — per operator rule: country names for USA / Korea stay
    # in English across ALL locales (visible labels only; canonical stored
    # value is still English so the CRM downstream is untouched).
    "USA": _L("USA", "USA", "USA"),
    "Korea": _L("Korea", "Korea", "Korea"),
    "Europe": _L("Europe", "Европа", "Європа"),
    "Any": _L("Any", "Всякакъв", "Будь-який"),
    # purchaseType
    "In stock": _L("In stock", "В наличност", "В наявності"),
    "On order": _L("On order", "Под поръчка", "Під замовлення"),
    "Auction": _L("Auction", "Аукцион", "Аукціон"),
    "Leasing": _L("Leasing", "Лизинг", "Лізинг"),
    # fuel
    "Petrol": _L("Petrol", "Бензин", "Бензин"),
    "Diesel": _L("Diesel", "Дизел", "Дизель"),
    "Hybrid": _L("Hybrid", "Хибрид", "Гібрид"),
    "Electric": _L("Electric", "Електрически", "Електро"),
    "LPG": _L("LPG", "Газ (LPG)", "Газ (LPG)"),
    # transmission
    "Automatic": _L("Automatic", "Автоматик", "Автомат"),
    "Manual": _L("Manual", "Ръчни", "Механіка"),
    # preferredContact
    "Phone": _L("Phone", "Телефон", "Телефон"),
    "Email": _L("Email", "Имейл", "Ел. пошта"),
    "WhatsApp": _L("WhatsApp", "WhatsApp", "WhatsApp"),
    "Viber": _L("Viber", "Viber", "Viber"),
    "Telegram": _L("Telegram", "Telegram", "Telegram"),
    # contactTime
    "Morning": _L("Morning", "Сутрин", "Зранку"),
    "Afternoon": _L("Afternoon", "Следобед", "Вдень"),
    "Evening": _L("Evening", "Вечер", "Ввечері"),
}


def localize_option(value: str, lang: str) -> str:
    m = OPTION_LABELS.get(value)
    if not m:
        return value
    return m.get(lang) or m.get("en") or value


def localized_buckets(key: str, lang: str) -> List[Dict[str, Any]]:
    """Return numeric bucket chips with language-aware labels (units / 'Any')."""
    if key in ("budgetFrom", "budgetTo"):
        return [dict(b) for b in BUDGET_BUCKETS]
    if key in ("yearFrom", "yearTo"):
        return [dict(b) for b in YEAR_BUCKETS]
    if key == "mileageMax":
        km = {"en": "km", "bg": "км", "uk": "км"}.get(lang, "km")
        any_ = {"en": "Any", "bg": "Всякакъв", "uk": "Будь-який"}.get(lang, "Any")
        return [
            {"value": 50000, "label": f"≤ 50k {km}"},
            {"value": 100000, "label": f"≤ 100k {km}"},
            {"value": 150000, "label": f"≤ 150k {km}"},
            {"value": 200000, "label": f"≤ 200k {km}"},
            {"value": 300000, "label": any_},
        ]
    return []

# Default interactive widget per registry field.
#   cards  → big tappable option cards (single select)
#   chips  → compact selectable chips (single select)
#   toggle → yes/no toggle card (boolean)
#   brand  → popular-brand chips + free text
#   input / textarea → styled input
WIDGET_BY_KEY: Dict[str, str] = {
    "sourceCountry": "cards", "fuel": "cards",
    "transmission": "cards", "preferredContact": "cards", "contactTime": "chips",
    "auctionInterest": "toggle", "leasingInterest": "toggle",
    "budgetFrom": "chips", "budgetTo": "chips",
    "yearFrom": "chips", "yearTo": "chips", "mileageMax": "chips",
    "brand": "catalog_brand", "model": "catalog_model", "comment": "textarea",
}

# Which registry group each numeric bucket belongs to (for chip options).
_BUCKETS_BY_KEY = {
    "budgetFrom": BUDGET_BUCKETS, "budgetTo": BUDGET_BUCKETS,
    "mileageMax": MILEAGE_BUCKETS, "yearFrom": YEAR_BUCKETS, "yearTo": YEAR_BUCKETS,
}

# Trilingual "selling" benefit bullets (default; admin-editable).
BENEFITS_DEFAULT = {
    "en": ["Free personal consultation", "Import from USA & Korea auctions",
           "Transparent all-in price", "Full delivery to Bulgaria + customs"],
    "bg": ["Безплатна лична консултация", "Внос от аукциони в USA и Korea",
           "Прозрачна крайна цена", "Пълна доставка до България + митница"],
    "uk": ["Безкоштовна персональна консультація", "Імпорт з аукціонів USA та Korea",
           "Прозора кінцева ціна", "Повна доставка до Болгарії + митниця"],
}

# Registry groups that belong to the final "contact" step.
_CONTACT_KEYS = {"name", "firstName", "lastName", "phone", "email",
                 "preferredContact", "contactTime", "city", "country"}


def default_widget(key: str, ftype: str, custom: bool) -> str:
    if custom:
        if ftype in ("select", "radio"):
            return "cards"
        if ftype == "checkbox":
            return "toggle"
        return "input"
    if key in WIDGET_BY_KEY:
        return WIDGET_BY_KEY[key]
    reg = FIELD_REGISTRY.get(key, {})
    if reg.get("type") == "select":
        return "cards"
    if reg.get("type") == "checkbox":
        return "toggle"
    if reg.get("type") == "textarea":
        return "textarea"
    return "input"


# ══════════════════════════════════════════════════════════════════════
# TEMPLATES — 11 required starting points. Each defines a default field
# set (ordered, with required flags), a lead_source label and trilingual
# copy. The admin can fully edit everything afterwards.
# ══════════════════════════════════════════════════════════════════════
def _f(key: str, required: bool = False) -> Dict[str, Any]:
    return {"key": key, "required": required}


def _content(title_en, title_bg, title_uk, sub_en="", sub_bg="", sub_uk="",
             cta_en="Send", cta_bg="Изпрати", cta_uk="Надіслати"):
    return {
        "title":    _L(title_en, title_bg, title_uk),
        "subtitle": _L(sub_en, sub_bg, sub_uk),
        "cta":      _L(cta_en, cta_bg, cta_uk),
        "success":  _L("Thank you! We'll contact you shortly.",
                       "Благодарим! Ще се свържем с вас скоро.",
                       "Дякуємо! Ми зв'яжемося з вами найближчим часом."),
    }


TEMPLATES: Dict[str, Dict[str, Any]] = {
    "general_lead": {
        "labels": _L("General Lead", "Обща заявка", "Загальна заявка"),
        "lead_source": "website",
        "fields": [_f("name", True), _f("phone", True), _f("email"), _f("comment")],
        "content": _content("Get a consultation", "Получете консултация", "Отримайте консультацію",
                            "Leave your details and our team will help you.",
                            "Оставете данните си и екипът ни ще ви помогне.",
                            "Залиште дані і наша команда допоможе вам."),
    },
    "free_consultation": {
        "labels": _L("Free Consultation", "Безплатна консултация", "Безкоштовна консультація"),
        "lead_source": "website",
        "fields": [_f("name", True), _f("phone", True), _f("preferredContact"), _f("comment")],
        "content": _content("Free consultation", "Безплатна консултация", "Безкоштовна консультація",
                            "We'll call you back and answer all your questions.",
                            "Ще ви върнем обаждане и ще отговорим на всичките ви въпроси.",
                            "Ми передзвонимо і відповімо на всі ваші запитання."),
    },
    "find_my_car": {
        "labels": _L("Find My Car", "Намери моята кола", "Знайти моє авто"),
        "lead_source": "website",
        "fields": [_f("sourceCountry"), _f("brand"), _f("model"),
                   _f("budgetTo"), _f("fuel"), _f("transmission"), _f("mileageMax"),
                   _f("name", True), _f("phone", True)],
        "content": _content("Find my perfect car", "Намери моята кола", "Знайти ідеальне авто",
                            "Answer a few quick questions — we'll find the best matches and call you back.",
                            "Отговорете на няколко въпроса — ще намерим най-добрите оферти и ще ви върнем обаждане.",
                            "Дайте відповідь на кілька запитань — ми знайдемо найкращі варіанти і передзвонимо."),
    },
    "car_from_usa": {
        "labels": _L("Car from USA", "Кола от USA", "Авто з USA"),
        "lead_source": "website",
        "fields": [_f("name", True), _f("phone", True), _f("brand"), _f("model"),
                   _f("budgetFrom"), _f("budgetTo"), _f("comment")],
        "content": _content("Order a car from the USA", "Поръчай кола от USA", "Замовити авто з USA",
                            "Import from US auctions to Bulgaria.",
                            "Внос от аукциони в USA до България.",
                            "Імпорт з аукціонів USA до Болгарії."),
    },
    "car_from_korea": {
        "labels": _L("Car from Korea", "Кола от Korea", "Авто з Korea"),
        "lead_source": "website",
        "fields": [_f("name", True), _f("phone", True), _f("brand"), _f("model"),
                   _f("budgetFrom"), _f("budgetTo"), _f("comment")],
        "content": _content("Order a car from Korea", "Поръчай кола от Korea", "Замовити авто з Korea",
                            "Import from South Korean auctions to Bulgaria.",
                            "Внос от аукциони в Korea до България.",
                            "Імпорт з аукціонів Korea до Болгарії."),
    },
    "specific_car": {
        "labels": _L("Specific Car Interest", "Интерес към конкретна кола", "Інтерес до конкретного авто"),
        "lead_source": "website",
        "fields": [_f("name", True), _f("phone", True), _f("carUrl"), _f("lotNumber"), _f("vin"), _f("comment")],
        "content": _content("Interested in this car?", "Интересувате се от тази кола?", "Цікавить це авто?",
                            "Send the link or lot number and we'll get the details.",
                            "Изпратете линк или номер на лот и ще вземем детайлите.",
                            "Надішліть посилання або номер лоту — ми дізнаємось деталі."),
    },
    "auction_car": {
        "labels": _L("Auction Car", "Аукционна кола", "Аукціонне авто"),
        "lead_source": "website",
        "fields": [_f("name", True), _f("phone", True), _f("brand"), _f("model"),
                   _f("budgetFrom"), _f("budgetTo"), _f("auctionInterest"), _f("comment")],
        "content": _content("Buy at auction", "Купи на аукцион", "Купити на аукціоні",
                            "We bid on IAAI / Copart for you.",
                            "Наддаваме на IAAI / Copart вместо вас.",
                            "Ми робимо ставки на IAAI / Copart за вас."),
    },
    "leasing": {
        "labels": _L("Leasing", "Лизинг", "Лізинг"),
        "lead_source": "website",
        "fields": [_f("name", True), _f("phone", True), _f("budgetFrom"), _f("budgetTo"),
                   _f("leasingInterest"), _f("comment")],
        "content": _content("Car leasing", "Лизинг на автомобил", "Лізинг авто",
                            "Flexible leasing options for imported cars.",
                            "Гъвкави лизингови условия за вносни автомобили.",
                            "Гнучкі умови лізингу для імпортних авто."),
    },
    "callback": {
        "labels": _L("Callback", "Обратно обаждане", "Зворотний дзвінок"),
        "lead_source": "website",
        "fields": [_f("name", True), _f("phone", True), _f("contactTime")],
        "content": _content("Request a callback", "Заяви обаждане", "Замовити дзвінок",
                            "Leave your number — we'll call you back.",
                            "Оставете номер — ще ви върнем обаждане.",
                            "Залиште номер — ми передзвонимо.",
                            "Call me back", "Обади ми се", "Передзвоніть мені"),
    },
    "contact_request": {
        "labels": _L("Contact Request", "Контактна заявка", "Контактна заявка"),
        "lead_source": "website",
        "fields": [_f("name", True), _f("phone", True), _f("email"), _f("comment", True)],
        "content": _content("Contact us", "Свържете се с нас", "Зв'яжіться з нами",
                            "We usually reply within a few hours.",
                            "Обикновено отговаряме в рамките на няколко часа.",
                            "Зазвичай відповідаємо протягом кількох годин."),
    },
    "custom": {
        "labels": _L("Custom Form", "Персонализирана форма", "Кастомна форма"),
        "lead_source": "website",
        "fields": [_f("name", True), _f("phone", True)],
        "content": _content("Contact form", "Форма за контакт", "Форма контакту"),
    },
}


# ══════════════════════════════════════════════════════════════════════
# Small helpers
# ══════════════════════════════════════════════════════════════════════
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime] = None) -> str:
    return (dt or _now()).isoformat()


def gen_id(prefix: str = "form") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    base = _SLUG_RE.sub("-", (text or "").strip().lower()).strip("-")
    base = base[:40] or "form"
    return f"{base}-{uuid.uuid4().hex[:6]}"


def normalize_email(email: Optional[str]) -> Optional[str]:
    e = (email or "").strip().lower()
    return e or None


def normalize_phone_bg(phone: Optional[str]) -> Tuple[bool, str]:
    """Bulgarian phone normalization → E.164. Mirrors server._validate_bg_phone.

    Returns (is_valid, normalized). When the number does not match BG rules
    we still return the digit-cleaned form so dedup can compare consistently.
    """
    if not phone:
        return False, ""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("359"):
        digits = digits[3:]
    if digits.startswith("0"):
        digits = digits[1:]
    if not digits:
        return False, ""
    if len(digits) == 9 and digits[0] in ("8", "9"):
        return True, "+359" + digits
    if len(digits) in (8, 9) and digits[0] in ("2", "3", "4", "5", "6", "7"):
        return True, "+359" + digits
    # Unknown country / format: keep a stable canonical form for dedup.
    return False, "+" + digits if len(digits) >= 8 else digits


# UTM canonical keys
UTM_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")


def pick_utm(src: Optional[Dict[str, Any]]) -> Dict[str, str]:
    src = src or {}
    return {k: str(src.get(k) or "")[:180] for k in UTM_KEYS}


_CHANNEL_MAP = {
    "fb": "facebook", "facebook": "facebook", "meta": "facebook",
    "ig": "instagram", "instagram": "instagram",
    "google": "google", "google_ads": "google", "adwords": "google", "gads": "google",
    "referral": "referral", "direct": "direct",
}


def detect_channel(utm: Dict[str, str], fbclid: str = "", gclid: str = "",
                   referrer: str = "") -> str:
    """Best-effort marketing channel attribution."""
    src = (utm.get("utm_source") or "").strip().lower()
    if src in _CHANNEL_MAP:
        return _CHANNEL_MAP[src]
    if fbclid:
        return "facebook"
    if gclid:
        return "google"
    if referrer:
        r = referrer.lower()
        if "facebook" in r or "fb." in r:
            return "facebook"
        if "instagram" in r:
            return "instagram"
        if "google" in r:
            return "google"
        return "referral"
    return "direct"


def device_from_ua(ua: str) -> str:
    u = (ua or "").lower()
    if any(t in u for t in ("iphone", "android", "mobile", "ipod")):
        return "mobile"
    if "ipad" in u or "tablet" in u:
        return "tablet"
    return "desktop"


# ══════════════════════════════════════════════════════════════════════
# Form document builders / normalizers
# ══════════════════════════════════════════════════════════════════════
def _default_field_label(key: str, lang: str) -> str:
    reg = FIELD_REGISTRY.get(key)
    if reg:
        return reg["labels"].get(lang) or reg["labels"].get("en") or key
    return key


def resolve_field(field: Dict[str, Any], lang: str) -> Dict[str, Any]:
    """Resolve a stored form field into a public-render descriptor."""
    key = field.get("key")
    custom = bool(field.get("custom"))
    ftype = field.get("type") or (FIELD_REGISTRY.get(key, {}).get("type") if not custom else "text") or "text"
    label = field.get("label") or _default_field_label(key, lang)
    options = field.get("options")
    if options is None and not custom:
        options = FIELD_REGISTRY.get(key, {}).get("options")
    widget = field.get("widget") or default_widget(key, ftype, custom)
    group = field.get("group") or FIELD_REGISTRY.get(key, {}).get("group") or "extra"
    if key in _CONTACT_KEYS:
        group = "contact"
    # SELECT / radio options → localized {value,label} (value stays canonical).
    options_out: List[Dict[str, str]] = []
    for o in (options or []):
        if isinstance(o, dict):
            options_out.append({"value": o.get("value"), "label": o.get("label") or str(o.get("value"))})
        else:
            options_out.append({"value": o, "label": localize_option(o, lang) if not custom else str(o)})
    # Numeric bucket chips (budget / mileage / year) — language-aware labels.
    buckets = localized_buckets(key, lang) if not custom else []
    return {
        "key": key,
        "type": ftype,
        "label": label,
        "placeholder": field.get("placeholder") or "",
        "required": bool(field.get("required")),
        "options": options_out,
        "buckets": buckets or [],
        "brand_suggestions": POPULAR_BRANDS if widget == "brand" else [],
        "widget": widget,
        "group": group,
        "step": field.get("step"),
        "custom": custom,
    }


def build_form_document(payload: Dict[str, Any], created_by: str = "") -> Dict[str, Any]:
    """Create a NEW lead_forms document from an admin payload (+ template)."""
    template_key = (payload.get("template") or "custom").strip()
    tpl = TEMPLATES.get(template_key, TEMPLATES["custom"])
    lang = (payload.get("language") or DEFAULT_LANG).strip().lower()
    if lang not in LANGS:
        lang = DEFAULT_LANG

    name = (payload.get("name") or "").strip() or _tpl_label(tpl, lang)
    fields = payload.get("fields")
    if not fields:
        fields = [dict(f) for f in tpl["fields"]]
    fields = _normalize_fields(fields)

    content = payload.get("content") or _content_for_lang(tpl["content"], lang)

    now = _now()
    doc = {
        "id": gen_id(),
        "slug": slugify(payload.get("slug") or name or template_key),
        "name": name[:160],
        "internal_name": (payload.get("internal_name") or name)[:160],
        "template": template_key,
        "language": lang,
        "status": "draft",
        "content": _normalize_content(content),
        "fields": fields,
        "attribution": _normalize_attribution(payload.get("attribution"), tpl),
        "routing": _normalize_routing(payload.get("routing")),
        "sla": _normalize_sla(payload.get("sla")),
        "duplicate_policy": (payload.get("duplicate_policy") or "update"),
        "thankyou": _normalize_thankyou(payload.get("thankyou")),
        "tracking": _normalize_tracking(payload.get("tracking")),
        "settings": _normalize_settings(payload.get("settings"), lang, template_key),
        "counters": empty_counters(),
        "created_at": _iso(now),
        "updated_at": _iso(now),
        "created_by": created_by,
    }
    return doc


def _tpl_label(tpl: Dict[str, Any], lang: str) -> str:
    return tpl["labels"].get(lang) or tpl["labels"].get("en") or "Form"


def _content_for_lang(content_ml: Dict[str, Any], lang: str) -> Dict[str, Any]:
    """Flatten a multilingual content dict into the chosen language."""
    out = {}
    for k in ("title", "subtitle", "cta", "success"):
        v = content_ml.get(k) or {}
        out[k] = v.get(lang) or v.get("en") or ""
    return out


def _normalize_content(content: Dict[str, Any]) -> Dict[str, str]:
    return {
        "title":   str(content.get("title") or "")[:200],
        "subtitle": str(content.get("subtitle") or "")[:400],
        "cta":     str(content.get("cta") or "Send")[:60],
        "success": str(content.get("success") or "Thank you!")[:400],
    }


def _normalize_fields(fields: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = set()
    for i, f in enumerate(fields or []):
        key = (f.get("key") or "").strip()
        custom = bool(f.get("custom"))
        if not key or key in seen:
            continue
        seen.add(key)
        entry: Dict[str, Any] = {
            "key": key,
            "required": bool(f.get("required")),
            "order": int(f.get("order", i)),
            "custom": custom,
        }
        if custom:
            ftype = (f.get("type") or "text").strip()
            entry["type"] = ftype if ftype in CUSTOM_FIELD_TYPES else "text"
            entry["label"] = (f.get("label") or key)[:120]
            if f.get("placeholder"):
                entry["placeholder"] = str(f["placeholder"])[:160]
            if isinstance(f.get("options"), list):
                entry["options"] = [str(o)[:80] for o in f["options"]][:20]
        else:
            if f.get("label"):
                entry["label"] = str(f["label"])[:120]
            if f.get("placeholder"):
                entry["placeholder"] = str(f["placeholder"])[:160]
        # Preserve interactive-widget config for all fields.
        if f.get("widget"):
            entry["widget"] = str(f["widget"])[:24]
        if f.get("step") is not None:
            try:
                entry["step"] = int(f["step"])
            except (TypeError, ValueError):
                pass
        out.append(entry)
    out.sort(key=lambda x: x.get("order", 0))
    for i, f in enumerate(out):
        f["order"] = i
    return out


def _normalize_attribution(attr: Optional[Dict[str, Any]], tpl: Dict[str, Any]) -> Dict[str, Any]:
    attr = attr or {}
    tags = attr.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    return {
        "lead_source": (attr.get("lead_source") or tpl.get("lead_source") or "website")[:64],
        "campaign": (attr.get("campaign") or "")[:120],
        "tags": [str(t)[:40] for t in tags][:20],
        "lead_status": (attr.get("lead_status") or "new")[:32],
        "priority": (attr.get("priority") or "normal")[:16],
    }


def _normalize_routing(routing: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    routing = routing or {}
    mode = (routing.get("mode") or "round_robin").strip()
    if mode not in ("round_robin", "manual", "default"):
        mode = "round_robin"
    return {
        "mode": mode,
        "default_manager_id": routing.get("default_manager_id") or None,
    }


def _normalize_sla(sla: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    sla = sla or {}
    try:
        minutes = int(sla.get("first_response_minutes") or 15)
    except (TypeError, ValueError):
        minutes = 15
    minutes = max(5, min(minutes, 1440))
    return {"first_response_minutes": minutes}


def _normalize_thankyou(ty: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    ty = ty or {}
    behaviour = (ty.get("behaviour") or "message").strip()
    if behaviour not in ("message", "redirect"):
        behaviour = "message"
    return {
        "behaviour": behaviour,
        "redirect_url": (ty.get("redirect_url") or "")[:400],
    }


def _normalize_tracking(tr: Optional[Dict[str, Any]]) -> Dict[str, str]:
    tr = tr or {}
    return {
        "meta_pixel_id": str(tr.get("meta_pixel_id") or "")[:64],
        "google_ads_conversion_id": str(tr.get("google_ads_conversion_id") or "")[:64],
        "google_ads_conversion_label": str(tr.get("google_ads_conversion_label") or "")[:64],
        "ga4_measurement_id": str(tr.get("ga4_measurement_id") or "")[:64],
    }


def _normalize_settings(st: Optional[Dict[str, Any]], lang: str = DEFAULT_LANG,
                        template_key: str = "custom") -> Dict[str, Any]:
    """Branding / conversion settings for the public landing form."""
    st = st or {}
    layout = (st.get("layout") or "wizard").strip()
    if layout not in ("wizard", "single"):
        layout = "wizard"
    accent = str(st.get("accent_color") or "#FEAE00")[:16]
    theme = (st.get("theme") or "light").strip()
    if theme not in ("light", "dark"):
        theme = "light"
    benefits = st.get("benefits")
    if not isinstance(benefits, list) or not benefits:
        benefits = list(BENEFITS_DEFAULT.get(lang) or BENEFITS_DEFAULT["en"])
    benefits = [str(b)[:80] for b in benefits][:6]
    return {
        "layout": layout,
        "theme": theme,
        "accent_color": accent,
        "hero_headline": str(st.get("hero_headline") or "")[:120],
        "show_benefits": st.get("show_benefits", True) is not False,
        "benefits": benefits,
        "trust_badge": str(st.get("trust_badge")
                           or {"en": "1500+ cars imported to Bulgaria",
                               "bg": "1500+ вносени автомобила в България",
                               "uk": "1500+ авто імпортовано до Болгарії"}.get(lang, ""))[:120],
        "show_progress": st.get("show_progress", True) is not False,
    }


def empty_counters() -> Dict[str, int]:
    return {k: 0 for k in ("views", "starts", "submissions", "valid_leads", "duplicates", "deals", "won")}


def apply_updates(doc: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply an admin edit payload to an existing form doc (in place)."""
    if "name" in payload:
        doc["name"] = str(payload["name"] or "")[:160]
    if "internal_name" in payload:
        doc["internal_name"] = str(payload["internal_name"] or "")[:160]
    if "slug" in payload:
        # Slug is the user-facing short URL (bibicars.bg/{slug}) — the admin can
        # freely rename it in the builder. Uniqueness / reserved-word checks are
        # enforced at the router level (needs DB access).
        raw = str(payload["slug"] or "").strip().lower()
        cleaned = _SLUG_RE.sub("-", raw).strip("-")[:60]
        if cleaned:
            doc["slug"] = cleaned
    if "language" in payload:
        lang = str(payload["language"]).lower()
        doc["language"] = lang if lang in LANGS else doc.get("language", DEFAULT_LANG)
    if "content" in payload and isinstance(payload["content"], dict):
        doc["content"] = _normalize_content(payload["content"])
    if "fields" in payload and isinstance(payload["fields"], list):
        doc["fields"] = _normalize_fields(payload["fields"])
    if "attribution" in payload:
        tpl = TEMPLATES.get(doc.get("template"), TEMPLATES["custom"])
        doc["attribution"] = _normalize_attribution(payload["attribution"], tpl)
    if "routing" in payload:
        doc["routing"] = _normalize_routing(payload["routing"])
    if "sla" in payload:
        doc["sla"] = _normalize_sla(payload["sla"])
    if "duplicate_policy" in payload:
        dp = payload["duplicate_policy"]
        doc["duplicate_policy"] = dp if dp in ("update", "reactivate", "always_new") else "update"
    if "thankyou" in payload:
        doc["thankyou"] = _normalize_thankyou(payload["thankyou"])
    if "tracking" in payload:
        doc["tracking"] = _normalize_tracking(payload["tracking"])
    if "settings" in payload:
        doc["settings"] = _normalize_settings(payload["settings"], doc.get("language", DEFAULT_LANG), doc.get("template", "custom"))
    if "status" in payload and payload["status"] in ("draft", "published", "disabled"):
        doc["status"] = payload["status"]
    doc["updated_at"] = _iso()
    return doc


def public_view(form: Dict[str, Any]) -> Dict[str, Any]:
    """Shape a form doc for the PUBLIC render endpoint (no internal data)."""
    lang = form.get("language", DEFAULT_LANG)
    return {
        "slug": form.get("slug"),
        "name": form.get("name"),
        "language": lang,
        "status": form.get("status"),
        "content": form.get("content") or {},
        "fields": [resolve_field(f, lang) for f in sorted(form.get("fields", []), key=lambda x: x.get("order", 0))],
        "thankyou": form.get("thankyou") or {"behaviour": "message"},
        "tracking": form.get("tracking") or {},
        "settings": form.get("settings") or _normalize_settings(None, lang, form.get("template", "custom")),
    }


# ══════════════════════════════════════════════════════════════════════
# Routing — pick a manager (round-robin by open lead load)
# ══════════════════════════════════════════════════════════════════════
async def pick_manager(db, form: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    routing = form.get("routing") or {}
    mode = routing.get("mode") or "round_robin"

    if mode in ("manual", "default") and routing.get("default_manager_id"):
        mgr = await db.staff.find_one(
            {"$or": [{"id": routing["default_manager_id"]}, {"_id": routing["default_manager_id"]}]}
        )
        if mgr:
            return mgr

    managers = await db.staff.find(
        {"role": "manager", "$or": [{"disabled": {"$exists": False}}, {"disabled": False}]}
    ).to_list(200)
    if not managers:
        return None

    # Open-load per manager (active leads)
    load_map: Dict[str, int] = {}
    try:
        pipeline = [
            {"$match": {"status": {"$nin": list(TERMINAL_LEAD_STATUSES)}}},
            {"$group": {"_id": "$managerId", "load": {"$sum": 1}}},
        ]
        async for row in db.leads.aggregate(pipeline):
            if row.get("_id"):
                load_map[row["_id"]] = int(row.get("load") or 0)
    except Exception:
        load_map = {}

    def keyfn(m):
        mid = m.get("id") or str(m.get("_id"))
        return (load_map.get(mid, 0), m.get("created_at") or "")

    managers.sort(key=keyfn)
    return managers[0]


# ══════════════════════════════════════════════════════════════════════
# Submission → Lead mapping
# ══════════════════════════════════════════════════════════════════════
def map_submission_to_lead(form: Dict[str, Any], values: Dict[str, Any],
                           meta: Dict[str, Any]) -> Dict[str, Any]:
    """Translate a raw submission into the canonical `leads` document shape."""
    attribution = form.get("attribution") or {}
    utm = meta.get("utm") or {}
    channel = meta.get("channel") or "direct"

    first = (values.get("firstName") or "").strip()
    last = (values.get("lastName") or "").strip()
    name = (values.get("name") or "").strip()
    if not name and (first or last):
        name = f"{first} {last}".strip()
    if name and not first and not last:
        parts = name.split(maxsplit=1)
        first = parts[0]
        last = parts[1] if len(parts) > 1 else ""

    _ok, phone = normalize_phone_bg(values.get("phone"))
    email = normalize_email(values.get("email"))

    # Vehicle interest string
    veh_parts = [values.get("brand"), values.get("model")]
    vehicle_interest = " ".join([str(p) for p in veh_parts if p]).strip() or values.get("carUrl") or None

    # Budget (EUR)
    budget = 0.0
    for k in ("budgetTo", "budgetFrom"):
        try:
            v = float(values.get(k) or 0)
            if v:
                budget = v
                break
        except (TypeError, ValueError):
            pass

    now = _now()
    lead_id = f"lead-{now.timestamp()}"
    attr_event = {
        "form_id": form.get("id"),
        "form_slug": form.get("slug"),
        "form_name": form.get("name"),
        "channel": channel,
        "source": attribution.get("lead_source") or "website",
        "campaign": attribution.get("campaign") or utm.get("utm_campaign") or "",
        "utm": utm,
        "fbclid": meta.get("fbclid") or "",
        "gclid": meta.get("gclid") or "",
        "referrer": meta.get("referrer") or "",
        "landing_url": meta.get("landing_url") or "",
        "language": meta.get("language") or form.get("language"),
        "device": meta.get("device") or "",
        "submitted_at": _iso(now),
    }

    lead = {
        "id": lead_id,
        "firstName": first,
        "lastName": last,
        "name": name or "(no name)",
        "email": email,
        "phone": phone or (values.get("phone") or ""),
        "phoneCountry": "BG",
        "country": values.get("country") or "BG",
        "city": values.get("city"),
        "source": channel,                        # marketing channel
        "lead_source": attribution.get("lead_source") or "website",
        "campaign": attr_event["campaign"],
        "status": attribution.get("lead_status") or "new",
        "priority": attribution.get("priority") or "normal",
        "tags": list(attribution.get("tags") or []),
        "score": 70,
        "vin": (values.get("vin") or None),
        "lotNumber": values.get("lotNumber") or None,
        "vehicleInterest": vehicle_interest,
        "budgetEur": budget,
        "budgetUsd": budget,
        "budgetCurrency": "EUR",
        "notes": values.get("comment") or "",
        "description": values.get("comment") or "",
        "form_id": form.get("id"),
        "form_slug": form.get("slug"),
        "form_data": values,
        "utm": utm,
        "utm_source": utm.get("utm_source") or channel,
        "utm_medium": utm.get("utm_medium") or "",
        "utm_campaign": attr_event["campaign"],
        "utm_content": utm.get("utm_content") or "",
        "utm_term": utm.get("utm_term") or "",
        "fbclid": meta.get("fbclid") or "",
        "gclid": meta.get("gclid") or "",
        "attribution": [attr_event],
        "last_submission_at": _iso(now),
        "created_at": _iso(now),
        "updated_at": _iso(now),
    }
    return lead, attr_event


async def find_duplicate(db, phone: str, email: Optional[str]) -> Optional[Dict[str, Any]]:
    """Find an ACTIVE (non-terminal) lead matching normalized phone then email."""
    if phone:
        lead = await db.leads.find_one(
            {"phone": phone, "status": {"$nin": list(TERMINAL_LEAD_STATUSES)}},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        if lead:
            return lead
    if email:
        lead = await db.leads.find_one(
            {"email": email, "status": {"$nin": list(TERMINAL_LEAD_STATUSES)}},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        if lead:
            return lead
    return None


async def find_any(db, phone: str, email: Optional[str]) -> Optional[Dict[str, Any]]:
    """Find ANY lead (incl. closed) matching phone then email — for reactivation."""
    q = []
    if phone:
        q.append({"phone": phone})
    if email:
        q.append({"email": email})
    if not q:
        return None
    return await db.leads.find_one({"$or": q}, {"_id": 0}, sort=[("created_at", -1)])


# ══════════════════════════════════════════════════════════════════════
# Analytics — funnel events + counters
# ══════════════════════════════════════════════════════════════════════
FUNNEL_EVENTS = ("view", "start", "submit", "lead_created", "duplicate", "deal", "won")

_COUNTER_FOR_EVENT = {
    "view": "views",
    "start": "starts",
    "submit": "submissions",
    "lead_created": "valid_leads",
    "duplicate": "duplicates",
    "deal": "deals",
    "won": "won",
}


async def record_event(db, form: Dict[str, Any], event_type: str, *,
                       lead_id: Optional[str] = None, meta: Optional[Dict[str, Any]] = None) -> None:
    """Write a raw funnel event + bump the aggregate counter on the form."""
    if event_type not in FUNNEL_EVENTS:
        return
    meta = meta or {}
    utm = meta.get("utm") or {}
    doc = {
        "id": gen_id("fe"),
        "form_id": form.get("id"),
        "slug": form.get("slug"),
        "type": event_type,
        "lead_id": lead_id,
        "channel": meta.get("channel") or "",
        "source": (form.get("attribution") or {}).get("lead_source") or "",
        "campaign": (form.get("attribution") or {}).get("campaign") or utm.get("utm_campaign") or "",
        "language": meta.get("language") or form.get("language"),
        "utm": utm,
        "device": meta.get("device") or "",
        "ts": _now(),
    }
    try:
        await db.form_events.insert_one(doc)
    except Exception as e:
        logger.debug("[lead_forms] record_event insert failed: %s", e)
    counter = _COUNTER_FOR_EVENT.get(event_type)
    if counter:
        try:
            await db.lead_forms.update_one(
                {"id": form.get("id")},
                {"$inc": {f"counters.{counter}": 1}},
            )
        except Exception as e:
            logger.debug("[lead_forms] counter bump failed: %s", e)


async def compute_analytics(db, form: Dict[str, Any]) -> Dict[str, Any]:
    """Funnel + conversion rates + breakdown by channel/campaign/language."""
    counters = form.get("counters") or empty_counters()

    def rate(n: int, d: int) -> float:
        return round((n / d) * 100.0, 1) if d else 0.0

    funnel = {
        "views": counters.get("views", 0),
        "starts": counters.get("starts", 0),
        "submissions": counters.get("submissions", 0),
        "valid_leads": counters.get("valid_leads", 0),
        "duplicates": counters.get("duplicates", 0),
        "deals": counters.get("deals", 0),
        "won": counters.get("won", 0),
    }
    rates = {
        "view_to_submit": rate(funnel["submissions"], funnel["views"]),
        "submit_to_lead": rate(funnel["valid_leads"], funnel["submissions"]),
        "lead_to_deal": rate(funnel["deals"], funnel["valid_leads"]),
        "deal_to_won": rate(funnel["won"], funnel["deals"]),
    }

    # Breakdown by channel / campaign / language over submit+lead_created events
    breakdown = {"channel": {}, "campaign": {}, "language": {}}
    try:
        pipeline = [
            {"$match": {"form_id": form.get("id"), "type": {"$in": ["submit", "lead_created"]}}},
            {"$group": {"_id": {"channel": "$channel", "campaign": "$campaign", "language": "$language"},
                        "count": {"$sum": 1}}},
        ]
        async for row in db.form_events.aggregate(pipeline):
            g = row.get("_id") or {}
            cnt = int(row.get("count") or 0)
            for dim in ("channel", "campaign", "language"):
                key = (g.get(dim) or "—") or "—"
                breakdown[dim][key] = breakdown[dim].get(key, 0) + cnt
    except Exception as e:
        logger.debug("[lead_forms] analytics breakdown failed: %s", e)

    return {"funnel": funnel, "rates": rates, "breakdown": breakdown}


# ══════════════════════════════════════════════════════════════════════
# INGEST PIPELINE — the single intake for ALL sources (public form now,
# future Meta Lead Ads connector later). Creates/updates a REAL lead.
# ══════════════════════════════════════════════════════════════════════
async def ingest_submission(db, form: Dict[str, Any], values: Dict[str, Any],
                            meta: Dict[str, Any]) -> Dict[str, Any]:
    """Validate-agnostic intake. Assumes required-field validation already
    happened at the transport layer. Handles dedup, routing, lead create/
    update, SLA-trackability, notifications and analytics.

    Returns: {"ok", "lead_id", "duplicate": bool, "reactivated": bool}
    """
    now = _now()
    lead_doc, attr_event = map_submission_to_lead(form, values, meta)
    phone = lead_doc.get("phone")
    email = lead_doc.get("email")
    policy = form.get("duplicate_policy") or "update"

    await record_event(db, form, "submit", meta=meta)

    # ── Deduplication ────────────────────────────────────────────────
    existing = None
    reactivated = False
    if policy != "always_new":
        existing = await find_duplicate(db, phone, email)
        if not existing and policy == "reactivate":
            existing = await find_any(db, phone, email)

    if existing:
        lead_id = existing.get("id")
        set_ops: Dict[str, Any] = {
            "updated_at": _iso(now),
            "last_submission_at": _iso(now),
            "last_contact_at": _iso(now),
        }
        # Reactivation: if the found lead is terminal, revive it.
        cur_status = str(existing.get("status") or "").lower()
        if policy == "reactivate" and cur_status in TERMINAL_LEAD_STATUSES:
            set_ops["status"] = "new"
            set_ops["reactivated_at"] = _iso(now)
            set_ops["first_response_at"] = None  # restart SLA
            reactivated = True
        # Enrich empty fields from the new submission
        for k in ("email", "vehicleInterest", "budgetEur", "city"):
            if not existing.get(k) and lead_doc.get(k):
                set_ops[k] = lead_doc[k]
        try:
            await db.leads.update_one(
                {"id": lead_id},
                {"$set": set_ops,
                 "$push": {"attribution": attr_event}},
            )
        except Exception as e:
            logger.error("[lead_forms] dedup update failed: %s", e)

        # Attribution activity note (visible in Lead360 timeline)
        try:
            await db.lead_notes.insert_one({
                "id": f"lnote-{now.timestamp()}",
                "leadId": lead_id,
                "text": (f"New form submission via '{form.get('name')}' "
                         f"[{attr_event.get('channel')}"
                         + (f" / {attr_event.get('campaign')}" if attr_event.get('campaign') else "")
                         + "]" + (" — lead reactivated" if reactivated else "")),
                "pinned": False,
                "system": True,
                "created_at": _iso(now),
                "created_by": "system:lead_forms",
                "created_by_name": "Lead Forms",
            })
        except Exception:
            pass

        await record_event(db, form, "duplicate", lead_id=lead_id, meta=meta)

        # Reactivated leads need a manager + a fresh notification.
        if reactivated:
            try:
                fresh = await db.leads.find_one({"id": lead_id}, {"_id": 0}) or existing
                if not fresh.get("managerId"):
                    mgr = await pick_manager(db, form)
                    if mgr:
                        mid = mgr.get("id") or str(mgr.get("_id"))
                        await db.leads.update_one({"id": lead_id}, {"$set": {
                            "managerId": mid,
                            "manager": mgr.get("name") or mgr.get("email"),
                        }})
                        fresh["managerId"] = mid
                from app.services.lead_notifications import notify_new_lead
                await notify_new_lead(db, fresh)
            except Exception as e:
                logger.debug("[lead_forms] reactivation notify failed: %s", e)

        return {"ok": True, "lead_id": lead_id, "duplicate": True, "reactivated": reactivated}

    # ── New lead ─────────────────────────────────────────────────────
    mgr = await pick_manager(db, form)
    if mgr:
        mid = mgr.get("id") or str(mgr.get("_id"))
        lead_doc["managerId"] = mid
        lead_doc["manager"] = mgr.get("name") or mgr.get("email")
        lead_doc["manager_email"] = mgr.get("email")
        lead_doc["assigned_at"] = _iso(now)
    else:
        lead_doc["managerId"] = None

    try:
        await db.leads.insert_one(dict(lead_doc))
    except Exception as e:
        logger.error("[lead_forms] lead insert failed: %s", e)
        raise

    lead_doc.pop("_id", None)

    # Notification (assigned manager, or admins/TLs if unassigned)
    try:
        from app.services.lead_notifications import notify_new_lead
        await notify_new_lead(db, lead_doc)
    except Exception as e:
        logger.debug("[lead_forms] notify_new_lead failed: %s", e)

    await record_event(db, form, "lead_created", lead_id=lead_doc["id"], meta=meta)

    return {"ok": True, "lead_id": lead_doc["id"], "duplicate": False, "reactivated": False}



# ══════════════════════════════════════════════════════════════════════
# SEED — hard-coded starter forms materialised from the built-in TEMPLATES.
# These are seeded on every startup so the Lead Forms library ALWAYS exists
# after a fresh deploy / re-created database. Both the `id` and the public
# `slug` are DETERMINISTIC (derived from the template key), so the public
# route ``/f/{slug}`` is stable and never lost across redeploys.
#
# Idempotent: an existing form (matched by its deterministic id) is NEVER
# overwritten — admin edits always win.
# ══════════════════════════════════════════════════════════════════════

# Language each starter form is materialised in. Bulgaria is the primary
# market for this CRM, so the visible copy is seeded in Bulgarian; the admin
# can freely edit / duplicate / translate afterwards.
SEED_LANG = "bg"

# Explicit order the starter forms should appear in (nice-to-have; the list
# endpoint still sorts by created_at, but we stamp created_at accordingly).
SEED_ORDER: Tuple[str, ...] = (
    "general_lead", "free_consultation", "find_my_car", "car_from_usa",
    "car_from_korea", "specific_car", "auction_car", "leasing",
    "callback", "contact_request", "custom",
)


def seed_slug(key: str) -> str:
    """Deterministic, human-readable public slug for a starter form."""
    return key.replace("_", "-")


def seed_form_id(key: str) -> str:
    """Deterministic id so the seed is idempotent across restarts."""
    return f"form-{seed_slug(key)}"


def build_seed_document(key: str, lang: str = SEED_LANG,
                        order_index: int = 0) -> Optional[Dict[str, Any]]:
    """Materialise a built-in template into a full, publishable form doc
    with a STABLE id + slug (so the route survives every redeploy)."""
    tpl = TEMPLATES.get(key)
    if not tpl:
        return None
    doc = build_form_document({"template": key, "language": lang},
                              created_by="system:seed")
    doc["id"] = seed_form_id(key)
    doc["slug"] = seed_slug(key)
    doc["status"] = "published"          # live route, visible + submittable
    doc["seed_key"] = key                # marker: this is a hard-coded form
    doc["is_seed"] = True
    # Deterministic, ordered created_at so the library lists in a sensible order.
    ts = datetime(2024, 1, 1, tzinfo=timezone.utc)
    # earlier keys should sort first when list sorts by created_at DESC → give
    # earlier keys a LATER timestamp.
    doc["created_at"] = ts.replace(microsecond=(999999 - order_index)).isoformat()
    return doc


async def seed_forms_if_missing(db) -> Dict[str, Any]:
    """Ensure every built-in starter form exists. Idempotent & non-destructive.

    Returns {"created": int, "kept": int, "total": int}.
    """
    created = 0
    kept = 0
    keys = list(SEED_ORDER) + [k for k in TEMPLATES.keys() if k not in SEED_ORDER]
    for idx, key in enumerate(keys):
        sid = seed_form_id(key)
        existing = await db.lead_forms.find_one({"id": sid}, {"_id": 1})
        if existing:
            kept += 1
            continue
        doc = build_seed_document(key, order_index=idx)
        if not doc:
            continue
        # Guard: if an admin form already grabbed this slug, disambiguate so
        # we never violate slug-uniqueness (route for the admin form wins).
        if await db.lead_forms.find_one({"slug": doc["slug"]}):
            doc["slug"] = f'{doc["slug"]}-{uuid.uuid4().hex[:6]}'
        try:
            await db.lead_forms.insert_one(dict(doc))
            created += 1
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("[lead_forms] seed insert failed for %s: %s", key, e)
    return {"created": created, "kept": kept, "total": len(keys)}
