# Implementation Plan
## OncoTrack — Patient Pipeline Tracking System

**Companion to:** 01_PRD.md, 02_TRD.md, 03_App_Workflow.md

---

## Guiding Approach

This is a small-team, high-stakes-but-low-volume system. The plan is phased so that a working, trustworthy core (patient registration + stage tracking + doctor dashboard) is validated with real hospital usage before layering notifications, mobile, and refinements on top. Each phase ends with a real acceptance check against the actual department, not just a code review — this is a tool that has to be trusted by clinicians to be adopted at all.

---

## Phase 0 — Foundations & Setup (Duration: ~1–2 weeks)

**Goal:** infrastructure and groundwork in place before feature work starts.

- Finalize answers to PRD Open Questions (stage thresholds, hospital IT ownership of the server, Patient ID scheme, expected scale, hard-block vs. soft-warning on chemo scheduling, data retention policy).
- Hospital IT provisions the on-premise server (or confirms an existing VM to use).
- Set up repository, CI basics, Docker Compose skeleton, environment configuration.
- Define the finalized database schema (see 06_Backend_Schema.md) and get doctor sign-off on the exact stage list and transition rules — this is the backbone of the entire system and is expensive to change later.
- Set up authentication scaffolding and the four roles.

**Acceptance check:** a blank deployed instance is reachable on the hospital network over HTTPS, with login working for one test account per role.

---

## Phase 1 — Core Pipeline Tracking (Web only) (Duration: ~3–4 weeks)

**Goal:** the minimum system that solves the actual problem — visibility into patient stage across the department — without notifications or mobile yet.

Scope:
- Patient registration with Patient ID generation (P0-1)
- Full stage state machine with role-gated transitions (P0-2)
- Role-based dashboards, web only (P0-3, P0-12)
- SHS assignment by doctor (P0-4)
- Doctor verification (approve/reject) (P0-6)
- Chemo scheduling with prerequisite validation (P0-7)
- Patient search by ID (P0-10)
- Audit trail (P0-11)
- Authentication and RBAC (P0-14)
- On-premise deployment (P0-15)

Explicitly deferred to later phases: push notifications, mobile app, stall detection.

**Acceptance check:** run a real patient (or a realistic dry-run case) through the entire pipeline end to end using the actual staff — doctor, one SHS, one radiology staff member, one office staff member — on real hospital hardware/network, confirming each handoff is visible to the next role without any out-of-band communication.

---

## Phase 2 — Notifications & Stall Detection (Duration: ~2–3 weeks)

**Goal:** close the original gap — the doctor and office proactively catching problems instead of discovering them on the day.

Scope:
- In-app notification on marking completion, rejection, verification (P0-5)
- Stall detection background job with initial default thresholds (P0-8)
- Manual call-outcome logging (P0-9)
- Configurable stall thresholds (P1-1)

**Acceptance check:** deliberately let a test case sit past its threshold and confirm it surfaces correctly on the Doctor and Office dashboards; confirm a call log entry can be added and is visible to all relevant roles.

---

## Phase 3 — Mobile App (Duration: ~3–4 weeks)

**Goal:** feature parity for daily-use screens on Android/iOS, with real push notifications.

Scope:
- Mobile app for all four roles (P0-13)
- Push notification integration (FCM/APNs) per the data-minimal design in the TRD
- Offline queuing for simple actions (mark complete, log call) with sync on reconnect

**Acceptance check:** an SHS completes a marking entirely from their phone, on hospital wifi and then deliberately off wifi, and confirms the action syncs correctly; doctor receives a phone push notification within an acceptable delay.

---

## Phase 4 — Refinement & Pilot Rollout (Duration: ~2–4 weeks, runs alongside real usage)

**Goal:** validate the system against real department volume and iterate on the parts that were guesses (thresholds, prerequisite rules) before full rollout.

Scope:
- Overbooking prevention on chemo calendar (P1-2)
- Daily digest notification (P1-3)
- Filter/sort improvements on patient lists (P1-4)
- SHS availability toggle (P1-5)
- Exportable reports (P1-6)
- Bug fixes and UX friction points surfaced during the pilot

**Acceptance check:** the doctor and office staff can articulate that the system is now their primary source of truth for pipeline status, ahead of paper — this is a workflow adoption milestone, not just a technical one.

---

## Phase 5 — Full Department Rollout & Handover

- Expand from pilot subset to full patient volume.
- Deliver an operations handover: who at the hospital is responsible for backups, uptime monitoring, and account management going forward.
- Deliver a short training document/session for each role (see UI/UX document for screen-by-screen reference material).

---

## Suggested Sequencing Rationale

Notifications and mobile are placed *after* the core web tracking system deliberately: the actual problem statement (chemo slots wasted due to missed prerequisites) is solvable with a shared status view alone, even before push alerts exist — staff can check the dashboard proactively. Building and validating that core first, with real people, surfaces workflow assumptions (stage names, who does what, whether the state machine matches reality) that are far cheaper to fix before mobile and push notification plumbing is layered on top.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Hospital IT server provisioning takes longer than expected | Start Phase 0 infrastructure request immediately; develop against a local/dev environment in parallel so engineering isn't blocked |
| Staff resist adopting a new tool over familiar paper process | Pilot with a small patient subset first; keep the UI extremely low-friction (few taps); involve the doctor as a visible champion |
| Stage thresholds are wrong initially, causing false stall alerts or missed real ones | Make thresholds configurable (P1-1) from day one of Phase 2; expect to tune during pilot, not get it perfect upfront |
| Push notifications requiring external cloud relay raises a compliance concern | Confirmed data-minimal design (opaque ping only) in TRD; get explicit hospital sign-off on this before Phase 3, with in-app-only fallback available |
| Scope creep toward becoming a full EMR/HMS | Non-goals are explicit in the PRD; any request to add clinical data storage should trigger a new scoping conversation, not a quiet expansion |
