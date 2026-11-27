import { CHART_PRIORITIES, type ChartPriority, type IssueChartRequest } from '@oncotrack/contracts';
import { DomainError, type FieldProblem } from '../transactions/domain-error.js';

/** Letters, digits and / . _ - only, so an RT number is never free text. Format itself is open (D-03). */
export const RT_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9/._-]{0,39}$/;
const REFERENCE_MAX = 60;

export interface ParsedIssueChart {
  rtNumber: string;
  plannedSessions: number;
  priority: ChartPriority;
  planId: string | null;
  contourSetName: string | null;
  scanReference: string | null;
}

/** The RT number is stored in capitals so "rt-1" and "RT-1" can never be two charts. */
export function normaliseRtNumber(value: string): string {
  return value.trim().toUpperCase();
}

function optionalReference(value: unknown, field: string, problems: FieldProblem[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    problems.push({ field, message: 'Must be text.' });
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > REFERENCE_MAX) {
    problems.push({ field, message: `Use at most ${REFERENCE_MAX} characters.` });
    return null;
  }
  return trimmed;
}

export function parseIssueChart(body: unknown): ParsedIssueChart {
  const problems: FieldProblem[] = [];
  const input = (typeof body === 'object' && body !== null ? body : {}) as Partial<
    Record<keyof IssueChartRequest, unknown>
  >;

  let rtNumber = '';
  if (typeof input.rtNumber !== 'string' || input.rtNumber.trim() === '') {
    problems.push({ field: 'rtNumber', message: 'Enter the RT number.' });
  } else {
    rtNumber = normaliseRtNumber(input.rtNumber);
    if (!RT_NUMBER_PATTERN.test(rtNumber)) {
      problems.push({
        field: 'rtNumber',
        message: 'Use up to 40 letters, digits and / . _ - only, starting with a letter or digit.',
      });
    }
  }

  const sessions = input.plannedSessions;
  if (
    typeof sessions !== 'number' ||
    !Number.isInteger(sessions) ||
    sessions < 1 ||
    sessions > 100
  ) {
    problems.push({ field: 'plannedSessions', message: 'Enter a whole number from 1 to 100.' });
  }

  let priority: ChartPriority = 'ROUTINE';
  if (input.priority !== undefined) {
    if (!CHART_PRIORITIES.includes(input.priority as ChartPriority)) {
      problems.push({ field: 'priority', message: 'Choose ROUTINE or URGENT.' });
    } else {
      priority = input.priority as ChartPriority;
    }
  }

  const planId = optionalReference(input.planId, 'planId', problems);
  const contourSetName = optionalReference(input.contourSetName, 'contourSetName', problems);
  const scanReference = optionalReference(input.scanReference, 'scanReference', problems);

  if (problems.length > 0) {
    throw new DomainError(400, 'VALIDATION_FAILED', 'Some fields need attention.', problems);
  }
  return {
    rtNumber,
    plannedSessions: sessions as number,
    priority,
    planId,
    contourSetName,
    scanReference,
  };
}
