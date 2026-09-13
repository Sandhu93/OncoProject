# Technical Requirements Document (TRD)
## OncoTrack — Patient Pipeline Tracking System

**Companion to:** 01_PRD.md
**Version:** 1.0 (Draft for review)

---

## 1. Scope Recap

Web app (responsive) + mobile app (Android/iOS), on-premise hosted within the hospital network, tracking pipeline *status* only (no clinical data), for a bounded set of roles: Doctor (Admin), Senior House Surgeon, Radiology, Office/Front Desk.

---

## 2. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Scale** | Design for hundreds of concurrent active patients and dozens of concurrent staff users. This is a low-traffic, high-importance system, not a high-throughput one — architecture should favor simplicity and reliability over horizontal scalability. |
| **Availability** | Target 99%+ uptime during hospital working hours. A short outage is tolerable (staff fall back to phone/paper); prolonged data loss is not. Daily automated backups are mandatory. |
| **Latency** | Stage updates and notifications should be reflected for other users within seconds to low minutes — this is not a real-time trading system, near-real-time is sufficient. |
| **Data residency** | All patient-identifiable data must remain within the hospital's on-premise infrastructure at all times. No patient data is stored on or transits through third-party cloud services. |
| **Security** | Role-based access control (RBAC) enforced server-side on every request. Hospital-issued credentials (not self-signup). Encrypted transport (HTTPS/TLS) even on the internal network. Encrypted at rest for the database. |
| **Compliance posture** | Treat data as sensitive health-adjacent information under India's Digital Personal Data Protection Act (DPDP) 2023, even though no diagnosis/clinical detail is stored — patient name, contact number, and treatment-stage linkage is itself sensitive. Minimize what's collected; store only what the P0 requirements need. |
| **Offline tolerance** | Hospital wifi/network can be unreliable on wards. Mobile app should gracefully queue simple actions (e.g., "mark complete") and sync when connectivity returns, rather than fail silently. |
| **Auditability** | Every stage transition and action is immutably logged (append-only audit log) with actor, role, timestamp, and previous/new state. |

---

## 3. Architecture Overview

### 3.1 High-level component diagram (described)

```
┌─────────────────────────────────────────────────────────────┐
│                     HOSPITAL NETWORK (on-prem)                │
│                                                                 │
│  ┌───────────────┐        ┌────────────────────┐             │
│  │  Web App       │───────▶│                    │             │
│  │  (React, HTTPS)│        │   Backend API      │             │
│  └───────────────┘        │   (REST, on-prem    │             │
│                             │    application       │             │
│  ┌───────────────┐        │    server)           │             │
│  │ Mobile App     │───────▶│                    │◀────┐       │
│  │ (Android/iOS)  │        └─────────┬──────────┘     │       │
│  └───────────────┘                  │                 │       │
│         │                            ▼                 │       │
│         │                   ┌────────────────┐        │       │
│         │                   │  PostgreSQL DB   │        │       │
│         │                   │  (on-prem)       │        │       │
│         │                   └────────────────┘        │       │
│         │                            │                 │       │
│         │                            ▼                 │       │
│         │                   ┌────────────────┐        │       │
│         │                   │ Nightly Backup  │        │       │
│         │                   │  (local + off-  │        │       │
│         │                   │   site encrypted)│        │       │
│         │                   └────────────────┘        │       │
└─────────┼───────────────────────────────────────────────┼─────┘
          │                                                 │
          │  (token only, no patient data)                 │
          ▼                                                 │
┌───────────────────────┐                                  │
│  FCM / APNs            │  (external — required for        │
│  (push notification    │   mobile push; carries only      │
│   relay, cloud)         │   "you have an update" ping) ────┘
└───────────────────────┘
```

**Key architectural decision, flagged per PRD Open Questions:** true mobile push notifications require Firebase Cloud Messaging (Android) and Apple Push Notification service (iOS), both of which are external cloud relays — this is unavoidable for native push on either platform. The design keeps this relay data-minimal: it carries only an opaque "you have a pending update, open the app" trigger with no patient name, ID, or status content. All actual data is fetched by the app directly from the on-premise backend over the hospital network/VPN after the ping. If the hospital's policy requires *zero* external network calls, the fallback is in-app-only notifications (visible when the app is open) plus a periodic auto-refresh, at the cost of true "phone buzzes in your pocket" alerting. This trade-off should be confirmed with hospital IT/administration before build.

### 3.2 Stack recommendation

| Layer | Choice | Rationale |
|---|---|---|
| Backend | Node.js (NestJS) or Python (FastAPI) REST API | Either is a solid, well-supported choice for a small-team, on-prem CRUD-and-workflow system; pick based on team familiarity. FastAPI recommended if the team leans Python for future AI/reporting features. |
| Database | PostgreSQL | Relational integrity matters here (patients, stages, assignments, audit logs are all relationally linked); strong on-prem track record; good backup tooling. |
| Web frontend | React (responsive, works on desktop and mobile browser) | Single codebase reused for shared components with mobile where feasible (e.g., React Native for mobile shares logic/patterns). |
| Mobile frontend | React Native (Android + iOS from one codebase) | Matches "both mobile and web" requirement without doubling engineering effort; native modules only where push notification handling requires it. |
| Push relay | Firebase Cloud Messaging (Android) + APNs via Firebase (iOS) | Industry-standard, minimal-data-only relay as described above. |
| Reverse proxy / TLS | Nginx with an internally-issued or hospital-IT-issued TLS certificate | Encrypts traffic even within the internal network. |
| Backup | pg_dump nightly to local encrypted storage + rotated off-site/offline copy | Protects against server hardware failure, not just software bugs. |
| Deployment | Docker Compose on a single on-prem server (or two for redundancy if budget allows) | Keeps ops simple for a system this size; avoids over-engineering with Kubernetes for a single-department tool. |

### 3.3 Why not a bigger/cloud-native stack?

This system serves one department with a bounded, predictable user count. A large distributed architecture would add operational burden (someone in the hospital has to maintain it) without a corresponding benefit. The stack above is deliberately conventional and low-maintenance, which matters more here than raw scalability headroom.

---

## 4. Core Domain Model (see 06_Backend_Schema.md for full DDL)

Entities: `Patient`, `PipelineStage` (reference table), `PatientStageHistory` (audit trail), `StaffUser`, `Role`, `Assignment` (SHS ↔ Patient), `ChemoSlot`, `CallLog`, `Notification`.

---

## 5. API Design (representative endpoints)

RESTful, JSON, versioned under `/api/v1/`. All endpoints require an authenticated session (bearer token) and are authorized per role server-side.

| Method | Endpoint | Purpose | Roles allowed |
|---|---|---|---|
| POST | `/api/v1/patients` | Register new patient, generate Patient ID | Doctor, Office |
| GET | `/api/v1/patients/{patientId}` | Get patient current status + history | All roles |
| GET | `/api/v1/patients?stage=&assignedTo=&stalled=true` | Filtered patient list for dashboards | All roles (results scoped to role) |
| PATCH | `/api/v1/patients/{patientId}/stage` | Advance/change pipeline stage | Role-dependent (enforced server-side per stage transition) |
| POST | `/api/v1/patients/{patientId}/assign-shs` | Assign an SHS for marking | Doctor |
| POST | `/api/v1/patients/{patientId}/marking` | SHS submits marking complete | SHS (only if assigned to them) |
| POST | `/api/v1/patients/{patientId}/verify` | Doctor approves/rejects marking | Doctor |
| POST | `/api/v1/patients/{patientId}/chemo-slot` | Propose/confirm chemo date; server validates prerequisites and returns warning list if incomplete | Office, Doctor |
| POST | `/api/v1/patients/{patientId}/call-log` | Log a manual call outcome | Office, SHS, Radiology |
| GET | `/api/v1/dashboard/stalled` | List of currently stalled patients | Doctor, Office |
| GET | `/api/v1/staff/{staffId}/queue` | A staff member's assigned queue | Self / Doctor |
| GET | `/api/v1/patients/{patientId}/audit` | Full audit trail for a patient | Doctor |

**Stage transition validation:** the `PATCH .../stage` endpoint is the single gate all stage changes pass through. It looks up the current stage, validates that the requested transition is legal (per the state machine in the Workflow document) and that the requesting role is permitted to make that specific transition, and rejects otherwise with a clear error. This centralizes the workflow logic in one place instead of scattering business rules across the frontend.

---

## 6. Notification Logic

| Trigger event | Who is notified | Channel |
|---|---|---|
| SHS completes marking | Doctor | In-app push |
| Doctor rejects marking | Assigned SHS | In-app push |
| Doctor verifies marking | Office (chemo scheduling can proceed) | In-app push |
| Patient enters "stalled" state (no progress past configured threshold for current stage) | Doctor, Office | In-app push |
| Chemo date within N days but prerequisites incomplete | Doctor, Office | In-app push |
| SHS assigned a new patient | That SHS | In-app push |

Stall-detection runs as a scheduled backend job (e.g., every 30–60 minutes) that scans `PatientStageHistory` for patients whose time-in-current-stage exceeds the configured threshold for that stage, and raises a notification once per stall event (not repeatedly every run).

---

## 7. Security & Access Control

- **Authentication:** hospital-issued username/password (or integrate with hospital's existing staff directory/AD if one exists — open question for hospital IT) with hashed+salted password storage (bcrypt/argon2) if self-managed.
- **Authorization:** RBAC with four roles (Doctor/Admin, SHS, Radiology, Office). Admin can additionally manage staff accounts and configure stall thresholds.
- **Session management:** short-lived JWT or server-side session tokens, with reasonable expiry and re-auth for mobile after prolonged inactivity.
- **Transport security:** HTTPS enforced everywhere, including internal hospital network traffic.
- **Data minimization:** patient record stores only what's needed for tracking (name, contact number, Patient ID, stage data) — no diagnosis, imaging, or lab values, per PRD non-goals.
- **Audit log immutability:** audit entries are insert-only; no update/delete path exposed via the API, even to Admin, to preserve trustworthy history.

---

## 8. Deployment & Operations

- Single on-premise server (physical or hospital-provided VM) running Docker Compose: backend API container, PostgreSQL container, Nginx reverse proxy container.
- Recommend hospital IT designate a named responsible person for server uptime/patching, or contract this out — a system tracking active cancer treatment scheduling should not go unmaintained.
- Nightly automated database backup, retained for a rolling 30/90-day window (to be finalized with hospital data retention policy), with periodic restore testing.
- Basic uptime monitoring (even a simple health-check ping with email/SMS alert to a designated technical contact) recommended so an outage is noticed quickly rather than discovered when staff can't log in.

---

## 9. What This TRD Deliberately Does Not Cover

- Detailed infrastructure sizing (CPU/RAM/disk) — depends on answers to PRD Open Questions on expected patient/staff volume; to be finalized once those are answered.
- Integration specifications for PACS/RIS or an existing EMR — explicitly P2/future scope per PRD.
- Detailed CI/CD pipeline design — can be added once team tooling preferences (GitHub, etc.) are confirmed.
