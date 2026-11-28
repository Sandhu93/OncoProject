import 'server-only';

import {
  CHART_PRIORITIES,
  type ChartDetail,
  type ChartList,
  type ChartQueue,
  type ChartSummary,
  CLINICAL_ROLES,
  type IssueChartRequest,
  type PerformActionRequest,
  type PostCommentRequest,
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
  phase: z.string().nullable(),
  waitingFor: z.string().nullable(),
  ownerRole: z.enum(CLINICAL_ROLES).nullable(),
  issuedBy: z.string(),
  createdAt: z.string(),
});

const ChartListSchema = z.object({ items: z.array(ChartSummarySchema), total: z.number() });

const ActionFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['heading', 'text', 'area', 'date', 'time', 'number', 'select', 'staff']),
  required: z.boolean(),
  help: z.string().optional(),
  placeholder: z.string().optional(),
  maxLength: z.number().optional(),
  min: z.string().optional(),
  max: z.string().optional(),
  default: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  staffRole: z.enum(CLINICAL_ROLES).optional(),
});

const AvailableActionSchema = z.object({
  action: z.string(),
  label: z.string(),
  requiresReason: z.boolean(),
  fields: z.array(ActionFieldSchema),
  checks: z.array(z.object({ label: z.string(), ok: z.boolean(), detail: z.string() })),
});

const ChartCommentSchema = z.object({
  id: z.string(),
  kind: z.enum(['COMMENT', 'HANDOFF']),
  body: z.string(),
  authorName: z.string(),
  authorRoles: z.array(z.enum(CLINICAL_ROLES)),
  forRole: z.enum(CLINICAL_ROLES).nullable(),
  stageLabel: z.string(),
  createdAt: z.string(),
});

const ChartDetailSchema = ChartSummarySchema.extend({
  comments: z.array(ChartCommentSchema),
  recorded: z.array(z.object({ label: z.string(), value: z.string() })),
  weekly: z
    .object({
      weekEnding: z.string(),
      updates: z.array(z.object({ role: z.enum(CLINICAL_ROLES), posted: z.boolean() })),
    })
    .nullable(),
  availableActions: z.array(AvailableActionSchema),
  controls: z.array(AvailableActionSchema),
  history: z.array(
    z.object({
      action: z.string(),
      summary: z.string().nullable(),
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

const QueueItemSchema = z.object({
  rtNumber: z.string(),
  priority: z.enum(CHART_PRIORITIES),
  stage: z.object({ code: z.string(), label: z.string() }),
  phase: z.string().nullable(),
  stageNumber: z.number(),
  stageCount: z.number(),
  daysInStage: z.number(),
  stalled: z.boolean(),
  needsYou: z.boolean(),
  nextStep: z.string().nullable(),
  waitingOn: z.string(),
  assignedTo: z.string().nullable(),
  assignedToYou: z.boolean(),
  dateLine: z.string().nullable(),
  treatmentDay: z.number().nullable(),
  sessionsDone: z.number().nullable(),
  plannedSessions: z.number().nullable(),
  weeklyMissing: z.array(z.enum(CLINICAL_ROLES)),
});

const ChartQueueSchema = z.object({
  stallDays: z.number(),
  weekEnding: z.string(),
  items: z.array(QueueItemSchema),
  totals: z.object({
    open: z.number(),
    gettingReady: z.number(),
    stalled: z.number(),
    inTreatment: z.number(),
    saturdayUpdatesToCome: z.number(),
  }),
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

  /** Every open chart, the ones that need the signed-in person first. */
  static queue = () =>
    handleRequest<ChartQueue>('/charts/queue', {
      requiresAuth: true,
      parse: data => ChartQueueSchema.parse(data),
    });

  /** One chart and its history. A 404 throws an `ApiError` with code `CHART_NOT_FOUND`. */
  static find = (rtNumber: string) =>
    handleRequest<ChartDetail>(`/charts/by-number/${encodeURIComponent(rtNumber)}`, {
      requiresAuth: true,
      parse: data => ChartDetailSchema.parse(data),
    });

  /**
   * Records one step. `expectedVersion` is the chart version the person saw: a chart that changed since is
   * refused (`CHART_CHANGED`). The same `idempotencyKey` for the same request returns the first result.
   */
  static perform = (rtNumber: string, action: string, payload: PerformActionRequest, idempotencyKey: string) =>
    handleRequest<ChartDetail>(
      `/charts/by-number/${encodeURIComponent(rtNumber)}/actions/${encodeURIComponent(action)}`,
      {
        requiresAuth: true,
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
        parse: data => ChartDetailSchema.parse(data),
      },
    );

  /** Adds a comment to a chart's discussion. */
  static comment = (rtNumber: string, payload: PostCommentRequest, idempotencyKey: string) =>
    handleRequest<ChartDetail>(`/charts/by-number/${encodeURIComponent(rtNumber)}/comments`, {
      requiresAuth: true,
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
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
