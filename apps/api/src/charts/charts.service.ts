import { Inject, Injectable } from '@nestjs/common';
import type {
  ChartDetail,
  ChartHistoryEntry,
  ChartList,
  ChartPriority,
  ChartStatus,
  ChartSummary,
} from '@oncotrack/contracts';
import type { Actor } from '../auth/actor.js';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import { CommandService } from '../transactions/command.service.js';
import { DomainError } from '../transactions/domain-error.js';
import { normaliseRtNumber, parseIssueChart } from './issue-chart.parse.js';

/** Assumed until D-02 (who registers charts) is answered: the consultant issues the chart. */
export const ISSUING_ROLE = 'CONSULTANT';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface ChartRow {
  id: string;
  display_number: string;
  stage_code: string;
  stage_label: string;
  current_stage_since: Date | string;
  minutes_in_stage: string | number;
  status: ChartStatus;
  version: number;
  planned_sessions: number | null;
  priority: ChartPriority;
  plan_id: string | null;
  contour_set_name: string | null;
  scan_reference: string | null;
  issued_by: string;
  created_at: Date | string;
}

const CHART_SELECT = `
  SELECT c.id, c.display_number, c.current_stage AS stage_code, s.label AS stage_label,
         c.current_stage_since, floor(extract(epoch FROM (now() - c.current_stage_since)) / 60) AS minutes_in_stage,
         c.status, c.version, c.planned_sessions, c.priority, c.plan_id, c.contour_set_name,
         c.scan_reference, u.full_name AS issued_by, c.created_at
    FROM rt_charts c
    JOIN workflow_stages s ON s.workflow_id = c.workflow_id AND s.code = c.current_stage
    JOIN staff_users u ON u.id = c.created_by`;

const iso = (value: Date | string) => new Date(value).toISOString();

function toSummary(row: ChartRow): ChartSummary {
  return {
    id: row.id,
    rtNumber: row.display_number,
    stage: { code: row.stage_code, label: row.stage_label },
    stageSince: iso(row.current_stage_since),
    minutesInStage: Number(row.minutes_in_stage),
    status: row.status,
    version: row.version,
    plannedSessions: row.planned_sessions,
    priority: row.priority,
    planId: row.plan_id,
    contourSetName: row.contour_set_name,
    scanReference: row.scan_reference,
    issuedBy: row.issued_by,
    createdAt: iso(row.created_at),
  };
}

export interface ListFilters {
  q?: string;
  status?: string;
  stage?: string;
  limit?: string;
  offset?: string;
}

@Injectable()
export class ChartsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandService) private readonly commands: CommandService,
  ) {}

  async issue(actor: Actor, key: string | undefined, body: unknown) {
    if (!actor.roles.includes(ISSUING_ROLE)) {
      throw new DomainError(403, 'ROLE_NOT_ALLOWED', 'Only a consultant can issue a chart.');
    }
    const input = parseIssueChart(body);
    return this.commands.run(
      actor,
      { operation: 'chart.issue', key, payload: input },
      async (tx, { requestId }) => {
        const workflow = await tx.query<{ id: string; stage: string }>(
          `SELECT w.id, s.code AS stage
             FROM workflow_versions w JOIN workflow_stages s ON s.workflow_id = w.id AND s.is_initial
            WHERE w.status = 'ACTIVE'
            ORDER BY w.approved_at DESC LIMIT 1`,
        );
        const active = workflow.rows[0];
        if (!active) {
          throw new DomainError(
            409,
            'WORKFLOW_NOT_ACTIVE',
            'The department workflow has not been approved yet, so charts cannot be issued.',
          );
        }
        const duplicate = await tx.query('SELECT 1 FROM rt_charts WHERE display_number = $1', [
          input.rtNumber,
        ]);
        if (duplicate.rowCount > 0) {
          throw new DomainError(
            409,
            'RT_NUMBER_EXISTS',
            `A chart with RT number ${input.rtNumber} already exists.`,
          );
        }
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO rt_charts(display_number, workflow_id, current_stage, consultant_id, created_by,
                                 planned_sessions, priority, plan_id, contour_set_name, scan_reference)
           VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            input.rtNumber,
            active.id,
            active.stage,
            actor.id,
            input.plannedSessions,
            input.priority,
            input.planId,
            input.contourSetName,
            input.scanReference,
          ],
        );
        const chartId = inserted.rows[0]!.id;
        await tx.query(
          `INSERT INTO chart_stage_history(chart_id, workflow_id, from_stage, to_stage, action, actor_id, actor_roles, chart_version)
           VALUES ($1, $2, NULL, $3, 'ISSUE_CHART', $4, $5::text[], 1)`,
          [chartId, active.id, active.stage, actor.id, [...actor.roles]],
        );
        await tx.query(
          `INSERT INTO audit_events(chart_id, actor_id, actor_roles, action, entity_type, entity_id, after_values, request_id)
           VALUES ($1::uuid, $2::uuid, $3::text[], 'CHART_ISSUED', 'RT_CHART', $6::text, $4::jsonb, $5::uuid)`,
          [
            chartId,
            actor.id,
            [...actor.roles],
            JSON.stringify({
              rtNumber: input.rtNumber,
              plannedSessions: input.plannedSessions,
              priority: input.priority,
            }),
            requestId,
            chartId,
          ],
        );
        await tx.query(
          `INSERT INTO outbox_events(chart_id, event_type, payload)
           VALUES ($1, 'CHART_ISSUED', $2::jsonb)`,
          [chartId, JSON.stringify({ chartId, rtNumber: input.rtNumber, stage: active.stage })],
        );
        const created = await this.loadSummary(tx, chartId);
        return { status: 201, body: created };
      },
    );
  }

  private async loadSummary(db: Queryable, chartId: string): Promise<ChartSummary> {
    const result = await db.query<ChartRow>(`${CHART_SELECT} WHERE c.id = $1`, [chartId]);
    return toSummary(result.rows[0]!);
  }

  async list(filters: ListFilters): Promise<ChartList> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      if (!['OPEN', 'CLOSED', 'DISCONTINUED'].includes(filters.status)) {
        throw new DomainError(400, 'VALIDATION_FAILED', 'Some filters need attention.', [
          { field: 'status', message: 'Use OPEN, CLOSED or DISCONTINUED.' },
        ]);
      }
      params.push(filters.status);
      where.push(`c.status = $${params.length}`);
    }
    if (filters.stage) {
      params.push(filters.stage);
      where.push(`c.current_stage = $${params.length}`);
    }
    if (filters.q?.trim()) {
      // RT numbers hold only letters, digits and / . _ - so there is nothing to escape except LIKE's own symbols.
      const needle = normaliseRtNumber(filters.q).replace(/[\\%_]/g, (char) => `\\${char}`);
      params.push(`%${needle}%`);
      where.push(`c.display_number LIKE $${params.length}`);
    }
    const limit = Math.min(
      Math.max(Number.parseInt(filters.limit ?? '', 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = Math.max(Number.parseInt(filters.offset ?? '', 10) || 0, 0);
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const total = await this.database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM rt_charts c ${clause}`,
      params,
    );
    // Urgent first, then the chart that has waited longest in its stage.
    const rows = await this.database.query<ChartRow>(
      `${CHART_SELECT} ${clause}
        ORDER BY (c.priority = 'URGENT') DESC, c.current_stage_since ASC, c.display_number ASC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return { items: rows.rows.map(toSummary), total: Number(total.rows[0]?.count ?? 0) };
  }

  async findByNumber(rtNumber: string): Promise<ChartDetail> {
    const number = normaliseRtNumber(rtNumber);
    const found = await this.database.query<ChartRow>(
      `${CHART_SELECT} WHERE c.display_number = $1`,
      [number],
    );
    const row = found.rows[0];
    if (!row) throw new DomainError(404, 'CHART_NOT_FOUND', `No chart has RT number ${number}.`);
    const history = await this.database.query<{
      action: string;
      from_stage: string | null;
      from_label: string | null;
      to_stage: string;
      to_label: string;
      actor_name: string;
      actor_roles: string[];
      reason: string | null;
      occurred_at: Date | string;
    }>(
      `SELECT h.action, h.from_stage, fs.label AS from_label, h.to_stage, ts.label AS to_label,
              u.full_name AS actor_name, h.actor_roles, h.reason, h.occurred_at
         FROM chart_stage_history h
         JOIN staff_users u ON u.id = h.actor_id
         JOIN workflow_stages ts ON ts.workflow_id = h.workflow_id AND ts.code = h.to_stage
         LEFT JOIN workflow_stages fs ON fs.workflow_id = h.workflow_id AND fs.code = h.from_stage
        WHERE h.chart_id = $1 ORDER BY h.chart_version ASC`,
      [row.id],
    );
    const entries: ChartHistoryEntry[] = history.rows.map((entry) => ({
      action: entry.action,
      fromStage: entry.from_stage,
      fromStageLabel: entry.from_label,
      toStage: entry.to_stage,
      toStageLabel: entry.to_label,
      actorName: entry.actor_name,
      actorRoles: entry.actor_roles,
      reason: entry.reason,
      occurredAt: iso(entry.occurred_at),
    }));
    return { ...toSummary(row), history: entries };
  }
}
