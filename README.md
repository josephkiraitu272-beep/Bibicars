<div align="center">

# BIBI Cars

**Платформа полного цикла пригона автомобилей с аукционов США и Кореи в Болгарию**

Публичная витрина · CRM · 4 кабинета (Admin · Team Lead · Manager · Customer)

FastAPI · React 19 · MongoDB

</div>

---

## Содержание

1. [Концепция](#1-концепция)
2. [Возможности платформы](#2-возможности-платформы)
3. [Роли и кабинеты](#3-роли-и-кабинеты)
4. [Технологический стек](#4-технологический-стек)
5. [Архитектура](#5-архитектура)
6. [Бизнес-процесс «угон» сделки (state machine)](#6-бизнес-процесс-угон-сделки-state-machine)
7. [Интеграции](#7-интеграции)
8. [Логики, требующие донастройки и ключей](#8-логики-требующие-донастройки-и-ключей)
9. [Структура репозитория](#9-структура-репозитория)
10. [Быстрый старт (локально)](#10-быстрый-старт-локально)
11. [Развёртывание в продакшен](#11-развёртывание-в-продакшен)
12. [Безопасность](#12-безопасность)
13. [Документация](#13-документация)

---

## 1. Концепция

**BIBI Cars** — это **end-to-end платформа пригона автомобилей** с американских и южнокорейских аукционов в Болгарию. Платформа закрывает всю цепочку:

> **Лид → Квалификация → Депозит → Ставка/Выигрыш → Контракт → Оплата → Логистика (океан + суша) → Таможня → Выдача ключей**

Решение состоит из трёх связанных продуктов внутри одного приложения:

| Продукт | Назначение |
|---|---|
| 🌐 **Storefront** (публичная витрина) | SEO-сайт: каталог авто, фильтры, VIN-поиск, калькулятор импорта, блог, формы заявок. Аудитория — конечные клиенты до регистрации. |
| 🛠 **CRM** (внутренняя) | Управление лидами, сделками, контрактами, инвойсами, доставкой, персоналом, парсерами и аналитикой. Аудитория — администратор, тимлиды, менеджеры. |
| 👤 **Customer Cabinet** (личный кабинет клиента) | Прозрачная картина для клиента: статус его авто (5 стадий), контракты на подпись, инвойсы, трекинг доставки, избранное, сравнение, чат с менеджером. |

Данные об авто собираются парсерами с **bidmotors.bg**, **lemon-cars**, **westmotors**, обогащаются историей VIN и трекингом контейнеров через **VesselFinder**.

---

## 2. Возможности платформы

### Публичная часть
- 📋 Каталог авто с фильтрами (марка, модель, год, цена, пробег).
- 🔍 Живой поиск по VIN или номеру лота.
- 🧮 Калькулятор полной стоимости импорта (аукционная цена + доставка + таможня + комиссия).
- 📜 Проверка истории авто (VIN-сервис).
- 📝 Блог (admin-editable).
- 🌍 Мультиязычность: **EN / BG** (украинский — для staff-кабинетов).
- 🍪 GDPR-совместимый cookie consent + аналитика согласий.
- 📧 SEO-страницы (sitemap.xml / robots.txt) + Open Graph.

### CRM / операционное ядро
- 🔥 **Управление лидами**: источники, UTM, приоритезация, SLA, напоминания, эскалации.
- 💼 **Pipeline сделок** (deal pipeline): депозит → ставка → выигрыш → контракт.
- 📄 **Юридический workflow**: шаблоны документов, контракты, e-подпись.
- 💰 **Финансы**: инвойсы, платежи, разбивка стоимости, отчётность, KPI, прогнозирование (Forecasting 360).
- 🚢 **Delivery 360**: трекинг судов и контейнеров, события отгрузки, статусы доставки.
- 📞 **Звонки**: интеграция с Ringostat + эвристический скоринг звонков (намерение, уровень интереса).
- 🔔 **Нотификации**: in-app + e-mail outbox + правила сповіщень.
- 👥 **Управление персоналом**: создание staff, права, аудит действий.
- 🤖 **Парсеры в фоне**: bidmotors, lemon, westmotors, statvin, auctionauto.
- 🧩 **Resolver Engine**: слияние данных о VIN из разных источников в единую карточку.
- 📈 **Master Dashboard**: общий контроль для админа (KPI всех направлений в реальном времени).

### Кабинет клиента
- 5-этапный прогресс сделки (Selection → Contract → Payment → Delivery → Obtaining).
- VIN-трекинг и Carfax-история.
- Подписание контрактов онлайн.
- Оплата инвойсов (Stripe или банковский перевод).
- Real-time таймлайн событий доставки.
- Избранное, сравнение, заметки, чат с менеджером.

---

## 3. Роли и кабинеты

В системе ровно **4 роли**: `admin`, `team_lead`, `manager`, `customer`.

| Роль | Маршрут | Что доступно |
|---|---|---|
| 👨‍💼 **Admin** | `/admin` | Полный контроль: вся CRM, финансы, настройки, парсеры, персонал, KPI. |
| 👥 **Team Lead** | `/team/dashboard` | Дашборд команды, нагрузка менеджеров, переназначение лидов, надзор SLA. |
| 🧑‍💻 **Manager** | `/manager` | Личный workspace: горячие лиды, задачи, звонки, инвойсы, заказы. |
| 👤 **Customer** | `/cabinet/:id` | Личный кабинет: статус авто, контракты, инвойсы, доставка, избранное. |

Единая страница входа для всех — `/cabinet/login` (автоопределение типа учётки по e-mail).

### Двухфакторная аутентификация

| Роль | Метод 2FA |
|---|---|
| `admin` | TOTP (Google Authenticator), опционально, включается в настройках. |
| `team_lead` | Email-OTP (одноразовый код на e-mail). |
| `manager` | Логин/пароль (можно включить Email-OTP). |
| `customer` | Логин/пароль или Google OAuth. |

### Role-based route guards (frontend + backend)

- **Frontend** (`App.js`): `<ProtectedRoute allowedRoles={[...]}>` блокирует чужие маршруты и редиректит на «домашний» кабинет роли.
- **Backend**: каждая чувствительная ручка использует `Depends(require_admin)`, `Depends(require_staff)`, `Depends(require_extension_hmac)`. Default-deny на admin-эндпоинтах.

---

## 4. Технологический стек

### Backend

| Компонент | Технология |
|---|---|
| Язык | **Python 3.11** |
| Web framework | **FastAPI** + Uvicorn |
| Async DB driver | **Motor** (async MongoDB) |
| Real-time | **python-socketio** (WebSocket) |
| Auth | JWT (`python-jose`) + bcrypt/passlib + `pyotp` (TOTP) |
| Rate-limit | `slowapi` + tier-based limits |
| Метрики | `prometheus_client` |
| PDF | `weasyprint` (инвойсы, контракты) |
| HTTP client | `httpx` (async) |
| HTML парсинг | `beautifulsoup4` + `lxml` |
| Headless browser (опционально) | `playwright` (для Cloudflare-защищённых источников) |
| Платежи (опционально) | `stripe` |
| Email (опционально) | `resend` / SMTP |

### Frontend

| Компонент | Технология |
|---|---|
| Framework | **React 19** + CRACO (обёртка над CRA) |
| Стили | **Tailwind CSS** + shadcn/ui (Radix UI) |
| Маршрутизация | `react-router-dom` 7 |
| Состояние данных | `@tanstack/react-query` + локальные контексты |
| HTTP | `axios` (+ интерсепторы) |
| WebSocket | `socket.io-client` |
| Графики | `recharts` |
| Карты | `leaflet` |
| Текстовый редактор | `tiptap` |
| Анимации | `framer-motion` |
| Локализация | собственная i18n (EN/BG/UK) |

### Хранилище

- **MongoDB** (документная БД, единый source of truth, ≈50 коллекций).
- Все идентификаторы — **строковые** (`id`/`customerId`), а не ObjectId — для безопасной JSON-сериализации.
- TTL-индексы на сессии (7 дней) и аналитические события (90 дней).

### Инфраструктура (продакшен)

- **Supervisor** управляет процессами: `backend` (uvicorn), `frontend` (yarn start или статический билд).
- **Nginx** / Kubernetes Ingress маршрутизирует `/api/*` → бэкенд:8001, всё остальное → фронтенд:3000.
- **HTTPS** — на уровне ingress / reverse proxy.

---

## 5. Архитектура

### 5.1. Высокоуровневая диаграмма

```
   ┌─────────────────────────────────────────────────────────────────┐
   │                          Браузер (React SPA)                     │
   │  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
   │  │ Storefront │  │  Admin   │  │ TeamLead │  │ Manager · Cust │  │
   │  └─────┬──────┘  └─────┬────┘  └─────┬────┘  └────────┬───────┘  │
   └────────┼───────────────┼─────────────┼────────────────┼──────────┘
            │  HTTPS,  все запросы: /api/*  · WebSocket (socket.io)
            ▼               ▼             ▼                ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                       FastAPI backend                            │
   │                                                                  │
   │   Middleware: CORS · rate-limit · security headers · auth-gate   │
   │           │                                                      │
   │           ▼                                                      │
   │   ┌─────────────┐    ┌──────────────┐   ┌──────────────────┐    │
   │   │   Routers   │─▶ │   Services    │─▶│   Repositories   │    │
   │   │ /api/<...>  │    │  (бизнес-     │   │   (Motor/Mongo)  │    │
   │   │             │    │   логика)     │   │                  │    │
   │   └─────────────┘    └──────────────┘   └──────────────────┘    │
   │                                                                  │
   │   Фоновые воркеры (worker_registry):                             │
   │     enrichment · tracking · resolver · lead_sla · reminders ·    │
   │     ops_guardian · watchlist_poll · ringostat_cron · ...         │
   │                                                                  │
   │   Парсеры аукционов:                                             │
   │     bidmotors · lemon · westmotors · vesselfinder · statvin      │
   └────────────────────────────────┬─────────────────────────────────┘
                                    ▼
                              ┌───────────┐
                              │  MongoDB  │  ≈50 коллекций
                              └───────────┘
                                    ▲
                                    │
   ┌────────────────────────────────┴─────────────────────────────────┐
   │           Внешние интеграции (опциональные)                      │
   │                                                                  │
   │   Stripe  ·  Google OAuth  ·  Resend / SMTP  ·  Ringostat        │
   │   VesselFinder  ·  Carfax  ·  Browser extension (HMAC-канал)     │
   └──────────────────────────────────────────────────────────────────┘
```

### 5.2. Поток данных по сделке

```
[Storefront]──submit lead form──▶[API /api/leads]──▶[lead_sla worker]
                                       │                  │
                                       ▼                  ▼
                                   MongoDB           уведомление
                                  (leads coll.)         менеджеру
                                       │
                                       ▼
[Manager UI]──work on lead──▶[deal pipeline]──▶[invoice]──▶[Stripe (опц.)]
                                       │                       │
                                       ▼                       ▼
                              [legal_workflow]              [webhook]
                              (контракт + подпись)              │
                                       │                       ▼
                                       ▼                  payment confirmed
                              [shipment]──▶[tracking_worker]──▶[VesselFinder]
                                       │                       │
                                       ▼                       ▼
[Customer Cabinet]◀──real-time updates via Socket.IO──[shipment_events]
```

### 5.3. Backend (контролируемый модульный монолит)

Ядро в `backend/server.py` постепенно декомпозируется в модули `backend/app/`:

```
backend/
├── server.py                  # bootstrap + legacy ручки (frozen)
├── app/
│   ├── routers/               # FastAPI APIRouter за доменами
│   ├── services/              # Бизнес-логика
│   ├── repositories/          # Mongo DAO
│   ├── models/                # Pydantic-схемы
│   ├── middleware/            # Rate-limit, security
│   ├── core/                  # Конфиг, observability, deps
│   └── integrations/          # Внешние сервисы
├── *_scraper.py               # Парсеры аукционов
├── *_worker.py                # Фоновые воркеры (отдельные модули)
├── legal_workflow.py          # Юридический workflow
├── payments_tracking.py       # Облік платежів
├── notifications.py           # Сповіщення
├── vin_service.py             # VIN-сервис с circuit breaker
├── multisource_resolver.py    # Резолвинг данных авто
└── security.py                # Auth, роли, аудит
```

Точка входа ASGI: **`server:app`** (socketio.ASGIApp, оборачивает `server:fastapi_app`).

### 5.4. Frontend

```
frontend/src/
├── App.js                     # Routes + ProtectedRoute + AuthContext
├── pages/
│   ├── public/                # Storefront (landing, catalog, calculator, blog, ...)
│   ├── admin/                 # Admin cabinet
│   ├── manager/               # Manager workspace
│   ├── team/                  # Team lead dashboard
│   ├── cabinet/               # Customer cabinet
│   └── security/              # Login audit, security pages
├── components/                # UI по доменам (crm, deal360, delivery360, payments, calls...)
├── i18n/                      # Локализация EN/BG/UK
├── context/                   # AuthContext, CustomerAuthContext, LanguageContext
├── hooks/                     # useApi, usePagination, useDebounce...
├── lib/
│   └── runtime-origin-patch.js   # Делает сборку портативной по домену
└── constants/                 # data-testid, шаги пайплайна, типы
```

---

## 6. Бизнес-процесс «угон» сделки (state machine)

Каждая сделка проходит через 8 состояний. Переходы регулируются правилами в `legal_workflow.py`, `payments_tracking.py` и сервисах пайплайна.

```
  ┌─────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────────┐
  │  LEAD   │────▶│  QUALIFIED   │────▶│ DEPOSIT  │────▶│  WON (BID)   │
  │         │     │              │     │  PAID    │     │              │
  └─────────┘     └──────────────┘     └──────────┘     └───────┬──────┘
                                                                ▼
  ┌──────────────────┐    ┌────────────┐    ┌────────────────────────┐
  │     DELIVERED    │◀──│  CUSTOMS   │◀──│  PAYMENT FULLY RECEIVED │
  │  (keys obtained) │    │  CLEARED   │    │  + CONTRACT SIGNED      │
  └──────────────────┘    └─────┬──────┘    └────────────┬────────────┘
          ▲                     ▲                         ▼
          │                     │                  ┌──────────────┐
          └──────VEHICLE───────┴────IN TRANSIT───│  SHIPMENT    │
                 OBTAINED                          │ (ocean+land)│
                                                   └──────────────┘
```

### Состояния клиента (`customer.status`)
- `prospect` — лид без оплат.
- `active` — есть депозит и активная сделка.
- `vip` — несколько успешных сделок в истории.
- `archived` — сделка завершена, клиент в архиве.
- `inactive` — длительная неактивность.

### Состояния лида (`leads.status`)
- `new` → `contacted` → `qualified` → `negotiation` → `won` / `lost`

### Состояния сделки (`deals.stage`)
- `awaiting_deposit` → `deposit_paid` → `bidding` → `won` → `awaiting_payment` → `contract_signed` → `paid_full` → `shipment_created` → `in_transit` → `customs` → `delivered` → `closed`

### Состояния инвойса (`invoices.status`)
- `draft` → `issued` → `paid` / `partially_paid` → `void`

### Состояния контракта (`contracts.status`)
- `draft` → `sent_for_signature` → `signed_by_customer` → `signed_by_company` → `executed`

### Состояния отгрузки (`shipments.status`)
- `awaiting_pickup` → `picked_up` → `loaded_to_vessel` → `in_transit` → `arrived_port` → `customs_clearance` → `released` → `delivered`

Каждое изменение состояния пишется в коллекции `audit_log` и `shipment_events`. Клиент видит обновления в реальном времени через Socket.IO.

---

## 7. Интеграции

Платформа использует **9 внешних сервисов**. Все ключи и секреты хранятся в `backend/.env` — никогда в коде.

| # | Сервис | Что делает | Обязателен? | Где взять ключи |
|---|---|---|:---:|---|
| 1 | **MongoDB** | Основная БД (≈50 коллекций) | ✅ | self-hosted / MongoDB Atlas |
| 2 | **Resend** *(или SMTP)* | Отправка e-mail: OTP, нотификации, контракты, инвойсы | ⚙️ опц. | https://resend.com → API Keys |
| 3 | **Stripe** | Платежи: депозиты, инвойсы (Checkout + webhooks) | ⚙️ опц. | https://dashboard.stripe.com → Developers → API keys |
| 4 | **Google OAuth 2.0** | Вход клиентов через Google | ⚙️ опц. | https://console.cloud.google.com → APIs & Services → Credentials |
| 5 | **Ringostat** | Колл-трекинг, входящие/исходящие звонки, IVR | ⚙️ опц. | https://my.ringostat.net → Настройки → API |
| 6 | **VesselFinder** | Трекинг судов/контейнеров | ⚙️ опц. | https://www.vesselfinder.com/api |
| 7 | **Carfax / Premium VIN** | История VIN, аварии, пробеги | ⚙️ опц. | требуется b2b-договор |
| 8 | **Browser Extension** *(собственная)* | HMAC-канал для парсинга Cloudflare-сайтов | ⚙️ опц. | задаётся `EXT_SHARED_SECRET` |
| 9 | **bidmotors / lemon / westmotors** | Публичные парсеры аукционов | автомат. | ключи не нужны (HTML scraping) |

Подробное описание каждой интеграции, где взять ключи и как настроить — в [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md).

---

## 8. Логики, требующие донастройки и ключей

Этот раздел описывает фичи, которые **работают сразу из коробки**, и фичи, которые **требуют конфигурации** (ключей, доменов, ToS).

### ✅ Работает сразу (без внешних ключей)

- Публичная витрина (каталог, фильтры, VIN-поиск из локальной БД, калькулятор, блог).
- Логины всех 4 ролей (admin / team_lead / manager / customer).
- Создание лидов, сделок, инвойсов, контрактов вручную.
- Master Dashboard, Manager Workspace, Customer Cabinet.
- Парсеры bidmotors / lemon / westmotors (если включить `PARSER_ENABLED=1`).
- Уведомления in-app (без e-mail).
- Юридический workflow (генерация PDF из шаблонов).
- Скоринг звонков (эвристический, без LLM).
- Multi-language EN/BG/UK.

### ⚙️ Требует ключей и донастройки

| Фича | Какие ключи | Где взять | Что не работает без неё |
|---|---|---|---|
| **Отправка e-mail** (OTP, контракты, нотификации) | `RESEND_API_KEY` *(или GMAIL_SMTP_*)* | resend.com | Team Lead Email-OTP, e-mail уведомления, отправка инвойсов клиенту |
| **Платежи Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | dashboard.stripe.com | Онлайн-оплата депозитов и инвойсов |
| **Google OAuth для клиентов** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com | Кнопка «Войти через Google» в кабинете клиента |
| **Звонки Ringostat** | `RINGOSTAT_API_KEY`, `RINGOSTAT_PROJECT_ID`, `RINGOSTAT_WEBHOOK_SECRET` | my.ringostat.net | Автоматический подтяг входящих/исходящих звонков, IVR события |
| **Трекинг судов VesselFinder** | API-ключ (опционально) | vesselfinder.com/api | Реальный live-трекинг (без него: ручной ввод событий доставки) |
| **Carfax** | b2b-договор | carfax.com | Полная история VIN (без неё: только локальная база) |
| **Browser extension** (Cloudflare bypass) | `EXT_SHARED_SECRET` | вы сами генерируете | Парсинг сайтов с Cloudflare-защитой |
| **HTTPS-домен** | `PUBLIC_SITE_URL`, `CORS_ORIGINS` | ваш DNS-провайдер | OAuth, webhooks Stripe, OG-картинки в e-mail |

### 🔐 Production-параметры безопасности

Для продакшена обязательно установить в `backend/.env`:

```bash
AUTH_MODE="strict"                  # отклоняет небезопасные конфиги
ENVIRONMENT="production"
JWT_SECRET="<длинный_случайный_секрет_64+ символов>"
CORS_ORIGINS="https://ваш-домен.com"   # никаких '*'
EXT_SHARED_SECRET="<секрет_для_HMAC_расширения>"
```

Подробный production-чеклист — в [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## 9. Структура репозитория

```
.
├── backend/                     # FastAPI backend
│   ├── server.py                # Точка входа + ядро API
│   ├── app/                     # Модульная часть
│   │   ├── routers/             # HTTP-ендпоинты по доменам
│   │   ├── services/            # Бизнес-логика
│   │   ├── repositories/        # Доступ к MongoDB
│   │   ├── models/              # Pydantic-модели
│   │   ├── middleware/          # Rate-limit, security
│   │   ├── core/                # Конфиг, observability, deps
│   │   ├── integrations/        # Внешние сервисы
│   │   ├── wave6/ wave7/ wave8/ # Изолированные модули (контракты, ассайнменты)
│   │   └── repositories/
│   ├── *_scraper.py             # Парсеры аукционов
│   ├── *_worker.py              # Фоновые воркеры
│   ├── vin_service.py           # VIN-сервис
│   ├── legal_workflow.py        # Юридический workflow
│   ├── payments_tracking.py     # Платежи
│   ├── notifications.py         # Уведомления
│   ├── security.py              # Auth + роли
│   ├── scripts/                 # Утилиты (seed, миграции, ротация секретов)
│   ├── requirements.txt         # Python-зависимости
│   └── .env.example             # Шаблон переменных окружения
├── frontend/                    # React 19 SPA
│   ├── src/
│   │   ├── App.js               # Роутинг + ProtectedRoute + контексты
│   │   ├── pages/               # admin/ manager/ team/ cabinet/ public/ security/
│   │   ├── components/          # UI-компоненты по доменам
│   │   ├── i18n/                # Переводы EN/BG/UK
│   │   ├── context/ hooks/ lib/ utils/
│   │   └── constants/           # data-testid'ы, пайплайн константы
│   ├── public/                  # robots.txt, sitemap.xml, статика
│   ├── package.json
│   └── .env.example
├── docs/                        # Документация
│   ├── ARCHITECTURE.md          # Подробно: backend, frontend, MongoDB, безопасность
│   ├── INTEGRATIONS.md          # Каждая интеграция: ключи + как настроить
│   ├── DEPLOYMENT.md            # Production-развёртывание + чеклист
│   ├── LOGIC.md                 # Бизнес-логика, потоки данных
│   └── STRIPE.md                # Углублённо: Stripe-интеграция
├── README.md                    # Этот файл
└── .gitignore
```

---

## 10. Быстрый старт (локально)

**Требования:** Python 3.11, Node.js 18+, Yarn, MongoDB 6+.

```bash
# 1. Клонируем репозиторий
git clone <repo-url> bibi-cars && cd bibi-cars

# 2. Backend
cd backend
cp .env.example .env                  # отредактируйте MONGO_URL, JWT_SECRET, паролі
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# 3. Frontend (в другом терминале)
cd ../frontend
cp .env.example .env                  # укажите REACT_APP_BACKEND_URL=http://localhost:8001
yarn install
yarn start                            # http://localhost:3000
```

**После первого старта:**
- Backend ідемпотентно сидить staff-учётки из env (`admin@bibi.cars`, `manager@bibi.cars`, `teamlead@bibi.cars`).
- Логин на http://localhost:3000/cabinet/login
- Каталог авто будет пуст до запуска парсеров (`PARSER_ENABLED=1`).

**Seed демо-данных** (опционально):

```bash
cd backend && python scripts/seed_scale_test.py
# Создаст: 1 admin + 10 team_leads + 50 managers + 10 000 customers
# + 10 000 leads + ~3 500 deals в разных стадиях
```

---

## 11. Развёртывание в продакшен

Краткий чек-лист (подробно в [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)):

1. **Сервер**: Linux, Python 3.11, Node 18+, MongoDB 6+, Nginx (или другой reverse-proxy).
2. **DNS**: настроить A-запись на ваш домен.
3. **HTTPS**: Let's Encrypt / Cloudflare.
4. **`.env`**: заполнить `MONGO_URL`, `JWT_SECRET` (длинный!), `CORS_ORIGINS`, `EXT_SHARED_SECRET`, `AUTH_MODE=strict`.
5. **Supervisor**: запустить backend и frontend как сервисы.
6. **Nginx**: маршрутизировать `/api/*` → :8001, `/socket.io/*` → :8001, всё остальное → :3000 (или статический билд).
7. **Интеграции**: подключить Stripe / Resend / Google OAuth / Ringostat по мере необходимости.
8. **Мониторинг**: Prometheus (`/api/metrics`) + Sentry (опционально).
9. **Бэкапы**: ежедневный `mongodump`.

---

## 12. Безопасность

Платформа спроектирована с **default-deny** подходом:

- ✅ **Strict mode**: отказ запуска при небезопасной конфигурации (`AUTH_MODE=strict` отклоняет `CORS=*` и пустые секреты).
- ✅ **JWT** + bcrypt-хеши паролей + TOTP/Email-OTP для staff.
- ✅ **Role-based access**: `require_admin`, `require_staff`, `require_extension_hmac` на каждой чувствительной ручке.
- ✅ **Frontend route-guard**: `ProtectedRoute allowedRoles={[...]}` блокирует чужие маршруты.
- ✅ **Rate-limiting**: `slowapi` с тирами (login: 5/min, public: 60/min, admin: 200/min).
- ✅ **Security headers**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cache-Control no-store, CSP Report-Only (HTML).
- ✅ **CORS allowlist**: никаких `*` в продакшене.
- ✅ **Upload validation**: magic-byte проверка, denylist расширений, MIME, размер.
- ✅ **IDOR protection**: ownership scoping (cust1 не может прочитать данные cust2).
- ✅ **No secret leakage**: `/api/public-config` маскирует Stripe/Resend ключи.
- ✅ **Audit log**: каждый login и критическое действие → `login_audit` / `audit_log`.
- ✅ **Browser extension HMAC**: только подписанные запросы могут пушить парсинговые данные.

---

## 13. Документация

| Документ | Содержание |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Backend, frontend, MongoDB, безопасность — технические детали. |
| [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) | Каждая интеграция: как получить ключи и как настроить. |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Production-развёртывание + полный чеклист. |
| [`docs/LOGIC.md`](docs/LOGIC.md) | Бизнес-логика, потоки данных по сделке. |
| [`docs/STRIPE.md`](docs/STRIPE.md) | Углублённо: Stripe-интеграция (Checkout + webhooks). |

---

<div align="center">

**BIBI Cars** · Built for serious car import operations.

</div>
