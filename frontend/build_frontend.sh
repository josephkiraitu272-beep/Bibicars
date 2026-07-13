#!/usr/bin/env bash
# Out-of-band production build for the frontend. Run detached (setsid) with the
# backend stopped so the whole 2 GB pod memory budget is available to webpack.
# On success, atomically swaps the fresh bundle into build/.
set -u
cd /app/frontend
LOG=/app/frontend/_extbuild.log
echo "[build_frontend] $(date -u) START" > "$LOG"

rm -rf build_new
BUILD_PATH=build_new \
GENERATE_SOURCEMAP=false \
DISABLE_ESLINT_PLUGIN=true \
NODE_OPTIONS=--max-old-space-size=4096 \
  ./node_modules/.bin/craco build >> "$LOG" 2>&1
RC=$?
echo "[build_frontend] $(date -u) craco exit=$RC" >> "$LOG"

if [ -f build_new/index.html ] && ls build_new/static/js/*.js >/dev/null 2>&1; then
  rm -rf build_old
  mv build build_old 2>/dev/null || true
  mv build_new build
  rm -rf build_old
  echo "[build_frontend] $(date -u) SUCCESS — real bundle live in build/" >> "$LOG"
else
  echo "[build_frontend] $(date -u) FAILED — build/ left untouched (placeholder)" >> "$LOG"
fi
