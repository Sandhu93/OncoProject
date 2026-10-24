# Code walkthrough guide for the team lead

Purpose: each developer explains the scaffold to the lead, live, before building on it. The aim is a lead who can answer a reviewer's question about any part of the foundation, and developers who can show they understand code they own. Do this as a conversation with the code open, not a slide show.

## How to run a session

- 60 minutes per developer, one developer at a time, screen shared, repository open.
- Start by running it: `npm run check` and `npm run test:db:embedded`. The developer says what each line of output means.
- The developer navigates; the lead picks the next file. Ask "what happens if this fails?" more than "what does this do?".
- Ask the developer to change one small thing live (see "Live change" for each) and run the tests. A person who understands the code can do this in a few minutes.
- Write down every "I don't know" in the issue tracker. An honest gap is useful; a confident wrong answer is the real risk.

## What good answers sound like

A good answer names the file, says what the code protects against, and says what a test would show if it broke. Warning signs: reading the code aloud, "it's the standard way", "the framework handles that", or being unable to find where a behavior is enforced.

## Backend developer (about 60 minutes)

| Topic                      | Open                                                                                    | Ask                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start-up and configuration | `apps/api/src/main.ts`, `config.ts`, `bootstrap.ts`                                     | What happens if `API_PORT` is `abc`? Which test proves it? Why does the start-up failure message not print the connection string?                                       |
| Deny by default            | `apps/api/src/auth/access.guard.ts`                                                     | Which routes are public and how is that marked? What does a request to a private route get today, and why is a client-sent role header never trusted?                   |
| Readiness                  | `apps/api/src/database/database.service.ts`, `apps/api/src/health/health.controller.ts` | What is the difference between live and ready? Why does readiness list every migration? What would a half-migrated database show?                                       |
| Workflow policy            | `packages/contracts/src/index.ts` (`evaluateTransition`)                                | Walk each rejection code in order. Why is the version check before the role check? Why does the API still need to reload facts from the database?                       |
| Migrations                 | `scripts/database.mjs` (`migrate`), `database/migrations/`                              | What does the advisory lock prevent? What happens if someone edits migration 001 after it was applied? How do you add a column safely?                                  |
| Database rules             | `001_initial.sql`, `002_numbering_throttle_weekly_updates.sql`                          | Pick three constraints. For each: which test fails if it is removed? Why is audit history append-only? What can a database owner still do?                              |
| Transactions               | `allocate_number`, `record_failed_login`                                                | Why are these called inside the caller's transaction? Two staff register patients at the same instant: what happens? (Answer: the second waits for the first row lock.) |
| Tests                      | `tests/database/suite.mjs`, `tests/integration/`                                        | Why does each fixture roll back? What do the API tests replace, and what do they therefore not prove?                                                                   |

Live change: add a failing check for a new rule (for example, a note length limit on a table), see it fail, then make it pass with a new migration file, never by editing an old one.

## Frontend developer (about 60 minutes)

| Topic             | Open                                                       | Ask                                                                                                                                    |
| ----------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Application shell | `apps/web/src/App.tsx`                                     | How does the page know the API is up? What are the three states and what does each show? Why abort the request after 5 seconds?        |
| Honest status     | `App.tsx` (`checkService`)                                 | What counts as "Available"? What if the API answers with the wrong service name? Why does the page say staff login is not implemented? |
| Shared types      | `packages/contracts/src/index.ts`                          | Which types will the web and the API both use? Why must the web never decide permissions itself?                                       |
| Build and proxy   | `apps/web` Vite config, `infra/nginx.conf`                 | How does `/api` reach the API in development and in the container? What security headers does the proxy add and why?                   |
| Browser tests     | `tests/e2e/shell.spec.ts`                                  | What do WEB-001 and WEB-002 check? Why are service responses controlled in the test? What would you add for a login screen?            |
| Quality gates     | `.github/workflows/ci.yml`, `eslint` and `prettier` config | What runs on every push? What does a red CI mean for merging?                                                                          |
| Roles and screens | `docs/product/rt-workflow-proposal.md`                     | For the Radiographer, list the actions and the chart stages they appear in. Which screens does that suggest?                           |

Live change: change a label on the home screen, run the browser tests, and fix whichever test now fails for the right reason.

## Both developers

- Explain the first slice end to end: login, create a chart, assign, submit, next queue, audit. Which pieces exist today and which do not?
- Explain one thing in the repository they did not write and are unsure about.
- Say which three questions for the consultant (see the [confirmation sheet](../product/consultant-confirmation-sheet.md)) block their next task.

## After the sessions

For each developer note: topics explained well, topics they could not explain, and the follow-up (pair review, reading, or a smaller task). Repeat the walkthrough briefly after the first vertical slice. If a developer cannot explain a part of the code, that part is reviewed by the other developer or the lead before it is built on.
