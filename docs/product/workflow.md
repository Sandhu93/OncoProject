# Workflow specification contract

Status: clinical RT workflow unconfirmed. The repository does not contain an approved 13-stage list.

A proposal drafted from the consultant's own description is in [the proposed RT workflow](rt-workflow-proposal.md). It is awaiting confirmation and must not be activated or seeded until the consultant approves it.

## Required definition

For every stage/action, collect: stage code/label, owner role, action name, next stage, prerequisite facts, assignment requirement, rejection reason requirement, rejection return target and escalation threshold. Decide branch/skip rules explicitly. Store stable codes, not human-readable labels, in references.

Each chart is bound to one approved workflow version. Draft definitions cannot create a chart or authorize a transition. Definition changes create a new version; existing charts retain their original meaning until an explicit migration is designed. The initial schema locks published versions entirely, so retirement requires a subsequent controlled change.

## Engineering fixture only

| Current stage | Action      | Next stage     | Actor           | Assigned actor required |
| ------------- | ----------- | -------------- | --------------- | ----------------------- |
| REGISTERED    | ASSIGN_TASK | TASK_ASSIGNED  | Consultant      | No                      |
| TASK_ASSIGNED | SUBMIT_TASK | REVIEW_PENDING | Junior resident | Yes                     |

This three-stage DRAFT fixture exists only to exercise setup and integration work. It intentionally omits clinical assumptions. It is not the contouring/simulation protocol and must not be activated for staff use.

## Invariants for command implementation

- Load active actor, chart, assignment and prerequisites from trusted server records.
- Deny an action if workflow is not active, actor is inactive, chart is closed, expected version is stale, transition is absent, role/assignment is wrong, required reason is empty or prerequisites are missing.
- A permitted policy decision must still be persisted atomically with its history and outgoing event.
- An overdue condition is separate from the chart's clinical stage; calls annotate follow-up rather than changing that stage.
- Review decisions belong to submission revisions. A newer revision does not inherit all prior approvals automatically.
- Store a snapshot of actor roles at action time so later staff changes do not rewrite history.

The shared policy is implemented at `packages/contracts/src/index.ts`. Tests use a separate synthetic ACTIVE fixture to verify engine behavior. No HTTP workflow endpoint is implemented yet.
