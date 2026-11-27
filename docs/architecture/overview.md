# Architecture

## Decision

Use a TypeScript workspace with a Next.js web app ([how it works](web.md)), NestJS modular API, PostgreSQL and a later React Native app. The intended deployment is a hospital-owned server behind an internal TLS reverse proxy. This is a single-department modular application; introduce separately deployed services only when an operational need is demonstrated.

```mermaid
flowchart LR
  Web[Next.js web] --> Proxy[Hospital HTTPS reverse proxy]
  Mobile[React Native - planned] --> Proxy
  Proxy --> API[NestJS API]
  API --> DB[(PostgreSQL)]
  Worker[Outbox and stall worker - planned] --> DB
  DB --> Backup[Approved encrypted backup storage]
```

The checked-in Compose app profile is a localhost HTTP preview, not the illustrated production TLS deployment.

## Boundaries

| Area       | Responsibility                                                          | Current state                                                                                              |
| ---------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Identity   | Authenticate sessions and scope records/actions                         | Local-account login, server-side sessions, lockout and audit implemented; directory sign-in pending (D-08) |
| Registry   | RT chart lifecycle (RT number only; no patient data)                    | Schema only                                                                                                |
| Workflow   | Authorized action, expected version, prerequisites, approved definition | Pure policy function and schema; persistence command pending                                               |
| Reviews    | Submission revisions and decisions                                      | Schema only                                                                                                |
| Scheduling | Resource capacity, readiness and booking lifecycle                      | Database overlap constraint; application commands pending                                                  |
| Follow-up  | Stalls, calls, notifications and delivery                               | Schema only; worker pending                                                                                |
| Audit      | Append-only mutation record                                             | Protected tables; application capture pending                                                              |
| Health     | Liveness and database/schema readiness                                  | Implemented                                                                                                |

Keep future modules under `apps/api/src/<module>`. Controllers validate input and authenticate requests; command services enforce domain rules; repositories perform parameterized SQL. Do not let frontend state authorize changes. Shared contracts provide types and policy vocabulary, not trusted client claims.

## Mutation transaction contract

For a future state-changing command:

1. Verify the staff session and load active roles from the server.
2. Acquire/inspect the actor's idempotency record; reject key reuse with a different payload.
3. Lock the chart, verify access scope and compare the expected version.
4. Load the chart's approved workflow definition, assignment and prerequisite facts.
5. Evaluate the requested transition; rejection returns a stable code without changing data.
6. Update current state and increment version; insert history, audit, result and outbox event in the same transaction.
7. Commit, then return the saved result. Publish notifications through the outbox worker after commit.

`CommandService` (`apps/api/src/transactions`) implements steps 2, 5 and 7 for every command: the idempotency record (a retry with the same key returns the first answer for 24 hours; the same key for a different request is refused with `IDEMPOTENCY_KEY_REUSED`), one transaction, and rollback with no saved record when the command is refused. Commands throw `DomainError` with a stable code. Tests TXN-001 and TXN-002.

No stage-change endpoint is exposed until the chart commands that use this service are implemented. The current pure function cannot supply database locking, idempotency or authorization by itself.

## Recorded decisions

| ID      | Decision                                                         | Reason                                                                                                                                          |
| ------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-001 | RT is the working domain                                         | Later source documents correct the chemo assumption; user accepted the assessment.                                                              |
| ADR-002 | ~~Separate patient identity and RT charts~~                      | Superseded by ADR-008: there is no patient identity. A repeat course gets a new RT number, so earlier charts are never overwritten.             |
| ADR-003 | Plain SQL migrations plus `pg`                                   | Constraints, composite foreign keys and PostgreSQL range exclusions are directly reviewable. No ORM needed for the initial foundation.          |
| ADR-004 | Draft workflow fixture, no clinical seed                         | Exact 13-stage RT definition is absent; software must not silently invent it.                                                                   |
| ADR-005 | Deny private API routes unless authenticated                     | Fail closed. Implemented as server-side sessions (opaque token, SHA-256 stored); roles come from the database, never from headers.              |
| ADR-006 | Single backend, future database outbox worker                    | Fits the documented low volume and avoids losing handoff events after a process crash.                                                          |
| ADR-007 | No native scaffold or external push yet                          | Distribution/signing and device data boundaries remain open; mobile stays an explicit milestone.                                                |
| ADR-008 | No patient information in the application (28 Nov 2026)          | OncoTrack is an internal work-status tracker. Charts are identified by RT number only; staff look the patient up in their own clinical systems. |
| ADR-009 | NestJS + PostgreSQL on the hospital's local server (28 Nov 2026) | Everything is hosted on-premise; no cloud platform. The web app talks to this API only.                                                         |
| ADR-008 | Embedded SQL smoke tests plus real PostgreSQL CI                 | Local schema checks work without Docker, while server behavior still has a separate verification path.                                          |

## Tooling references

Runtime selection was checked against [NestJS setup](https://docs.nestjs.com/first-steps) and [Next.js documentation](https://nextjs.org/docs). PostgreSQL constraints are described in the [official constraint documentation](https://www.postgresql.org/docs/current/ddl-constraints.html). Embedded tests register the documented [PGlite btree_gist extension](https://pglite.dev/extensions/).

Dependencies are captured in `package-lock.json`. The `multer` override pins 2.3.0 to address the advisory reported during installation; review whether the override remains necessary when upgrading NestJS. [Advisory](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm)
