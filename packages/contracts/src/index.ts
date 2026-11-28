export const CLINICAL_ROLES = [
  'JUNIOR_RESIDENT',
  'SENIOR_RESIDENT',
  'CONSULTANT',
  'PHYSICIST',
  'RADIOGRAPHER',
] as const;

export type ClinicalRole = (typeof CLINICAL_ROLES)[number];

export const STAFF_CAPABILITIES = [
  'MANAGE_STAFF',
  'CONFIGURE_WORKFLOW',
  'VIEW_AUDIT',
  'EXPORT_REPORTS',
] as const;

export type StaffCapability = (typeof STAFF_CAPABILITIES)[number];

export interface LoginRequest {
  username: string;
  password: string;
}

/** Token response shape accepted by the web login template (access_token, expires_in in seconds). */
export interface LoginResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

/** The signed-in staff member, as the server sees them. Never includes secrets. */
export interface StaffProfile {
  id: string;
  username: string;
  fullName: string;
  roles: readonly ClinicalRole[];
  capabilities: readonly StaffCapability[];
}

export interface HealthResponse {
  status: 'ok' | 'unavailable';
  service: 'oncotrack-api';
}

export interface TransitionRule {
  action: string;
  from: string;
  to: string;
  role: ClinicalRole;
  requiresAssignment: boolean;
  requiresReason: boolean;
  prerequisites: readonly string[];
}

export interface WorkflowDefinition {
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  transitions: readonly TransitionRule[];
}

export interface TransitionRequest {
  action: string;
  currentStage: string;
  currentVersion: number;
  expectedVersion: number;
  chartOpen: boolean;
  actor: { id: string; active: boolean; roles: readonly ClinicalRole[] };
  assignedStaffId?: string;
  reason?: string;
  completedPrerequisites: readonly string[];
}

export type TransitionDecision =
  | { allowed: true; nextStage: string }
  | {
      allowed: false;
      code:
        | 'WORKFLOW_NOT_ACTIVE'
        | 'ACCESS_DENIED'
        | 'CHART_CLOSED'
        | 'VERSION_CONFLICT'
        | 'INVALID_TRANSITION'
        | 'REASON_REQUIRED'
        | 'PREREQUISITES_MISSING';
    };

/** Pure policy evaluation. The API must reload these facts from the database in a transaction. */
export function evaluateTransition(
  definition: WorkflowDefinition,
  request: TransitionRequest,
): TransitionDecision {
  if (definition.status !== 'ACTIVE') return { allowed: false, code: 'WORKFLOW_NOT_ACTIVE' };
  if (!request.actor.active) return { allowed: false, code: 'ACCESS_DENIED' };
  if (!request.chartOpen) return { allowed: false, code: 'CHART_CLOSED' };
  if (request.currentVersion !== request.expectedVersion) {
    return { allowed: false, code: 'VERSION_CONFLICT' };
  }
  const rules = definition.transitions.filter(
    (rule) => rule.from === request.currentStage && rule.action === request.action,
  );
  if (!rules.length) return { allowed: false, code: 'INVALID_TRANSITION' };
  const rule = rules.find((candidate) => request.actor.roles.includes(candidate.role));
  if (!rule || (rule.requiresAssignment && request.assignedStaffId !== request.actor.id)) {
    return { allowed: false, code: 'ACCESS_DENIED' };
  }
  if (rule.requiresReason && !request.reason?.trim()) {
    return { allowed: false, code: 'REASON_REQUIRED' };
  }
  if (rule.prerequisites.some((item) => !request.completedPrerequisites.includes(item))) {
    return { allowed: false, code: 'PREREQUISITES_MISSING' };
  }
  return { allowed: true, nextStage: rule.to };
}

export const CHART_PRIORITIES = ['ROUTINE', 'URGENT'] as const;
export type ChartPriority = (typeof CHART_PRIORITIES)[number];
export type ChartStatus = 'OPEN' | 'CLOSED' | 'DISCONTINUED';

/** Fields for issuing a chart. The RT number is typed in by the consultant who creates the file. */
export interface IssueChartRequest {
  rtNumber: string;
  plannedSessions: number;
  priority?: ChartPriority;
  /** Optional short pointers into the planning system. Never patient names, images or findings. */
  planId?: string;
  contourSetName?: string;
  scanReference?: string;
}

/** A chart as the work tracker shows it. A chart holds no patient information. */
export interface ChartSummary {
  id: string;
  rtNumber: string;
  stage: { code: string; label: string };
  stageSince: string;
  minutesInStage: number;
  status: ChartStatus;
  version: number;
  plannedSessions: number | null;
  priority: ChartPriority;
  planId: string | null;
  contourSetName: string | null;
  scanReference: string | null;
  issuedBy: string;
  createdAt: string;
}

export interface ChartHistoryEntry {
  action: string;
  fromStage: string | null;
  fromStageLabel: string | null;
  toStage: string;
  toStageLabel: string;
  actorName: string;
  actorRoles: readonly string[];
  reason: string | null;
  occurredAt: string;
}

export interface ChartDetail extends ChartSummary {
  history: readonly ChartHistoryEntry[];
}

export interface ChartList {
  items: readonly ChartSummary[];
  total: number;
}

/** Error body for every refused request. `details` lists the fields that failed validation. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: readonly { field: string; message: string }[];
}
