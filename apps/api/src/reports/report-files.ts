import type { ReportsView } from '@oncotrack/contracts';
import writeXlsxFile from 'write-excel-file/node';

export type ReportName = 'waiting' | 'stalled' | 'treatment';
export const REPORT_NAMES: readonly ReportName[] = ['waiting', 'stalled', 'treatment'];

type Cell = string | number | null;
export interface Table {
  name: string;
  title: string;
  header: readonly string[];
  rows: readonly (readonly Cell[])[];
  widths: readonly number[];
}

const OUTCOME = { IN_TREATMENT: 'In treatment', FINISHED: 'Finished', STOPPED: 'Stopped' } as const;

/** The three reports as plain tables, which is what both file formats are made from. */
export function tables(report: ReportsView): Record<ReportName, Table> {
  return {
    waiting: {
      name: 'Waiting time by stage',
      title: 'waiting-time-by-stage',
      header: [
        'Stage',
        'Phase',
        'Stays finished',
        'Median days',
        'Average days',
        '9 in 10 within days',
        'Longest days',
        'Charts waiting now',
        'Longest waiting now (days)',
      ],
      rows: report.waiting.map((row) => [
        row.stageLabel,
        row.phase,
        row.finished,
        row.medianDays,
        row.averageDays,
        row.ninetiethDays,
        row.longestDays,
        row.waitingNow,
        row.longestWaitingNowDays,
      ]),
      widths: [34, 16, 14, 13, 13, 18, 13, 18, 26],
    },
    stalled: {
      name: 'Stalled charts',
      title: 'stalled-charts',
      header: [
        'RT number',
        'Stage',
        'Phase',
        'Days in stage',
        'Priority',
        'Waiting for',
        'Role',
        'Contouring by',
      ],
      rows: report.stalled.map((row) => [
        row.rtNumber,
        row.stageLabel,
        row.phase,
        row.daysInStage,
        row.priority === 'URGENT' ? 'Urgent' : 'Routine',
        row.waitingFor,
        row.owner,
        row.assignedTo,
      ]),
      widths: [16, 34, 16, 14, 11, 58, 18, 24],
    },
    treatment: {
      name: 'Treatment completion',
      title: 'treatment-completion',
      header: [
        'RT number',
        'Outcome',
        'Started on',
        'Finished on',
        'Days taken',
        'Sessions planned',
        'Sessions given',
      ],
      rows: report.treatment.items.map((row) => [
        row.rtNumber,
        OUTCOME[row.outcome],
        row.startedOn,
        row.finishedOn,
        row.daysTaken,
        row.plannedSessions,
        row.sessionsGiven,
      ]),
      widths: [16, 14, 13, 13, 11, 16, 14],
    },
  };
}

/**
 * A spreadsheet runs text as a formula when it begins with one of these characters, and an RT number or a name could.
 * Such text gets a leading apostrophe, which spreadsheets show and do not execute.
 */
export function plain(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

// Written as a code so no editor or formatter turns it into an invisible character in the source.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const csvCell = (value: Cell): string => {
  if (value === null) return '';
  const text = typeof value === 'number' ? String(value) : plain(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** One report as CSV. A byte-order mark first, so Excel reads it as UTF-8, and Windows line endings. */
export function csv(table: Table): string {
  const lines = [table.header, ...table.rows].map((row) => row.map(csvCell).join(','));
  return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
}

/** All three reports as one workbook, one sheet each, with the range and the time on a first sheet. */
export async function workbook(report: ReportsView): Promise<Buffer> {
  const all = tables(report);
  const header = { fontWeight: 'bold' as const, backgroundColor: '#e4e4e7' };
  const sheet = (table: Table) => ({
    sheet: table.name,
    stickyRowsCount: 1,
    columns: table.widths.map((width) => ({ width })),
    data: [
      table.header.map((value) => ({ value, ...header })),
      ...table.rows.map((row) =>
        row.map((value) =>
          value === null
            ? null
            : typeof value === 'number'
              ? { value, type: Number }
              : { value: plain(value), type: String },
        ),
      ),
    ],
  });
  const about = {
    sheet: 'About',
    columns: [{ width: 28 }, { width: 44 }],
    data: [
      [{ value: 'OncoTrack reports', fontWeight: 'bold' as const }, null],
      [{ value: 'From' }, { value: report.range.from }],
      [{ value: 'To' }, { value: report.range.to }],
      [
        { value: 'Charts count as stalled after (days)' },
        { value: report.stallDays, type: Number },
      ],
      [{ value: 'Read at' }, { value: report.generatedAt }],
      [{ value: 'Charts are named by RT number only.' }, null],
    ],
  };
  return writeXlsxFile([
    about,
    sheet(all.waiting),
    sheet(all.stalled),
    sheet(all.treatment),
  ] as never).toBuffer();
}
