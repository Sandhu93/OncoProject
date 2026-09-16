# Documentation

Current product and engineering guidance lives here. The original planning inputs are kept in a separate archive because they contain superseded chemotherapy requirements.

## Start here

1. [Development start guide](development/getting-started.md): how to build the first complete staff handoff.
2. [Local setup](development/local-setup.md): installation, database, commands and troubleshooting.
3. [Current status](development/status.md): what works, what was verified and what is still pending.
4. [RT scope and decisions](product/rt-scope.md): unresolved requirements before clinical workflow implementation.

## Current references

| Area          | Documents                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product       | [RT scope](product/rt-scope.md), [workflow contract](product/workflow.md)                                                                                                                       |
| Architecture  | [System overview and decisions](architecture/overview.md), [database design](architecture/database.md)                                                                                          |
| API           | [Implemented OpenAPI contract](api/openapi.yaml)                                                                                                                                                |
| Development   | [Start guide](development/getting-started.md), [local setup](development/local-setup.md), [testing](development/testing.md), [backlog](development/backlog.md), [status](development/status.md) |
| Starter tasks | [Database integrity tests](development/tasks/database-integrity-tests.md)                                                                                                                       |
| Operations    | [Runbook and deployment prerequisites](operations/runbook.md)                                                                                                                                   |
| Planning      | [Pre-development assessment and delivery plan](planning/project-assessment.md)                                                                                                                  |
| History       | [Original planning archive](archive/initial-planning/README.md)                                                                                                                                 |

## Where new files belong

- Put product requirements and workflow decisions in `product/`.
- Put system design, database descriptions and architectural decisions in `architecture/`.
- Put developer instructions, test guidance and implementation status in `development/`.
- Put API specifications in `api/` and deployment/recovery procedures in `operations/`.
- Put delivery estimates and project assessments in `planning/`.
- Put superseded source material in `archive/`, with a note explaining what replaced it.

Keep repository entry points (`README.md`, `CONTRIBUTING.md`, `AGENTS.md`) and tool configuration at the repository root. Executable SQL belongs in `database/`, application code in `apps/`, shared code in `packages/`, and deployment definitions in `infra/` (with `compose.yaml` at the root for standard commands).

Current executable code and migrations describe implemented behavior; current product documents describe intended scope. The archive supplies historical context and must not override either. Unconfirmed clinical rules stay explicitly draft.
