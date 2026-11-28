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

## Update, 28 November 2026

- Scope decision: no patient information in the application. Migration `003_remove_patient_identity.sql` drops `patients` and `rt_charts.patient_id`; test DB-028 keeps it that way. Superseded ADR-002; see ADR-008 and ADR-009 (NestJS + PostgreSQL on the hospital's local server).
- Staff sign-in: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`. scrypt password hashes, opaque session tokens stored only as SHA-256, five failures lock a name for 15 minutes, deactivated users lose their sessions immediately, sign-in and sign-out are audited. The guard checks the database on every request and answers 503 if it cannot.
- `npm run staff:create` provisions a local account on the server (hidden password prompt). Provisioning screens and endpoints (MANAGE_STAFF) come later.
- Tests AUTH-001 and AUTH-002 run against the real migrations in an embedded PostgreSQL.
- The web app is now Next.js (from the department's login template, REST-auth mode): login page, protected dashboard showing the account's name, roles and capabilities, logout that revokes the session on the API, redirect back after login. The browser never calls the API; roles come only from the API, and there is no role switcher. See [web application](../architecture/web.md). Supabase, encryption helpers, Redux, the sample projects module and external fonts were removed.
- Charts API (milestone 3): `POST /charts` (consultant issues; RT number typed in, stored in capitals; planned sessions, priority and optional references; idempotent; history, audit and outbox written in one transaction), `GET /charts` (urgent first, then longest wait; search by RT number; paging) and `GET /charts/by-number/:rt` (with history). Charts can only be issued once a workflow has been approved: until then the API answers `WORKFLOW_NOT_ACTIVE`. Any signed-in staff member can read charts; visibility rules are still open. Tests CHART-001 and CHART-002.
- Browser tests: 38 against a stand-in API and 28 against the real API on an in-memory PostgreSQL. 301 web unit tests.
- Chart screens (milestone 5): `/charts` (open charts, urgent first, search by RT number, status filter, paging), `/charts/<RT number>` (details and history, times in India Standard Time) and `/charts/new` (the issue form, offered to consultants only; the API enforces the role either way). The reference fields warn that no patient names or clinical details belong there. Refusals show plainly: duplicate RT number on its field, `WORKFLOW_NOT_ACTIVE` as a message. Tests WEB-030–033 against the stand-in API and WEB-040 against the real API.
- Workflow now matches the prototype (milestone 5b): `database/seeds/rt-workflow-proposed.sql` holds the 14 stages and 16 transitions of `docs/product/rt-workflow-proposal.md`, from `RT_CHART_ISSUED` to `TREATMENT_COMPLETED`, with the right role for each step, the three "send back" actions that need a reason, `SUBMIT_CONTOURING` tied to the assigned resident, `INFORM_PATIENT` guarded by its three prerequisites, and weekly updates in `TREATMENT_IN_PROGRESS`. `npm run workflow:activate-dev` now activates it (and retires the old 3-stage placeholder if an earlier run activated that), so a new chart starts at "RT chart issued". It is still the proposal, not the department's workflow, until the consultant confirms it (D-01). The old placeholder seed `development.sql` remains only as a database-test fixture. Chart history now returns stage labels as well as codes. Tests DB-030 and CHART-003.
- Workflow steps, milestone 6 (framework and the radiographer's three steps): `POST /charts/by-number/<RT>/actions/<ACTION>` records a step in one transaction (stage, facts kept on the chart, history with a plain sentence, audit, outbox, idempotent, refused if the chart changed since the person looked). The chart's answer now says who it is waiting for, which phase it is in, what has been recorded and which steps the signed-in person can take, with each step's fields, defaults and limits, so the web draws the form from the API (`ActionForm`). Done: give mould and CT Sim dates, mould done, CT Sim done (dates cannot be in the past, CT Sim not before the mould, done dates not in the future). Migration `005_chart_actions.sql`. Tests ACT-010, DB-031, WEB-050 (stand-in API) and WEB-051 (real API). Still to do, in order: contouring, planning, treatment steps, then role queues.
- Workflow steps, milestone 7 (contouring): the consultant assigns a junior resident from a pick-list of active, available residents with a due date (recorded as the chart's current `assignments` row; assigning again ends the earlier one), the assigned resident alone submits the contour set (name kept on the chart), a senior resident verifies, the consultant approves. Either may send the chart back with a required reason, which takes back what was submitted, named and verified so it must be done and checked again. Tests ACT-020 and WEB-052.
- Workflow steps, milestone 8 (planning): the physicist submits the plan (plan ID required, kept on the chart), the consultant approves it (as consultant or treating doctor) or sends it back with a reason, which takes back the plan ID, and the physicist sends the approved plan to LINAC 1 or LINAC 2 with a first treatment date and time. The slot is checked against every open chart whose treatment has not started (same machine, date and time), under a database lock so two people reserving at once cannot both get it; the suggested date is the first free weekday. Tests ACT-030 and WEB-053.
- Workflow steps, milestone 9 (treatment): the radiographer tells the patient (refused, saying what is missing, unless contouring is approved, the plan is approved and a LINAC slot is reserved; the same three checks are shown on the form), a junior resident records the start (a treatment record is kept), then, while treatment is in progress, the junior resident and the radiographer each post one Saturday update per week (sessions so far, any gap, a note that is required if there was a gap). A Saturday update is not a stage change: the chart stays put, its version moves on and the history says what was posted; `weekly_updates_due()` no longer lists the chart for that role once posted. A junior resident finishes treatment (a note is required if fewer sessions than planned); the chart is then closed. Every action in the workflow now has a step definition (test ACT-001). Tests ACT-040 and WEB-054.
- Role queues, milestone 10: `GET /charts/queue` returns every open chart marked for the person asking. A chart "needs you" when one of your roles can take a step on it now (for contouring, only the assigned junior resident; in treatment, a role that has not yet posted this week's Saturday update). Each item carries the next step in plain words ("Verify contouring, or send back"), the stage and its position (n of 14), days in the stage (India Standard Time calendar days), a stalled flag (waiting `STALL_DAYS` or more, default 3, never in treatment: D-07 is still to be confirmed), who it is waiting on, the assigned resident, the most useful date ("Contouring due …", "Late: was due …", "Started … · 3 of 25 sessions") and the Saturday updates still missing. The dashboard now leads with "Needs you" (urgent and longest-waiting first, treatment last) and lists everyone else's charts with who they are waiting on; a new Overview page shows four tiles (getting ready, stalled, in treatment, Saturday updates to come), the All / Stalled / Getting ready / In treatment filters with counts, and a progress bar per chart. Tests QUE-010 and WEB-055/WEB-060.
- Notifications, milestone 11: the people a chart is waiting for are told in the app, inside the same transaction as the step, so a person is told if and only if the step was recorded. Told: the radiographers when a chart is issued; whoever owns the next stage on each handoff (the assigned resident for contouring, the role for other stages); the resident, with the reason, when contouring or a plan is sent back; the assigned resident when contouring is given to them (with the due date and who assigned it); the consultants when treatment finishes. The person who did the step is never told about it. A reminder timer (`NOTIFICATION_SWEEP_MINUTES`, default 15) creates, once per person, a "waiting too long" reminder for whoever the chart is waiting for and the consultants, and once a week a "Saturday updates due" reminder for each role that still owes one. The header shows an Inbox link with the unread count (checked every 30 seconds), the Inbox page lists everything with Mark as read and Mark all as read, and the dashboard, overview and inbox refresh themselves every 30 seconds. Email and SMS are not built (decision: in-app only). Tests NOT-010, WEB-056 and WEB-070.
- All 16 transitions of the proposed workflow can be done in the web app by the right role, with the prototype's forms and rules, and each role now has its queue. Not yet built from the prototype: the calendar of appointments, the Saturday-updates page, and the stage map by phase.
- Known gaps: no account provisioning screens, no refresh tokens (sessions last 12 hours), the template's refresh code is switched off. `npm audit` reports transitive findings (`proxy-addr` in the API's Express, `source-map-js` in PostCSS) that predate this change and are not yet resolved.

## Still to implement

Account provisioning screens and directory sign-in; chart commands; approved clinical workflow; persistence/idempotency transaction service; full role dashboards; scheduling readiness and overrides; outbox/stall workers; reports; native mobile apps; production TLS/storage/least-privilege provisioning; backups and recovery automation.

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
