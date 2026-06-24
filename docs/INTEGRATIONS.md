# Интеграции BIBI Cars

Данный документ перечисляет **все внешние интеграции**, ключи к ним и пошаговую настройку.

Все ключи хранятся в `backend/.env` (никогда не в коде). Шаблон — `backend/.env.example`.

---

## Сводка

| # | Сервис | Категория | Обязателен? | Что без него не работает |
|---|---|---|:---:|---|
| 1 | **MongoDB** | База данных | ✅ обязателен | Ничего не запустится |
| 2 | **Resend** *(или SMTP)* | E-mail | ⚙️ опц. | OTP, нотификации, e-mail-уведомления |
| 3 | **Stripe** | Платежи | ⚙️ опц. | Онлайн-оплата депозитов и инвойсов |
| 4 | **Google OAuth 2.0** | Аутентификация | ⚙️ опц. | Кнопка «Войти через Google» в кабинете клиента |
| 5 | **Ringostat** | Колл-трекинг | ⚙️ опц. | Автоматический подтяг звонков, IVR события |
| 6 | **VesselFinder** | Трекинг судов | ⚙️ опц. | Live-трекинг контейнеров (без него: ручной ввод) |
| 7 | **Carfax / Premium VIN** | История авто | ⚙️ опц. | Полная история VIN (без неё: локальная база) |
| 8 | **Browser Extension** | Парсинг Cloudflare | ⚙️ опц. | Парсинг сайтов с CF-защитой |
| 9 | **bidmotors / lemon / westmotors** | Парсеры аукционов | автомат. | Каталог авто (можно вручную) |

---

## 1. MongoDB ✅ обязателен

**Назначение:** основная БД (~50 коллекций, все сущности проекта).

**Где взять:**
- Локально: `apt install mongodb` или Docker `docker run -d -p 27017:27017 mongo:6`.
- Хостинг: [MongoDB Atlas](https://www.mongodb.com/atlas) (есть бесплатный M0-тариф).

**Конфигурация в `.env`:**

```bash
MONGO_URL="mongodb://localhost:27017"             # локально
# или
MONGO_URL="mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true"   # Atlas
DB_NAME="bibi_cars"
```

**Что произойдёт при первом старте:**
- Backend идемпотентно создаст индексы (включая TTL для сессий и аналитики).
- Идемпотентно сидует staff-учётки из `BIBI_*_PASSWORD`.

---

## 2. Resend (или SMTP) — отправка e-mail ⚙️

**Назначение:** отправка всех писем платформы (Email-OTP, нотификации, контракты, инвойсы).

### Вариант А: Resend (рекомендуется)

**Где взять ключи:**
1. Зарегистрируйтесь на https://resend.com
2. В дашборде → **API Keys** → **Create API Key** (даст вам `re_xxxxxxxxxx`).
3. **Domains** → добавьте свой домен и подтвердите DNS-записи (SPF + DKIM + MX).

**Конфигурация:**

```bash
EMAIL_PRIMARY_PROVIDER="resend"
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxx"
RESEND_FROM_EMAIL="no-reply@вашдомен.com"
RESEND_FROM_NAME="BIBI Cars"
LEADS_INBOX_EMAIL="sales@вашдомен.com"   # куда падают копии заявок
```

### Вариант Б: Gmail / SMTP

```bash
EMAIL_PRIMARY_PROVIDER="smtp"
GMAIL_SMTP_HOST="smtp.gmail.com"
GMAIL_SMTP_PORT="587"
GMAIL_SMTP_USER="your-email@gmail.com"
GMAIL_SMTP_PASS="app_password_здесь"        # https://myaccount.google.com/apppasswords
GMAIL_SMTP_FROM="your-email@gmail.com"
GMAIL_SMTP_FROM_NAME="BIBI Cars"
```

**Что не работает без e-mail:**
- Email-OTP для team_lead (он не сможет залогиниться).
- Уведомления клиентам о статусе.
- Отправка контрактов и инвойсов по почте.

---

## 3. Stripe — онлайн-платежи ⚙️

**Назначение:** приём оплат за депозиты и инвойсы через Stripe Checkout + webhooks.

**Где взять ключи:**
1. Зарегистрируйтесь на https://dashboard.stripe.com
2. **Developers** → **API keys** — скопируйте `pk_test_...` (publishable) и `sk_test_...` (secret).
3. **Developers** → **Webhooks** → **Add endpoint** = `https://ваш-домен/api/stripe/webhook`. Подпишитесь на события: `checkout.session.completed`, `payment_intent.succeeded`, `invoice.paid`. Получите `whsec_xxx`.
4. Для прода — переключите ключи на `sk_live_...`/`pk_live_...`.

**Конфигурация:**

```bash
STRIPE_SECRET_KEY="sk_test_xxxxxxxxxxxxxxxxxxxxx"
STRIPE_PUBLISHABLE_KEY="pk_test_xxxxxxxxxxxxxxxxxxxxx"
STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Где используется:**
- `POST /api/payments/checkout` — создание Stripe Checkout session.
- `POST /api/stripe/webhook` — приём webhook'ов.
- `frontend/src/pages/cabinet/InvoicesPage.jsx` — кнопка «Оплатить».

**Подробно** — в [`STRIPE.md`](STRIPE.md).

---

## 4. Google OAuth 2.0 — вход клиентов через Google ⚙️

**Назначение:** альтернативный вход в кабинет клиента через Google аккаунт (не для staff).

**Где взять ключи:**
1. https://console.cloud.google.com → **APIs & Services** → **Credentials**.
2. **Create credentials** → **OAuth client ID** → **Web application**.
3. **Authorized JavaScript origins**: `https://ваш-домен.com`.
4. **Authorized redirect URIs**: `https://ваш-домен.com/cabinet/login` (не обязательно, если используется Google Identity Services).
5. Скопируйте Client ID (`xxxxx.apps.googleusercontent.com`) и Client Secret.

**Конфигурация:**

```bash
GOOGLE_CLIENT_ID="xxxxxxxxxxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxx"
```

**Где используется:**
- `POST /api/customer-auth/google/verify` — верификация id-token.
- Кнопка «Continue with Google» на странице `/cabinet/login`.

---

## 5. Ringostat — колл-трекинг ⚙️

**Назначение:** автоматический подтяг входящих/исходящих звонков, IVR-события, запись разговоров.

**Где взять ключи:**
1. Зайдите в личный кабинет https://my.ringostat.net
2. **Настройки** → **Интеграции** → **API**.
3. Скопируйте API key и Project ID.
4. Настройте webhook URL: `https://ваш-домен/api/ringostat/webhook`. Скопируйте Secret.

**Конфигурация:**

```bash
RINGOSTAT_API_KEY="xxxxxxxxxxxxxxxxxxxxxxx"
RINGOSTAT_PROJECT_ID="xxxxxx"
RINGOSTAT_WEBHOOK_SECRET="xxxxxxxxxxxxxxxxxxxxx"
```

**Где используется:**
- `POST /api/ringostat/webhook` — приём событий звонков.
- `ringostat_cron` воркер — периодическая синхронизация (если webhook пропустил события).
- `frontend/src/pages/manager/CallsPage.jsx` — список звонков.

**Эвристический скоринг звонков** работает локально на основе длительности и истории — не требует LLM.

---

## 6. VesselFinder — трекинг судов ⚙️

**Назначение:** Live-трекинг океанских контейнеров и судов для отображения статуса доставки клиенту.

**Где взять ключи:**
- https://www.vesselfinder.com/api — B2B API (платный).
- Альтернатива: бесплатный web-scraping (выключен по умолчанию, требует согласия с ToS).

**Конфигурация:**

```bash
BACKEND_VF_SCRAPING="off"        # "on" чтобы включить web-scraping
# или
VESSELFINDER_API_KEY="xxxxxxxxxxxxxxx"   # если используете API
```

**Без интеграции:** статусы отгрузки вводятся вручную менеджером в админке.

---

## 7. Carfax / Premium VIN ⚙️

**Назначение:** полная история автомобиля по VIN: аварии, владельцы, пробег, тех.обслуживание.

**Где взять:** требуется B2B-договор с Carfax (https://www.carfax.com). Аналоги: AutoCheck, VINCheck.

**Конфигурация:**

```bash
CARFAX_API_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Без интеграции:** используется локальная база `vin_data` (накапливается парсерами).

---

## 8. Browser Extension — HMAC-канал ⚙️

**Назначение:** парсинг сайтов с Cloudflare-защитой (там, где обычный HTTP-парсер не проходит).

Расширение работает в браузере менеджера, парсит DOM нужных страниц и пушит данные в наш бэкенд по защищённому HMAC-каналу.

**Как настроить:**

1. Сгенерируйте сильный секрет:
   ```bash
   openssl rand -hex 32
   ```
2. Добавьте его одинаковым образом в:
   - `backend/.env` → `EXT_SHARED_SECRET="..."`
   - Конфиг расширения (загружается через `chrome://extensions` → Options).
3. Расширение подписывает каждый запрос HMAC-SHA256: `X-Ext-Signature: <hmac>`, `X-Ext-Timestamp: <unix_ms>`.
4. Бэкенд валидирует подпись через `require_extension_hmac` зависимость.

**Эндпоинты:**
- `POST /api/ext/observation` — приём парсинговых данных.
- `GET /api/ext/clients` — список зарегистрированных клиентов расширения.

---

## 9. Парсеры аукционов (без ключей)

**Сайты:** bidmotors.bg, lemon-cars, westmotors, statvin.com, auctionauto.

Это публичные парсеры HTML — ключи не нужны.

**Включение:**

```bash
PARSER_ENABLED="1"
```

После этого фоновые воркеры начнут периодически синхронизировать каталог. Без включения — каталог пуст, нужно завести авто вручную.

---

## Чек-лист по интеграциям для прода

- [ ] MongoDB запущен и доступен по `MONGO_URL`.
- [ ] `JWT_SECRET` — длинный случайный (≥64 символа).
- [ ] `CORS_ORIGINS` указан явно, без `*`.
- [ ] `EXT_SHARED_SECRET` сгенерирован (если используется extension).
- [ ] Resend / SMTP настроен (или явно отключён, если e-mail не нужен).
- [ ] Stripe ключи переключены с `test_` на `live_`.
- [ ] Google OAuth Authorized Origin содержит ваш production-домен.
- [ ] Ringostat webhook URL обновлён на production-домен.
- [ ] `AUTH_MODE="strict"`, `ENVIRONMENT="production"`.
- [ ] Все `*_PASSWORD` сменены с дефолтных.
