# Product Requirements Document (PRD)
## OncoTrack — Patient Pipeline Tracking System for Oncology Department

**Prepared for:** Oncology Department, Government Medical College, Kerala
**Document owner:** [Consulting Engineer]
**Version:** 1.0 (Draft for review)
**Status:** Pre-development, pending stakeholder sign-off

---

## 1. Problem Statement

The oncology department currently manages the patient journey from consultation to chemotherapy using paper records, spread across the doctor's office, radiology, and the residents doing pre-chemo workup. There is no single place where the current status of a patient is visible to everyone involved.

The specific, recurring failure: a chemo slot is booked on the assumption that the patient has completed the required pre-chemo tests (MRI, marking, doctor verification, further assigned tests). In practice, patients frequently arrive at the chemo slot having skipped one or more of these steps, because no one detected the gap until the patient physically showed up. This wastes a chemo slot that could have gone to another patient, delays that patient's treatment, and consumes doctor and staff time to re-route the patient back into the workup pipeline.

This is a coordination and visibility failure, not a clinical one — the department needs a shared, real-time view of where every active patient sits in the pipeline, with automatic flags when someone is stuck or has gone silent.

**Who is affected:** the consulting doctor (bears the clinical and scheduling consequence), senior house surgeons doing MRI marking, radiology staff, and the doctor's office/front desk who currently do this coordination by phone and paper.

**Cost of not solving it:** wasted chemo slots, delayed cancer treatment for patients who fall through the cracks, and significant manual chase-up effort that scales badly as patient volume grows.

---

## 2. Goals

1. **Give the doctor a single-screen view of every active patient's pipeline stage**, so a gap is visible without needing to ask around.
2. **Eliminate chemo slot bookings for patients who have not completed prerequisite steps** — the system should prevent or clearly flag this before the slot is confirmed.
3. **Automatically surface patients who have stalled** (no movement for longer than an expected window at their current stage) so staff can call them proactively, before the scheduled date, not on the day.
4. **Reduce the time between an SHS completing MRI marking and the doctor verifying it**, by replacing manual notification (walking over, calling) with an in-app alert.
5. **Support many patients in the pipeline simultaneously** without the coordination overhead growing — the department should be able to track hundreds of concurrent patients as easily as it tracks ten.

*Non-clinical, workflow-only metrics — this system does not measure clinical outcomes.*

---

## 3. Non-Goals

1. **Not an Electronic Medical Record (EMR).** No diagnosis, treatment notes, imaging files, lab values, or clinical history are stored. Only pipeline *status* (which stage a patient is at, and dates) is tracked. This is deliberate — it keeps the regulatory and security burden proportionate to the problem being solved, and avoids duplicating/conflicting with any EMR the hospital already uses or may adopt later.
2. **Not a hospital-wide HMS.** Scoped to the oncology chemo-workup pipeline only. Other departments are only touched insofar as radiology needs to confirm test completion.
3. **No in-app calling or messaging to patients.** Calling the patient happens outside the app (phone). The app only tracks that a call is needed/was made and its outcome, as a note.
4. **No patient-facing login in v1.** Patients do not get an account, app, or portal in this phase. They are tracked by staff, not self-service. (Flagged as a P2 future consideration — see Section 6.)
5. **No billing, insurance, or payment tracking.** Purely a clinical-workflow-status tracker.
6. **No integration with hospital PACS/RIS or lab systems in v1.** Marking and test results are recorded as a status ("done"/"not done") entered manually by staff, not pulled automatically from imaging or lab systems. Automated integration is a valid future phase but adds significant scope and hospital IT dependency that would delay a working v1.

---

## 4. Personas / User Types

| Persona | Role in the pipeline | Primary need from the app |
|---|---|---|
| **Consulting Doctor (Admin)** | Registers patients, assigns SHS, verifies MRI marking, assigns further tests, confirms chemo scheduling, owns escalations | One dashboard showing every patient's stage and every stalled case |
| **Senior House Surgeon (SHS)** | Performs MRI marking on assigned patients | Simple queue of assigned patients, one-tap "mark complete" |
| **Radiology Staff** | Confirms test completion, checks prerequisite status before chemo date is finalized | View of patients due for radiology, with prerequisite checklist visible |
| **Doctor's Office / Front Desk** | Books slots, manages patient calls and reminders, first point of contact for stalled patients | List of patients needing a reminder call, ability to log call outcome, booking calendar view |

---

## 5. User Stories

### Doctor (Admin)
- As the doctor, I want to register a new patient with a unique Patient ID at first consultation, so their journey is tracked from day one.
- As the doctor, I want to assign an available SHS to a patient's MRI marking, so workload is distributed and I know who owns each case.
- As the doctor, I want to be notified the moment an SHS completes marking, so I can verify it without having to check manually.
- As the doctor, I want to see every patient's current pipeline stage on one screen, so I can spot bottlenecks at a glance.
- As the doctor, I want to be alerted when a patient has not progressed within the expected time window for their current stage, so I can have someone call them before the situation becomes a wasted chemo slot.
- As the doctor, I want the system to block or clearly warn against confirming a chemo date for a patient whose prerequisite steps are incomplete, so slots are not wasted.
- As the doctor, I want to see a history of a patient's pipeline progression (stage, date, who acted), so I can understand what happened if something goes wrong.

### Senior House Surgeon
- As an SHS, I want to see only the patients assigned to me, so I know exactly what I need to do today.
- As an SHS, I want to mark a patient's MRI as reviewed with minimal taps, so it fits into a busy ward routine.
- As an SHS, I want confirmation that my marking was received and sent to the doctor, so I know my part is done.

### Radiology Staff
- As radiology staff, I want to see which patients are due for tests and whether their prior steps are complete, so I don't schedule someone who isn't ready.
- As radiology staff, I want to mark a patient's assigned tests as complete, so the doctor's office knows chemo can be scheduled.

### Doctor's Office / Front Desk
- As office staff, I want a daily list of patients who need a reminder call (stalled, or upcoming chemo date with incomplete prerequisites), so outreach is proactive instead of reactive.
- As office staff, I want to log the outcome of a reminder call (reached/not reached, patient's response, rescheduled), so there's a record without needing to remember it.
- As office staff, I want to see the chemo slot calendar with each booking's prerequisite-completion status color-coded, so I can catch a problem booking before the day arrives.

### Cross-cutting
- As any staff member, I want to search for a patient by Patient ID and immediately see their current stage, so I don't need to ask around the department.
- As any staff member, I want the system to work on both a hospital desktop/web browser and a personal phone, so I can check status whether I'm at a workstation or on the ward.

---

## 6. Requirements

### P0 — Must Have (v1 cannot ship without these)

| # | Requirement | Acceptance Criteria |
|---|---|---|
| P0-1 | Unique Patient ID generation at registration | Given a new patient is registered, when the doctor/office saves the record, then a unique, human-readable Patient ID is generated and displayed |
| P0-2 | Pipeline stage state machine (Registered → Tests Booked → MRI Done → Marking Pending → Marked/Verification Pending → Verified → Additional Tests Assigned → Tests Complete → Chemo Scheduled → Chemo Completed) | Given a patient record, when any authorized role advances the stage, then the new stage is recorded with timestamp and actor; invalid stage skips are blocked with a clear message |
| P0-3 | Role-based dashboards | Given a user logs in as Doctor / SHS / Radiology / Office, when they view their dashboard, then they see only the patients and actions relevant to their role |
| P0-4 | SHS assignment by doctor | Given the doctor is at the "assign marking" step, when they select an available SHS, then that SHS's queue is updated and they receive a notification |
| P0-5 | In-app notification on marking completion | Given an SHS marks a case complete, when they submit it, then the doctor receives an in-app notification within the same session |
| P0-6 | Doctor verification gate | Given a marking is submitted, when the doctor reviews it, then the doctor can Approve (advances stage) or Reject (sends back to SHS with a note) |
| P0-7 | Chemo scheduling with prerequisite check | Given office staff attempts to confirm a chemo date, when prerequisite steps are incomplete, then the system displays a clear warning listing missing steps before allowing (or blocking) confirmation |
| P0-8 | Stall detection and escalation | Given a patient has not advanced stage within a configurable expected-duration threshold for their current stage, then the patient is flagged as "stalled" on the doctor's and office's dashboards |
| P0-9 | Manual call-outcome logging | Given office/SHS/radiology staff calls a patient outside the app, when they return to the app, then they can log outcome (reached / no answer / rescheduled / declined) with a free-text note and timestamp |
| P0-10 | Patient search by ID | Given any authorized user, when they enter or scan a Patient ID, then the patient's current stage and recent history are displayed |
| P0-11 | Audit trail per patient | Given any stage change or action, then it is permanently logged with timestamp, actor, and role — visible to the doctor |
| P0-12 | Web app (responsive) accessible on hospital network | Given a staff member on a hospital workstation or personal device connected appropriately, then they can access the full app via browser |
| P0-13 | Mobile app (Android/iOS) with feature parity for daily-use screens | Given a staff member on their phone, then they can view their queue, act on assigned patients, and receive notifications |
| P0-14 | Authentication and role assignment | Given a staff member, then they log in with hospital-issued credentials and are restricted to actions permitted for their assigned role |
| P0-15 | On-premise deployment | The system backend, application server, and database run on hospital-owned infrastructure within the hospital network; no patient-identifiable data leaves the premises |

### P1 — Should Have (high-value fast follows, not launch-blocking)

| # | Requirement |
|---|---|
| P1-1 | Configurable stall thresholds per stage (doctor can tune "how many days is too long" per stage without engineering involvement) |
| P1-2 | Overbooking prevention on the chemo calendar (slot capacity limits, warns on double-booking a time slot) |
| P1-3 | Daily digest notification to the doctor summarizing stalled patients and pending verifications |
| P1-4 | Bulk view / filter / sort of patient list by stage, assigned staff, or days-in-stage |
| P1-5 | SHS availability toggle (mark self available/unavailable) feeding into the doctor's assignment screen |
| P1-6 | Exportable daily/weekly report (CSV/PDF) of pipeline status for department meetings |

### P2 — Future Considerations (explicitly out of scope for v1, but should not be architecturally blocked)

| # | Requirement |
|---|---|
| P2-1 | Patient-facing portal or SMS/WhatsApp status updates directly to patients |
| P2-2 | Integration with hospital PACS/RIS to auto-pull MRI availability instead of manual entry |
| P2-3 | Integration with a hospital-wide EMR or HMS, if/when one exists |
| P2-4 | Multi-department expansion beyond oncology (same pipeline-tracking pattern applied elsewhere) |
| P2-5 | Automated SMS/WhatsApp reminder to patient (currently explicitly manual/outside-app by design; revisit if department wants it later) |

---

## 7. Success Metrics

### Leading indicators (weeks 1–8 post-launch)
- **Staff adoption:** % of daily-active oncology staff (doctor, SHS, radiology, office) logging into the app at least once per working day. Target: 90% within 4 weeks.
- **Stage-update latency:** median time between an event happening (e.g., marking done) and it being reflected in the app. Target: under 30 minutes.
- **Stalled-patient catch rate:** number of patients flagged as stalled and contacted *before* their scheduled chemo date, versus discovered *on* the chemo date. Target: 90%+ caught before the date within 8 weeks.

### Lagging indicators (months 2–6 post-launch)
- **Wasted chemo slot rate:** chemo slots booked but not usable due to incomplete prerequisites, as a % of total booked slots. Target: reduce from current baseline (to be measured pre-launch) by at least 70%.
- **Doctor time spent on manual status-chasing:** self-reported, target meaningful reduction (baseline to be captured via a short pre-launch survey with the doctor).
- **Time from consultation to chemo start:** average number of days, tracked to see if better pipeline visibility shortens it.

*Baseline for wasted-slot rate and time-to-chemo should be captured from existing paper records for at least 4–6 weeks before launch, to have something to compare against.*

---

## 8. Open Questions

| Question | Who should answer | Blocking? |
|---|---|---|
| What are realistic expected-duration thresholds per stage (e.g., how many days is "too long" between MRI and marking)? Needed to configure stall detection meaningfully. | Doctor | Yes, before P0-8 can be tuned (can launch with a rough default and adjust) |
| Does the medical college have an existing IT policy / server team who will host and maintain the on-premise server, or does this need to be provisioned as part of this project? | Hospital IT / Doctor | Yes, blocks infrastructure planning |
| Is there an existing hospital patient registration/ID system this should align with, or is a new Patient ID scheme acceptable? | Doctor / Hospital records dept | Yes, affects data model |
| How many patients and staff are expected concurrently (rough scale), to size the server appropriately? | Doctor | Yes, affects TRD sizing |
| Should chemo slot booking be a hard block (cannot confirm without prerequisites) or a soft warning (can override with reason)? Clinical judgment may sometimes require overriding. | Doctor | Yes, affects P0-7 design |
| Any specific data retention or destruction policy required by hospital/government regulations? | Hospital administration | No — can proceed with a sensible default and revise |

---

## 9. Timeline Considerations

- No hard external deadline stated; recommend phased delivery (see Implementation Plan document) starting with the core pipeline tracking (P0) before layering P1 features.
- Dependency: on-premise server provisioning by hospital IT should be initiated early, in parallel with development, since it is likely the longest lead-time item outside engineering's control.
- Recommend a pilot period with a small subset of patients (e.g., one SHS, a handful of concurrent patients) before full department rollout, to validate the stage thresholds and workflow fit against real usage.
