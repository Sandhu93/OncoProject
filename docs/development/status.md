# Development status

Initial foundation created 13 September 2026. This is a starter workspace, not the first complete staff feature.

## Implemented

- Build-start guide and current RT scope/decision register.
- TypeScript npm workspaces, React/Vite shell, NestJS API, shared policy/contracts.
- Liveness/readiness endpoints and deny-by-default boundary for private routes.
- PostgreSQL migration with RT chart/review/scheduling/audit/outbox structures and a DRAFT-only reference seed.
- Environment generation, checksummed migration runner, local Compose and container build recipes.
- Policy/API tests, embedded and real PostgreSQL schema suites, browser smoke tests and CI definition.
- Architecture, database, API, setup, testing, operations and first-slice backlog documentation.
- A reviewable starter task for additional database integrity tests, with reproducible disposable database setup.

## Update, 24 October 2026

Work since the foundation (uncommitted until reviewed):

- Migration `002_numbering_throttle_weekly_updates.sql`: RT number allocation, login throttling, workflow retirement with one ACTIVE version per code, weekly-update stage rules, treatment start/weekly/completion records and a Saturday due list. Tests DB-010 to DB-016 cover it.
- API readiness now requires every migration, guarded by test MIG-001.
- The consultant's 13 steps are written up as an [unconfirmed workflow proposal](../product/rt-workflow-proposal.md) with a [confirmation sheet](../product/consultant-confirmation-sheet.md) for the meeting. Decisions D-01, D-06 and D-11 are tracked in [RT scope](../product/rt-scope.md).
- New guides: [code walkthrough](code-walkthrough.md), [repository settings](repository-settings.md) and the [re-baselined schedule](../planning/schedule.md).
- The starter task's idempotency item was corrected; payload-change detection belongs to the API, not SQL.

Verification in a Linux sandbox: embedded database suite 18 of 18 passed; ESLint and Prettier clean. Vitest, type checking, Docker, the real PostgreSQL suite and browser tests could not run there (Windows-installed dependencies) and must be run on the development PC with `npm run check`.

## Still to implement

Authentication and account provisioning; patient/chart commands; approved clinical workflow; persistence/idempotency transaction service; full role dashboards; scheduling readiness and overrides; outbox/stall workers; reports; native mobile apps; production TLS/storage/least-privilege provisioning; backups and recovery automation.

## Verification

Verified locally on 13 September 2026 with Node.js 22.14.0 and Docker Engine 29.6.1:

| Check                                        | Result                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run check`                              | Passed: formatting, lint, workspace/test type checks, automated tests and web/API builds |
| Policy and API tests                         | 20 passed                                                                                |
| Embedded PostgreSQL schema suite             | 11 passed                                                                                |
| Real PostgreSQL 17 schema suite              | The same 11 checks passed on the disposable test database                                |
| Chromium browser tests                       | 2 passed; includes small-screen layout and service recovery                              |
| Development migrations and seed              | Applied successfully; seed contains only a draft workflow                                |
| Compose configuration                        | Validated                                                                                |
| API/web Docker images                        | Built successfully                                                                       |
| Container web/proxy/API/database smoke check | Web HTTP 200; liveness and readiness both `ok`; CSP header present                       |
| npm dependency audit                         | Zero known vulnerabilities reported after patched `multer` override                      |

The first browser run needed cleanup permission for its Windows test-server process. A rerun with that permission exited normally with both tests passing. The initial local verification preceded publishing the repository; subsequent remote results are available in [GitHub Actions](https://github.com/Sandhu93/OncoProject/actions).

The local container preview is available at `http://localhost:8080` while its services are running. Use `docker compose --profile app stop api web` before switching to host hot reload with `npm run dev`. Database data remains in the development volume; the test database is disposable.

These results verify the foundation only. Authentication, clinical workflow correctness, application-level concurrent commands, mobile delivery and production recovery have not been implemented or validated.

The database definition is shareable through Git. Local PostgreSQL data is held in Docker volumes and is intentionally not committed. A developer should create a fresh disposable test database by following [the database task setup](tasks/database-integrity-tests.md), rather than receiving a copied data directory or dump.

## Repository organization

The original numbered planning files now live under `docs/archive/initial-planning/`. The assessment is in `docs/planning/`, and the startup guide is in `docs/development/`. Use [the documentation index](../README.md) to find current guidance. The reorganization preserves application paths and standard root-level tooling configuration.
