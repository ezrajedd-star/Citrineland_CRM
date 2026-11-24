#!/bin/sh
# Runs on every deploy (compose `migrate` service): applies migrations, optionally seeds.
set -e
npx prisma migrate deploy
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "SEED_ON_START=true → seeding"
  npx tsx prisma/seed.ts
fi
