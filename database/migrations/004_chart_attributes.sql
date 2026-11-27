-- Chart attributes the product owner approved on 28 November 2026: planned sessions, priority, and
-- optional references into the planning system. None of these identify a patient. The references are
-- short pointers only (never images or findings); the application cannot detect a name typed into them,
-- so the interface warns staff and the length is capped.
ALTER TABLE rt_charts
  ADD COLUMN planned_sessions integer CHECK (planned_sessions BETWEEN 1 AND 100),
  ADD COLUMN priority text NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE', 'URGENT')),
  ADD COLUMN plan_id text CHECK (plan_id = trim(plan_id) AND length(plan_id) BETWEEN 1 AND 60),
  ADD COLUMN contour_set_name text CHECK (contour_set_name = trim(contour_set_name) AND length(contour_set_name) BETWEEN 1 AND 60),
  ADD COLUMN scan_reference text CHECK (scan_reference = trim(scan_reference) AND length(scan_reference) BETWEEN 1 AND 60);
CREATE INDEX ON rt_charts(priority, current_stage_since) WHERE status = 'OPEN' AND priority = 'URGENT';
