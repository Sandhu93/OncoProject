-- A discussion thread on each chart, and the note a person leaves when they pass a chart on.
-- Operational messages only. No patient names or clinical details: charts are known by RT number.
CREATE TABLE chart_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid NOT NULL REFERENCES rt_charts(id),
  author_id uuid NOT NULL REFERENCES staff_users(id),
  author_roles text[] NOT NULL,
  kind text NOT NULL CHECK (kind IN ('COMMENT', 'HANDOFF')),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
  -- The role the comment is addressed to, if any; that role is notified.
  for_role text CHECK (for_role IS NULL OR for_role IN ('CONSULTANT', 'SENIOR_RESIDENT', 'JUNIOR_RESIDENT', 'PHYSICIST', 'RADIOGRAPHER')),
  -- The stage the chart was in (comment) or moved to (handoff note) when this was written.
  stage_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chart_comments_by_chart ON chart_comments(chart_id, created_at, id);
