# Contributing

Start with [local setup](docs/development/local-setup.md) and choose a task from [the backlog](docs/development/backlog.md). A task is ready when its expected behavior and unresolved dependencies are clear.

For a business behavior, write the acceptance example and failing test before implementing the command. Keep changes focused on a complete observable slice, including API permissions and user-visible failures. Use parameterized SQL and synthetic fixtures.

Run `npm run check`, the relevant real database tests and browser tests. Include results and any limitations in the pull request. Update the API contract, migration documentation and development status when behavior changes. Require a second review for workflow rules, permissions and schema changes.

Use migrations rather than manual schema edits. Keep published workflow definitions and historical decisions stable. Do not treat the draft development workflow as the department's protocol.

External CI must contain no real patient data or production credentials. A release build is not a clinical acceptance sign-off; follow the pilot and operations gates in the startup guide.
