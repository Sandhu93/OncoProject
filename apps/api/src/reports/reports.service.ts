import { Inject, Injectable } from '@nestjs/common';
import type {
  ReportsView,
  StalledChartRow,
  TreatmentRow,
  TreatmentSummary,
  WaitingTimeRow,
} from '@oncotrack/contracts';
import { requireCapability } from '../admin/capability.js';
import type { Actor } from '../auth/actor.js';
import { isIsoDate } from '../charts/actions/dates.js';
import { STAGE_INFO } from '../charts/actions/stage-info.js';
import { TREATMENT_STAGE, roleName } from '../charts/queue-model.js';
import { readConfig } from '../config.js';
import { DatabaseService } from '../database/database.service.js';
import { DomainError, type FieldProblem } from '../transactions/domain-error.js';

/** Longest range one report may cover, so a request cannot ask for years of history at once. */
export const REPORT_RANGE_MAX_DAYS = 800;
const DEFAULT_DAYS = 90;

export interface ReportQuery {
  from?: string;
  to?: string;
}

const round1 = (value: number | string | null): number | null =>
  value === null ? null : Math.round(Number(value) * 10) / 10;

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Reports for the department: how long charts wait in each stage, which charts are stalled now, and how treatment
 * is going. Charts appear by RT number only. Needs EXPORT_REPORTS; the same figures are what the downloads contain.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async report(actor: Actor, query: ReportQuery): Promise<ReportsView> {
    requireCapability(actor, 'EXPORT_REPORTS');
    const { stallDays } = readConfig();
    const range = await this.range(query);
    const [waiting, stalled, treatment] = await Promise.all([
      this.waiting(range.from, range.to),
      this.stalled(stallDays),
      this.treatment(range.from, range.to),
    ]);
    return {
      range,
      stallDays,
      generatedAt: new Date().toISOString(),
      waiting,
      stalled,
      treatment,
    };
  }

  /** The range asked for, or the last 90 days up to today. */
  private async range(query: ReportQuery): Promise<{ from: string; to: string }> {
    const today = (
      await this.database.query<{ today: string }>(
        `SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS today`,
      )
    ).rows[0]!.today;
    const problems: FieldProblem[] = [];
    const to = query.to?.trim() || today;
    if (!isIsoDate(to)) problems.push({ field: 'to', message: 'Use a date like 2026-12-01.' });
    let from = query.from?.trim() ?? '';
    if (from && !isIsoDate(from))
      problems.push({ field: 'from', message: 'Use a date like 2026-12-01.' });
    if (problems.length === 0) {
      from ||= (
        await this.database.query<{ day: string }>(
          `SELECT ($1::date - ${DEFAULT_DAYS - 1})::text AS day`,
          [to],
        )
      ).rows[0]!.day;
      const days = (
        await this.database.query<{ days: number }>(`SELECT ($1::date - $2::date)::int AS days`, [
          to,
          from,
        ])
      ).rows[0]!.days;
      if (days < 0) problems.push({ field: 'from', message: 'The start cannot be after the end.' });
      else if (days > REPORT_RANGE_MAX_DAYS) {
        problems.push({
          field: 'from',
          message: `Choose a range of no more than ${REPORT_RANGE_MAX_DAYS} days.`,
        });
      }
    }
    if (problems.length > 0) {
      throw new DomainError(400, 'VALIDATION_FAILED', 'Some fields need attention.', problems);
    }
    return { from, to };
  }

  /**
   * One row per stage, in workflow order. A stay is the time between a chart entering a stage and leaving it, so a
   * chart sent back and forward again counts once for each visit. The last stay of a chart that has been closed or
   * stopped is not a wait, and is left out.
   */
  private async waiting(from: string, to: string): Promise<WaitingTimeRow[]> {
    const rows = await this.database.query<{
      code: string;
      label: string;
      finished: number;
      median: string | null;
      average: string | null;
      p90: string | null;
      longest: string | null;
      waiting_now: number;
      longest_now: string | null;
    }>(
      `WITH stays AS (
         SELECT h.chart_id, h.to_stage AS code, h.occurred_at AS entered,
                lead(h.occurred_at) OVER (PARTITION BY h.chart_id ORDER BY h.chart_version) AS left_at,
                c.status
           FROM chart_stage_history h JOIN rt_charts c ON c.id = h.chart_id
       ), latest AS (
         SELECT DISTINCT ON (s.code) s.code, s.label, s.display_order
           FROM workflow_stages s JOIN workflow_versions w ON w.id = s.workflow_id
          ORDER BY s.code, w.version DESC
       ), finished AS (
         SELECT code, extract(epoch FROM (left_at - entered)) / 86400 AS days
           FROM stays
          WHERE left_at IS NOT NULL
            AND (entered AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date
       ), summary AS (
         SELECT code, count(*)::int AS finished,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY days) AS median,
                avg(days) AS average,
                percentile_cont(0.9) WITHIN GROUP (ORDER BY days) AS p90,
                max(days) AS longest
           FROM finished GROUP BY code
       ), now_open AS (
         SELECT code, count(*)::int AS waiting_now,
                max(extract(epoch FROM (now() - entered)) / 86400) AS longest_now
           FROM stays WHERE left_at IS NULL AND status = 'OPEN' GROUP BY code
       )
       SELECT l.code, l.label,
              coalesce(s.finished, 0) AS finished, s.median, s.average, s.p90, s.longest,
              coalesce(n.waiting_now, 0) AS waiting_now, n.longest_now
         FROM latest l
         LEFT JOIN summary s ON s.code = l.code
         LEFT JOIN now_open n ON n.code = l.code
        ORDER BY l.display_order`,
      [from, to],
    );
    return rows.rows.map((row) => ({
      stage: row.code,
      stageLabel: row.label,
      phase: STAGE_INFO[row.code]?.phase ?? null,
      finished: row.finished,
      medianDays: round1(row.median),
      averageDays: round1(row.average),
      ninetiethDays: round1(row.p90),
      longestDays: round1(row.longest),
      waitingNow: row.waiting_now,
      longestWaitingNowDays: round1(row.longest_now),
    }));
  }

  /** Open charts that have been in one stage for the stall limit or longer. Treatment itself is never a stall. */
  private async stalled(stallDays: number): Promise<StalledChartRow[]> {
    const rows = await this.database.query<{
      rt_number: string;
      stage: string;
      label: string;
      days: number;
      priority: string;
      assignee: string | null;
    }>(
      `SELECT c.display_number AS rt_number, c.current_stage AS stage, s.label,
              ((now() AT TIME ZONE 'Asia/Kolkata')::date - (c.current_stage_since AT TIME ZONE 'Asia/Kolkata')::date)::int AS days,
              c.priority, u.full_name AS assignee
         FROM rt_charts c
         JOIN workflow_stages s ON s.workflow_id = c.workflow_id AND s.code = c.current_stage
         LEFT JOIN assignments a ON a.chart_id = c.id AND a.task_code = 'CONTOURING' AND a.ended_at IS NULL
         LEFT JOIN staff_users u ON u.id = a.staff_id
        WHERE c.status = 'OPEN' AND c.current_stage <> $1
          AND ((now() AT TIME ZONE 'Asia/Kolkata')::date - (c.current_stage_since AT TIME ZONE 'Asia/Kolkata')::date) >= $2
        ORDER BY days DESC, c.display_number`,
      [TREATMENT_STAGE, stallDays],
    );
    return rows.rows.map((row) => {
      const info = STAGE_INFO[row.stage];
      return {
        rtNumber: row.rt_number,
        stage: row.stage,
        stageLabel: row.label,
        phase: info?.phase ?? null,
        daysInStage: row.days,
        priority: row.priority,
        waitingFor: info ? sentence(`waiting for ${info.waiting}`) : 'Waiting',
        owner: info?.owner ? roleName(info.owner) : null,
        assignedTo: row.stage === 'CONTOURING' ? row.assignee : null,
      };
    });
  }

  /** Charts whose treatment started in the range, and how each is going or went. */
  private async treatment(
    from: string,
    to: string,
  ): Promise<{ summary: TreatmentSummary; items: TreatmentRow[] }> {
    const rows = await this.database.query<{
      rt_number: string;
      status: string;
      planned: number | null;
      started: string;
      completed: string | null;
      given_final: string | null;
      given_now: string | null;
    }>(
      `SELECT c.display_number AS rt_number, c.status, c.planned_sessions AS planned,
              c.data->>'startOn' AS started, c.data->>'completeOn' AS completed,
              c.data->>'sessionsFinal' AS given_final, c.data->>'sessionsDone' AS given_now
         FROM rt_charts c
        WHERE c.data ? 'startOn' AND c.data->>'startOn' BETWEEN $1 AND $2
        ORDER BY c.data->>'startOn', c.display_number`,
      [from, to],
    );
    const items: TreatmentRow[] = rows.rows.map((row) => {
      const outcome =
        row.status === 'DISCONTINUED' ? 'STOPPED' : row.completed ? 'FINISHED' : 'IN_TREATMENT';
      const given = row.given_final ?? row.given_now;
      const days =
        row.completed === null
          ? null
          : Math.round(
              (Date.parse(`${row.completed}T00:00:00Z`) - Date.parse(`${row.started}T00:00:00Z`)) /
                86_400_000,
            ) + 1;
      return {
        rtNumber: row.rt_number,
        outcome,
        startedOn: row.started,
        finishedOn: row.completed,
        daysTaken: days,
        plannedSessions: row.planned,
        sessionsGiven: given === null || given === undefined ? null : Number(given),
      };
    });

    const finished = items.filter((item) => item.outcome === 'FINISHED');
    const planned = finished.filter(
      (item) => item.plannedSessions !== null && item.sessionsGiven !== null,
    );
    const plannedTotal = planned.reduce((sum, item) => sum + item.plannedSessions!, 0);
    const givenTotal = planned.reduce((sum, item) => sum + item.sessionsGiven!, 0);
    const days = finished.filter((item) => item.daysTaken !== null);
    return {
      summary: {
        started: items.length,
        inTreatment: items.filter((item) => item.outcome === 'IN_TREATMENT').length,
        finished: finished.length,
        stopped: items.filter((item) => item.outcome === 'STOPPED').length,
        finishedShort: planned.filter((item) => item.sessionsGiven! < item.plannedSessions!).length,
        averageDaysTaken: days.length
          ? round1(days.reduce((sum, item) => sum + item.daysTaken!, 0) / days.length)
          : null,
        sessionsGivenPercent: plannedTotal ? Math.round((givenTotal * 100) / plannedTotal) : null,
      },
      items,
    };
  }
}
