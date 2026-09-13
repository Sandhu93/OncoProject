-- Minimal non-clinical engineering fixture. No patients, accounts or approved RT rules.
INSERT INTO workflow_versions(id, code, version, label, status)
VALUES ('00000000-0000-4000-8000-000000000001', 'RT_DEVELOPMENT_ONLY', 1,
  'Draft engineering handoff — not a clinical protocol', 'DRAFT')
ON CONFLICT (code, version) DO NOTHING;

INSERT INTO workflow_stages(workflow_id, code, label, display_order, is_initial)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'REGISTERED', 'Registered', 0, true),
  ('00000000-0000-4000-8000-000000000001', 'TASK_ASSIGNED', 'Task assigned', 1, false),
  ('00000000-0000-4000-8000-000000000001', 'REVIEW_PENDING', 'Review pending', 2, false)
ON CONFLICT DO NOTHING;

INSERT INTO workflow_transitions(workflow_id, from_stage, action, to_stage, role_code, requires_assignment)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'REGISTERED', 'ASSIGN_TASK', 'TASK_ASSIGNED', 'CONSULTANT', false),
  ('00000000-0000-4000-8000-000000000001', 'TASK_ASSIGNED', 'SUBMIT_TASK', 'REVIEW_PENDING', 'JUNIOR_RESIDENT', true)
ON CONFLICT DO NOTHING;
