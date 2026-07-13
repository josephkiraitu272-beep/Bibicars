#!/usr/bin/env bash
# ============================================================================
# Dev-mode launcher for the preview environment.
# Per operator rules: NO production build here. Run the webpack dev server
# (craco start) directly on port 3000. Node heap capped at 1024MB.
# ============================================================================
set -u
cd /app/frontend

export PORT=3000
export HOST=0.0.0.0
export NODE_OPTIONS="--max-old-space-size=1024 --max-semi-space-size=16"
export FAST_REFRESH=false
export DISABLE_ESLINT_PLUGIN=true
export GENERATE_SOURCEMAP=false
export WDS_SOCKET_PORT=443
export DANGEROUSLY_DISABLE_HOST_CHECK=true
export BROWSER=none
export CI=false

exec ./node_modules/.bin/craco start
