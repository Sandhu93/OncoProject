# Re-baselined schedule (24 October 2026)

Status: planning estimate, not a commitment. It replaces the elapsed-time view in the [original assessment](project-assessment.md#7-delivery-sequence-and-exit-gates); phase content and exit gates there are unchanged.

## Where the project stands

Six weeks have passed since the foundation was created on 13 September 2026. The foundation is real (database schema, CI, API and web shells, 18 database checks), but most of the first-phase list is still open, and no commit has been made since 16 September. Requirements are not closed: the 13 steps from the consultant are written down as a [proposal](../product/rt-workflow-proposal.md) that the consultant has not yet confirmed.

| Original phase          | Planned   | State on 24 October                                                                                 |
| ----------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| 0. Resolve requirements | 1–2 weeks | Open. Stage list drafted; consultant confirmation outstanding (D-01 to D-06, D-11).                 |
| 1. Foundation           | 2 weeks   | About half done: schema, migrations, CI, shells. Missing: login, roles, API contract, mobile spike. |
| 2 to 7                  | 14–18 wks | Not started.                                                                                        |

## Assumptions

- One backend developer and one frontend developer working full time, plus the lead, as in the original estimate. If the developers are part time, multiply the durations by the same factor.
- The consultant answers the [confirmation sheet](../product/consultant-confirmation-sheet.md) by **Friday 6 November 2026**. This date is an assumption, not an appointment. Phase 1 restarts on Monday 9 November.
- Hospital IT answers hosting, network and sign-in questions (D-08, D-09) while Phase 1 runs.
- Holidays, festival closures, examinations and leave are not modelled.

## Dates if sign-off lands on 6 November

Computed from the phase durations in the assessment, with the remaining Foundation work cut to 1–2 weeks. Each cell is the earliest and latest date, assuming phases do not overlap.

| Phase                                                | Duration  | Starts (early / late)     | Ends (early / late)       |
| ---------------------------------------------------- | --------- | ------------------------- | ------------------------- |
| 1. Foundation (login, roles, contract, mobile spike) | 1–2 weeks | 9 Nov 2026 / 9 Nov 2026   | 13 Nov 2026 / 20 Nov 2026 |
| 2. First complete handoff                            | 2 weeks   | 16 Nov 2026 / 23 Nov 2026 | 27 Nov 2026 / 4 Dec 2026  |
| 3. Full review workflow                              | 3 weeks   | 30 Nov 2026 / 7 Dec 2026  | 18 Dec 2026 / 25 Dec 2026 |
| 4. Scheduling and escalation                         | 2 weeks   | 21 Dec 2026 / 28 Dec 2026 | 1 Jan 2027 / 8 Jan 2027   |
| 5. Mobile and operational features                   | 3–4 weeks | 4 Jan 2027 / 11 Jan 2027  | 22 Jan 2027 / 5 Feb 2027  |
| 6. Release hardening                                 | 2–3 weeks | 25 Jan 2027 / 8 Feb 2027  | 5 Feb 2027 / 26 Feb 2027  |
| 7. Controlled pilot                                  | 3–4 weeks | 8 Feb 2027 / 1 Mar 2027   | 26 Feb 2027 / 26 Mar 2027 |

Total from 9 November: 16–20 weeks. Pilot ends between **26 February and 26 March 2027**. Phases 3 and 4 fall over Christmas and New Year, so expect the late column.

## If sign-off slips

Every week of delay moves every later date by a week, except the work in the next section.

| Sign-off date | Pilot ends (early / late) |
| ------------- | ------------------------- |
| 6 Nov 2026    | 26 Feb 2027 / 26 Mar 2027 |
| 20 Nov 2026   | 12 Mar 2027 / 9 Apr 2027  |
| 4 Dec 2026    | 26 Mar 2027 / 23 Apr 2027 |

## Work that does not wait for the consultant

These can start now and protect the schedule: login and account provisioning (AUTH-01, AUTH-02, using the login throttle in migration 002), least-privilege database roles and staging (OPS-01), the hospital IT decisions (START-02), the Android and iOS build and signing spike (iOS signing and distribution are the usual long-lead item), and the code walkthroughs in [the walkthrough guide](../development/code-walkthrough.md). Registration (REG-01) needs only the RT number format, not the stage list.

## Critical path

1. Consultant confirms the stage list, who does each step and the weekly update rules.
2. Phase 3 workflow and rejection routes are built on that list.
3. Hospital IT provides a staging server before Phase 2 ends.

## Re-estimate

Re-estimate after the first two delivery iterations, as the assessment says. Replace the durations in this file with measured velocity and keep the original table in Git history.
