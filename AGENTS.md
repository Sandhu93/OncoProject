# Repository working guidance

- Read `README.md`, `docs/development/status.md` and the relevant architecture/product document before implementation.
- RT is the current domain. Documents 01–06 in `docs/archive/initial-planning/` contain an obsolete chemo model; do not reuse their stage seeds or four-role policy. Start from `docs/README.md` for current guidance.
- The exact RT workflow remains unconfirmed. Never turn the development fixture into an approved clinical protocol by assumption.
- Keep patient identity separate from RT charts. Bind charts to a workflow version; retain revision-specific decisions and append-only history.
- Authenticate and authorize on the server. Do not replace the initial deny-by-default guard with client headers or fake sessions.
- New consequential mutations require acceptance examples, focused tests and a transaction covering state, audit and outgoing event. Document unimplemented behavior honestly.
- Add new numbered SQL migrations after an existing migration has been deployed. Do not change recorded migration checksums to hide an edit.
- Use synthetic data in tests. Never commit `.env`, patient records, credentials, database dumps or browser artifacts containing real records.
- Run `npm run check` for code/schema changes. Run `npm run test:db` for database changes when a test server is available and `npm run test:e2e` for web behavior changes. Report unavailable checks explicitly.
- On this Windows workspace use `npm.cmd` when PowerShell blocks npm's script shim. Keep tooling caches inside `.cache` where practical.
- Update `docs/development/status.md` when a milestone changes what the application can do.
