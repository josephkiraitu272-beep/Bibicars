# Архитектура BIBI Cars

Этот документ описывает **техническое устройство** платформы: слои, модули, фоновые процессы, модель данных и безопасность.

---

## 1. Общая схема

Платформа — это **трёхслойная система**:

1. **Frontend (React SPA)** — публичная витрина + 4 кабинета. Вся коммуникация с бэкендом — через `${REACT_APP_BACKEND_URL}/api/*`.
2. **Backend (FastAPI + Socket.IO)** — REST API + WebSocket + фоновые воркеры.
3. **MongoDB** — единый source of truth (document store, доступ через Motor/async).

Все бэкенд-маршруты имеют префикс `/api` (это требование ingress-маршрутизации: `/api/*` → backend:8001, остальное → frontend:3000).

```
┌──────────────────────────────────────────────────────────────────┐
│                       Browser (React SPA)                          │
│   Storefront · Admin · TeamLead · Manager · Customer cabinets      │
└────────────────────────────┬────────────────────────────────────┘
                              │  HTTPS,  /api/*  · Socket.IO
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     FastAPI backend (port 8001)                    │
│   Middleware: CORS · rate-limit · security headers · auth-gate     │
│   Routers → Services → Repositories                                │
│   Background: workers, parsers, schedulers                         │
└────────────────────────────┬────────────────────────────────────┘
                              ▼
                        ┌──────────┐
                        │ MongoDB  │
                        └──────────┘
```

---

## 2. Backend

### 2.1. Структура (контролируемый модульный монолит)

Исторически ядро находится в одном `server.py` (~29 000 строк). Постепенно его разкладывают на модули в `backend/app/` (механическая экстракция, один домен — один модуль):

```
backend/app/
├── routers/        # FastAPI APIRouter за доменами (admin_*, auth_*, contracts, content …)
├── services/       # Бизнес-логика (calculator, lead_sla, contract_lifecycle, dashboard_aggregator …)
├── repositories/   # Работа с MongoDB (auth_otp, audit_events, invoice_templates …)
├── models/         # Pydantic-схемы
├── middleware/     # Безопасность, rate limiting
├── core/           # observability, config, утилиты
├── integrations/   # Внешние сервисы
└── wave6/ wave7/ wave8/  # Изолированные модули (контракты, ассайнменты)
```

Новые эндпоинты/сервисы создаются в `backend/app/` и подключаются через `fastapi_app.include_router(...)` в `server.py`.

### 2.2. Точка входа

- ASGI-приложение: **`server:app`** (это `socketio.ASGIApp(sio, other_asgi_app=fastapi_app)`).
- Внутренние FastAPI-маршруты определены на `fastapi_app`.
- При `startup` происходит:
  1. Подключение к MongoDB.
  2. Создание индексов (включая TTL для сессий и аналитики).
  3. Идемпотентный сидинг staff-аккаунтов из env.
  4. Запуск реестра воркеров.
  5. Запуск парсеров (если `PARSER_ENABLED=1`).

### 2.3. Фоновые воркеры (`worker_registry`)

Реестр управляет жизненным циклом асинхронных задач (рестарт при сбоях):

| Воркер | Назначение |
|--------|------------|
| `enrichment_worker` | Обогащение карточек авто доп. данными (фото, история) |
| `watchlist_live_poll` | Опрос избранных лотов клиентов (живая цена/статус) |
| `tracking_worker` | Трекинг доставки (суда/контейнеры через VesselFinder) |
| `resolver_worker` | Резолвинг/слияние данных из разных источников |
| `transfer_detector` | Обнаружение перемещений/передач между складами |
| `ops_guardian` | Мониторинг состояния операций / алёрты |
| `lead_sla` | Контроль SLA по лидам |
| `lead_reminders` | Напоминания менеджерам |
| `payment_reminder` | Напоминания клиентам о неоплаченных инвойсах |
| `escalations_wakeup` | Эскалации просроченных задач |
| `ringostat_cron` | Периодическая синхронизация звонков (требует конфига) |

### 2.4. Парсеры источников

Модули `*_scraper.py` / `*_parser.py` собирают данные авто:

- `bitmotors_scraper.py` — основной источник (bidmotors.bg): живой поиск + полная синхронизация.
- `lemon_scraper.py` / `lemon_sync.py` — lemon-cars.
- `westmotors_scraper.py` + `westmotors_workers/*` — парсинг westmotors.
- `vesselfinder_scraper.py` — трекинг судов (ВЫКЛ по умолчанию: требуется согласие с ToS).
- `statvin_scraper.py`, `auctionauto_scraper.py`, `copart_vin_normalizer.py` — доп. источники/нормализация.

> **Примечание:** часть источников, защищённых Cloudflare, требует отдельного browser-extension клиента (слой «extension layer» с HMAC). Без него эти источники просто выключены и не влияют на ядро CRM.

### 2.5. Ключевые доменные модули

| Модуль | За что отвечает |
|---|---|
| `vin_service.py` | Живой поиск по VIN с кешированием и circuit breaker |
| `legal_workflow.py` | Юридический workflow, шаблоны документов, контракты, e-подпись |
| `payments_tracking.py` | Учёт платежей |
| `financial_breakdown.py` | Финансовая разбивка стоимости импорта |
| `cabinet_financials.py` | Финансы в кабинете клиента |
| `notifications.py` | Уведомления (in-app + email outbox) |
| `multisource_resolver.py` | Слияние данных авто из разных источников |
| `resolver_engine.py` | Движок резолвинга по правилам |
| `shipment_identity_resolver.py` | Резолвинг идентичности отгрузок |
| `security.py` | Аутентификация, роли, аудит |

### 2.6. Real-time

WebSocket через **socket.io** (`python-socketio`) — push-обновления для:
- Уведомлений в реальном времени.
- Статусов доставки в кабинете клиента.
- Событий звонков (Ringostat).
- Изменений в Master Dashboard для админа.

---

## 3. Frontend

### 3.1. Стек

React 19 + CRACO (надстройка над CRA). Стили — Tailwind + shadcn/ui (Radix). Состояние/данные — React Query + локальные контексты. Маршрутизация — react-router-dom 7.

### 3.2. Организация

```
frontend/src/
├── App.js                  # Дерево маршрутов (~200 routes) + AuthContext + CustomerAuthContext
├── pages/                  # Страницы по ролям
│   ├── public/             # Storefront (homepage, catalog, calculator, blog, about, contacts)
│   ├── admin/              # Admin cabinet (~80 страниц)
│   ├── manager/            # Manager workspace (~40 страниц)
│   ├── team/               # Team Lead dashboard
│   ├── cabinet/            # Customer cabinet (~20 страниц)
│   └── security/           # Login audit, security pages
├── components/             # UI-компоненты по доменам (crm, deal360, delivery360, payments, calls…)
├── i18n/                   # Переводы EN/BG/UK (translations.js + контекст языка)
├── context/                # AuthContext, CustomerAuthContext, LanguageContext
├── hooks/                  # useApi, usePagination, useDebounce…
├── lib/
│   └── runtime-origin-patch.js   # Делает сборку портативной по домену
└── constants/              # data-testid'ы, шаги пайплайна, типы
```

### 3.3. Портативность домена

`runtime-origin-patch.js` устанавливает axios-интерсептор и обёртку `fetch`, которые переписывают URL бэкенда на текущий origin, если бандл был собран с другим `REACT_APP_BACKEND_URL`. Это делает деплой переносимым на любой собственный домен без пересборки.

### 3.4. ProtectedRoute (role-based guard)

`<ProtectedRoute allowedRoles={[...]}>` в `App.js`:
- Если не залогинен — редирект на `/cabinet/login`.
- Если роль не подходит — редирект на «домашний» кабинет роли (admin → `/admin`, team_lead → `/team/dashboard`, manager → `/manager`, customer → `/cabinet`).

---

## 4. Модель данных (MongoDB)

Основные коллекции (всего ~50):

| Коллекция | Назначение |
|----------|-------------|
| `staff` | Персонал (admin/manager/team_lead): роль, хеш пароля, статус |
| `customers` | Клиенты (юзеры) |
| `customer_sessions` | Сессии клиентов (TTL 7 дней) |
| `leads` | Лиды (источник, статус, приоритет, SLA) |
| `deals` | Сделки (пайплайн) |
| `invoices` | Инвойсы |
| `payments` | Платежи |
| `contracts` | Контракты + жизненный цикл/подпись |
| `shipments` / `shipment_events` | Доставка и события |
| `vin_data`, `vin_data_lemon` | Собранные/обогащённые данные авто по VIN |
| `client_folders` | Файловая система клиента (5 системных + кастомные папки) |
| `notifications`, `notification_rules` | Уведомления и правила |
| `auth_email_otp` | Одноразовые коды Email-OTP для team_lead |
| `login_audit`, `audit_log` | Аудит входов и действий |
| `blog_articles`, `email_templates`, `services` | Контент и справочники |
| `analytics_events` | Аналитика (TTL 90 дней) |
| `calls`, `call_events` | Звонки (Ringostat) |
| `tasks` | Задачи менеджеров |

Идентификаторы — строковые `id`/`customerId`/`call_id` (а не ObjectId), чтобы безопасно сериализовать в JSON.

Ключевые индексы:
- `staff.email` (unique)
- `customers.email` (unique)
- `leads.assigned_to`, `leads.status`, `leads.created_at`
- `deals.customer_id`, `deals.stage`
- `shipment_events.shipment_id`, `shipment_events.created_at`
- `auth_email_otp.created_at` (TTL 10 мин)
- `customer_sessions.expires_at` (TTL 7 дней)
- `analytics_events.created_at` (TTL 90 дней)

---

## 5. Аутентификация и безопасность

### 5.1. Staff (admin / manager / team_lead)

- Эндпоинт: `POST /api/auth/login` → JWT (`python-jose`, HS256).
- Пароли — bcrypt. При старте — идемпотентная пересинхронизация хешей (авторизация не «ломается» после редеплоя).
- 2FA:
  - `admin` — TOTP (`pyotp`), если включено в политике аутентификации.
  - `team_lead` — Email-OTP: код генерируется, сохраняется в `auth_email_otp`, подтверждается через `POST /api/auth/email-otp/verify`.

### 5.2. Customer (клиент)

- `POST /api/customer-auth/login` — email/пароль → сессионный токен.
- `POST /api/customer-auth/google/verify` — вход через Google Identity (стандартный Google OAuth, требует `GOOGLE_CLIENT_ID`; опционально).

### 5.3. Каналы для расширения браузера

- `POST /api/ext/observation` — приём парсинговых данных.
- `GET /api/ext/clients` — список зарегистрированных расширений.
- Защита: `Depends(require_extension_hmac)` — все запросы должны быть подписаны HMAC с `EXT_SHARED_SECRET`.

### 5.4. Слои защиты

1. **CORS allowlist** (никаких `*` в продакшене).
2. **Rate limiting** (`slowapi`): login = 5/min, public = 60/min, admin = 200/min.
3. **Security headers**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cache-Control: no-store, CSP Report-Only (только на HTML).
4. **Default-deny middleware** на admin-эндпоинтах.
5. **Role guards** на каждой чувствительной ручке: `require_admin`, `require_staff`, `require_extension_hmac`.
6. **Upload security**: magic-byte валидация + denylist расширений + MIME + размер.
7. **IDOR protection**: ownership scoping на customer/staff endpoints.
8. **No secret leakage**: `/api/public-config` маскирует Stripe/Resend ключи.
9. **Audit log**: каждый login + критическое действие → коллекции `login_audit` / `audit_log`.

---

## 6. Конфигурация

Вся конфигурация — через переменные окружения (`.env`), ничего не хардкодится. Полный перечень — в `backend/.env.example` и `frontend/.env.example`.

### Обязательные для бэкенда

- `MONGO_URL`, `DB_NAME`
- `JWT_SECRET` (длинный случайный, ≥64 символа)
- `CORS_ORIGINS` (в strict-режиме — без `*`)
- `EXT_SHARED_SECRET` (если используется browser extension)
- `AUTH_MODE` (рекомендация: `strict`)

### Опциональные

- `RESEND_API_KEY` / `GMAIL_SMTP_*` — e-mail.
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` — платежи.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth для клиентов.
- `RINGOSTAT_*` — звонки.
- `PARSER_ENABLED`, `BACKEND_VF_SCRAPING` — флаги парсеров.

Подробно — в [`INTEGRATIONS.md`](INTEGRATIONS.md).

---

## 7. Наблюдаемость

- **Логи**: стандартный Python logging + structured logs.
- **Метрики**: `/api/metrics` (Prometheus exposition format).
- **Health**: `/api/health` (проверка соединения с Mongo).
- **Аудит**: `login_audit` + `audit_log` коллекции.
- **CSP reports**: `/api/csp/report` (Report-Only режим).
- **Алёрты**: `ops_guardian` воркер пишет ALERT-события в `ops_events`.

---

## 8. Производительность и масштабирование

### Текущие нагрузочные характеристики (на 10 000 customers + 10 000 leads + 3 500 deals):

- Public catalog (`/api/public/vehicles`): **1000 параллельных запросов за 56 с**, 100% success на одном uvicorn worker.
- Customer cabinet: **500 параллельных запросов за 4 с**, 120 req/s.
- Admin dashboard (master): ~1.6 с/запрос (тяжёлые аггрегации MongoDB).

### Рекомендации для прода:
- Запускать минимум 4 uvicorn workers (`--workers 4`).
- MongoDB replica set + read preference на secondary для аналитики.
- Redis для кэширования агрегатов dashboard (опционально).
- CDN для статики frontend (Cloudflare/CloudFront).

---

## 9. CI/CD рекомендации

- Запускать `python -m py_compile backend/server.py` на pre-commit.
- `yarn lint && yarn build` на pre-commit для frontend.
- Smoke-тест после деплоя: `curl https://<домен>/api/health`.
- Бэкап БД перед каждым деплоем (`mongodump`).
