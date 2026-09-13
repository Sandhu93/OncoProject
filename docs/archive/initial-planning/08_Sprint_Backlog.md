# Sprint Backlog — OncoTrack
## A Week-by-Week Task Breakdown for a 2-Developer Team

**Companion to:** 04_Implementation_Plan.md, 07_Team_Leadership_Playbook.md
**Team:** 1 Backend Developer (BE), 1 Frontend Developer (FE), You as Lead
**Note:** These are RT (radiation therapy) domain terms — RT chart, RT number, contouring, physics planning, LINAC. The core PRD/TRD/Workflow/Schema documents need updating to match this terminology before development starts; treat that as Sprint 0's first task.

Timeframes are rough estimates for a 2-developer team, not commitments — adjust after your first 2–3 sprints once you see actual pace.

---

## Sprint 0 — Foundations (1 week)

**Sprint goal:** Everyone has what they need to start building, and the team is working against accurate specs.

| Task | Owner |
|---|---|
| Update PRD, TRD, App Workflow, and Backend Schema documents from the old chemo-pipeline model to the actual 13-step RT workflow | You (or ask Claude to do this pass) |
| Finalize the exact stage list and naming with the doctor (confirm the 13 steps map cleanly to database stages) | You + Doctor |
| Confirm timing thresholds — how many days is "too long" at each step — even if it's a rough first guess to be tuned later | You + Doctor |
| Confirm RT number format (e.g. `RT-2026-0001`) | You + Doctor + Hospital records dept |
| Initiate on-premise server request with hospital IT | You |
| Set up repository, branch protection on `main`, PR template | BE |
| Set up local dev environment (Docker Compose skeleton: backend + Postgres) | BE |
| Set up frontend project skeleton (React), confirm design tokens/colors/fonts from the UI/UX doc | FE |
| Set up shared task board, columns, and this backlog as the initial set of cards | You |

**Acceptance check:** repo exists, both developers can run the project locally, and everyone has read and understood the corrected PRD/TRD.

---

## Sprint 1–2 — Data Model & Auth Foundation (2 weeks)

**Sprint goal:** The database exists, and a staff member can log in and see an empty (but real) dashboard shell.

| Task | Owner |
|---|---|
| Implement database schema: `roles`, `staff_users`, `pipeline_stages`, `stage_thresholds` tables, with the 13 RT stages seeded | BE |
| Implement `patients` (rename conceptually to RT charts — consider `rt_charts` as the table name) and `patient_stage_history` tables | BE |
| Implement authentication (login, hashed passwords, session/JWT) | BE |
| Implement role-based access control middleware (checks role on every request) | BE |
| Build login screen (web) | FE |
| Build the app shell: sidebar navigation, top bar, empty dashboard layout matching the UI/UX mockup | FE |
| Connect frontend login to backend auth endpoint | FE + BE |

**Acceptance check:** you can create a test account for each of the 5 roles, log in as each, and see a role-appropriate (if empty) dashboard shell.

---

## Sprint 3–4 — RT Chart Creation & Core Stage Tracking (2 weeks)

**Sprint goal:** A doctor can create an RT chart, and it appears with the correct stage on the dashboard.

| Task | Owner |
|---|---|
| `POST /rt-charts` — create RT chart, generate RT number | BE |
| `GET /rt-charts/{id}` and `GET /rt-charts?stage=&assignedTo=` — fetch and filter | BE |
| `PATCH /rt-charts/{id}/stage` — the core stage-transition endpoint, with server-side validation of legal transitions per role | BE |
| Stage transition rules encoded per the App Workflow document's state machine | BE |
| "New RT Chart" form (web) matching the UI/UX registration screen | FE |
| Dashboard patient/chart list with stage, status color, and days-in-stage columns | FE |
| RT Chart Detail view — the timeline/history visual from the UI/UX mockup | FE |

**Acceptance check:** a doctor creates a test RT chart, and it's visible with the correct initial stage; manually walking it through a couple of stage transitions via the API updates it correctly on screen.

---

## Sprint 5–6 — Assignment, Contouring, and the Approval Chain (2 weeks)

**Sprint goal:** The core five-handoff approval chain (contouring → senior verification → consultant approval → physics planning → plan approval) works end to end.

| Task | Owner |
|---|---|
| `assignments` table and endpoints — assign a junior resident for contouring | BE |
| Marking/contouring submission endpoint (junior resident marks complete) | BE |
| Verification endpoints (senior resident verifies, consultant approves/rejects) | BE |
| Physics planning stage endpoints (plan submitted, plan approved) | BE |
| "My Queue" screen (junior resident view) | FE |
| Verification/approval queue screens (senior resident, consultant) | FE |
| Physicist planning queue screen | FE |
| Rejection flow — note attached, case reappears in the right queue | FE + BE |

**Acceptance check:** run one full test RT chart through the entire approval chain using real test accounts for each of the 5 roles — this is the heart of the system, so this check matters more than any other in the project.

---

## Sprint 7 — Scheduling & Radiographer Workflow (1 week)

**Sprint goal:** A chart can be marked ready for the LINAC and scheduled, with prerequisite checks.

| Task | Owner |
|---|---|
| Simulation booking (mould + CT sim dates) endpoints | BE |
| "Plan sent to LINAC" and treatment-start endpoints | BE |
| Prerequisite validation logic for scheduling | BE |
| Radiographer's booking/simulation screens | FE |
| Booking calendar view with color-coded prerequisite status | FE |

**Acceptance check:** attempting to schedule a chart with incomplete prerequisites shows the correct warning; a fully-ready chart schedules cleanly.

---

## Sprint 8 — Notifications & Stall Detection (1–1.5 weeks)

**Sprint goal:** The system proactively flags stalled charts, closing the original gap this project exists to solve.

| Task | Owner |
|---|---|
| Scheduled background job for stall detection (per stage thresholds) | BE |
| In-app notification records and endpoints | BE |
| Call-log endpoints | BE |
| Notification bell/dropdown (web) | FE |
| "Needs Attention" dashboard view | FE |
| Call-outcome logging UI | FE |

**Acceptance check:** deliberately leave a test chart stalled past its threshold and confirm it surfaces correctly; log a call outcome and confirm it's visible to relevant roles.

---

## Sprint 9 — Audit Trail, Reports & Polish (1 week)

**Sprint goal:** Everything the doctor needs to trust and review the system is in place.

| Task | Owner |
|---|---|
| Audit trail endpoint (full history per chart) | BE |
| CSV/PDF export endpoint | BE |
| Audit trail display on RT Chart Detail | FE |
| Export button wired up | FE |
| Bug bash — both developers test each other's areas | BE + FE |

**Acceptance check:** run the full Phase 1 web-only acceptance check from the Implementation Plan document with real department staff.

---

## Sprint 10–13 — Mobile App (3–4 weeks)

**Sprint goal:** Feature parity for daily-use screens on Android/iOS, with real push notifications.

| Task | Owner |
|---|---|
| React Native project setup, shared design tokens | FE |
| Mobile login, My Queue, and core action screens | FE |
| Offline queuing for simple actions (mark complete, log call) | FE |
| FCM/APNs push notification integration (data-minimal, per TRD) | BE + FE |
| Mobile build/signing/distribution setup (internal testing track) | FE |

**Acceptance check:** an SHS-equivalent role completes a real action entirely from their phone, on and off wifi, and confirms sync; a push notification arrives within an acceptable delay.

---

## Sprint 14+ — Pilot & Refine (ongoing, runs alongside real usage)

**Sprint goal:** Validate against real department volume and tune what was guesswork.

| Task | Owner |
|---|---|
| Deploy to the on-premise production server | BE |
| Run pilot with a small subset of real RT charts | You (coordinating with the department) |
| Tune stall thresholds based on real data | You + Doctor |
| Fix friction points surfaced by real use | BE + FE |
| Prepare short training material per role | You |

**Acceptance check:** the doctor and staff can say OncoTrack is now their primary source of truth for pipeline status, ahead of paper.

---

## How to Use This Document

- Copy each sprint's tasks onto your task board at the start of that sprint — don't load the whole backlog on day one, it'll be stale by Sprint 3.
- After each sprint, note in the Team Leadership Playbook's weekly-update template whether you're ahead, on pace, or behind — and adjust the remaining sprint estimates honestly rather than pretending the original plan still holds.
- If a sprint's acceptance check fails, that's more important than moving on to the next sprint's tasks — a shaky foundation compounds.
