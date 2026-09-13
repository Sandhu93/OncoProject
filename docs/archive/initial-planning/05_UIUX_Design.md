# UI/UX Design Document
## OncoTrack — Patient Pipeline Tracking System

**Companion to:** 01_PRD.md, 03_App_Workflow.md

---

## 1. Design Principles

1. **Fewer taps over more features.** Staff are using this between patients, on wards, in a hurry. Every core action (mark complete, log a call, change a stage) should be reachable in 2 taps or fewer from the dashboard.
2. **Status at a glance, before status in detail.** Color and grouping should communicate "is anything wrong right now" before the user reads a single word.
3. **Never let a user wonder "did that save?"** Every action gets immediate, unambiguous confirmation.
4. **Same mental model on web and mobile.** Screens don't need to look identical, but the grouping, color coding, and terminology must be identical so staff aren't relearning the tool switching devices.
5. **No clinical jargon overload.** This is a workflow tool, not a chart — keep labels in plain operational language ("Needs your review," not "Pending adjudication").

---

## 2. Color & Status Language (used consistently across all screens)

| Color | Meaning |
|---|---|
| Green | On track / complete / prerequisites met |
| Amber/Yellow | Pending action, within expected time window |
| Red | Stalled — past expected time window, needs attention |
| Grey | Not yet started / not applicable |

---

## 3. Screen-by-Screen Reference

### 3.1 Login Screen (Web & Mobile)
- Hospital-issued username + password.
- No self-signup — accounts provisioned by Admin (Doctor).
- On successful login, route directly to the role-appropriate dashboard (no generic landing page).

### 3.2 Doctor Dashboard (Admin Home)
Layout (web: multi-column; mobile: stacked, scrollable):
- **Top strip — "Needs Attention" summary:** count of stalled patients, count of verifications pending, count of unassigned MRI-done cases. Tapping any count jumps straight to that filtered list.
- **Stalled Patients list:** Patient ID, name, current stage, days stalled (in red), one-tap "Call Now" (opens phone dialer) and "Log Outcome" shortcut.
- **Verification Queue:** patients with markings awaiting doctor review; tap to open a review screen (Approve / Reject with note).
- **Unassigned MRI-Done Queue:** patients ready for SHS assignment; tap to open assignment screen (list of SHS with availability toggle state visible).
- **Full Patient List (secondary tab):** every active patient, filterable by stage, searchable by Patient ID or name, sortable by days-in-stage.
- **Patient Detail view (drill-down from any list):** stage timeline (visual, top to bottom or left to right), current stage, assigned staff, full audit history, call log history.

### 3.3 SHS "My Queue" (Web & Mobile)
- Simple list: Patient ID, name, date assigned, days pending.
- Tap a patient → Patient Detail (read-only history) + a single prominent **"Mark Complete"** button + optional short note field.
- If rejected by doctor, the patient reappears at the top of the queue with the doctor's note visible inline (not buried in history) so the SHS immediately sees what to fix.
- Availability toggle (P1) visible at the top of the screen: "Available for new assignments: On/Off."

### 3.4 Radiology "Tests Due" (Web & Mobile)
- List grouped by today / this week, similar to SHS queue.
- Each patient row shows a compact prerequisite checklist (small icons: consultation ✓, tests booked ✓, MRI ✓/pending) so radiology staff can see readiness without opening the full detail view.
- Two primary actions per patient: **"Mark MRI Done"** and **"Mark Tests Complete,"** shown contextually based on current stage.
- "No-show" action available to flag a missed appointment, feeding directly into stall detection.

### 3.5 Office / Front Desk Dashboard
- **"Needs Attention" combined list:** stalled patients + patients with an upcoming chemo date and incomplete prerequisites, sorted by urgency (soonest chemo date with a problem, first).
- Each row: **"Call Now"** (opens dialer) + **"Log Outcome"** (reached / no answer / rescheduled / declined, plus free-text note).
- **Booking Calendar view:** week/day grid of chemo slots. Each slot color-coded (green/yellow/red per prerequisite status). Attempting to confirm a red slot triggers a clear warning dialog listing exactly which prerequisite steps are missing, before allowing (or blocking, per the hard-block/soft-warning decision in PRD Open Questions) confirmation.

### 3.6 Patient Registration (Doctor / Office)
- Minimal required fields: name, contact number, age/sex if needed operationally, consulting doctor.
- Deliberately excludes any diagnosis or clinical detail field, per PRD non-goals — this is enforced by the form itself, not just policy.
- On save: Patient ID is generated and displayed prominently, with an option to print/display it for the patient's physical file.

### 3.7 Notifications
- **Mobile:** native push notification, tapping it deep-links directly to the relevant patient or queue.
- **Web:** in-app notification bell/badge with a dropdown list; browser tab title badge count optional nice-to-have.
- Notifications are actionable, not just informational, where possible — e.g., a "verification needed" notification opens directly to the Approve/Reject screen rather than a generic dashboard.

---

## 4. Navigation Structure

**Doctor (most roles):** Dashboard → Needs Attention / Verification Queue / Assignment Queue / Full Patient List → Patient Detail
**SHS:** My Queue → Patient Detail (read + Mark Complete)
**Radiology:** Tests Due → Patient Detail (contextual actions)
**Office:** Needs Attention / Booking Calendar → Patient Detail / Call Log

Bottom tab bar on mobile (per role, only relevant tabs shown); left sidebar on web.

---

## 5. Accessibility & Usability Notes

- Large, high-contrast tap targets — this will be used by clinicians who may be gloved, tired, or moving between wards.
- Avoid relying on color alone for status (per general accessibility good practice) — pair color with a short text label (e.g., a red badge also says "Stalled — 6 days").
- Support both English and Malayalam labels if the department requests it (flagged as a design decision to confirm — language of the interface, not patient data, since no patient-facing content exists in v1).
- Confirmation dialogs for any destructive or hard-to-reverse action (e.g., rejecting a marking, confirming a chemo date despite warnings).

---

## 6. Open Design Questions

| Question | Notes |
|---|---|
| Should the interface support Malayalam, English, or both? | To be confirmed with department staff during Phase 1 |
| Exact required fields at patient registration (beyond what's listed) — does the hospital want a photo, ward number, referring physician, etc.? | To confirm with doctor/office during Phase 0–1 |
| Should SHS availability be a manual toggle or tied to a duty roster the doctor already maintains? | Manual toggle proposed for v1 simplicity; revisit if roster data exists digitally elsewhere |
