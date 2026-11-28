import { describe, expect, it } from 'vitest';
import type { ReportsView } from '@oncotrack/contracts';
import { csv, plain, tables } from '../../apps/api/src/reports/report-files.js';

const report: ReportsView = {
  range: { from: '2026-09-01', to: '2026-11-28' },
  stallDays: 3,
  generatedAt: '2026-11-28T10:00:00.000Z',
  waiting: [],
  stalled: [
    {
      rtNumber: 'RT-1',
      stage: 'CONTOURING',
      stageLabel: 'Contouring, "in progress"',
      phase: 'Contouring',
      daysInStage: 5,
      priority: 'URGENT',
      waitingFor: 'Waiting for the assigned junior resident',
      owner: 'Junior resident',
      assignedTo: null,
    },
  ],
  treatment: {
    summary: {
      started: 0,
      inTreatment: 0,
      finished: 0,
      stopped: 0,
      finishedShort: 0,
      averageDaysTaken: null,
      sessionsGivenPercent: null,
    },
    items: [],
  },
};

describe('REP-001 report files', () => {
  it('makes text that a spreadsheet would run as a formula plain', () => {
    for (const risky of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      expect(plain(risky)).toBe(`'${risky}`);
    }
    expect(plain('RT-100')).toBe('RT-100');
    expect(plain('')).toBe('');
  });

  it('writes CSV with a byte-order mark, Windows line ends, quoting and no formulas', () => {
    const table = tables(report).stalled;
    const text = csv({
      ...table,
      rows: [[...table.rows[0]!.slice(0, 1).map(() => '=EVIL()'), ...table.rows[0]!.slice(1)]],
    });

    expect(text.startsWith('﻿RT number,Stage,')).toBe(true);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.split('\r\n')).toHaveLength(3);
    expect(text).toContain(`'=EVIL()`);
    // A comma or a quote in a value is quoted, and the quote doubled.
    expect(text).toContain('"Contouring, ""in progress"""');
    // Blank where there is nothing.
    expect(text).toContain(',Junior resident,\r\n');
  });

  it('has the same columns in the header and in every row', () => {
    for (const table of Object.values(tables(report))) {
      expect(table.widths).toHaveLength(table.header.length);
      for (const row of table.rows) expect(row).toHaveLength(table.header.length);
    }
  });
});
