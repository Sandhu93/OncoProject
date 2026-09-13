export const CLINICAL_ROLES = [
  'JUNIOR_RESIDENT',
  'SENIOR_RESIDENT',
  'CONSULTANT',
  'PHYSICIST',
  'RADIOGRAPHER',
] as const;

export type ClinicalRole = (typeof CLINICAL_ROLES)[number];

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
