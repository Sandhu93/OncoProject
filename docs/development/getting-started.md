# How to start building OncoTrack

Date: 13 September 2026. Working scope: radiation therapy (RT), following the user's acceptance of the assessment and the later project backlog. The precise clinical stages remain unconfirmed.

## Starting point

Build one tested staff handoff before expanding every screen. The first useful milestone is:

**Staff login → create a patient and RT chart → assign work → assigned staff submits → next reviewer sees the chart → audit history records the handoff.**

The foundation in this repository prepares for that milestone. It does not claim authentication, patient management, scheduling, mobile delivery or hospital deployment are complete.

## 1. Agree the domain before hard-coding it

Walk a synthetic RT case through the department with a consultant, junior resident, senior resident, physicist and radiographer. Write down each action, permitted role, prerequisite, expected duration and rejection destination in [the workflow specification](../product/workflow.md).

Confirm the 13-stage list mentioned in the old backlog, registration/call ownership, RT number format, chart-versus-course identity, scheduling overrides, and where tracking ends. There is no approved 13-stage RT list in the original files. The supplied draft fixture deliberately contains only a minimal engineering handoff, and cannot be activated by seeding.

Use [the decision register](../product/rt-scope.md). Technical foundation work can proceed while clinical answers are pending; do not expose unfinished workflow actions to staff.

## 2. Bring up the shared development foundation

Follow [local setup](local-setup.md). Install from the lockfile, generate a local environment with random database credentials, start PostgreSQL, apply the migrations, and load the draft reference fixture. Run `npm run check` and the database suite.

Use the [project repository](https://github.com/Sandhu93/OncoProject) for source and review. Branch protection requiring CI and review is a follow-up repository administration task. Keep environment files, patient data and generated artifacts outside version control.

## 3. Implement identity first

Resolve local hospital accounts versus directory integration. Implement account provisioning, password hashing or directory authentication, server-side session revocation, login throttling, and record-scoped permissions. Keep clinical roles separate from the account-administration capability.

Write tests for successful login, invalid credentials, expired sessions, disabled users, unauthorized roles and attempted access to another user's assignment. The scaffold denies non-public API routes until a verified authentication provider replaces the initial guard; never temporarily trust a client-supplied role header.

## 4. Implement the first vertical slice

1. Add registration commands and validation; use synthetic data while developing.
2. Allocate a unique RT display number transactionally using the agreed numbering scheme.
3. Create an RT chart bound to an approved workflow version.
4. Assign an active staff member to a permitted task.
5. Submit with an expected chart version and idempotency key.
6. Commit chart change, stage history, audit event and outbox message together.
7. Display the result in both staff queues and expose the permitted history.

Test the happy path, a wrong assignee, invalid transition, duplicate retry, stale version, rejected work and transaction rollback. Demonstrate the complete slice on staging before starting another independent module.

## 5. Expand in this order

| Milestone             | Deliverable                                                                 | Required proof                                                       |
| --------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Identity and registry | Accounts, permissions, patient/RT chart creation                            | Auth and ID integrity tests                                          |
| Review workflow       | Contouring, verification, approval, physics planning and revision returns   | Every approved handoff and rejection route tested                    |
| Scheduling            | Simulation/resource calendar, readiness gate, cancellation and rescheduling | Missing prerequisites blocked; simultaneous booking conflict handled |
| Escalation            | Stage timers, in-app notifications, call follow-up                          | Boundary-clock and duplicate-delivery tests                          |
| Mobile                | Real Android/iOS daily-use screens and approved sync behavior               | Real-device reconnection and revoked-session tests                   |
| Operations/pilot      | Backups, restore, monitoring, capacity testing, training                    | Recovery rehearsal and staff acceptance                              |

Audit capture belongs in every mutation from the first feature. Reports and richer audit presentation can follow later. Mobile is an explicit deliverable in the original P0 scope; a web preview does not finish the full application.

## 6. Test-driven working agreement

For a consequential behavior: acceptance example → failing test → minimal implementation → refactor → integration/UI check → reviewer evidence. See [testing](testing.md). Use actual PostgreSQL for database constraints and contention tests; mocks cannot verify those properties.

Every task links a requirement/acceptance ID, names the responsible developer, and defines an observable result. Every finished feature runs on shared staging and documents its remaining limitations.

## 7. Before real patient use

Complete identity and access review, approved workflow configuration, on-premise TLS and storage setup, monitoring, backup restoration rehearsal, downtime reconciliation instructions and training. Resolve phone caching, push relay, backup location and retention with hospital IT. Local Docker passwords, draft fixtures and development HTTP ports are not production configuration.

The earlier 18–22-week estimate remains a planning estimate for two developers plus a lead. Update it after two delivery iterations. Track actual completed work in [status](status.md) rather than treating scaffolding as finished product features.
