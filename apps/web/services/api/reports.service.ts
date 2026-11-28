import 'server-only';

import type { ReportsView } from '@oncotrack/contracts';
import { z } from 'zod';

import { handleRequest } from './base.service';

const nullableNumber = z.number().nullable();

const ReportsSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  stallDays: z.number(),
  generatedAt: z.string(),
  waiting: z.array(
    z.object({
      stage: z.string(),
      stageLabel: z.string(),
      phase: z.string().nullable(),
      finished: z.number(),
      medianDays: nullableNumber,
      averageDays: nullableNumber,
      ninetiethDays: nullableNumber,
      longestDays: nullableNumber,
      waitingNow: z.number(),
      longestWaitingNowDays: nullableNumber,
    }),
  ),
  stalled: z.array(
    z.object({
      rtNumber: z.string(),
      stage: z.string(),
      stageLabel: z.string(),
      phase: z.string().nullable(),
      daysInStage: z.number(),
      priority: z.string(),
      waitingFor: z.string(),
      owner: z.string().nullable(),
      assignedTo: z.string().nullable(),
    }),
  ),
  treatment: z.object({
    summary: z.object({
      started: z.number(),
      inTreatment: z.number(),
      finished: z.number(),
      stopped: z.number(),
      finishedShort: z.number(),
      averageDaysTaken: nullableNumber,
      sessionsGivenPercent: nullableNumber,
    }),
    items: z.array(
      z.object({
        rtNumber: z.string(),
        outcome: z.enum(['IN_TREATMENT', 'FINISHED', 'STOPPED']),
        startedOn: z.string(),
        finishedOn: z.string().nullable(),
        daysTaken: nullableNumber,
        plannedSessions: nullableNumber,
        sessionsGiven: nullableNumber,
      }),
    ),
  }),
});

export type ReportFile = 'xlsx' | 'waiting' | 'stalled' | 'treatment';

export default class ReportsService {
  /** The three reports for a range of dates (the last 90 days when none is given). Needs EXPORT_REPORTS. */
  static report = (range: { from?: string; to?: string }) =>
    handleRequest<ReportsView>('/reports', {
      requiresAuth: true,
      query: { ...range },
      parse: data => ReportsSchema.parse(data) as ReportsView,
    });

  /** A download: the workbook with all three reports, or one report as CSV. */
  static file = (file: ReportFile, range: { from?: string; to?: string }) =>
    handleRequest<Blob>(file === 'xlsx' ? '/reports/export.xlsx' : `/reports/export/${file}`, {
      requiresAuth: true,
      query: { ...range },
      responseType: 'blob',
    });
}
