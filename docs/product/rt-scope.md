# Current RT scope and decision register

The original PRD identifies the operational problem: missed preparation steps and invisible handoffs waste scheduled capacity. The later leadership/backlog documents correct the domain to radiation therapy. The user accepted the assessment and requested this development foundation.

The planned system tracks preparation status, responsible staff, dates, review completion and readiness. Clinical work remains in existing clinical systems. No dose calculation, image storage, treatment machine control, EMR, patient portal, billing or patient messaging is part of this foundation.

## Working roles

Junior resident, senior resident, consultant, physicist, radiographer. Administration is an independent capability. Exact role/action and chart-visibility rules require staff confirmation; these names are reference vocabulary, not a complete permission policy.

## Decisions

| ID   | Question                                                                                                | Owner                      | Work affected                               |
| ---- | ------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------- |
| D-01 | Exact 13 RT stages, initial/terminal stages and allowed returns?                                        | Consultant + staff         | Workflow activation and live chart creation |
| D-02 | Who registers charts, assigns tasks, calls patients and administers accounts? Is an office role needed? | Department lead            | Auth scopes and dashboards                  |
| D-03 | Existing hospital number and RT numbering format? One chart per course?                                 | Records + consultant       | Registration and identity                   |
| D-04 | Who reviews each revision? Which approvals are invalidated by rework?                                   | Consultant + physicist     | Review commands                             |
| D-05 | Scheduling hard block, authorized overrides, reservations and resource capacity?                        | Consultant + radiographer  | Booking commands                            |
| D-06 | Does tracking end at treatment start, course completion or another event?                               | Consultant                 | Terminal stages and repeated work           |
| D-07 | Stage thresholds, elapsed/working-day timers, recipients and reassignment?                              | Department lead            | Escalation worker                           |
| D-08 | Staff directory or local accounts, device policy, TLS/VPN, host owner?                                  | Hospital IT                | Authentication and deployment               |
| D-09 | Permitted phone cache, external push relays, backup storage and retention?                              | Hospital IT/administration | Mobile and operations                       |
| D-10 | English/Malayalam UI, required fields and initial patient population import?                            | Staff + records            | UX and pilot                                |

All are open unless later documented with an owner/date and concrete answer. No sample threshold, example workflow or resource schedule in tests is a clinical recommendation.

## Requirement mapping

| Current ID | Requirement                                        | Earlier source                              |
| ---------- | -------------------------------------------------- | ------------------------------------------- |
| RT-01      | Patient identity and RT chart registration         | PRD P0-1; RT backlog sprints 3–4            |
| RT-02      | Validated RT handoffs and reviews                  | PRD P0-2/P0-4/P0-6; RT backlog sprints 5–6  |
| RT-03      | Role dashboards and staff access                   | PRD P0-3/P0-10/P0-14; RT backlog five roles |
| RT-04      | Prerequisite-aware resource scheduling             | PRD P0-7; RT backlog sprint 7               |
| RT-05      | Notifications, stalls and calls                    | PRD P0-5/P0-8/P0-9; RT backlog sprint 8     |
| RT-06      | Action history and workflow reports                | PRD P0-11/P1-6; RT backlog sprint 9         |
| RT-07      | Responsive web and Android/iOS daily workflows     | PRD P0-12/P0-13                             |
| RT-08      | On-premise operation, recovery and data boundaries | PRD P0-15 and TRD                           |

Rewrite the original source documents as a coordinated follow-up once D-01–D-06 are answered. Their old chemo stage list must not quietly become the new RT workflow.
