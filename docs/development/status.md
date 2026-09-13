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

## Repository organization

The original numbered planning files now live under `docs/archive/initial-planning/`. The assessment is in `docs/planning/`, and the startup guide is in `docs/development/`. Use [the documentation index](../README.md) to find current guidance. The reorganization preserves application paths and standard root-level tooling configuration.
