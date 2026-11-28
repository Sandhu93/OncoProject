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
  /** The workflow phase this stage belongs to (Getting ready, Contouring, Planning, Treatment). */
  phase: string | null;
  /** Who the chart is waiting for, in plain words ("the radiographer to give mould and CT Sim dates"). */
  waitingFor: string | null;
  /** The role that can take the next step; null when tracking has ended. */
  ownerRole: ClinicalRole | null;
  issuedBy: string;
  createdAt: string;
}

export interface ChartHistoryEntry {
  action: string;
  /** One plain sentence of what was recorded, written by the step (e.g. "Mould done on 3 Dec 2026."). */
  summary: string | null;
  fromStage: string | null;
  fromStageLabel: string | null;
  toStage: string;
  toStageLabel: string;
  actorName: string;
  actorRoles: readonly string[];
  reason: string | null;
  occurredAt: string;
}

/** One field of a step's form. The API owns the rules; screens only draw what they are given. */
export type ActionFieldType =
  'heading' | 'text' | 'area' | 'date' | 'time' | 'number' | 'select' | 'staff';

export interface ActionField {
  key: string;
  label: string;
  type: ActionFieldType;
  required: boolean;
  help?: string;
  placeholder?: string;
  maxLength?: number;
  /** Earliest date (YYYY-MM-DD) or smallest number. */
  min?: string;
  /** Latest date (YYYY-MM-DD) or largest number. */
  max?: string;
  /** What the field starts with. */
  default?: string;
  options?: readonly { value: string; label: string }[];
  /** For `staff` fields: the role whose members can be chosen. */
  staffRole?: ClinicalRole;
}

/** A condition the step shows before it can be done (for example "Plan approved: not yet"). */
export interface ActionCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/** A step the signed-in person can take on this chart right now. */
export interface AvailableAction {
  action: string;
  label: string;
  /** True for "send back": the person must say why. */
  requiresReason: boolean;
  fields: readonly ActionField[];
  checks: readonly ActionCheck[];
}

export interface PerformActionRequest {
  /** The chart version the person saw. A changed chart is refused instead of overwritten. */
  expectedVersion: number;
  values: Readonly<Record<string, string>>;
}

/** Something already recorded on the chart, ready to show. */
export interface RecordedFact {
  label: string;
  value: string;
}

/** Who has posted this week's Saturday update, for a chart in treatment. */
export interface WeeklyStatus {
  /** The Saturday the week ends on (YYYY-MM-DD). */
  weekEnding: string;
  updates: readonly { role: ClinicalRole; posted: boolean }[];
}

/** A message on a chart: a comment anyone signed in can write, or the note left when a chart was passed on. */
export interface ChartComment {
  id: string;
  kind: 'COMMENT' | 'HANDOFF';
  body: string;
  authorName: string;
  authorRoles: readonly ClinicalRole[];
  /** The role it is addressed to, when it was addressed to one. */
  forRole: ClinicalRole | null;
  stageLabel: string;
  createdAt: string;
}

export interface PostCommentRequest {
  body: string;
  /** Optional: this role is notified. Without it, whoever the chart is waiting for is. */
  forRole?: ClinicalRole | null;
}

export interface ChartDetail extends ChartSummary {
  history: readonly ChartHistoryEntry[];
  /** The discussion, oldest first. */
  comments: readonly ChartComment[];
  recorded: readonly RecordedFact[];
  /** Saturday updates due this week; null when the chart is not in a stage that asks for them. */
  weekly: WeeklyStatus | null;
  /** Steps the signed-in person may take now: empty when it is someone else's turn. */
  availableActions: readonly AvailableAction[];
  /** Consultant overrides (reassign, return to an earlier stage, discontinue, reopen); empty for everyone else. */
  controls: readonly AvailableAction[];
}

export interface ChartList {
  items: readonly ChartSummary[];
  total: number;
}

/** One open chart as it appears in the queue and the all-charts view. */
export interface QueueItem {
  rtNumber: string;
  priority: ChartPriority;
  stage: { code: string; label: string };
  phase: string | null;
  /** Position of the stage in the workflow (1-based) and the number of stages, for a progress bar. */
  stageNumber: number;
  stageCount: number;
  /** Calendar days (India Standard Time) since the chart moved into this stage. */
  daysInStage: number;
  /** Waiting longer than the stall threshold, outside treatment. */
  stalled: boolean;
  /** The signed-in person can take a step on this chart now. */
  needsYou: boolean;
  /** What the signed-in person can do, in plain words ("Record mould done or send back"); null when nothing. */
  nextStep: string | null;
  /** Who the chart is waiting for ("Consultant", "Junior resident Dr Rao", "Radiographer (Saturday update)"). */
  waitingOn: string;
  /** The junior resident contouring, when the chart is in contouring. */
  assignedTo: string | null;
  assignedToYou: boolean;
  /** The most useful date for this stage ("CT Sim booked 3 Dec 2026, 10:00"); null when there is none. */
  dateLine: string | null;
  /** Treatment day, counted from the day treatment started (1 on the first day). */
  treatmentDay: number | null;
  sessionsDone: number | null;
  plannedSessions: number | null;
  /** Saturday updates still to come this week, by role; empty outside treatment. */
  weeklyMissing: readonly ClinicalRole[];
}

/** One stage of the active workflow with the open charts in it, for the stage map. */
export interface StageSummary {
  code: string;
  label: string;
  phase: string | null;
  /** 1-based position in the workflow. */
  position: number;
  open: number;
  stalled: number;
  /** RT numbers of the open charts here, most urgent and longest-waiting first. */
  charts: readonly string[];
}

export interface ChartQueue {
  /** Days a chart may wait in a stage before it counts as stalled (outside treatment). */
  stallDays: number;
  /** The Saturday this week's updates are dated by. */
  weekEnding: string;
  /** Every open chart: the ones that need the signed-in person first, most urgent and longest-waiting first. */
  items: readonly QueueItem[];
  /** Every stage of the active workflow in order, with how many open charts are in each. */
  stages: readonly StageSummary[];
  totals: {
    open: number;
    gettingReady: number;
    stalled: number;
    inTreatment: number;
    saturdayUpdatesToCome: number;
  };
}

/** One line in a person's inbox. */
export interface NotificationItem {
  id: string;
  /** YOUR_TURN, SENT_BACK, ASSIGNED, REASSIGNED, DISCONTINUED, STALLED, WEEKLY_DUE, COMMENT or FINISHED. */
  kind: string;
  message: string;
  rtNumber: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationList {
  items: readonly NotificationItem[];
  unread: number;
}

/** Error body for every refused request. `details` lists the fields that failed validation. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: readonly { field: string; message: string }[];
}

/** One appointment on the calendar, taken from the dates given on an open chart. */
export interface CalendarEntry {
  rtNumber: string;
  kind: 'MOULD' | 'CT_SIM' | 'FIRST_TREATMENT';
  /** YYYY-MM-DD. */
  date: string;
  /** HH:MM, or an empty string when none was given. */
  time: string;
  /** The machine, for a first treatment. */
  resource: string | null;
  /** Already done (mould made, CT Sim done, treatment started). */
  done: boolean;
  stage: { code: string; label: string };
}

export interface CalendarDay {
  date: string;
  entries: readonly CalendarEntry[];
}

export interface Calendar {
  today: string;
  from: string;
  to: string;
  /** Appointments before today that were never recorded as done, oldest first. */
  late: readonly CalendarEntry[];
  /** Every day from `from` to `to`, with its appointments in time order. */
  days: readonly CalendarDay[];
}

/** A staff account as the staff-management screen sees it. Never includes the password. */
export interface StaffMember {
  id: string;
  username: string;
  fullName: string;
  roles: readonly ClinicalRole[];
  capabilities: readonly StaffCapability[];
  /** Can sign in. A switched-off account keeps its history but cannot sign in. */
  isActive: boolean;
  /** Offered when a chart is assigned (for example to contour); false while on leave. */
  isAvailable: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CreateStaffRequest {
  username: string;
  fullName: string;
  roles: readonly ClinicalRole[];
  capabilities: readonly StaffCapability[];
  password: string;
}

/** Only what is sent changes. Roles and capabilities replace the whole set. */
export interface UpdateStaffRequest {
  fullName?: string;
  roles?: readonly ClinicalRole[];
  capabilities?: readonly StaffCapability[];
  isActive?: boolean;
  isAvailable?: boolean;
}

export interface WorkflowStageView {
  code: string;
  label: string;
  phase: string | null;
  position: number;
  isInitial: boolean;
  isTerminal: boolean;
  /** Roles that post a Saturday update in this stage (empty when none). */
  weeklyUpdateRoles: readonly ClinicalRole[];
}

export interface WorkflowTransitionView {
  from: string;
  fromLabel: string;
  action: string;
  /** What the step is called on screen. */
  actionLabel: string;
  role: ClinicalRole;
  to: string;
  toLabel: string;
  requiresReason: boolean;
  requiresAssignment: boolean;
}

/** The workflow the department is running, to read. */
export interface WorkflowView {
  code: string;
  version: number;
  label: string;
  status: 'ACTIVE';
  approvedBy: string | null;
  approvedAt: string | null;
  stages: readonly WorkflowStageView[];
  transitions: readonly WorkflowTransitionView[];
}

export interface AuditEntry {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string;
  rtNumber: string | null;
  actorName: string | null;
  actorRoles: readonly string[];
  before: unknown;
  after: unknown;
}

export interface AuditList {
  items: readonly AuditEntry[];
  total: number;
  /** Every action name that appears in the trail, for the filter. */
  actions: readonly string[];
}
