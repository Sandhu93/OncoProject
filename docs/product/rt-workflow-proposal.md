# Proposed RT workflow (for consultant confirmation)

Status: **PROPOSED, NOT APPROVED.** Drafted 24 October 2026 from the consultant's own description of the department process. It must not be seeded, activated or coded as a clinical protocol until the consultant confirms it. See [the confirmation sheet](consultant-confirmation-sheet.md) for the questions to take to that meeting.

Every row below is marked either **Stated** (the consultant said this) or **Assumed** (an engineering inference needed to make the workflow complete). Assumptions are the questions that matter most.

## What the consultant described

1. The doctor decides to give radiation, writes the prescription on the radiation (RT) chart and the patient is given a unique RT number.
2. The patient goes to the radiographer for a date for moulding (mask making) and a date for CT simulation (CT Sim).
3. The patient reports for the mould/mask.
4. The patient reports for CT simulation.
5. The CT images are contoured by the assigned junior resident.
6. The senior resident verifies the junior resident's contouring.
7. The consultant verifies the contoured images and approves the contouring.
8. The contoured structure set is sent to the physicist, who plans the treatment.
9. The treating doctor or consultant verifies and approves the plan.
10. The approved plan is sent to the linear accelerator (LINAC).
11. The radiographer informs the patient to come for radiation.
12. The patient reports to start treatment; the junior resident records the start of a new patient.
13. The junior resident updates the patient's status weekly. The radiographer and junior resident update the treatment status every Saturday and after treatment is complete.

## Stages (where a chart can be waiting)

Fourteen stages cover the thirteen steps: step 11 produces two states (plan waiting on the LINAC, then patient informed). Stage codes are stable identifiers; labels can change.

| Stage code                    | The chart is waiting for…                       | Step | Source  |
| ----------------------------- | ----------------------------------------------- | ---- | ------- |
| `RT_CHART_ISSUED` (initial)   | Radiographer to give mould and CT Sim dates     | 1    | Stated  |
| `SIMULATION_DATES_GIVEN`      | Patient to attend the mould appointment         | 2    | Stated  |
| `MOULD_DONE`                  | Patient to attend CT simulation                 | 3    | Stated  |
| `CT_SIM_DONE`                 | A junior resident to be assigned for contouring | 4    | Assumed |
| `CONTOURING`                  | Assigned junior resident to submit contouring   | 5    | Stated  |
| `SENIOR_VERIFICATION`         | Senior resident to verify the contouring        | 6    | Stated  |
| `CONSULTANT_CONTOUR_APPROVAL` | Consultant to approve the contouring            | 7    | Stated  |
| `PHYSICS_PLANNING`            | Physicist to build and submit the plan          | 8    | Stated  |
| `PLAN_APPROVAL`               | Consultant/treating doctor to approve the plan  | 9    | Stated  |
| `PLAN_APPROVED`               | Approved plan to be sent to the LINAC           | 10   | Stated  |
| `PLAN_ON_LINAC`               | Radiographer to inform the patient              | 11   | Stated  |
| `PATIENT_INFORMED`            | Patient to arrive and treatment to start        | 11   | Stated  |
| `TREATMENT_IN_PROGRESS`       | Weekly updates, then completion                 | 12   | Stated  |
| `TREATMENT_COMPLETED`         | Nothing: end of tracking (terminal, see D-06)   | 13   | Assumed |

## Actions (how a chart moves)

| From                          | Action                  | Actor           | Next                          | Assigned actor | Reason | Source  |
| ----------------------------- | ----------------------- | --------------- | ----------------------------- | -------------- | ------ | ------- |
| (new chart)                   | `ISSUE_RT_CHART`        | Consultant      | `RT_CHART_ISSUED`             | No             | No     | Assumed |
| `RT_CHART_ISSUED`             | `GIVE_SIMULATION_DATES` | Radiographer    | `SIMULATION_DATES_GIVEN`      | No             | No     | Stated  |
| `SIMULATION_DATES_GIVEN`      | `RECORD_MOULD_DONE`     | Radiographer    | `MOULD_DONE`                  | No             | No     | Assumed |
| `MOULD_DONE`                  | `RECORD_CT_SIM_DONE`    | Radiographer    | `CT_SIM_DONE`                 | No             | No     | Assumed |
| `CT_SIM_DONE`                 | `ASSIGN_CONTOURING`     | Consultant      | `CONTOURING`                  | No             | No     | Assumed |
| `CONTOURING`                  | `SUBMIT_CONTOURING`     | Junior resident | `SENIOR_VERIFICATION`         | Yes            | No     | Stated  |
| `SENIOR_VERIFICATION`         | `VERIFY_CONTOURING`     | Senior resident | `CONSULTANT_CONTOUR_APPROVAL` | No             | No     | Stated  |
| `SENIOR_VERIFICATION`         | `RETURN_CONTOURING`     | Senior resident | `CONTOURING`                  | No             | Yes    | Assumed |
| `CONSULTANT_CONTOUR_APPROVAL` | `APPROVE_CONTOURING`    | Consultant      | `PHYSICS_PLANNING`            | No             | No     | Stated  |
| `CONSULTANT_CONTOUR_APPROVAL` | `RETURN_CONTOURING`     | Consultant      | `CONTOURING`                  | No             | Yes    | Assumed |
| `PHYSICS_PLANNING`            | `SUBMIT_PLAN`           | Physicist       | `PLAN_APPROVAL`               | No             | No     | Stated  |
| `PLAN_APPROVAL`               | `APPROVE_PLAN`          | Consultant      | `PLAN_APPROVED`               | No             | No     | Stated  |
| `PLAN_APPROVAL`               | `RETURN_PLAN`           | Consultant      | `PHYSICS_PLANNING`            | No             | Yes    | Assumed |
| `PLAN_APPROVED`               | `SEND_PLAN_TO_LINAC`    | Physicist       | `PLAN_ON_LINAC`               | No             | No     | Assumed |
| `PLAN_ON_LINAC`               | `INFORM_PATIENT`        | Radiographer    | `PATIENT_INFORMED`            | No             | No     | Stated  |
| `PATIENT_INFORMED`            | `START_TREATMENT`       | Junior resident | `TREATMENT_IN_PROGRESS`       | No             | No     | Stated  |
| `TREATMENT_IN_PROGRESS`       | `COMPLETE_TREATMENT`    | Junior resident | `TREATMENT_COMPLETED`         | No             | No     | Assumed |

Weekly and completion status updates are **records inside `TREATMENT_IN_PROGRESS`**, not stage changes. See "Treatment updates" below.

## Prerequisites to enforce (all assumed)

- `INFORM_PATIENT` requires current approval of the contouring and of the plan, and a reserved LINAC appointment. This is the check that replaces discovering a gap on the day.
- A returned contouring invalidates the senior and consultant approvals for that revision, and any plan built on it. Whether a returned plan also invalidates contouring approval is a question for the consultant.
- Only the assigned junior resident can submit contouring.

## Treatment updates (steps 12–13)

The consultant wants these recorded after treatment starts:

- **Treatment start:** recorded once by the junior resident when treatment begins.
- **Weekly update:** the junior resident and the radiographer each post one update for every Saturday while the chart is in `TREATMENT_IN_PROGRESS`.
- **Completion update:** recorded once when treatment finishes.

Migration `002` adds `treatment_status_updates` and a `weekly_updates_due()` function so the application can list charts where a required Saturday update is missing. What an update must contain, how late is "late", and whether missed weeks stay visible are open (D-11). The database stores a short operational note only; it must not hold clinical findings.

## Not covered by what the consultant said

These need an answer before the workflow can be activated:

- Which steps can be skipped or reordered (is a mould always needed? can mould and CT happen on the same day?).
- Replanning, repeat simulation, treatment interruption and discontinuation.
- Who registers charts, who assigns the physicist, and who calls patients who miss appointments (D-02).
- How many days each stage may wait before the chart is flagged (D-07).
- Whether the "treating doctor" who approves a plan can differ from the "consultant".

None of these were guessed into the tables above except where marked **Assumed**.
