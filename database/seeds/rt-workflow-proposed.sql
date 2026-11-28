-- The PROPOSED RT workflow: 15 stages and 18 transitions (the last two let the junior resident and the radiographer
-- each post a final update after treatment; the chart moves to TRACKING_ENDED when both are in), exactly as docs/product/rt-workflow-proposal.md and
-- the prototype describe them. It is a DRAFT. It becomes the department's workflow only when the consultant
-- confirms it (D-01); rows the proposal marks "Assumed" are the questions on the confirmation sheet.
-- Chart creation (ISSUE_RT_CHART, by a consultant) is the chart-issuing command, not a transition.
INSERT INTO workflow_versions(id, code, version, label, status)
VALUES ('00000000-0000-4000-8000-000000000002', 'RT_PROPOSED', 1,
  'Proposed RT workflow, awaiting consultant confirmation', 'DRAFT')
ON CONFLICT (code, version) DO NOTHING;

INSERT INTO workflow_stages(workflow_id, code, label, display_order, is_initial, is_terminal,
                            requires_weekly_update, weekly_update_roles)
VALUES
  ('00000000-0000-4000-8000-000000000002', 'RT_CHART_ISSUED', 'RT chart issued', 0, true, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'SIMULATION_DATES_GIVEN', 'Dates given', 1, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'MOULD_DONE', 'Mould done', 2, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'CT_SIM_DONE', 'CT Sim done', 3, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'CONTOURING', 'Contouring', 4, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'SENIOR_VERIFICATION', 'Senior verification', 5, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'CONSULTANT_CONTOUR_APPROVAL', 'Consultant approval of contouring', 6, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'PHYSICS_PLANNING', 'Physics planning', 7, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'PLAN_APPROVAL', 'Plan approval', 8, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'PLAN_APPROVED', 'Plan approved', 9, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'PLAN_ON_LINAC', 'Plan on LINAC', 10, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'PATIENT_INFORMED', 'Patient informed', 11, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'TREATMENT_IN_PROGRESS', 'Treatment in progress', 12, false, false, true, '{JUNIOR_RESIDENT,RADIOGRAPHER}'),
  ('00000000-0000-4000-8000-000000000002', 'TREATMENT_COMPLETED', 'Treatment completed', 13, false, false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'TRACKING_ENDED', 'Tracking ended', 14, false, true, false, '{}')
ON CONFLICT DO NOTHING;

INSERT INTO workflow_transitions(workflow_id, from_stage, action, to_stage, role_code,
                                 requires_assignment, requires_reason, prerequisites)
VALUES
  ('00000000-0000-4000-8000-000000000002', 'RT_CHART_ISSUED', 'GIVE_SIMULATION_DATES', 'SIMULATION_DATES_GIVEN', 'RADIOGRAPHER', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'SIMULATION_DATES_GIVEN', 'RECORD_MOULD_DONE', 'MOULD_DONE', 'RADIOGRAPHER', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'MOULD_DONE', 'RECORD_CT_SIM_DONE', 'CT_SIM_DONE', 'RADIOGRAPHER', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'CT_SIM_DONE', 'ASSIGN_CONTOURING', 'CONTOURING', 'CONSULTANT', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'CONTOURING', 'SUBMIT_CONTOURING', 'SENIOR_VERIFICATION', 'JUNIOR_RESIDENT', true, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'SENIOR_VERIFICATION', 'VERIFY_CONTOURING', 'CONSULTANT_CONTOUR_APPROVAL', 'SENIOR_RESIDENT', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'SENIOR_VERIFICATION', 'RETURN_CONTOURING', 'CONTOURING', 'SENIOR_RESIDENT', false, true, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'CONSULTANT_CONTOUR_APPROVAL', 'APPROVE_CONTOURING', 'PHYSICS_PLANNING', 'CONSULTANT', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'CONSULTANT_CONTOUR_APPROVAL', 'RETURN_CONTOURING', 'CONTOURING', 'CONSULTANT', false, true, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'PHYSICS_PLANNING', 'SUBMIT_PLAN', 'PLAN_APPROVAL', 'PHYSICIST', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'PLAN_APPROVAL', 'APPROVE_PLAN', 'PLAN_APPROVED', 'CONSULTANT', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'PLAN_APPROVAL', 'RETURN_PLAN', 'PHYSICS_PLANNING', 'CONSULTANT', false, true, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'PLAN_APPROVED', 'SEND_PLAN_TO_LINAC', 'PLAN_ON_LINAC', 'PHYSICIST', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'PLAN_ON_LINAC', 'INFORM_PATIENT', 'PATIENT_INFORMED', 'RADIOGRAPHER', false, false, '{CONTOURING_APPROVED,PLAN_APPROVED,LINAC_SLOT_RESERVED}'),
  ('00000000-0000-4000-8000-000000000002', 'PATIENT_INFORMED', 'START_TREATMENT', 'TREATMENT_IN_PROGRESS', 'JUNIOR_RESIDENT', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'TREATMENT_IN_PROGRESS', 'COMPLETE_TREATMENT', 'TREATMENT_COMPLETED', 'JUNIOR_RESIDENT', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'TREATMENT_COMPLETED', 'POST_FINAL_UPDATE', 'TRACKING_ENDED', 'JUNIOR_RESIDENT', false, false, '{}'),
  ('00000000-0000-4000-8000-000000000002', 'TREATMENT_COMPLETED', 'POST_FINAL_UPDATE', 'TRACKING_ENDED', 'RADIOGRAPHER', false, false, '{}')
ON CONFLICT DO NOTHING;
