# MVP audit and plan (28 November 2026)

This audit separates what the application really does from what it does not do yet. "Done" means it works end to end and has automated tests against the real API and database. It was written after a hands-on trial found the app felt like a demo.

## Why the trial felt like a demo

1. **Only the consultant could do anything.** `npm run staff:create-test` made three accounts (consultant, junior resident, physicist). The first stage after a chart is issued belongs to the **radiographer**, and there was no radiographer account, so the chart stopped there. Fixed: the command now makes six accounts, one for each part of the workflow (consultant, radiographer, two junior residents, senior resident, physicist).
2. **Nothing tells anyone that a chart is waiting.** A person only finds out by signing in and looking at their own list. The system records an event for each handoff, but nothing reads those events. There are no notifications.
3. **No conversation.** There is no way to leave a comment or ask a question on a chart. The only free text is the reason when a chart is sent back and a few notes on steps.
4. **The consultant cannot step in.** Each step belongs to one role. The consultant cannot reassign a resident, skip or correct a step, put a chart on hold or reopen it.

## What exists today

| Area                                                  | State        | Notes                                                                                                                                                                                  |
| ----------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login, sessions, lockout, roles                       | Done         | Accounts are created only from the command line                                                                                                                                        |
| Issue an RT chart (RT number, sessions, urgent)       | Done         | Duplicate and numbering rules, idempotent                                                                                                                                              |
| 15-stage workflow, 18 steps, 5 roles                  | Done         | Forms, rules, send-back with reason, assignment, LINAC clash check, readiness checks, weekly updates, closing. Needs the proposed workflow activated (`npm run workflow:activate-dev`) |
| Handoff between roles                                 | Done, silent | The chart moves to the next role when a step is done; the next person sees it in their list only if they look                                                                          |
| Review loop (verify, approve, send back)              | Partial      | Senior verifies, consultant approves, either can send back with a reason. No comments, no link to the contour or plan itself                                                           |
| "Needs you" queue, overview, stalled flag             | Done         | Refreshes only when the page is opened                                                                                                                                                 |
| Chart history with who, when and what                 | Done         | Audit and outbox rows are written                                                                                                                                                      |
| Notifications                                         | Missing      |                                                                                                                                                                                        |
| Comments and discussion                               | Done (M12)   |                                                                                                                                                                                        |
| Consultant controls (reassign, hold, reopen, correct) | Missing      |                                                                                                                                                                                        |
| Calendar of appointments                              | Missing      | In the prototype                                                                                                                                                                       |
| Saturday updates page, stage map                      | Missing      | In the prototype; the updates themselves work on each chart                                                                                                                            |
| Staff management screen                               | Missing      | Command line only                                                                                                                                                                      |
| Audit viewer, reports, export                         | Missing      | Data is recorded, nothing displays it                                                                                                                                                  |
| Clash checks for mould and CT Sim slots               | Missing      | Only the first LINAC slot is checked                                                                                                                                                   |
| Mobile, deployment, backups, TLS                      | Missing      |                                                                                                                                                                                        |

## Plan

Order is by how much each makes it a tool people use rather than a form.

| #   | Milestone                     | What it adds                                                                                                                                                                                                                                                                 |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M11 | Notifications                 | An inbox and unread count in the header. A person is notified when a chart reaches them, is sent back to them (with the reason), is assigned to them, is stalled, or a Saturday update is due. The queue refreshes by itself. Email or SMS later, if the hospital allows it. |
| M12 | Comments and handoff notes    | A comment thread on each chart, a short message when passing a chart on ("contours ready, check the brain stem"), mentions of a role or person that notify them, and read marks.                                                                                             |
| M13 | Consultant controls           | Reassign a resident, put a chart on hold or cancel it, reopen a finished chart, correct a wrong entry with a reason (the old value stays in the history).                                                                                                                    |
| M14 | Prototype views still missing | Appointment calendar, Saturday-updates page and stage map by phase: built. Slot clash checks for mould and CT Sim: not built, because how many patients the mould room and CT can take at once is a question for the department.                                             |
| M15 | Administration                | Create and deactivate staff and set roles in the app, view the workflow, search the audit trail.                                                                                                                                                                             |
| M16 | Reports                       | Waiting times by stage, stalled charts, treatment completion, export to a spreadsheet.                                                                                                                                                                                       |
| M17 | Hardening and pilot           | Deployment on the hospital server, TLS, backups and restore test, training, a supervised pilot with real charts (RT numbers only).                                                                                                                                           |

M11 to M13 come first. After them, a chart can be passed on, discussed, corrected and seen by the right person without anyone having to look.

## Decisions needed

- **Notification channel:** in the app only, or also email or SMS? Hospital IT policy decides.
- **Who may override:** consultant only (decided). Built in M13: reassign the contouring resident, return to an earlier stage (before treatment starts), discontinue and reopen. Not built: reopening a chart whose tracking has ended, and correcting one recorded value in place (a chart is returned to the stage and the step done again).
- **Confirm the workflow** (D-01, D-03, D-06, D-07), still waiting on the consultant.
