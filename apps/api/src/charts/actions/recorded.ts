import type { RecordedFact } from '@oncotrack/contracts';
import { formatDate, formatWhen } from './dates.js';
import type { ChartData } from './types.js';

const day = (data: ChartData, key: string) => (data[key] ? formatDate(data[key]) : null);
const when = (data: ChartData, dateKey: string, timeKey: string) =>
  data[dateKey]
    ? data[timeKey]
      ? formatWhen(data[dateKey], data[timeKey])
      : formatDate(data[dateKey])
    : null;

/** The facts a chart has gathered so far, in the order the work happens. Only facts that exist are shown. */
const ROWS: readonly (readonly [label: string, read: (data: ChartData) => string | null])[] = [
  ['Mould appointment', (d) => when(d, 'mouldDate', 'mouldTime')],
  ['CT Sim appointment', (d) => when(d, 'ctDate', 'ctTime')],
  ['Mould done', (d) => day(d, 'mouldDoneOn')],
  ['CT Sim done', (d) => day(d, 'ctDoneOn')],
  ['Contouring assigned to', (d) => d.contourAssignee ?? null],
  ['Contouring due by', (d) => day(d, 'contourDue')],
  ['Contouring submitted', (d) => day(d, 'contourSubmittedOn')],
  ['Contouring verified by senior resident', (d) => day(d, 'seniorVerifiedOn')],
  ['Contouring approved', (d) => day(d, 'contourApprovedOn')],
  ['Plan submitted', (d) => day(d, 'planSubmittedOn')],
  [
    'Plan approved',
    (d) =>
      d.planApprovedOn
        ? `${formatDate(d.planApprovedOn)}${d.approvedBy ? `, by the ${d.approvedBy.toLowerCase()}` : ''}`
        : null,
  ],
  [
    'Plan sent to LINAC',
    (d) =>
      d.linacSentOn
        ? `${formatDate(d.linacSentOn)}, ${d.linacMachine ?? ''}`.replace(/, $/, '')
        : null,
  ],
  ['First treatment slot', (d) => when(d, 'firstSlotDate', 'firstSlotTime')],
  [
    'Patient told',
    (d) =>
      d.informedOn
        ? `${formatDate(d.informedOn)}${d.informedHow ? `, ${d.informedHow.toLowerCase()}` : ''}`
        : null,
  ],
  ['Patient to arrive', (d) => when(d, 'arriveDate', 'arriveTime')],
  ['Treatment started', (d) => day(d, 'startOn')],
  [
    'Treatment finished',
    (d) =>
      d.completeOn
        ? `${formatDate(d.completeOn)}${d.sessionsFinal ? `, ${d.sessionsFinal} sessions given` : ''}`
        : null,
  ],
];

export function recordedFacts(data: ChartData): RecordedFact[] {
  const facts: RecordedFact[] = [];
  for (const [label, read] of ROWS) {
    const value = read(data);
    if (value) facts.push({ label, value });
  }
  return facts;
}
