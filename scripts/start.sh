#!/bin/sh
# Container entrypoint: apply migrations, optionally seed, then serve.
set -e
mkdir -p "${STORAGE_DIR:-/data/storage}"
npx prisma migrate deploy
if [ "$RUN_SEED" = "true" ]; then
  npm run db:seed || echo "Seed failed (continuing)"
fi
exec npx next start -p "${PORT:-3000}"
