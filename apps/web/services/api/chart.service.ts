import 'server-only';

import {
  CHART_PRIORITIES,
  type ChartDetail,
  type ChartList,
  type ChartSummary,
  type IssueChartRequest,
} from '@oncotrack/contracts';
import { z } from 'zod';

import { handleRequest } from './base.service';

/** The API's chart shapes; defined once in `@oncotrack/contracts`. Checked here so a wrong reply is caught early. */
const ChartSummarySchema = z.object({
  id: z.string(),
  rtNumber: z.string(),
  stage: z.object({ code: z.string(), label: z.string() }),
  stageSince: z.string(),
  minutesInStage: z.number(),
  status: z.enum(['OPEN', 'CLOSED', 'DISCONTINUED']),
  version: z.number(),
  plannedSessions: z.number().nullable(),
  priority: z.enum(CHART_PRIORITIES),
  planId: z.string().nullable(),
  contourSetName: z.string().nullable(),
  scanReference: z.string().nullable(),
  issuedBy: z.string(),
  createdAt: z.string(),
});

const ChartListSchema = z.object({ items: z.array(ChartSummarySchema), total: z.number() });

const ChartDetailSchema = ChartSummarySchema.extend({
  history: z.array(
    z.object({
      action: z.string(),
      fromStage: z.string().nullable(),
      fromStageLabel: z.string().nullable(),
      toStage: z.string(),
      toStageLabel: z.string(),
      actorName: z.string(),
      actorRoles: z.array(z.string()),
      reason: z.string().nullable(),
      occurredAt: z.string(),
    }),
  ),
});

export interface ChartListQuery {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export default class ChartService {
  static list = (query: ChartListQuery) =>
    handleRequest<ChartList>('/charts', {
      requiresAuth: true,
      query: { ...query },
      parse: data => ChartListSchema.parse(data),
    });

  /** One chart and its history. A 404 throws an `ApiError` with code `CHART_NOT_FOUND`. */
  static find = (rtNumber: string) =>
    handleRequest<ChartDetail>(`/charts/by-number/${encodeURIComponent(rtNumber)}`, {
      requiresAuth: true,
      parse: data => ChartDetailSchema.parse(data),
    });

  /** Issues a chart. The same `idempotencyKey` for the same details returns the first result instead of a second chart. */
  static issue = (payload: IssueChartRequest, idempotencyKey: string) =>
    handleRequest<ChartSummary>('/charts', {
      requiresAuth: true,
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
      parse: data => ChartSummarySchema.parse(data),
    });
}
