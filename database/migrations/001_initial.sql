-- RT development foundation. Clinical workflow definitions are versioned and seeded as DRAFT.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE roles (
  code text PRIMARY KEY,
  label text NOT NULL
);
INSERT INTO roles(code, label) VALUES
  ('JUNIOR_RESIDENT', 'Junior resident'),
  ('SENIOR_RESIDENT', 'Senior resident'),
  ('CONSULTANT', 'Consultant'),
  ('PHYSICIST', 'Physicist'),
  ('RADIOGRAPHER', 'Radiographer');

CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE CHECK (username = lower(username)),
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 120),
  identity_provider text NOT NULL DEFAULT 'LOCAL' CHECK (identity_provider IN ('LOCAL', 'DIRECTORY')),
  password_hash text,
  external_subject text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((identity_provider = 'LOCAL' AND password_hash IS NOT NULL AND external_subject IS NULL)
    OR (identity_provider = 'DIRECTORY' AND external_subject IS NOT NULL AND password_hash IS NULL))
);
CREATE TABLE staff_roles (
  staff_id uuid NOT NULL REFERENCES staff_users(id),
  role_code text NOT NULL REFERENCES roles(code),
  PRIMARY KEY(staff_id, role_code)
);
CREATE TABLE staff_capabilities (
  staff_id uuid NOT NULL REFERENCES staff_users(id),
  capability text NOT NULL CHECK (capability IN ('MANAGE_STAFF', 'CONFIGURE_WORKFLOW', 'VIEW_AUDIT', 'EXPORT_REPORTS')),
  PRIMARY KEY(staff_id, capability)
);
CREATE TABLE staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff_users(id),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX ON staff_sessions(staff_id) WHERE revoked_at IS NULL;

CREATE TABLE workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  label text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  approved_by uuid REFERENCES staff_users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code, version),
  CHECK (status = 'DRAFT' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE workflow_stages (
  workflow_id uuid NOT NULL REFERENCES workflow_versions(id),
  code text NOT NULL,
  label text NOT NULL,
  display_order integer NOT NULL CHECK (display_order >= 0),
  is_initial boolean NOT NULL DEFAULT false,
  is_terminal boolean NOT NULL DEFAULT false,
  PRIMARY KEY(workflow_id, code)
);
CREATE UNIQUE INDEX one_initial_stage ON workflow_stages(workflow_id) WHERE is_initial;
CREATE TABLE workflow_transitions (
  workflow_id uuid NOT NULL,
  from_stage text NOT NULL,
  action text NOT NULL,
  to_stage text NOT NULL,
  role_code text NOT NULL REFERENCES roles(code),
  requires_assignment boolean NOT NULL DEFAULT false,
  requires_reason boolean NOT NULL DEFAULT false,
  prerequisites text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY(workflow_id, from_stage, action, role_code),
  FOREIGN KEY(workflow_id, from_stage) REFERENCES workflow_stages(workflow_id, code),
  FOREIGN KEY(workflow_id, to_stage) REFERENCES workflow_stages(workflow_id, code),
  CHECK (from_stage <> to_stage)
);
CREATE TABLE stage_thresholds (
  workflow_id uuid NOT NULL,
  stage_code text NOT NULL,
  threshold_minutes integer NOT NULL CHECK (threshold_minutes > 0),
  updated_by uuid NOT NULL REFERENCES staff_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workflow_id, stage_code),
  FOREIGN KEY(workflow_id, stage_code) REFERENCES workflow_stages(workflow_id, code)
);

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_number text UNIQUE,
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 120),
  contact_number text CHECK (length(contact_number) BETWEEN 5 AND 25),
  created_by uuid NOT NULL REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rt_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  display_number text NOT NULL UNIQUE CHECK (length(display_number) BETWEEN 1 AND 40),
  workflow_id uuid NOT NULL REFERENCES workflow_versions(id),
  current_stage text NOT NULL,
  current_stage_since timestamptz NOT NULL DEFAULT now(),
  consultant_id uuid NOT NULL REFERENCES staff_users(id),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'DISCONTINUED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, workflow_id),
  FOREIGN KEY(workflow_id, current_stage) REFERENCES workflow_stages(workflow_id, code)
);
CREATE INDEX ON rt_charts(patient_id);
CREATE INDEX ON rt_charts(workflow_id, current_stage, current_stage_since) WHERE status = 'OPEN';
CREATE TABLE chart_stage_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chart_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  from_stage text,
  to_stage text NOT NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES staff_users(id),
  actor_roles text[] NOT NULL CHECK (cardinality(actor_roles) > 0),
  reason text,
  chart_version integer NOT NULL CHECK (chart_version > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(chart_id, workflow_id) REFERENCES rt_charts(id, workflow_id),
  FOREIGN KEY(workflow_id, from_stage) REFERENCES workflow_stages(workflow_id, code),
  FOREIGN KEY(workflow_id, to_stage) REFERENCES workflow_stages(workflow_id, code),
  UNIQUE(chart_id, chart_version)
);
CREATE INDEX ON chart_stage_history(chart_id, occurred_at);
CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid NOT NULL REFERENCES rt_charts(id),
  task_code text NOT NULL,
  staff_id uuid NOT NULL REFERENCES staff_users(id),
  assigned_by uuid NOT NULL REFERENCES staff_users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);
CREATE UNIQUE INDEX one_current_task_owner ON assignments(chart_id, task_code) WHERE ended_at IS NULL;
CREATE INDEX ON assignments(staff_id) WHERE ended_at IS NULL;

CREATE TABLE review_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid NOT NULL REFERENCES rt_charts(id),
  kind text NOT NULL CHECK (kind IN ('CONTOURING', 'PHYSICS_PLAN')),
  revision integer NOT NULL CHECK (revision > 0),
  submitted_by uuid NOT NULL REFERENCES staff_users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chart_id, kind, revision),
  UNIQUE(id, chart_id)
);
CREATE TABLE review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid NOT NULL REFERENCES rt_charts(id),
  submission_id uuid NOT NULL,
  review_step text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  reason text,
  actor_id uuid NOT NULL REFERENCES staff_users(id),
  actor_role text NOT NULL REFERENCES roles(code),
  decided_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(submission_id, chart_id) REFERENCES review_submissions(id, chart_id),
  UNIQUE(submission_id, review_step),
  CHECK (decision <> 'REJECTED' OR length(trim(reason)) > 0 AND reason IS NOT NULL)
);
CREATE TABLE chart_prerequisites (
  chart_id uuid NOT NULL REFERENCES rt_charts(id),
  code text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETE', 'INVALIDATED')),
  submission_id uuid,
  recorded_by uuid REFERENCES staff_users(id),
  recorded_at timestamptz,
  PRIMARY KEY(chart_id, code),
  FOREIGN KEY(submission_id, chart_id) REFERENCES review_submissions(id, chart_id),
  CHECK (status <> 'COMPLETE' OR (recorded_by IS NOT NULL AND recorded_at IS NOT NULL))
);

CREATE TABLE resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('MOULD', 'CT_SIMULATION', 'LINAC')),
  is_active boolean NOT NULL DEFAULT true
);
-- Each independently bookable capacity unit has its own row. A LINAC normally has one.
CREATE TABLE resource_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES resources(id),
  label text NOT NULL,
  UNIQUE(resource_id, label)
);
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid NOT NULL REFERENCES rt_charts(id),
  resource_unit_id uuid NOT NULL REFERENCES resource_units(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'MISSED')),
  booked_by uuid NOT NULL REFERENCES staff_users(id),
  readiness_snapshot jsonb,
  override_by uuid REFERENCES staff_users(id),
  override_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK ((override_by IS NULL AND override_reason IS NULL) OR (override_by IS NOT NULL AND length(trim(override_reason)) > 0 AND override_reason IS NOT NULL)),
  CHECK (status <> 'CONFIRMED' OR readiness_snapshot IS NOT NULL),
  EXCLUDE USING gist (resource_unit_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status IN ('RESERVED', 'CONFIRMED'))
);
CREATE INDEX ON appointments(chart_id, starts_at);

CREATE TABLE stall_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  stage_code text NOT NULL,
  stage_entered_at timestamptz NOT NULL,
  threshold_minutes integer NOT NULL CHECK (threshold_minutes > 0),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY(chart_id, workflow_id) REFERENCES rt_charts(id, workflow_id),
  FOREIGN KEY(workflow_id, stage_code) REFERENCES workflow_stages(workflow_id, code),
  CHECK (resolved_at IS NULL OR resolved_at >= detected_at)
);
CREATE UNIQUE INDEX one_open_stall ON stall_episodes(chart_id) WHERE resolved_at IS NULL;
CREATE TABLE call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid NOT NULL REFERENCES rt_charts(id),
  logged_by uuid NOT NULL REFERENCES staff_users(id),
  outcome text NOT NULL CHECK (outcome IN ('REACHED', 'NO_ANSWER', 'RESCHEDULED', 'DECLINED')),
  note text CHECK (length(note) <= 1000),
  logged_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chart_id uuid REFERENCES rt_charts(id),
  actor_id uuid REFERENCES staff_users(id),
  actor_roles text[] NOT NULL DEFAULT '{}',
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_values jsonb,
  after_values jsonb,
  request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_events(chart_id, occurred_at);
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id uuid REFERENCES rt_charts(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
CREATE INDEX ON outbox_events(available_at) WHERE processed_at IS NULL;
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES staff_users(id),
  event_id uuid NOT NULL REFERENCES outbox_events(id),
  chart_id uuid REFERENCES rt_charts(id),
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE(recipient_id, event_id)
);
CREATE INDEX ON notifications(recipient_id, created_at) WHERE read_at IS NULL;
CREATE TABLE idempotency_records (
  actor_id uuid NOT NULL REFERENCES staff_users(id),
  request_key uuid NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id, request_key),
  CHECK (expires_at > created_at)
);

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Historical records are append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE OR TRUNCATE ON chart_stage_history
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_decisions BEFORE UPDATE OR DELETE OR TRUNCATE ON review_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_submissions BEFORE UPDATE OR DELETE OR TRUNCATE ON review_submissions
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();

CREATE FUNCTION require_active_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE initial_code text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.workflow_id <> OLD.workflow_id THEN
    RAISE EXCEPTION 'Chart workflow version cannot be changed in place' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM workflow_versions WHERE id = NEW.workflow_id AND status = 'ACTIVE') THEN
      RAISE EXCEPTION 'A chart requires an approved active workflow' USING ERRCODE = '55000';
    END IF;
    SELECT code INTO initial_code FROM workflow_stages WHERE workflow_id = NEW.workflow_id AND is_initial;
    IF initial_code IS NULL OR NEW.current_stage <> initial_code THEN
      RAISE EXCEPTION 'A chart must begin at its initial stage' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER chart_workflow_gate BEFORE INSERT OR UPDATE ON rt_charts
  FOR EACH ROW EXECUTE FUNCTION require_active_workflow();

CREATE FUNCTION protect_workflow_definition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_id uuid; new_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_id := OLD.workflow_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_id := NEW.workflow_id; END IF;
  IF EXISTS (SELECT 1 FROM workflow_versions WHERE id IN (old_id, new_id) AND status <> 'DRAFT') THEN
    RAISE EXCEPTION 'Published workflow definitions are immutable; create a new version' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_stages BEFORE INSERT OR UPDATE OR DELETE ON workflow_stages
  FOR EACH ROW EXECUTE FUNCTION protect_workflow_definition();
CREATE TRIGGER immutable_transitions BEFORE INSERT OR UPDATE OR DELETE ON workflow_transitions
  FOR EACH ROW EXECUTE FUNCTION protect_workflow_definition();

CREATE FUNCTION protect_workflow_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Published workflow version is immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM workflow_stages WHERE workflow_id = NEW.id AND is_initial
  ) THEN
    RAISE EXCEPTION 'An initial stage is required before activation' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_workflow_version BEFORE UPDATE OR DELETE ON workflow_versions
  FOR EACH ROW EXECUTE FUNCTION protect_workflow_version();
