-- After treatment is complete the junior resident and the radiographer each post a final status update; tracking
-- ends when both are in (docs/product/rt-workflow-proposal.md, revision of 28 November 2026).

ALTER TABLE treatment_status_updates DROP CONSTRAINT treatment_status_updates_kind_check;
ALTER TABLE treatment_status_updates
  ADD CONSTRAINT treatment_status_updates_kind_check
  CHECK (kind IN ('TREATMENT_START', 'WEEKLY', 'COMPLETION', 'FINAL'));

-- One final update per role per chart. Like the others it cannot be edited or deleted.
CREATE UNIQUE INDEX one_final_update_per_role ON treatment_status_updates(chart_id, author_role)
  WHERE kind = 'FINAL';

-- A development database that already holds the proposed workflow (seeded before this change) is brought in line
-- with database/seeds/rt-workflow-proposed.sql. On a new database the workflow is not there yet, so nothing happens.
UPDATE workflow_stages SET is_terminal = false
 WHERE workflow_id = '00000000-0000-4000-8000-000000000002' AND code = 'TREATMENT_COMPLETED';

INSERT INTO workflow_stages(workflow_id, code, label, display_order, is_initial, is_terminal,
                            requires_weekly_update, weekly_update_roles)
SELECT id, 'TRACKING_ENDED', 'Tracking ended', 14, false, true, false, '{}'
  FROM workflow_versions WHERE id = '00000000-0000-4000-8000-000000000002'
ON CONFLICT DO NOTHING;

INSERT INTO workflow_transitions(workflow_id, from_stage, action, to_stage, role_code,
                                 requires_assignment, requires_reason, prerequisites)
SELECT v.id, 'TREATMENT_COMPLETED', 'POST_FINAL_UPDATE', 'TRACKING_ENDED', r.role_code, false, false, '{}'
  FROM workflow_versions v, (VALUES ('JUNIOR_RESIDENT'), ('RADIOGRAPHER')) AS r(role_code)
 WHERE v.id = '00000000-0000-4000-8000-000000000002'
ON CONFLICT DO NOTHING;
