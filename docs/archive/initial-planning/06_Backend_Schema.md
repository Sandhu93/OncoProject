# Backend Schema Document
## OncoTrack — Patient Pipeline Tracking System

**Companion to:** 02_TRD.md, 03_App_Workflow.md
**Target:** PostgreSQL 15+

---

## 1. Entity Overview

| Table | Purpose |
|---|---|
| `roles` | The four fixed roles (Doctor/Admin, SHS, Radiology, Office) |
| `staff_users` | Hospital staff accounts |
| `patients` | Core patient record (non-clinical identifying + tracking data only) |
| `pipeline_stages` | Reference table of the fixed stage list, with default expected-duration thresholds |
| `patient_stage_history` | Append-only audit trail of every stage transition |
| `assignments` | SHS ↔ patient marking assignment |
| `chemo_slots` | Booking calendar entries |
| `call_logs` | Manual call outcome records |
| `notifications` | In-app/push notification records |
| `stage_thresholds` | Configurable per-stage stall thresholds (P1-1, but modeled from day one) |

---

## 2. DDL

```sql
-- ============================================================
-- Roles & Staff
-- ============================================================

CREATE TABLE roles (
    role_id         SMALLINT PRIMARY KEY,
    role_name       VARCHAR(30) NOT NULL UNIQUE  -- 'DOCTOR_ADMIN', 'SHS', 'RADIOLOGY', 'OFFICE'
);

INSERT INTO roles (role_id, role_name) VALUES
    (1, 'DOCTOR_ADMIN'),
    (2, 'SHS'),
    (3, 'RADIOLOGY'),
    (4, 'OFFICE');

CREATE TABLE staff_users (
    staff_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(120) NOT NULL,
    username        VARCHAR(60) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role_id         SMALLINT NOT NULL REFERENCES roles(role_id),
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,   -- used for SHS assignment (P1-5)
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,   -- deactivate instead of delete
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_role ON staff_users(role_id) WHERE is_active = TRUE;

-- ============================================================
-- Pipeline Stage Reference Data
-- ============================================================

CREATE TABLE pipeline_stages (
    stage_id            SMALLINT PRIMARY KEY,
    stage_code          VARCHAR(40) NOT NULL UNIQUE,
    stage_label         VARCHAR(80) NOT NULL,          -- display label
    sequence_order      SMALLINT NOT NULL,               -- for ordering in UI
    default_threshold_days SMALLINT                        -- default "too long" window
);

INSERT INTO pipeline_stages (stage_id, stage_code, stage_label, sequence_order, default_threshold_days) VALUES
    (1,  'REGISTERED',                'Registered',                     1, 2),
    (2,  'TESTS_BOOKED',               'Tests Booked',                   2, 5),
    (3,  'MRI_DONE',                   'MRI Done',                       3, 2),
    (4,  'MARKING_ASSIGNED',           'Marking Assigned',               4, 2),
    (5,  'MARKING_PENDING',            'Marking Pending',                5, 3),
    (6,  'VERIFICATION_PENDING',       'Verification Pending',           6, 2),
    (7,  'MARKING_REJECTED',           'Marking Rejected',               7, 2),
    (8,  'VERIFIED',                   'Verified',                       8, 1),
    (9,  'ADDITIONAL_TESTS_ASSIGNED',  'Additional Tests Assigned',      9, 3),
    (10, 'TESTS_IN_PROGRESS',          'Tests In Progress',             10, 7),
    (11, 'TESTS_COMPLETE',             'Tests Complete',                11, 2),
    (12, 'CHEMO_SCHEDULED',            'Chemo Scheduled',               12, NULL), -- threshold not duration-based; handled via date proximity
    (13, 'CHEMO_COMPLETED',            'Chemo Completed',               13, NULL);

-- Per-department-configurable override of default thresholds (P1-1)
CREATE TABLE stage_thresholds (
    stage_id            SMALLINT PRIMARY KEY REFERENCES pipeline_stages(stage_id),
    threshold_days       SMALLINT NOT NULL,
    updated_by           UUID REFERENCES staff_users(staff_id),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Patients
-- ============================================================

CREATE TABLE patients (
    patient_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id          VARCHAR(20) NOT NULL UNIQUE,   -- human-readable, e.g. ONC-2026-0042
    full_name           VARCHAR(120) NOT NULL,
    contact_number       VARCHAR(20) NOT NULL,
    age                  SMALLINT,
    sex                  VARCHAR(10),
    registered_by         UUID NOT NULL REFERENCES staff_users(staff_id),
    consulting_doctor_id  UUID NOT NULL REFERENCES staff_users(staff_id),
    current_stage_id      SMALLINT NOT NULL REFERENCES pipeline_stages(stage_id),
    current_stage_since   TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_stalled            BOOLEAN NOT NULL DEFAULT FALSE,
    stalled_since          TIMESTAMPTZ,
    is_active              BOOLEAN NOT NULL DEFAULT TRUE,   -- soft-close completed/discontinued cases
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patients_stage ON patients(current_stage_id) WHERE is_active = TRUE;
CREATE INDEX idx_patients_stalled ON patients(is_stalled) WHERE is_stalled = TRUE;
CREATE INDEX idx_patients_display_id ON patients(display_id);

-- ============================================================
-- Stage History (append-only audit trail)
-- ============================================================

CREATE TABLE patient_stage_history (
    history_id       BIGSERIAL PRIMARY KEY,
    patient_id        UUID NOT NULL REFERENCES patients(patient_id),
    from_stage_id      SMALLINT REFERENCES pipeline_stages(stage_id),  -- NULL for initial registration
    to_stage_id         SMALLINT NOT NULL REFERENCES pipeline_stages(stage_id),
    changed_by           UUID NOT NULL REFERENCES staff_users(staff_id),
    change_note           TEXT,                    -- e.g., doctor's rejection reason
    changed_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stage_history_patient ON patient_stage_history(patient_id, changed_at);

-- ============================================================
-- Assignments (SHS marking assignment)
-- ============================================================

CREATE TABLE assignments (
    assignment_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID NOT NULL REFERENCES patients(patient_id),
    assigned_shs_id       UUID NOT NULL REFERENCES staff_users(staff_id),
    assigned_by            UUID NOT NULL REFERENCES staff_users(staff_id),
    assigned_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at              TIMESTAMPTZ,
    completion_note            TEXT,
    status                       VARCHAR(20) NOT NULL DEFAULT 'PENDING'  -- PENDING, SUBMITTED, REJECTED, APPROVED
);

CREATE INDEX idx_assignments_shs ON assignments(assigned_shs_id, status);
CREATE INDEX idx_assignments_patient ON assignments(patient_id);

-- ============================================================
-- Chemo Slots (booking calendar)
-- ============================================================

CREATE TABLE chemo_slots (
    slot_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id           UUID NOT NULL REFERENCES patients(patient_id),
    scheduled_date         DATE NOT NULL,
    scheduled_time_slot      VARCHAR(20),          -- e.g. '09:00-10:00', simple slot label
    booked_by                 UUID NOT NULL REFERENCES staff_users(staff_id),
    prerequisites_met_at_booking BOOLEAN NOT NULL,
    override_reason              TEXT,             -- filled if booked despite a warning
    status                         VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED, COMPLETED, MISSED, CANCELLED
    created_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chemo_slots_date ON chemo_slots(scheduled_date);
CREATE INDEX idx_chemo_slots_patient ON chemo_slots(patient_id);

-- ============================================================
-- Call Logs
-- ============================================================

CREATE TABLE call_logs (
    call_log_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID NOT NULL REFERENCES patients(patient_id),
    logged_by             UUID NOT NULL REFERENCES staff_users(staff_id),
    call_outcome            VARCHAR(20) NOT NULL,  -- REACHED, NO_ANSWER, RESCHEDULED, DECLINED
    note                       TEXT,
    logged_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_logs_patient ON call_logs(patient_id, logged_at);

-- ============================================================
-- Notifications
-- ============================================================

CREATE TABLE notifications (
    notification_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_staff_id     UUID NOT NULL REFERENCES staff_users(staff_id),
    patient_id               UUID REFERENCES patients(patient_id),
    notification_type          VARCHAR(40) NOT NULL,  -- MARKING_SUBMITTED, MARKING_REJECTED, VERIFIED, STALLED, ASSIGNMENT, PREREQ_WARNING
    message                       TEXT NOT NULL,
    is_read                         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at                             TIMESTAMPTZ
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_staff_id, is_read);
```

---

## 3. Key Design Notes

- **`display_id` vs `patient_id`:** the internal UUID (`patient_id`) is never shown to staff; the human-readable `display_id` (e.g., `ONC-2026-0042`) is what's printed, searched, and spoken aloud. This separation avoids exposing internal identifiers while keeping a clean, collision-proof primary key.
- **No clinical fields anywhere in this schema**, deliberately — enforces the PRD non-goal at the data layer, not just the UI layer. Anyone extending this system later will hit the schema as a natural boundary before accidentally starting to store diagnosis or imaging data.
- **`patient_stage_history` is append-only** at the application layer (no UPDATE/DELETE exposed via the API per TRD Section 7) even though PostgreSQL itself doesn't enforce immutability natively; if stronger guarantees are wanted later, this can be enforced with a `REVOKE UPDATE, DELETE` at the database role level for the application's DB user.
- **`is_stalled` is a denormalized flag** on `patients`, recomputed by the scheduled stall-detection job (TRD Section 6) rather than calculated on every read — keeps dashboard queries fast (`WHERE is_stalled = TRUE` is a simple indexed lookup) at the cost of the flag being at most one job-interval stale, which is acceptable for this use case.
- **`chemo_slots.prerequisites_met_at_booking`** captures a point-in-time snapshot of whether prerequisites were satisfied when the slot was booked, plus an optional `override_reason` if a doctor chose to book anyway despite a warning (per the hard-block-vs-soft-warning decision flagged as an open question in the PRD) — this preserves an honest audit trail of overrides rather than silently allowing them.
- **Soft deletes throughout** (`is_active` on `staff_users` and `patients`) rather than hard deletes, to preserve historical integrity of the audit trail and any past patient records.

---

## 4. Sample Query Patterns

**Doctor's "Needs Attention" summary:**
```sql
SELECT p.display_id, p.full_name, ps.stage_label, p.current_stage_since, p.is_stalled
FROM patients p
JOIN pipeline_stages ps ON ps.stage_id = p.current_stage_id
WHERE p.is_active = TRUE
  AND (p.is_stalled = TRUE
       OR p.current_stage_id = 6  -- Verification Pending
       OR (p.current_stage_id = 3 AND NOT EXISTS (
             SELECT 1 FROM assignments a WHERE a.patient_id = p.patient_id AND a.status IN ('PENDING','SUBMITTED')
           )))
ORDER BY p.is_stalled DESC, p.current_stage_since ASC;
```

**SHS's queue:**
```sql
SELECT p.display_id, p.full_name, a.assigned_at, a.status
FROM assignments a
JOIN patients p ON p.patient_id = a.patient_id
WHERE a.assigned_shs_id = :staff_id
  AND a.status IN ('PENDING', 'REJECTED')
ORDER BY a.assigned_at ASC;
```

**Stall-detection scan (run by scheduled job):**
```sql
SELECT p.patient_id, p.current_stage_id, p.current_stage_since,
       COALESCE(st.threshold_days, ps.default_threshold_days) AS threshold_days
FROM patients p
JOIN pipeline_stages ps ON ps.stage_id = p.current_stage_id
LEFT JOIN stage_thresholds st ON st.stage_id = p.current_stage_id
WHERE p.is_active = TRUE
  AND p.is_stalled = FALSE
  AND ps.default_threshold_days IS NOT NULL
  AND now() - p.current_stage_since > (COALESCE(st.threshold_days, ps.default_threshold_days) || ' days')::interval;
```
