#!/usr/bin/env bash
# Builds and restarts the app on the server after the code has been checked out (run by .github/workflows/deploy.yml).
# Server settings stay on the server and are never in git: backend/.env, frontend/.env.production, backend/storage/.
#   SEED_DEMO_DATA=true  replaces ALL data with the demo sample data (prisma/seed.ts). Only on request.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SEED_DEMO_DATA="${SEED_DEMO_DATA:-false}"

echo "==> API"
cd "$APP_DIR/backend"
npm ci --no-audit --no-fund
npx prisma generate
# Fails instead of dropping data if a schema change would lose any
npx prisma db push --skip-generate
npm run build

if pm2 describe 5s-api > /dev/null 2>&1; then
  pm2 reload 5s-api --update-env
else
  pm2 start dist/main.js --name 5s-api --cwd "$APP_DIR/backend"
fi
pm2 save

# Wait until the API answers (an unauthenticated request returns 401)
for i in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/v1/auth/me)" = "401" ] && break
  [ "$i" = "60" ] && { echo "API did not start"; pm2 logs 5s-api --lines 80 --nostream; exit 1; }
  sleep 1
done

if [ "$SEED_DEMO_DATA" = "true" ]; then
  echo "==> Replacing all data with the demo sample data"
  npm run prisma:seed
  pm2 reload 5s-api --update-env
fi

echo "==> Web app"
cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund
# Build next to the live copy, then swap, so visitors never see a half-built site
npm run build -- --outDir dist-next --emptyOutDir
rm -rf dist-previous
[ -d dist ] && mv dist dist-previous
mv dist-next dist

echo "==> Deployed $(git -C "$APP_DIR" rev-parse --short HEAD)"
