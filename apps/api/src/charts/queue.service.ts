import { Inject, Injectable } from '@nestjs/common';
import type { ChartQueue, ClinicalRole, QueueItem, StageSummary } from '@oncotrack/contracts';
import type { Actor } from '../auth/actor.js';
import { readConfig } from '../config.js';
import { DatabaseService } from '../database/database.service.js';
import { CATALOGUE } from './actions/catalogue.js';
import { saturdayOnOrBefore } from './actions/dates.js';
import { FINAL_UPDATE_ROLES, STAGE_INFO } from './actions/stage-info.js';
import type { ChartData } from './actions/types.js';
import {
  dateLine,
  FINISHED_STAGE,
  nextStepText,
  queueOrder,
  treatmentDay,
  TREATMENT_STAGE,
  waitingOn,
} from './queue-model.js';

interface ChartRow {
  id: string;
  rt_number: string;
  workflow_id: string;
  stage: string;
  stage_label: string;
  priority: 'URGENT' | 'ROUTINE';
  planned_sessions: number | null;
  data: ChartData;
  stage_days: number;
  assignee_id: string | null;
  assignee_name: string | null;
  requires_weekly_update: boolean;
  weekly_update_roles: string[];
}

interface TransitionRow {
  workflow_id: string;
  from_stage: string;
  action: string;
  role_code: string;
  requires_assignment: boolean;
  requires_reason: boolean;
}

/** The open charts, each marked with whether the signed-in person can act on it. One read, no per-chart queries. */
@Injectable()
export class QueueService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async queue(actor: Actor): Promise<ChartQueue> {
    const { stallDays } = readConfig();
    const todayRow = await this.database.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS today`,
    );
    const today = todayRow.rows[0]!.today;
    const weekEnding = saturdayOnOrBefore(today);

    const charts = await this.database.query<ChartRow>(
      `SELECT c.id, c.display_number AS rt_number, c.workflow_id, c.current_stage AS stage, s.label AS stage_label,
              c.priority, c.planned_sessions, c.data,
              ((now() AT TIME ZONE 'Asia/Kolkata')::date - (c.current_stage_since AT TIME ZONE 'Asia/Kolkata')::date)::int AS stage_days,
              a.staff_id AS assignee_id, u.full_name AS assignee_name,
              s.requires_weekly_update, s.weekly_update_roles
         FROM rt_charts c
         JOIN workflow_stages s ON s.workflow_id = c.workflow_id AND s.code = c.current_stage
         LEFT JOIN assignments a ON a.chart_id = c.id AND a.task_code = 'CONTOURING' AND a.ended_at IS NULL
         LEFT JOIN staff_users u ON u.id = a.staff_id
        WHERE c.status = 'OPEN'
        ORDER BY c.display_number`,
    );
    const transitions = await this.database.query<TransitionRow>(
      `SELECT t.workflow_id, t.from_stage, t.action, t.role_code, t.requires_assignment, t.requires_reason
         FROM workflow_transitions t
         JOIN rt_charts c ON c.workflow_id = t.workflow_id AND c.status = 'OPEN'
        GROUP BY t.workflow_id, t.from_stage, t.action, t.role_code, t.requires_assignment, t.requires_reason
        ORDER BY t.action`,
    );
    const stages = await this.database.query<{
      workflow_id: string;
      code: string;
      position: number;
    }>(
      `SELECT workflow_id, code, (row_number() OVER (PARTITION BY workflow_id ORDER BY display_order))::int AS position
         FROM workflow_stages`,
    );
    const finals = await this.database.query<{ chart_id: string; author_role: string }>(
      `SELECT chart_id, author_role FROM treatment_status_updates WHERE kind = 'FINAL'`,
    );
    const finalBy = new Map<string, Set<string>>();
    for (const row of finals.rows) {
      const set = finalBy.get(row.chart_id) ?? new Set<string>();
      set.add(row.author_role);
      finalBy.set(row.chart_id, set);
    }
    const posted = await this.database.query<{ chart_id: string; author_role: string }>(
      `SELECT chart_id, author_role FROM treatment_status_updates WHERE kind = 'WEEKLY' AND week_ending = $1`,
      [weekEnding],
    );

    const position = new Map(
      stages.rows.map((row) => [`${row.workflow_id}/${row.code}`, row.position]),
    );
    const stageCount = new Map<string, number>();
    for (const row of stages.rows) {
      stageCount.set(row.workflow_id, Math.max(stageCount.get(row.workflow_id) ?? 0, row.position));
    }
    const postedBy = new Map<string, Set<string>>();
    for (const row of posted.rows) {
      const set = postedBy.get(row.chart_id) ?? new Set<string>();
      set.add(row.author_role);
      postedBy.set(row.chart_id, set);
    }

    const items: QueueItem[] = [];
    for (const chart of charts.rows) {
      const info = STAGE_INFO[chart.stage];
      const data = chart.data ?? {};
      const inTreatment = chart.stage === TREATMENT_STAGE;
      const done = postedBy.get(chart.id) ?? new Set<string>();
      const weeklyRoles = chart.requires_weekly_update ? chart.weekly_update_roles : [];
      const weeklyMissing = weeklyRoles.filter((role) => !done.has(role)) as ClinicalRole[];

      const finalDone = finalBy.get(chart.id) ?? new Set<string>();
      const finalMissing = FINAL_UPDATE_ROLES.filter((role) => !finalDone.has(role));
      const mine = transitions.rows.filter(
        (t) =>
          t.workflow_id === chart.workflow_id &&
          t.from_stage === chart.stage &&
          actor.roles.includes(t.role_code as never) &&
          !(t.action === 'POST_FINAL_UPDATE' && finalDone.has(t.role_code)) &&
          (!t.requires_assignment || chart.assignee_id === actor.id),
      );
      // In treatment the queue asks only for the Saturday update; finishing treatment is found on the chart.
      const steps = inTreatment ? [] : mine;
      const forward = steps
        .filter((t) => !t.requires_reason)
        .map((t) => CATALOGUE[t.action]?.label)
        .filter((label): label is string => Boolean(label));
      const canSendBack = steps.some((t) => t.requires_reason);
      const weeklyForMe = weeklyMissing.some((role) => actor.roles.includes(role));
      const needsYou = steps.length > 0 || weeklyForMe;

      const daysInStage = Math.max(chart.stage_days, 0);
      items.push({
        rtNumber: chart.rt_number,
        priority: chart.priority,
        stage: { code: chart.stage, label: chart.stage_label },
        phase: info?.phase ?? null,
        stageNumber: position.get(`${chart.workflow_id}/${chart.stage}`) ?? 0,
        stageCount: stageCount.get(chart.workflow_id) ?? 0,
        daysInStage,
        stalled: !inTreatment && daysInStage >= stallDays,
        needsYou,
        nextStep: needsYou ? nextStepText(forward, canSendBack, weeklyForMe) : null,
        waitingOn: waitingOn({
          stage: chart.stage,
          ownerRole: info?.owner ?? null,
          assignee: chart.assignee_name,
          weeklyMissing,
          finalMissing,
        }),
        assignedTo: chart.stage === 'CONTOURING' ? chart.assignee_name : null,
        assignedToYou: chart.stage === 'CONTOURING' && chart.assignee_id === actor.id,
        dateLine: dateLine(chart.stage, data, today, chart.planned_sessions),
        treatmentDay: inTreatment ? treatmentDay(data, today) : null,
        sessionsDone:
          inTreatment && data.sessionsDone !== undefined ? Number(data.sessionsDone) : null,
        plannedSessions: chart.planned_sessions,
        weeklyMissing,
      });
    }

    // Charts that need you come first; within each group the most urgent and longest-waiting lead.
    items.sort(
      (a, b) =>
        Number(b.needsYou) - Number(a.needsYou) ||
        queueOrder(
          {
            stage: a.stage.code,
            daysInStage: a.daysInStage,
            priority: a.priority,
            rtNumber: a.rtNumber,
          },
          {
            stage: b.stage.code,
            daysInStage: b.daysInStage,
            priority: b.priority,
            rtNumber: b.rtNumber,
          },
        ),
    );

    const active = await this.database.query<{ code: string; label: string; position: number }>(
      `SELECT s.code, s.label, (row_number() OVER (ORDER BY s.display_order))::int AS position
         FROM workflow_stages s JOIN workflow_versions w ON w.id = s.workflow_id AND w.status = 'ACTIVE'
        ORDER BY s.display_order`,
    );
    const stageMap: StageSummary[] = active.rows.map((stage) => {
      const here = items.filter((item) => item.stage.code === stage.code);
      return {
        code: stage.code,
        label: stage.label,
        phase: STAGE_INFO[stage.code]?.phase ?? null,
        position: stage.position,
        open: here.length,
        stalled: here.filter((item) => item.stalled).length,
        charts: here.map((item) => item.rtNumber),
      };
    });

    const open = items.length;
    const inTreatmentCount = items.filter((item) =>
      [TREATMENT_STAGE, FINISHED_STAGE].includes(item.stage.code),
    ).length;
    return {
      stallDays,
      weekEnding,
      items,
      stages: stageMap,
      totals: {
        open,
        gettingReady: open - inTreatmentCount,
        stalled: items.filter((item) => item.stalled).length,
        inTreatment: inTreatmentCount,
        saturdayUpdatesToCome: items.reduce((sum, item) => sum + item.weeklyMissing.length, 0),
      },
    };
  }
}
