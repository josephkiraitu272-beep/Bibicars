FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/pw-browsers

# ── System libraries ─────────────────────────────────────────────────────────
# Only WeasyPrint runtime deps are listed here.
# Playwright OS deps (libnss3, libgbm1, etc.) are installed automatically
# by `playwright install --with-deps` below.
# Package names are correct for Debian Trixie (python:3.13-slim base).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libharfbuzz0b \
        libgdk-pixbuf-2.0-0 \
        libffi8 \
        shared-mime-info \
        fonts-liberation \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --upgrade pip setuptools wheel
RUN pip install -r requirements.txt

# --with-deps re-runs apt-get update internally so it works after list cleanup.
# The explicit chromium check afterwards makes the build fail loudly if the
# binary was not downloaded (rather than silently shipping a broken image).
RUN playwright install --with-deps chromium \
    && ls /pw-browsers/ | grep -q chromium

COPY . ./

EXPOSE 8001
# Shell form so ${PORT:-8001} is expanded at runtime (Railway sets PORT).
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8001}
