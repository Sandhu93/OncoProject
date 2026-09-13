# How to Lead This Project
## A Playbook for Running OncoTrack With a 3-Person Team

**For:** Sandhu (Lead/Orchestrator), 1 Backend Developer, 1 Frontend Developer
**Purpose:** The minimum process that keeps a small team aligned, without slowing anyone down.

---

## 1. What Your Job Actually Is

As lead, you're not doing the coding — you're doing four things, on repeat, for the life of the project:

1. **Turn the roadmap into small, unambiguous tasks.** Nobody should ever open their task list and wonder what "done" looks like for something.
2. **Remove blockers before they cost days.** If your backend dev is stuck waiting on a decision from you, or your frontend dev is stuck waiting on an API that isn't ready, that's on you to catch early — not something to discover a week later.
3. **Hold the quality bar.** You decide what "good enough to ship" means, and you don't let that slip silently under deadline pressure.
4. **Be the translation layer to the doctor.** The doctor doesn't want to hear about database schemas. Your developers don't need to sit in every conversation with the department. You sit in the middle and translate both ways.

You already have the hard part done — the PRD, TRD, workflow, UI/UX, and schema documents give you and your team a shared source of truth. Leading well from here is mostly about **rhythm and clarity**, not heroics.

---

## 2. The Lightweight Toolkit (And Nothing More)

A 3-person team doesn't need Jira, a 40-page process doc, or daily 45-minute standups. It needs exactly these things:

| Tool | What it's for | Recommendation |
|---|---|---|
| **A task board** | Single source of truth for what's being worked on, by whom, and its status | GitHub Projects (free, lives next to your code) or Trello if you want something simpler |
| **A git repository with branches** | Keeps work isolated so two people don't overwrite each other | GitHub or GitLab, private repo, `main` branch always deployable |
| **Pull requests (PRs)** | A second pair of eyes on every change before it merges | Every change — even small ones — goes through a PR, even on a 2-person dev team |
| **A shared docs folder** | The PRD/TRD/workflow/schema documents, kept up to date as the single source of truth | Google Drive or Notion, mirroring what's already been built |
| **A weekly written update** | Keeps the doctor informed without needing a meeting every week | A short written summary (template below) |
| **A running risk/decision log** | So decisions and open questions don't get lost in chat history | A simple shared doc or spreadsheet |

That's it. Six things. Resist the urge to add more process than this — for a 3-person team, more process usually means more overhead and less actual building.

---

## 3. Weekly Rhythm

Recommended cadence for a team this size:

| Day | What happens |
|---|---|
| **Monday** | Sprint planning (30 min) — you and both developers. Look at the task board, pull the next slice of work, make sure everyone knows what they're doing this week and why. |
| **Daily (async)** | A short written check-in — not a meeting. Each developer posts in a shared chat: what they finished yesterday, what they're doing today, anything blocking them. Takes 2 minutes to write, saves you from a surprise on Friday. |
| **Wednesday (as needed)** | A quick sync if either developer is blocked or a design decision needs your input. Don't let a blocker sit until Monday. |
| **Friday** | Short demo/review (30–45 min) — whatever was built this week gets shown, even if it's rough. This is also when you update the doctor. |

**Why async daily check-ins instead of a live standup:** with just two developers, a scheduled meeting every day is often more overhead than value. A written check-in gets you the same visibility without forcing everyone into a fixed time slot.

---

## 4. Who Owns What

Being explicit about this avoids the two most common small-team failure modes: things falling through the cracks because "I thought they were doing it," and you becoming a bottleneck because you're making every decision yourself.

| Area | Owner |
|---|---|
| Breaking phases into weekly tasks, prioritizing the backlog | You |
| Talking to the doctor, hospital IT, and the department | You |
| Accepting or rejecting finished work against the PRD's acceptance criteria | You |
| API design, database schema, business rule logic (stage transitions, stall detection), server deployment | Backend developer |
| Web and mobile UI, matching the UI/UX document, integrating with the backend API | Frontend developer |
| Final say on scope changes (does this request fit the PRD's non-goals?) | You |
| Final say on technical architecture choices | Backend developer, with your sign-off |
| Final say on UI/UX decisions within the established design | Frontend developer, with your sign-off |

You don't need to be the technical expert in the room — you need to be the person who makes sure the right conversations happen and the right calls get made by the right person.

---

## 5. Definition of Ready & Definition of Done

This is the single most useful habit you can build as a first-time lead. Every task on your board should move through these states, and a task should never skip a state.

**Backlog → Ready → In Progress → In Review → Testing → Done**

**Definition of Ready** (a task can move from Backlog to Ready only if all of these are true):
- It has a clear, one-sentence description of what needs to happen
- It references the relevant PRD requirement or UI/UX screen
- Any open question blocking it has been answered

**Definition of Done** (a task can move to Done only if all of these are true):
- Code has been reviewed and approved via PR by the other developer (or you, if you're reviewing)
- It's been manually tested against the acceptance criteria in the PRD
- It's deployed to a shared dev/staging environment where you can actually click through it
- No known critical bugs
- Any related documentation (API reference, schema) is updated if it changed

Print this list out, or pin it somewhere visible. When you're not sure if something is "really" done, this is the checklist that decides — not a feeling.

---

## 6. How to Run Sprint Planning (30–45 minutes, every Monday)

1. **Look at what's left in the current phase** (see the companion Sprint Backlog document).
2. **Pull the next unstarted tasks** — enough to fill about a week of work per developer. Don't overload; it's normal to underestimate at first.
3. **Make sure every task is "Ready"** per the definition above before assigning it.
4. **State the sprint goal in one sentence** — e.g., "By Friday, a doctor can log in and see a list of RT charts with their current stage." A single sentence goal keeps everyone oriented even when individual tasks feel disconnected.
5. **Assign, don't volunteer-fish.** As lead, you assign based on who owns that area (see Section 4), rather than asking "who wants to take this?" every time.

---

## 7. Weekly Update to the Doctor — Template

Keep this short. A doctor reading this between patients should understand it in under two minutes.

```
Subject: OncoTrack — Week [N] Update

WHAT WE SHIPPED THIS WEEK
- [1-3 bullet points, in plain language, no jargon]

WHAT WE'RE WORKING ON NEXT
- [1-2 bullet points]

DECISIONS WE NEED FROM YOU
- [Anything blocking progress that only the doctor can answer —
   e.g., "confirm the expected time window for contouring before we
   finalize the stall-alert timing"]

ANYTHING TO SEE?
- [A link, a screenshot, or "nothing visual yet, still building the
   foundation" — be honest when there's nothing to show yet]
```

Sending this every week, even when there's not much to report, builds trust. Silence is what makes stakeholders nervous, not slow-but-visible progress.

---

## 8. Common First-Time-Lead Pitfalls

| Pitfall | What to do instead |
|---|---|
| **Scope creep** — the doctor (or you) keeps adding "just one more thing" mid-sprint | Anything new goes on the backlog, not into the current sprint. Compare it against the PRD's non-goals before agreeing to anything that expands scope. |
| **Skipping code review because the team is small** | Don't. Two-person teams benefit from PR review more, not less — there's no one else to catch a mistake. |
| **Making every decision yourself** | If it's a technical implementation decision, that's your backend or frontend developer's call — you're there to unblock, not to micromanage. |
| **No single source of truth** | If a requirement changes, update the PRD/TRD, don't just mention it in chat. Chat history is not documentation. |
| **Not showing the doctor anything until it's "finished"** | Show rough, working versions early and often (per the Friday demo). Feedback on a rough version is far cheaper to act on than feedback after full build-out. |
| **Treating the plan as fixed** | The phased plan is a starting estimate, not a promise. Adjust it openly as you learn how fast the team actually moves — and say so in the weekly update. |

---

## 9. Your First Two Weeks — A Concrete Checklist

- [ ] Create the private GitHub (or GitLab) repository; add both developers as collaborators
- [ ] Set up a GitHub Projects board (or Trello) with columns: Backlog, Ready, In Progress, In Review, Testing, Done
- [ ] Create a shared Drive/Notion folder and drop in the PRD, TRD, App Workflow, Implementation Plan, UI/UX, and Backend Schema documents
- [ ] Update those documents to reflect the actual RT (radiation therapy) workflow — they currently reflect an earlier, incorrect chemo-pipeline assumption and need to be corrected before development starts against them
- [ ] Hold a kickoff meeting with both developers: walk through the PRD and TRD together, make sure both understand the "why," not just the "what"
- [ ] Set up a shared chat channel (WhatsApp group or Slack) for daily async check-ins
- [ ] Schedule a short meeting with the doctor to close out the PRD's open questions (stage timing thresholds, who owns the on-premise server, RT number format, hard-block vs. soft-warning on scheduling)
- [ ] Confirm with hospital IT: who is provisioning the on-premise server, and start that process now — it's usually the longest lead-time item and shouldn't wait on development
- [ ] Set up a shared dev/staging environment both developers can deploy to and you can click through
- [ ] Run your first Monday sprint planning session using Phase 0 of the Sprint Backlog document
