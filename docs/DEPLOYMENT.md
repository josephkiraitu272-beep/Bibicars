# Развёртывание в продакшен — BIBI Cars

Этот документ описывает развёртывание платформы на production-сервере.

---

## 1. Требования

- **OS**: Linux (Ubuntu 22.04 LTS или Debian 12+ рекомендуется).
- **Python**: 3.11+
- **Node.js**: 18+
- **Yarn**: 1.22+ (классический, не Berry)
- **MongoDB**: 6.0+
- **Reverse-proxy**: Nginx 1.20+ (или Caddy/Traefik).
- **Supervisor**: для управления процессами (или systemd).
- **HTTPS-сертификат**: Let's Encrypt (через certbot) или Cloudflare.
- **Домен**: указан DNS A-записью на сервер.

---

## 2. Подготовка сервера

```bash
# Обновление и базовые пакеты
sudo apt update && sudo apt install -y python3.11 python3.11-venv python3-pip \
     nodejs yarn nginx supervisor curl git

# MongoDB
curl -fsSL https://www.mongodb.org/static/pgp/server-6.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-6.0.gpg
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

---

## 3. Клонирование и сборка

```bash
# Клонируем
cd /opt && sudo git clone <repo-url> bibi-cars && cd bibi-cars
sudo chown -R $USER:$USER /opt/bibi-cars

# Backend
cd /opt/bibi-cars/backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Frontend
cd /opt/bibi-cars/frontend
yarn install
yarn build                # положит статику в /opt/bibi-cars/frontend/build
```

---

## 4. Конфигурация `.env`

### Backend (`/opt/bibi-cars/backend/.env`)

```bash
MONGO_URL="mongodb://localhost:27017"
DB_NAME="bibi_cars"

# Auth
JWT_SECRET="<openssl rand -hex 64>"
JWT_TTL_HOURS=24
AUTH_MODE="strict"
ENVIRONMENT="production"
CORS_ORIGINS="https://ваш-домен.com"
EXT_SHARED_SECRET="<openssl rand -hex 32>"

# Bootstrap staff (создаются один раз)
BIBI_ADMIN_EMAIL="admin@ваш-домен.com"
BIBI_ADMIN_PASSWORD="<сильный_пароль>"
BIBI_MANAGER_EMAIL="manager@ваш-домен.com"
BIBI_MANAGER_PASSWORD="<сильный_пароль>"
BIBI_TEAM_LEAD_EMAIL="teamlead@ваш-домен.com"
BIBI_TEAM_LEAD_PASSWORD="<сильный_пароль>"

PUBLIC_SITE_URL="https://ваш-домен.com"

# Парсеры
PARSER_ENABLED="1"
BACKEND_VF_SCRAPING="off"

# Интеграции — заполняйте по мере подключения
RESEND_API_KEY=""
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
GOOGLE_CLIENT_ID=""
RINGOSTAT_API_KEY=""
```

### Frontend (`/opt/bibi-cars/frontend/.env`)

```bash
REACT_APP_BACKEND_URL=https://ваш-домен.com
WDS_SOCKET_PORT=443
ENABLE_HEALTH_CHECK=false
```

После изменения `frontend/.env` пересоберите фронтенд: `yarn build`.

---

## 5. Supervisor — управление процессами

Создайте `/etc/supervisor/conf.d/bibi-cars.conf`:

```ini
[program:bibi-backend]
command=/opt/bibi-cars/backend/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --workers 4
directory=/opt/bibi-cars/backend
environment=PYTHONUNBUFFERED="1"
autostart=true
autorestart=true
startsecs=10
stdout_logfile=/var/log/bibi-cars/backend.out.log
stderr_logfile=/var/log/bibi-cars/backend.err.log
user=www-data

# Frontend опционален: если используете статический build + Nginx, то это не нужно.
# Если хочется dev-сервер (НЕ для прода) — раскомментируйте:
# [program:bibi-frontend]
# command=/usr/bin/yarn start
# directory=/opt/bibi-cars/frontend
# environment=PORT="3000",HOST="0.0.0.0"
# autostart=true
# autorestart=true
# stdout_logfile=/var/log/bibi-cars/frontend.out.log
# stderr_logfile=/var/log/bibi-cars/frontend.err.log
# user=www-data
```

```bash
sudo mkdir -p /var/log/bibi-cars
sudo chown www-data:www-data /var/log/bibi-cars
sudo supervisorctl reread && sudo supervisorctl update
sudo supervisorctl status
```

---

## 6. Nginx

`/etc/nginx/sites-available/bibi-cars`:

```nginx
server {
    listen 80;
    server_name ваш-домен.com www.ваш-домен.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ваш-домен.com www.ваш-домен.com;

    ssl_certificate     /etc/letsencrypt/live/ваш-домен.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ваш-домен.com/privkey.pem;

    client_max_body_size 50M;     # для загрузки документов / фото

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
    }

    # Socket.IO (WebSocket)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Static frontend
    root /opt/bibi-cars/frontend/build;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "public, max-age=3600";
    }

    # Длинный кэш для статики
    location /static/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/bibi-cars /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ваш-домен.com -d www.ваш-домен.com
```

---

## 7. Первый запуск

```bash
sudo supervisorctl restart bibi-backend
sudo supervisorctl tail -f bibi-backend stderr
```

В логах вы увидите:
```
[STARTUP] ✓ Unique indexes ensured
[STARTUP] ✓ Staff seeded: admin@..., manager@..., teamlead@...
[STARTUP] ✓ Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001
```

**Smoke-проверка:**

```bash
curl https://ваш-домен.com/api/health
# {"status":"ok","mongo_ok":true}

curl -X POST https://ваш-домен.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ваш-домен.com","password":"<пароль>"}'
# должен вернуть {"access_token":"eyJ...","user":{...}}
```

---

## 8. Production-чеклист (must-have)

### Безопасность
- [ ] `JWT_SECRET` — длинный случайный (≥64 символа), сгенерирован через `openssl rand -hex 64`.
- [ ] `AUTH_MODE="strict"`.
- [ ] `CORS_ORIGINS` — точный список доменов, **без `*`**.
- [ ] `EXT_SHARED_SECRET` — установлен, если используется browser extension.
- [ ] HTTPS включён (Let's Encrypt + auto-renew).
- [ ] `BIBI_*_PASSWORD` — изменены с дефолтных.
- [ ] Тестовый клиент-bypass (`test@customer.com`) удалён, если был.
- [ ] Все `STRIPE_*` ключи переключены с `test_` на `live_`.

### Производительность
- [ ] Uvicorn запущен с `--workers 4` (или больше, по числу CPU).
- [ ] MongoDB в replica set (для high availability).
- [ ] Nginx gzip + static caching включены.
- [ ] (Опционально) CDN для статики frontend.

### Мониторинг
- [ ] Prometheus собирает `/api/metrics`.
- [ ] Алёрты на: `mongo_ok=false`, `Application startup` не завершён за 60 с, ops_guardian ALERTы.
- [ ] Sentry / аналог (опционально).
- [ ] Healthcheck `/api/health` опрашивается каждые 30 с.

### Резервное копирование
- [ ] Ежедневный `mongodump` в S3 (или другое хранилище).
- [ ] Раз в неделю — restore-проверка из бэкапа.
- [ ] `.env` файлы (бэкенда и фронтенда) хранятся в безопасном secret-менеджере (1Password / Vault / AWS Secrets Manager).

### Интеграции
- [ ] Stripe Webhook URL обновлён на production-домен.
- [ ] Google OAuth Authorized Origins содержит production-домен.
- [ ] Ringostat webhook URL обновлён.
- [ ] Resend домен подтверждён (SPF + DKIM).

### DNS / e-mail deliverability
- [ ] SPF-запись: `v=spf1 include:_spf.resend.com ~all`
- [ ] DKIM настроен (Resend дашборд → Domains).
- [ ] DMARC: `v=DMARC1; p=quarantine; rua=mailto:postmaster@ваш-домен.com`

---

## 9. Обновление до новой версии

```bash
cd /opt/bibi-cars
sudo -u www-data git pull

# Backend
cd backend
source .venv/bin/activate && pip install -r requirements.txt

# Frontend
cd ../frontend && yarn install && yarn build

# Перезапуск
sudo supervisorctl restart bibi-backend
sudo nginx -s reload                  # подхватит новый build/
```

---

## 10. Откат на предыдущую версию

```bash
cd /opt/bibi-cars
sudo -u www-data git log --oneline -10            # выберите хеш
sudo -u www-data git checkout <commit_hash>

cd backend && source .venv/bin/activate && pip install -r requirements.txt
cd ../frontend && yarn install && yarn build
sudo supervisorctl restart bibi-backend
sudo nginx -s reload
```

---

## 11. Известные особенности (good to know)

### Холодный старт при большом числе клиентов
Если в БД >10 000 customers, первый запуск может занять до минуты из-за миграции системных папок. Это однократное событие — последующие старты быстрые (fast-path).

### Email-OTP для team_lead
Требует настроенного Resend / SMTP. Без e-mail tem_lead не сможет залогиниться. Если e-mail временно недоступен — admin может временно изменить role team_lead на `manager` в коллекции `staff`.

### Парсеры и rate-limit аукционов
bidmotors / lemon имеют свой rate-limit. Если включить `PARSER_ENABLED=1` сразу — первые часы будет интенсивная нагрузка. Рекомендуется включать в нерабочее время или ограничить через `TRACKING_WORKER_INTERVAL_SEC`.

### Single-worker dev-режим
`uvicorn ... --workers 1 --reload` подходит ТОЛЬКО для разработки. В проде обязательно `--workers 4+` без `--reload`.
