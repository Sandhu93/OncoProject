-- Gap-fill migration 002. Adds: gap-free RT numbering, login throttling, workflow retirement with a
-- single ACTIVE version per workflow code, and treatment start / weekly (Saturday) / completion updates.
-- No clinical rules are decided here; which stages need weekly updates is workflow data (still DRAFT).

-- 1. Sequential numbers per scope (for example 'RT:2026'). Called inside the creating transaction, so a
--    rolled-back request gives its number back and committed numbers never have gaps or duplicates.
CREATE TABLE number_counters (
  scope text PRIMARY KEY CHECK (length(scope) BETWEEN 1 AND 80),
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);
CREATE FUNCTION allocate_number(counter_scope text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE allocated bigint;
BEGIN
  IF counter_scope IS NULL OR length(trim(counter_scope)) = 0 THEN
    RAISE EXCEPTION 'A number scope is required' USING ERRCODE = '23514';
  END IF;
  INSERT INTO number_counters(scope, last_value) VALUES (counter_scope, 1)
  ON CONFLICT (scope) DO UPDATE SET last_value = number_counters.last_value + 1
  RETURNING last_value INTO allocated;
  RETURN allocated;
END;
$$;

-- 2. Login throttling keyed by normalized username (not by chart or session). The API must check
--    locked_until before verifying a password and delete the row after a successful login.
CREATE TABLE login_throttle (
  username text PRIMARY KEY CHECK (length(username) BETWEEN 1 AND 100 AND username = lower(trim(username))),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION record_failed_login(
  login_name text,
  max_failures integer,
  failure_window interval,
  lock_duration interval
) RETURNS timestamptz LANGUAGE plpgsql AS $$
DECLARE
  normalized text := lower(trim(login_name));
  current_row login_throttle%ROWTYPE;
  new_count integer;
  new_window timestamptz;
  new_lock timestamptz;
BEGIN
  IF normalized IS NULL OR normalized = '' OR max_failures < 1 THEN
    RAISE EXCEPTION 'Invalid login throttle request' USING ERRCODE = '23514';
  END IF;
  INSERT INTO login_throttle(username) VALUES (normalized) ON CONFLICT (username) DO NOTHING;
  SELECT * INTO current_row FROM login_throttle WHERE username = normalized FOR UPDATE;
  IF current_row.window_started_at <= now() - failure_window
     AND (current_row.locked_until IS NULL OR current_row.locked_until <= now()) THEN
    new_count := 1;
    new_window := now();
    new_lock := NULL;
  ELSE
    new_count := current_row.failed_count + 1;
    new_window := current_row.window_started_at;
    new_lock := current_row.locked_until;
  END IF;
  IF new_count >= max_failures THEN new_lock := now() + lock_duration; END IF;
  UPDATE login_throttle
    SET failed_count = new_count, window_started_at = new_window, locked_until = new_lock, updated_at = now()
    WHERE username = normalized;
  RETURN new_lock;
END;
$$;

-- 3. Workflow retirement and one ACTIVE version per workflow code. An ACTIVE version may only be
--    retired (no other field changes); RETIRED is final. Charts already on a retired version continue
--    on it (the chart gate in 001 only checks the workflow when a chart is created or re-pointed).
CREATE UNIQUE INDEX one_active_workflow_per_code ON workflow_versions(code) WHERE status = 'ACTIVE';
CREATE OR REPLACE FUNCTION protect_workflow_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'RETIRED' THEN
    RAISE EXCEPTION 'Published workflow version is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'ACTIVE' THEN
    IF TG_OP = 'DELETE'
       OR NEW.status <> 'RETIRED'
       OR ROW(NEW.id, NEW.code, NEW.version, NEW.label, NEW.approved_by, NEW.approved_at, NEW.created_at)
          IS DISTINCT FROM
          ROW(OLD.id, OLD.code, OLD.version, OLD.label, OLD.approved_by, OLD.approved_at, OLD.created_at) THEN
      RAISE EXCEPTION 'Published workflow version is immutable; it can only be retired' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM workflow_stages WHERE workflow_id = NEW.id AND is_initial
  ) THEN
    RAISE EXCEPTION 'An initial stage is required before activation' USING ERRCODE = '55000';
  END IF;
  IF NEW.status = 'RETIRED' THEN
    RAISE EXCEPTION 'Only an ACTIVE workflow version can be retired' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Which stages need weekly updates, and from which roles. Workflow data, frozen on publication.
ALTER TABLE workflow_stages
  ADD COLUMN requires_weekly_update boolean NOT NULL DEFAULT false,
  ADD COLUMN weekly_update_roles text[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT weekly_update_roles_match_flag CHECK (
    (requires_weekly_update AND cardinality(weekly_update_roles) > 0)
    OR (NOT requires_weekly_update AND cardinality(weekly_update_roles) = 0)
  );
CREATE FUNCTION validate_weekly_update_roles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.weekly_update_roles) AS wanted(code)
    WHERE NOT EXISTS (SELECT 1 FROM roles WHERE roles.code = wanted.code)
  ) THEN
    RAISE EXCEPTION 'Weekly update roles must be existing role codes' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_stage_weekly_roles BEFORE INSERT OR UPDATE ON workflow_stages
  FOR EACH ROW EXECUTE FUNCTION validate_weekly_update_roles();

-- 5. Treatment updates: one start and one completion per chart, one WEEKLY update per role per
--    Saturday. Append-only like other history (a correction flow is an open decision, D-11).
CREATE TABLE treatment_status_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid NOT NULL REFERENCES rt_charts(id),
  kind text NOT NULL CHECK (kind IN ('TREATMENT_START', 'WEEKLY', 'COMPLETION')),
  week_ending date,
  author_id uuid NOT NULL REFERENCES staff_users(id),
  author_role text NOT NULL REFERENCES roles(code),
  note text CHECK (note IS NULL OR length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'WEEKLY' AND week_ending IS NOT NULL AND extract(dow FROM week_ending) = 6)
    OR (kind <> 'WEEKLY' AND week_ending IS NULL)
  )
);
CREATE UNIQUE INDEX one_weekly_update_per_role ON treatment_status_updates(chart_id, week_ending, author_role)
  WHERE kind = 'WEEKLY';
CREATE UNIQUE INDEX one_treatment_start_per_chart ON treatment_status_updates(chart_id)
  WHERE kind = 'TREATMENT_START';
CREATE UNIQUE INDEX one_completion_per_chart ON treatment_status_updates(chart_id)
  WHERE kind = 'COMPLETION';
CREATE INDEX ON treatment_status_updates(chart_id, created_at);
CREATE TRIGGER immutable_treatment_updates BEFORE UPDATE OR DELETE OR TRUNCATE ON treatment_status_updates
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();

-- 6. Missing updates for the most recent Saturday (Asia/Kolkata calendar) on OPEN charts that are in a
--    stage requiring weekly updates and entered that stage on or before that Saturday. Older missed
--    Saturdays are not listed; how to treat them is an open decision (D-11).
CREATE FUNCTION weekly_updates_due(as_of timestamptz DEFAULT now())
RETURNS TABLE (due_chart_id uuid, due_role text, due_week_ending date)
LANGUAGE sql STABLE AS $$
  WITH latest AS (
    SELECT d - ((extract(dow FROM d)::integer + 1) % 7) AS saturday
    FROM (SELECT (as_of AT TIME ZONE 'Asia/Kolkata')::date AS d) AS today
  )
  SELECT c.id, wanted.role_code, latest.saturday
  FROM latest
  CROSS JOIN rt_charts c
  JOIN workflow_stages s ON s.workflow_id = c.workflow_id AND s.code = c.current_stage
  CROSS JOIN LATERAL unnest(s.weekly_update_roles) AS wanted(role_code)
  WHERE c.status = 'OPEN'
    AND s.requires_weekly_update
    AND (c.current_stage_since AT TIME ZONE 'Asia/Kolkata')::date <= latest.saturday
    AND NOT EXISTS (
      SELECT 1 FROM treatment_status_updates u
      WHERE u.chart_id = c.id AND u.kind = 'WEEKLY'
        AND u.week_ending = latest.saturday AND u.author_role = wanted.role_code
    )
$$;
