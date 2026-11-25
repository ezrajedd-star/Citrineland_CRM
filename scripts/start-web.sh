#!/bin/sh
# Single-container start for free hosting (Render): migrate, optionally seed, then serve.
# The background worker runs in-process when RUN_WORKER_IN_WEB=true (see src/instrumentation.ts).
set -e

# Render provides RENDER_EXTERNAL_URL (e.g. https://citrineland-crm.onrender.com)
if [ -z "${APP_URL:-}" ] && [ -n "${RENDER_EXTERNAL_URL:-}" ]; then export APP_URL="$RENDER_EXTERNAL_URL"; fi
if [ -z "${AUTH_URL:-}" ] && [ -n "${APP_URL:-}" ]; then export AUTH_URL="$APP_URL"; fi

echo "[start] applying migrations"
npx prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[start] seeding (idempotent)"
  npx tsx prisma/seed.ts
fi

echo "[start] starting web on port ${PORT:-3000}"
exec node node_modules/next/dist/bin/next start -p "${PORT:-3000}"
