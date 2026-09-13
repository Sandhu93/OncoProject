# OncoTrack

On-premise radiation therapy workflow tracking for hospital staff. This repository is a **development foundation**, not a clinical deployment. It contains a runnable React workspace, NestJS API shell, PostgreSQL migrations, workflow policy tests, CI, and development documentation.

Start with [the build-start guide](docs/development/getting-started.md), then [local setup](docs/development/local-setup.md). Browse the [documentation index](docs/README.md) for current guidance and historical planning.

## Quick start

Requires Node.js 22.14+ and Docker with Linux containers. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

```sh
npm ci
npm run env:init
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Web: http://localhost:5173. API liveness: http://localhost:3000/api/v1/health/live. Readiness: http://localhost:3000/api/v1/health/ready. The web shell displays live service status and does not contain patient data or a simulated login.

```sh
npm run check
npm run test:db
npm run test:e2e
```

`check` runs formatting, lint, type checks, unit/API tests and production builds. Database tests require the disposable test database described in local setup. Browser tests require `npx playwright install chromium` once.

## Documentation

| Document                                                 | Purpose                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Build-start guide](docs/development/getting-started.md) | How to start, sequence of implementation, first milestone                 |
| [Architecture](docs/architecture/overview.md)            | Boundaries, data flow, deployment and decisions                           |
| [Database](docs/architecture/database.md)                | Entities, migrations, integrity and ownership                             |
| [RT scope and open decisions](docs/product/rt-scope.md)  | Current domain baseline and questions that must not become invented rules |
| [Workflow specification](docs/product/workflow.md)       | Versioned workflow contract and provisional development fixture           |
| [API contract](docs/api/openapi.yaml)                    | Implemented routes only                                                   |
| [Testing](docs/development/testing.md)                   | Test layers, commands, acceptance IDs and release gates                   |
| [Operations](docs/operations/runbook.md)                 | Environment boundaries, backups and deployment prerequisites              |
| [Backlog](docs/development/backlog.md)                   | Actionable first development milestones                                   |
| [Status](docs/development/status.md)                     | Implemented and outstanding capabilities, verification record             |

The [original planning documents](docs/archive/initial-planning/README.md) are archived for reference. Documents 01–06 contain an outdated chemotherapy model. Do not implement their chemo stage seeds or permissions. The current foundation uses RT terminology, with unresolved clinical transitions explicitly kept in draft. The [project assessment](docs/planning/project-assessment.md) explains the conflict.

## Workspace

```text
apps/api/             NestJS API and fail-closed access boundary
apps/web/             React development shell
apps/mobile/          Mobile implementation contract (native setup is a later milestone)
packages/contracts/   Shared roles, safe API shapes and workflow policy
database/migrations/  Ordered, checksummed PostgreSQL migrations
database/seeds/       Development-only draft workflow, no patient records or passwords
scripts/              Cross-platform setup and database tooling
tests/                API, database, policy and browser verification
infra/                Docker build and reverse proxy configuration
docs/                 Documentation index and current guidance
docs/planning/        Assessment and delivery planning
docs/archive/         Historical source documents; not implementation specifications
```

No patient data, passwords, database dumps or production environment files belong in Git, CI artifacts or external telemetry.
