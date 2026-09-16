# Starter task: database integrity tests

Suggested branch: `task/database-integrity-tests`

This is a bounded starter task for the OncoTrack database foundation. Add useful tests against the existing RT schema without changing clinical workflow rules or application behavior.

## What already exists

- Executable schema: `database/migrations/001_initial.sql`
- Development-only draft fixture: `database/seeds/development.sql`
- Migration runner: `scripts/migrate.mjs`
- Real PostgreSQL test suite: `tests/database/postgres.test.mjs`
- Embedded PostgreSQL smoke suite: `tests/database/embedded.test.mjs`
- Shared test cases: `tests/database/suite.mjs`
- Disposable test service: `db-test` in `compose.yaml`

The schema targets PostgreSQL 17 and uses `btree_gist` for resource-booking overlap protection. The seed is deliberately DRAFT and creates no staff accounts, passwords or patients. Do not activate or expand it into an RT protocol.

## Setup

From the repository root:

```powershell
npm.cmd ci
npm.cmd run env:init
docker compose --profile test up -d --wait db-test
npm.cmd run test:db
```

If Docker is unavailable, run the embedded suite:

```powershell
npm.cmd run test:db:embedded
```

The real suite uses `TEST_DATABASE_URL`, which points to port 5433 and a database ending in `_test`. It refuses to fall back to the development database. Fixtures roll back, so no persistent test records are expected.

## Deliverable

Add tests under `tests/database/` for these behaviors, reusing the existing fixture helper where possible and using synthetic IDs/data only:

- Duplicate staff username is rejected.
- Invalid local/directory identity combinations are rejected.
- A chart cannot begin at a non-initial stage.
- A published workflow stage or transition cannot be edited.
- An assignment cannot have an end time before its assignment time.
- A rejection decision requires a non-empty reason.
- A completed prerequisite requires an actor and timestamp.
- An open stall episode is unique per chart.
- A notification is unique per recipient and event.
- An idempotency record rejects conflicting key reuse according to the documented behavior.

For each test, assert the PostgreSQL error code or observable result where stable. A test should fail if the constraint or trigger is removed. Do not assert internal implementation details that a user or database consumer cannot observe.

## Acceptance criteria

1. `npm.cmd run test:db:embedded` passes.
2. `npm.cmd run test:db` passes against the disposable PostgreSQL service.
3. Tests use no real patient data, credentials or external services.
4. Existing tests remain green.
5. No migration SQL is changed. If a genuine schema defect is found, document it in the pull request and stop for review rather than quietly altering the migration.
6. Add the new test IDs and behaviors to `docs/development/testing.md`.

## Out of scope

Do not implement login, API endpoints, RT stages, application repositories, mobile behavior, clinical rules or production data imports. Do not commit `.env`, Docker volumes, PostgreSQL dumps or generated build/test artifacts.

## Review notes

Explain which database invariant each test protects and why it matters to the staff workflow. Passing tests are evidence about the database foundation; they are not approval of the unconfirmed clinical RT workflow.
