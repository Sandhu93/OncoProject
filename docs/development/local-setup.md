# Local development

## Requirements

Node.js 22.14+ on the 22.x line (or a supported newer LTS), npm 10+, Git, and Docker with Linux containers for the server database. Windows PowerShell may block the `npm.ps1` shim: use `npm.cmd`, without changing system execution policy.

## Start

From the repository root:

```sh
npm ci
npm run env:init
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run dev
```

The setup command creates `.env` once with random local credentials; rerunning it preserves existing values. The web uses port 5173 and proxies `/api` to port 3000. PostgreSQL uses port 5432. Keep these ports available or update both ends of the corresponding configuration. Changing `API_PORT` requires changing `API_PROXY_TARGET` for Vite as well.

The API and web can run without PostgreSQL for shell development: liveness works, readiness returns 503, and the web truthfully shows that the database is unavailable. There are no login credentials because authentication is not implemented and no accounts are seeded.

## Database tests

```sh
npm run test:db:embedded
docker compose --profile test up -d --wait db-test
npm run test:db
```

The embedded suite requires no server and cannot exercise independent concurrent connections. The real server suite requires `TEST_DATABASE_URL`, uses port 5433 by default, and refuses a database name not ending in `_test`. It never uses the application database as a fallback. Test data is synthetic and individual fixtures roll back.

## Daily verification

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` includes formatting, lint, type checks, unit/API tests, embedded schema checks and builds. Run `npm run format` after edits. Browser tests start the web server and mock only service health responses; API route behavior is verified separately. A full patient journey is a future test, not an existing capability.

## Optional container preview

After host-side migrations:

```sh
docker compose --profile app up --build -d
```

Browse http://localhost:8080. Stop the host API first to free port 3000. The app containers do not run migrations automatically. This prevents replicas/startup from silently changing schema. This localhost HTTP preview does not provide production TLS.

To return from the container preview to host hot reload, run `docker compose --profile app stop api web`, then `npm run dev`. Leave `db` running. To stop only the disposable test database, use `docker compose --profile test stop db-test`.

The initial verification downloaded Chromium into `.cache/ms-playwright`. To reuse it on this Windows workspace, set `$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/ms-playwright'` before `npm.cmd run test:e2e`. On another machine, the standard Playwright installation command above uses its default browser cache.

## Troubleshooting

- Docker connection error: start the Docker engine/Desktop and confirm `docker info` works. On Windows use Linux containers.
- Port occupied: inspect the existing service before changing ports; do not terminate unrelated processes.
- Database readiness fails: verify PostgreSQL, `DATABASE_URL` and `npm run db:migrate`.
- Database password changed after first boot: the persisted volume retains its original credentials. Do not delete data to fix a password mismatch; restore the matching local configuration or deliberately rotate credentials.
- Migration checksum mismatch: restore the applied migration and create a new numbered migration for the change.
- Registry or browser download denied: use the organization's approved network/proxy; do not disable TLS validation.

`docker compose stop` preserves development data. No cleanup script deletes database volumes automatically.
