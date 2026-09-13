# Test strategy and acceptance evidence

## Implemented foundation checks

| ID          | Behavior                                                                                                                                                  | Location                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| WF-001      | Permitted transition, draft/retired rejection, role/assignment, stale version, prerequisites and required reason                                          | `tests/unit/workflow.test.ts`   |
| API-001     | Liveness/readiness response and private routes denied despite forged headers                                                                              | `tests/integration/api.test.ts` |
| DB-001–009  | Migration repeatability, draft gate, ID uniqueness, overlap/adjacency, audit immutability, definition freeze, thresholds and cross-chart review integrity | `tests/database/suite.mjs`      |
| WEB-001–002 | Truthful availability/recovery and small-screen layout                                                                                                    | `tests/e2e/shell.spec.ts`       |

`npm test` runs policy and API tests. The API tests replace only the database health provider; they do not assert real database connectivity. `npm run test:db:embedded` executes the SQL locally in PGlite. `npm run test:db` exercises the same SQL suite on PostgreSQL. `npm run test:e2e` checks the browser shell with controlled service responses.

The root `check` command composes fast quality checks plus embedded SQL and builds. CI additionally supplies a real PostgreSQL service and a Chromium browser.

## Tests to add with the first staff feature

1. AUTH-001: valid login, invalid credentials, expiry, revocation, inactive account and throttling.
2. RT-01: unique registration numbers under simultaneous requests and correct multiple-chart identity.
3. RT-02: assigned actor advances once, correct review queue receives the chart and actor-role history persists.
4. RT-02-CONFLICT: stale request rejected; repeated request has one effect; same key with changed payload rejected.
5. RT-02-REVIEW: rejection returns to the approved owner and invalidates only the defined dependent approvals.
6. RT-04: prerequisites and role gate booking; two real database sessions compete for one unit without overbooking.
7. RT-05: timer boundary, recurring stall episodes and crash/retry notification deduplication.
8. RT-07: real Android/iOS connectivity loss, restart, reconnect after reassignment and revoked session.
9. RT-08: backup restoration, transaction rollback during failure and deployment recovery.

Write expected outcomes from the approved acceptance examples. Do not generate assertions solely from the implementation's rule table. Favor behavior over implementation snapshots.

## Data and release discipline

Use synthetic records only in development and external CI. Keep fixtures isolated and clocks controllable. Do not put patient names or identifiers into screenshot artifacts, logs or failed test output from a real deployment.

Before production, require all approved handoff/permission boundaries covered, no known critical defects, PostgreSQL contention checks, both mobile platform checks, agreed latency/load results, restore rehearsal and staff acceptance. None of the initial scaffold tests establish clinical correctness, full authentication or production readiness.
