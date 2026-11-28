import { formatDate, formatWhen } from './actions/dates.js';
import type { ChartData } from './actions/types.js';

/** The one stage where charts are being treated: it never counts as stalled and asks for Saturday updates. */
export const TREATMENT_STAGE = 'TREATMENT_IN_PROGRESS';

const ROLE_NAMES: Record<string, string> = {
  CONSULTANT: 'Consultant',
  SENIOR_RESIDENT: 'Senior resident',
  JUNIOR_RESIDENT: 'Junior resident',
  PHYSICIST: 'Physicist',
  RADIOGRAPHER: 'Radiographer',
};

export const roleName = (role: string) => ROLE_NAMES[role] ?? role;

const lower = (role: string) => roleName(role).toLowerCase();

/** Whole days from one YYYY-MM-DD day to another. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const when = (data: ChartData, dateKey: string, timeKey: string) =>
  data[dateKey]
    ? data[timeKey]
      ? formatWhen(data[dateKey], data[timeKey])
      : formatDate(data[dateKey])
    : null;

/** The date that matters most while a chart is in this stage. */
export function dateLine(
  stage: string,
  data: ChartData,
  today: string,
  planned: number | null,
): string | null {
  switch (stage) {
    case 'RT_CHART_ISSUED':
      return 'Dates not recorded yet';
    case 'SIMULATION_DATES_GIVEN': {
      const mould = when(data, 'mouldDate', 'mouldTime');
      return mould ? `Mould booked ${mould}` : null;
    }
    case 'MOULD_DONE': {
      const ct = when(data, 'ctDate', 'ctTime');
      return ct ? `CT Sim booked ${ct}` : null;
    }
    case 'CONTOURING': {
      if (!data.contourDue) return null;
      return data.contourDue < today
        ? `Late: was due ${formatDate(data.contourDue)}`
        : `Contouring due ${formatDate(data.contourDue)}`;
    }
    case 'PLAN_APPROVED':
    case 'PLAN_ON_LINAC': {
      const slot = when(data, 'firstSlotDate', 'firstSlotTime');
      return slot ? `First treatment ${slot}` : null;
    }
    case 'PATIENT_INFORMED': {
      const arrive = when(data, 'arriveDate', 'arriveTime');
      return arrive ? `Patient arrives ${arrive}` : null;
    }
    case TREATMENT_STAGE: {
      if (!data.startOn) return null;
      const done = data.sessionsDone === undefined ? null : Number(data.sessionsDone);
      const sessions =
        done === null ? '' : ` · ${done}${planned === null ? '' : ` of ${planned}`} sessions`;
      return `Started ${formatDate(data.startOn)}${sessions}`;
    }
    default:
      return null;
  }
}

/** Treatment day: 1 on the day treatment started. */
export function treatmentDay(data: ChartData, today: string): number | null {
  if (!data.startOn) return null;
  return Math.max(daysBetween(data.startOn, today) + 1, 1);
}

/**
 * Plain words for what the signed-in person can do: the forward steps joined with "or", then "or send back"
 * when the stage can return the chart. A Saturday update is named last.
 */
export function nextStepText(forward: readonly string[], canSendBack: boolean, weekly: boolean) {
  const parts = [...forward];
  if (weekly) parts.push('Post your Saturday update');
  if (parts.length === 0 && !canSendBack) return null;
  let text = parts.join(' or ');
  if (canSendBack) text = text ? `${text}, or send back` : 'Send back';
  return text;
}

/** Who the chart is waiting for. */
export function waitingOn(input: {
  stage: string;
  ownerRole: string | null;
  assignee: string | null;
  weeklyMissing: readonly string[];
}): string {
  if (input.stage === 'CONTOURING' && input.assignee) return `Junior resident ${input.assignee}`;
  if (input.stage === TREATMENT_STAGE) {
    if (input.weeklyMissing.length === 0) return 'Nobody this week: Saturday updates are in';
    return `${input.weeklyMissing.map((role, index) => (index === 0 ? roleName(role) : lower(role))).join(' and ')} (Saturday update)`;
  }
  return input.ownerRole ? roleName(input.ownerRole) : 'No one (finished)';
}

/** Urgent charts first, then the longest wait; charts in treatment come last. */
export function queueOrder(a: SortKey, b: SortKey): number {
  const weight = (item: SortKey) =>
    (item.stage === TREATMENT_STAGE ? -1000 : 0) +
    item.daysInStage +
    (item.priority === 'URGENT' ? 100 : 0);
  return weight(b) - weight(a) || a.rtNumber.localeCompare(b.rtNumber);
}

interface SortKey {
  stage: string;
  daysInStage: number;
  priority: string;
  rtNumber: string;
}
