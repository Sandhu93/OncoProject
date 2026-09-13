# OncoTrack assessment and test-driven delivery plan

This assessment records the pre-development review. Its inventory describes the project before scaffolding. See [current development status](../development/status.md) for implemented capabilities and the [archived source documents](../archive/initial-planning/README.md) for documents 01–08 referenced below.

Prepared 13 September 2026. Status: proposed plan; RT scope inferred from the later project documents and pending confirmation. This document does not replace stakeholder-approved requirements.

## 1. Current project state

All eight existing Markdown documents were reviewed. The workspace contains planning documents only: no application source, package manifest, executable migrations, automated tests, CI configuration, or deployment implementation. The SQL in `06_Backend_Schema.md` is a design draft, not an installed database. No application tests can currently be run.

The central requirement is shared visibility and accountable handoffs: staff should know where each case is, who must act next, what is overdue, and whether prerequisites permit scheduling.

There is a material scope conflict:

| Evidence | Implication |
|---|---|
| Documents 01–06 describe chemotherapy, MRI marking, four staff roles, and chemo bookings. | These cannot be used unchanged to build the later RT backlog. |
| `07_Team_Leadership_Playbook.md`, first-two-weeks checklist, explicitly calls the chemo assumption incorrect. | Updating the domain is a stated project requirement. |
| `08_Sprint_Backlog.md` specifies RT charts, contouring, physics planning, LINAC, five roles, and a 13-step RT workflow. | RT is the working direction for this plan. |
| No document enumerates all 13 RT stages and their transition rules. | The old schema's 13 chemo stages are not the missing RT specification. Do not seed them as RT stages. |

Treat “full scale” as a production-ready application for one department, initially hundreds of active charts and dozens of staff, consistent with the TRD. Hospital-wide deployment, multi-tenancy, and clinical-system integrations are separate scope.

## 2. Intended application

Build an on-premise staff application for tracking radiation-therapy preparation and handoffs. Based on the backlog, the broad journey is:

RT chart creation → simulation booking/completion → contouring → senior verification → consultant approval → physics planning → plan approval → LINAC handoff → scheduling/treatment start.

This is a summary of the backlog, not an approved 13-stage clinical protocol. The ordering of simulation details, approval ownership, rejection return points, and the endpoint after treatment starts must be confirmed with department staff.

The five inferred operational roles are junior resident, senior resident, consultant, physicist, and radiographer. Define account administration separately as a permission; clarify whether office staff need their own role and who handles calls and registration.

Track completion status, responsible staff, dates, and operational reasons. Actual contouring, imaging review, dose calculation, and treatment planning remain in existing clinical systems. The application records a staff member's confirmation of a handoff; it does not certify clinical correctness or control a LINAC.

Retain the original exclusions unless explicitly changed: no imaging uploads, diagnoses, lab values, billing, patient portal, automated patient messaging, or PACS/EMR integration in the initial release. Reporting stores workflow metrics only.

## 3. What must be built

| Module | Deliverable | Acceptance evidence |
|---|---|---|
| Identity and staff administration | Hospital-provisioned accounts, login/logout, session revocation, role permissions, deactivation and assignment availability. | Each role can perform its permitted actions; direct requests cannot bypass permissions. |
| Patient and RT chart registry | Minimal patient details, internal ID plus agreed display RT number, patient-to-chart linkage, registration, exact ID search and permitted filters. | Concurrent registrations produce unique numbers; separate charts retain separate histories. |
| Workflow engine | Approved stage/action matrix, prerequisite checks, assignments, responsible role, return-for-revision paths, closure and reopening rules. | Every permitted transition and representative forbidden transitions are tested against approved examples. |
| Review and planning handoffs | Contouring submission, senior review, consultant review, physics submission, plan review, rejection reasons and revision tracking. | Changes to an upstream revision cannot silently retain approvals for an obsolete revision. |
| Role dashboards | Department overview, each role's queue, overdue work, chart detail, current owner, next action, timeline and notification inbox. | A completed action appears in the correct next role's queue with an accurate status. |
| Simulation and treatment scheduling | Mould/CT simulation booking as confirmed, resource calendars, LINAC handoff status, readiness checks, booking/rescheduling/cancellation/no-show. | Incomplete cases are blocked by the agreed policy; competing bookings cannot exceed resource capacity. |
| Follow-up and escalation | Configurable stage thresholds, overdue episodes, accountable call queue, call outcomes, in-app alerts and optional digest. | One alert per recipient/event; contact does not silently clear an unresolved overdue case. |
| Audit and reports | Append-only action history, actor role at action time, before/after values, booking changes, overrides and administration events; workflow CSV/PDF summaries. | History survives reassignment/deactivation and agrees with current records; exports obey access scope. |
| Mobile | Android/iOS daily-use screens, secure sessions, visible sync state, approved offline action queue and notification handling. | The same server rules apply on both platforms, including reconnection and stale action handling. |
| Operations | On-premise deployment, HTTPS, database/storage encryption, migrations, monitoring, backups, restore procedures and role-specific training. | A clean installation and recovery from backup both pass a documented rehearsal. |

Promote calendar capacity enforcement to a release gate for actual resource scheduling, even though the old chemo PRD puts it in P1. Build audit capture with the first write operation; only its richer display/reporting should wait for a later sprint.

## 4. Decisions to settle before dependent implementation

| Decision | Why it matters | Proposed planning position |
|---|---|---|
| RT versus chemo; exact RT stages and five roles | Controls the entire data model and acceptance suite. | Use RT for planning; obtain the actual stage/action table before workflow code. |
| RT chart versus patient; number source | Patients may need more than one tracked course/chart. | Separate patient identity from RT chart; confirm numbering and repeat-course rules. |
| End of scope | The RT backlog reaches treatment start; the chemo documents include treatment completion/cycles. | Do not infer fraction-by-fraction tracking or course completion requirements. |
| Review/rejection/replanning rules | Determines which approvals become invalid after revisions. | Record revisions and approval scope; confirm exact invalidation rules. |
| Booking policy and responsible role | Old requirements allow hard block or warning, without deciding. | Default proposal: block incomplete prerequisites; build overrides only if explicitly included with authorized role and reason. |
| Resource capacity, tentative reservations and no-shows | Needed for realistic CT/LINAC calendars. | Model tentative versus confirmed bookings and server-side capacity checks. |
| Stage timers, holidays and escalation owner | Calendar days and working days produce different alerts. | Agree time units, threshold boundary and who receives each alert. |
| Phone storage and network boundaries | Offline patient-linked actions on personal phones conflict with literal “no identifiable data leaves premises.” | Define permitted local data, expiry, encryption, device access and VPN/offsite use before offline patient storage. |
| External push and backup location | TRD proposes cloud push and an off-site backup while PRD requires on-premise residency. | Start with on-premise in-app notifications and on-premise separate backup storage; external routing/storage needs a resolved policy. |
| Infrastructure and retention | Determines deployment, restore targets and operational ownership. | Hospital IT supplies hosting, certificate, account/directory choice and named support owner; administration defines retention. |

Other gaps in the existing schema: no RT simulation/planning entities, no persistent prerequisite checklist even for the old test workflow, no resource capacity model, no revision-bound approvals, no concurrency/version field, and no event deduplication mechanism. The stage history table also lacks the actor's historical role and does not cover all non-stage changes. Free-text notes mean “no clinical fields” alone does not enforce data minimization.

## 5. Proposed architecture and data model

Use the existing TRD's React web, React Native mobile, PostgreSQL, Nginx and Docker Compose direction. Select its NestJS backend option with TypeScript to share API types with both clients. This is a team-fit proposal, not an existing implementation or a requirement for a particular framework version.

Start with one modular backend and a background worker, deployed on hospital infrastructure. Keep workflow decisions server-side and route all action endpoints through one transition service. Share API contracts and validation types across clients; do not assume web and native UI components can all be shared.

Suggested code layout:

```text
apps/web
apps/api
apps/mobile
packages/contracts
tests/integration
tests/e2e
tests/performance
infra
docs/acceptance
```

Suggested entities: `patients`, `rt_charts`, `staff_users`, role/permission mappings, workflow definitions and transitions, `stage_history`, `assignments`, `review_submissions`, `approvals`, prerequisite records, `resources`, `appointments`, `stall_episodes`, `call_logs`, `notifications`, `audit_events`, session/device records and an event outbox.

Version chart records and review submissions. Store chart update, audit entry and outgoing event in a single database transaction. A worker delivers events with retry and deduplication so a worker crash does not lose a handoff. A retried user action should have one business effect, using a request identity and payload check.

Use database constraints plus an explicit concurrency strategy for chart changes and capacity allocation. PostgreSQL documents row locking and its interaction with competing transactions; apply this to protect contested bookings and test contention and deadlock recovery. [PostgreSQL locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html)

Store timestamps consistently and display hospital-local time. Use versioned workflow definitions or an explicit migration rule so changing stages does not reinterpret old histories. Restrict audit updates/deletes for the application database account; this protects against application changes but does not make a privileged database administrator technically incapable of altering data.

## 6. Test-driven development approach

Interpret “test based” as executable acceptance criteria plus test-driven development for consequential business behavior.

For every feature: agree a concrete Given/When/Then example → write a failing test → implement enough to pass → refactor → integrate the screen → run the relevant regression checks → demonstrate on staging. Tests must assert expected behavior derived from the approved requirement, not repeat the implementation's own rule table as their oracle.

Use Vitest with Nest's testing utilities for domain tests and Supertest for API tests against an isolated PostgreSQL database. Nest documents these testing utilities and API-test integration. [NestJS testing documentation](https://docs.nestjs.com/fundamentals/testing)

Use Playwright for web journeys, with isolated test accounts/data and assertions against visible user behavior. Its official guidance specifically recommends behavioral tests and test isolation. [Playwright best practices](https://playwright.dev/docs/best-practices)

| Layer | Required tests |
|---|---|
| Domain unit tests | Allowed/forbidden stage changes, role permissions, prerequisite evaluation, rejection/revision rules, threshold boundaries, closure/reopening and override policy. |
| Database/API integration | Authorization and record scope, transaction rollback, ID uniqueness, duplicate requests, concurrent bookings, stale versions, audit consistency, migration constraints and event retries. Use real PostgreSQL for these checks. |
| UI behavior | Loading/empty/error states, accessible actions, keyboard use, clear missing prerequisites, rejection notes, role navigation and pending-versus-saved feedback. |
| Web end-to-end | Entire approved journey using separate role sessions, rejection and resubmission, scheduling refusal, reassignment, stalled case/contact and authorized export. |
| Native/mobile | Both OS builds on real devices: login/session expiry, queue/action flows, no connectivity, app restart, reconnect conflicts, duplicate retries, notification deep links and cache clearing. Select native automation during the foundation spike. |
| Security | Direct access to another user's chart/queue, privilege escalation, disabled accounts, session revocation, injection/XSS attempts in notes, export scope and sensitive-data leakage in logs/notifications. |
| Reliability and performance | Target concurrency, sustained activity, process restart mid-operation, worker retries, database outage, backup failure, full restore and deployment recovery. |
| Staff acceptance | One representative of each operational role walks realistic synthetic cases on hospital hardware, confirms terminology, handoffs and responsibility. |

High-priority acceptance cases to implement first:

1. An unassigned junior resident submits another resident's chart: denied; no state, approval or notification mutation.
2. A valid submission advances once, writes the actor/role/history, and reaches the next review queue.
3. A reviewer rejects with a required reason: the correct owner receives the revision task; obsolete approvals are invalidated under the agreed rule.
4. A user submits an action based on an old chart version: receives a conflict and current status instead of overwriting newer work.
5. A confirmed treatment booking is attempted with a missing approval: refused with the missing prerequisite identified; no confirmed booking is created.
6. Two users simultaneously request the last available resource slot: only one succeeds; capacity remains correct.
7. A queued mobile action is replayed after the server committed but the response was lost: one action, audit entry and downstream event result.
8. A queued action reconnects after reassignment or account deactivation: current server permissions are checked; the action is refused visibly.
9. At just below, exactly at, and just above a threshold: the documented boundary is respected; repeated scans do not duplicate the stall alert.
10. Staff logs a call for a stalled chart: contact history updates while the unresolved stall remains visible. Progress clears it; a later stall creates a new episode.
11. A notification worker crashes after processing an event: replay does not create duplicate in-app alerts.
12. Restoring a backup recovers chart states, assignments, bookings, histories and staff access consistently.

Use synthetic data in development, CI and automated tests. Inject a controllable clock for time-based tests; use isolated fixtures rather than waiting real days. Include at least one chart at every approved stage, rejected revisions, inactive staff, duplicate-looking names, full resources, overdue cases and non-ASCII names. Never use production patient records in external CI.

## 7. Delivery sequence and exit gates

Planning estimate: 18–22 weeks for one backend developer, one frontend/mobile developer and a lead, with regular staff and hospital IT availability. This is an estimate for the scope below, not a fixed commitment. Re-estimate after the first two delivery iterations. Infrastructure procurement, iOS signing/distribution and substantial workflow changes can extend elapsed time.

| Phase | Duration | Build and test together | Exit gate |
|---|---|---|---|
| 0. Resolve requirements | 1–2 weeks | Correct PRD/TRD/workflow/schema/UI/backlog; define transition and permission matrices, data boundary, acceptance examples and deployment owner. | RT scope and exact stage rules agreed; trace every launch requirement to an acceptance case. |
| 1. Foundation | 2 weeks | Repository/CI, environments, schema migrations, auth, role permissions, test fixtures, API contract and web shell; mobile build/connectivity spike. | Clean install works; permitted/denied access tests pass for all agreed roles. |
| 2. First complete handoff | 2 weeks | Registration, RT chart detail, assignment, first submission, next queue, audit capture and event delivery. | Two-role end-to-end test passes; duplicate/stale action tests pass. |
| 3. Full review workflow | 3 weeks | Simulation dependencies and full contouring/review/planning workflow, revision paths and role dashboards. | Full approved preparation journey plus every rejection route is demonstrated and automated. |
| 4. Scheduling and escalation | 2 weeks | Resource bookings, readiness/capacity checks, overdue worker, notification inbox and call tracking. | Missing-prerequisite, booking-race, timer-boundary and notification retry tests pass. |
| 5. Mobile and operational features | 3–4 weeks | Android/iOS daily flows, permitted offline handling, push if approved, filters, availability, reports and digest. | Both OS builds pass daily journeys and real-device reconnect checks; role-scoped reports reconcile. |
| 6. Release hardening | 2–3 weeks | Performance/security testing, accessibility review, production deployment rehearsal, restore drill and training. | Agreed performance/recovery gates pass with no unresolved critical defects. |
| 7. Controlled pilot | 3–4 weeks | Small approved patient cohort, named support, reconciled initial data, daily issue review and gradual expansion. | Staff acceptance, reconciled records and operating ownership confirmed before department-wide rollout. |

The durations sum to 18–22 weeks; opportunities for overlap are not assumed in the estimate. Backend owns domain/database/API/operations, frontend owns web/mobile and UI tests, and the lead owns scope, acceptance coordination and rollout. Both developers contribute to integration tests and review each other's consequential changes.

A web preview can be delivered earlier, but mobile remains a launch requirement under the existing P0-13. A web-only pilot must be explicitly identified as a limited release rather than presented as completion of all P0 requirements.

## 8. CI and production acceptance

Every pull request: type checks, lint, relevant unit tests, API/database integration tests, migration checks and a small critical web journey suite. Attach test evidence to requirement IDs. Expand device and endurance checks for release candidates and changes affecting those areas.

Definition of done: approved acceptance examples pass, server authorization is exercised, consequential mutations are audited, failure states are usable, code is reviewed, documentation/contracts are current, and the feature runs on shared staging. A global coverage percentage alone does not establish correctness; require explicit coverage of every approved transition and permission boundary.

Proposed measurable targets to agree with hospital IT before load testing:

| Area | Initial target, not a measured result |
|---|---|
| Dataset/load | 1,000 active RT charts, 10,000 historical charts and 50 concurrent staff using a documented read/write mix on the intended server. |
| Responsiveness | 95th-percentile common API requests under 500 ms; usable dashboard within 2 seconds on the hospital test network. |
| Handoff visibility | In-app queue/notification update within 10 seconds during normal connectivity. |
| Stall detection | Flags appear within the agreed worker interval after a threshold is crossed; propose a 5-minute interval for evaluation. |
| Integrity | No lost accepted writes, duplicate business actions or capacity violations in contention/retry tests. |
| Recovery | Initial proposal: recover service within 4 hours and lose no more than 24 hours of data with daily backups. If a smaller loss window is required, add more frequent backup/transaction-log recovery and test it. |
| Residency | Network/log/export inspection confirms the agreed patient-data boundary, including mobile storage, backups and any enabled push relay. |

Before full rollout, demonstrate backup restoration on a separate instance, rehearse failed deployment recovery, verify monitoring for backup/job failures, and assign owners for accounts, updates and incidents. Provide a paper fallback and a controlled reconciliation procedure for work recorded during downtime.

Rebase the old chemo success metrics for RT with the department: delayed starts due to unmet preparation steps, time in each preparation stage, overdue cases contacted before appointments, update latency and staff adoption. Capture a baseline before the pilot. These measure workflow performance, not clinical outcomes.

The first implementation milestone should be a tested vertical slice: staff login → RT chart creation → assigned user's action → next role's queue → permanent audit history. Completing this slice validates the application foundation before expanding the whole workflow.
