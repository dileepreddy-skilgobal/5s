# Backend tests

## Unit tests

Pure domain logic (TOTP, scoring, settings, file-type detection, subscription rules, webhook SSRF guard,
CSV export, numbering, annotation rendering). They run against the compiled output and need no database.

```bash
npm run build
npm run test:unit
```

## End-to-end tests

18 suites (≈530 checks) exercise the HTTP API against a real PostgreSQL database seeded with the demo
data. Every record a suite creates is prefixed `ISO-` (or uses `iso-softdel-*` e-mails) and is removed by
`test/e2e/support/cleanup.cjs`, which the runner calls before and after each suite.

1. Create and seed a database (a dedicated one is recommended):

   ```bash
   npx prisma db push
   npm run prisma:seed
   ```

2. Build and start the API with test-friendly settings:

   ```bash
   npm run build
   PORT=3901 PUBLIC_API_URL=http://localhost:3901 NOTIFICATION_SCAN_MINUTES=0 PUSH_NOTIFICATIONS=off \
   AUTH_RATE_LIMIT_PER_MINUTE=1000 TRUST_PROXY=loopback WEBHOOK_ALLOW_PRIVATE=true WEBHOOK_DISPATCH_SECONDS=1 \
   node dist/main.js
   ```

   `WEBHOOK_ALLOW_PRIVATE=true` lets the integrations suite deliver webhooks to its local receiver; never
   set it in production.

3. Run all suites, or only some:

   ```bash
   npm run test:e2e
   npm run test:e2e -- security files
   ```

   `E2E_BASE_URL` points the runner at another API (default `http://localhost:3901`). The `mobile` suite
   compiles the mobile app's scoring helpers and needs `mobile/node_modules` (`npm ci` in `mobile/`).

## Continuous integration

`.github/workflows/ci.yml` runs the same steps on a fresh PostgreSQL service (backend build, unit and
end-to-end tests), type-checks and builds the web app, and type-checks and exports the mobile app.
