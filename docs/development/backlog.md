# First implementation backlog

State definitions: Backlog → Ready → In progress → Review → Testing → Done. Ready requires an acceptance example and resolved dependencies; Done requires reviewed implementation, tests and staging evidence.

| Ticket     | Owner           | Deliverable                                                         | Dependency / acceptance                              |
| ---------- | --------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| START-01   | Lead + staff    | Confirm RT stages and role/action matrix                            | D-01–D-06, approved examples                         |
| START-02   | Lead + IT       | Identity, hosting, network and device decisions                     | D-08–D-09                                            |
| AUTH-01    | Backend         | Session authentication and account provisioning                     | START-02; AUTH-001 tests                             |
| AUTH-02    | Frontend        | Real login and role navigation                                      | AUTH-01 contract; no fake accounts                   |
| REG-01     | Backend         | Register patient/chart, number allocation, list/detail access scope | START-01 + AUTH-01; RT-01 tests                      |
| REG-02     | Frontend        | Registration, search and chart detail                               | REG-01 contract                                      |
| FLOW-01    | Backend         | Transactional assignment and first handoff                          | START-01 + REG-01; RT-02 and conflict tests          |
| FLOW-02    | Frontend        | Assigned queue and reviewer queue                                   | FLOW-01; two-session staff demo                      |
| EVENT-01   | Backend         | Outbox processing and deduplication                                 | FLOW-01; restart/retry tests                         |
| OPS-01     | Backend + IT    | Least-privilege roles, TLS and shared staging                       | START-02; clean install verified                     |
| REVIEW-01  | Both developers | Remaining review/revision chain                                     | First vertical slice accepted                        |
| BOOK-01    | Both developers | Resource calendar and readiness gate                                | Scheduling policy; real concurrent transaction tests |
| ALERT-01   | Both developers | Stalls, follow-up and notification inbox                            | Confirmed timers/owners                              |
| MOBILE-01  | Frontend + IT   | Native build/signing/device spike                                   | Device/storage/distribution policy                   |
| RELEASE-01 | Lead + team     | Performance, restore rehearsal, training and pilot                  | All required workflows implemented                   |

The foundation files are complete only as recorded in `status.md`. These tickets describe future application work; they are not represented as finished by the scaffold.

## Ready starter task

[Database integrity tests](tasks/database-integrity-tests.md) is intentionally independent of the unfinished clinical workflow. It uses the existing migration and disposable test database, teaches PostgreSQL constraints and test isolation, and has a small reviewable scope. Do not ask the assignee to invent RT stages or change `001_initial.sql`.
