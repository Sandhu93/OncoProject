# Local development

## Requirements

Node.js 22.22.2+ on the 22.x line (or Node 24.15+), as the Next.js web app requires, npm 10+, Git, and Docker with Linux containers for the server database. Windows PowerShell may block the `npm.ps1` shim: use `npm.cmd`, without changing system execution policy.

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

The setup command creates `.env` once with random local credentials, and `apps/web/.env.local` with the API address; rerunning it preserves existing values. The web uses port 5173 and its server calls the API on port 3000 (`API_URL` in `apps/web/.env.local`; the browser never calls the API). PostgreSQL uses port 5432. Keep these ports available or update both ends of the corresponding configuration. Changing `API_PORT` requires changing `API_URL` too.

Without PostgreSQL the API's liveness works and readiness returns 503, but nobody can log in. No accounts are seeded. Create the first account on the server, after migrations:

```sh
npm run staff:create -- your.username "Your Name" CONSULTANT MANAGE_STAFF
```

It asks for the password twice without showing it (12 to 128 characters). Roles are `JUNIOR_RESIDENT`, `SENIOR_RESIDENT`, `CONSULTANT`, `PHYSICIST` and `RADIOGRAPHER`; capabilities are `MANAGE_STAFF`, `CONFIGURE_WORKFLOW`, `VIEW_AUDIT` and `EXPORT_REPORTS`. For quick trials on your own computer, `npm run staff:create-test` creates six test accounts, one for each part of the workflow, sharing one known password, printed when the command finishes: `test.consultant` (every capability), `test.radiographer`, `test.resident` and `test.resident2` (junior residents), `test.senior` and `test.physicist`. A chart passes between these people, so sign in as each in turn (a private window per account is easiest). Run again, it resets them. It refuses to run unless `DATABASE_URL` points at this computer. To issue charts you also need an approved workflow. The department's real one needs the consultant's approval (D-01), so for trials on your own computer run `npm run workflow:activate-dev`. It seeds and approves the proposed 15-stage workflow, records a consultant account as the approver, and refuses unless the database is on this computer and named `*_dev`. Until a workflow is approved, issuing a chart answers `WORKFLOW_NOT_ACTIVE`. Then open http://localhost:5173. Five wrong passwords lock a username for 15 minutes. If you forget or mistype a password, set a new one (this also ends that account's sessions and clears the lockout):

```sh
npm run staff:reset-password -- your.username
```

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

`check` includes formatting, lint, type checks, API and web unit tests, embedded schema checks and builds. Run `npm run format` after edits. `npm run test:e2e` builds everything first, then runs the browser tests, which start production builds of the web app: one set against a stand-in API, and one set (WEB-020) against the real API on an in-memory PostgreSQL. See [web application](../architecture/web.md). Chart workflows are a future test, not an existing capability.

## Optional container preview

After host-side migrations:

```sh
docker compose --profile app up --build -d
```

Browse http://localhost:8080 (the web container listens on 5173 inside). Stop the host API first to free port 3000. The app containers do not run migrations automatically. This prevents replicas/startup from silently changing schema. This localhost HTTP preview does not provide production TLS.

To return from the container preview to host hot reload, run `docker compose --profile app stop api web`, then `npm run dev`. Leave `db` running. To stop only the disposable test database, use `docker compose --profile test stop db-test`.

The initial verification downloaded Chromium into `.cache/ms-playwright`. To reuse it on this Windows workspace, set `$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/ms-playwright'` before `npm.cmd run test:e2e`. On another machine, the standard Playwright installation command above uses its default browser cache.

## Troubleshooting

- Docker connection error: start the Docker engine/Desktop and confirm `docker info` works. On Windows use Linux containers.
- Port occupied: inspect the existing service before changing ports; do not terminate unrelated processes.
- Database readiness fails: verify PostgreSQL, `DATABASE_URL` and `npm run db:migrate`.
- Database password changed after first boot: the persisted volume retains its original credentials. Do not delete data to fix a password mismatch; restore the matching local configuration or deliberately rotate credentials.
- Migration checksum mismatch: restore the applied migration and create a new numbered migration for the change.
- `npm run lint` reports hundreds of problems in `apps/web/dist`: that folder is left over from the old Vite shell and is no longer used. Delete `apps/web/dist` (it is ignored by git); lint now skips it as well.
- Registry or browser download denied: use the organization's approved network/proxy; do not disable TLS validation.

`docker compose stop` preserves development data. No cleanup script deletes database volumes automatically.
