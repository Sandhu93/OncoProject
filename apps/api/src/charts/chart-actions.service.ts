import { Inject, Injectable } from '@nestjs/common';
import type {
  ActionField,
  AvailableAction,
  ChartDetail,
  ClinicalRole,
  WeeklyStatus,
} from '@oncotrack/contracts';
import type { Actor } from '../auth/actor.js';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import { CommandService } from '../transactions/command.service.js';
import { DomainError, type FieldProblem } from '../transactions/domain-error.js';
import { CATALOGUE } from './actions/catalogue.js';
import { readValues, refuse } from './actions/fields.js';
import { saturdayOnOrBefore } from './actions/dates.js';
import { recordedFacts } from './actions/recorded.js';
import type { ActionContext, ActionDefinition, ChartData, FieldDef } from './actions/types.js';
import { NotificationService } from '../notifications/notification.service.js';
import { ChartsService } from './charts.service.js';
import { CommentsService, HANDOFF_MAX } from './comments.service.js';
import { normaliseRtNumber } from './issue-chart.parse.js';

const ROLE_WORDS: Record<string, string> = {
  CONSULTANT: 'consultant',
  SENIOR_RESIDENT: 'senior resident',
  JUNIOR_RESIDENT: 'junior resident',
  PHYSICIST: 'physicist',
  RADIOGRAPHER: 'radiographer',
};

interface ChartState {
  id: string;
  display_number: string;
  workflow_id: string;
  current_stage: string;
  status: string;
  version: number;
  planned_sessions: number | null;
  issued_on: string;
  data: ChartData;
}

interface TransitionRow {
  action: string;
  to_stage: string;
  role_code: string;
  requires_assignment: boolean;
  requires_reason: boolean;
  /** A record kept on the chart (a Saturday update) rather than a move to another stage. */
  keeps_stage?: boolean;
}

const WEEKLY = 'POST_WEEKLY_UPDATE';
const FINAL = 'POST_FINAL_UPDATE';
const HANDOFF_KEY = 'handoffNote';

/** Weekly and final updates are not handoffs, and a send-back already carries its reason. */
const keepsStage = (transition: { action: string; requires_reason: boolean }) =>
  transition.action === WEEKLY || transition.action === FINAL || transition.requires_reason;

interface WeeklyStage {
  requires_weekly_update: boolean;
  weekly_update_roles: string[];
  is_terminal: boolean;
}

/** Strips the server-only parts of a field before it is sent to a screen. */
function toField(field: FieldDef): ActionField {
  const visible: Partial<FieldDef> = { ...field };
  delete visible.requiredMessage;
  delete visible.minMessage;
  delete visible.maxMessage;
  delete visible.requiredWhen;
  return (field.requiredWhen ? { ...visible, required: false } : visible) as ActionField;
}

/** Offered on every step that passes a chart on; stored with the chart as a handoff note. */
const HANDOFF_FIELD: ActionField = {
  key: HANDOFF_KEY,
  label: 'Note for the next person',
  type: 'area',
  required: false,
  help: 'Optional. Operational notes only: no patient names or clinical details.',
  maxLength: HANDOFF_MAX,
};

@Injectable()
export class ChartActionsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandService) private readonly commands: CommandService,
    @Inject(ChartsService) private readonly charts: ChartsService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}

  /** A chart with its history and the steps this person may take on it now. */
  async view(actor: Actor, rtNumber: string, db: Queryable = this.database): Promise<ChartDetail> {
    const base = await this.charts.readDetail(db, rtNumber);
    const state = await this.loadState(db, normaliseRtNumber(rtNumber), false);
    const availableActions =
      state.status === 'OPEN'
        ? await this.availableFor(db, actor, state)
        : ([] as AvailableAction[]);
    const weekly = await this.weeklyStatus(db, state);
    return {
      ...base,
      comments: await this.comments.list(db, base.id),
      recorded: recordedFacts(state.data, state.planned_sessions),
      weekly,
      availableActions,
    };
  }

  async perform(
    actor: Actor,
    key: string | undefined,
    rtNumber: string,
    action: string,
    body: unknown,
  ) {
    const number = normaliseRtNumber(rtNumber);
    const input = (typeof body === 'object' && body !== null ? body : {}) as {
      expectedVersion?: unknown;
      values?: unknown;
    };
    if (!Number.isInteger(input.expectedVersion)) {
      refuse([{ field: 'expectedVersion', message: 'Send the chart version you saw.' }]);
    }
    const expectedVersion = input.expectedVersion as number;

    return this.commands.run(
      actor,
      {
        operation: `chart.action.${action}`,
        key,
        payload: { rtNumber: number, expectedVersion, values: input.values ?? {} },
      },
      async (tx, { requestId }) => {
        const chart = await this.loadState(tx, number, true);
        if (chart.status !== 'OPEN') {
          throw new DomainError(
            409,
            'CHART_CLOSED',
            'This chart is closed, so no more steps can be recorded.',
          );
        }
        if (chart.version !== expectedVersion) {
          throw new DomainError(
            409,
            'CHART_CHANGED',
            'This chart changed while you were working. Reload it to see the latest, then try again.',
          );
        }
        const candidates = await this.candidatesFor(tx, chart, action);
        if (candidates.length === 0) {
          throw new DomainError(
            409,
            'ACTION_NOT_AVAILABLE',
            "This step is not available at the chart's current stage.",
          );
        }
        const transition = candidates.find((row) => actor.roles.includes(row.role_code as never));
        if (!transition) {
          const who = [
            ...new Set(candidates.map((row) => ROLE_WORDS[row.role_code] ?? 'another role')),
          ];
          throw new DomainError(
            403,
            'ROLE_NOT_ALLOWED',
            `Only a ${who.join(' or ')} can do this step.`,
          );
        }
        const definition = CATALOGUE[action];
        if (!definition) {
          throw new DomainError(409, 'ACTION_NOT_AVAILABLE', 'This step cannot be recorded yet.');
        }
        const context = await this.context(tx, actor, chart, transition.role_code);
        if (transition.requires_assignment) {
          const assigned = await tx.query(
            `SELECT 1 FROM assignments WHERE chart_id = $1 AND task_code = 'CONTOURING' AND staff_id = $2 AND ended_at IS NULL`,
            [chart.id, actor.id],
          );
          if (assigned.rows.length === 0) {
            throw new DomainError(
              403,
              'NOT_ASSIGNED',
              'Only the junior resident assigned to this chart can do this step.',
            );
          }
        }
        await definition.assertReady?.(context);

        const fields = await this.fieldsFor(tx, definition, context, transition.requires_reason);
        const { values, problems } = readValues(fields, input.values);
        const extra: FieldProblem[] =
          problems.length === 0 ? await (definition.validate?.(values, context) ?? []) : [];
        if (problems.length > 0 || extra.length > 0) refuse([...problems, ...extra]);

        const handoffNote = this.readHandoffNote(input.values, !keepsStage(transition));

        const derived = (await definition.derive?.(values, context)) ?? {};
        const summary = definition.summary({ ...values, ...derived }, context);
        const { reason, ...facts } = values;
        const data: ChartData = { ...chart.data, ...facts, ...derived };
        if (definition.stamp) data[definition.stamp] = context.today;
        for (const cleared of definition.clear ?? []) delete data[cleared];

        await definition.afterApply?.(values, context);

        const columns = definition.columns?.(values) ?? {};
        // The first of the two final updates leaves the chart where it is; the second ends tracking.
        const keeps =
          action === FINAL
            ? !(await this.otherFinalPosted(tx, chart.id, transition.role_code))
            : transition.keeps_stage === true;
        const toStage = keeps ? chart.current_stage : transition.to_stage;
        const params: unknown[] = [chart.id, expectedVersion];
        const bind = (value: unknown) => `$${params.push(value)}`;
        const sets = [
          'version = version + 1',
          'updated_at = now()',
          `data = ${bind(JSON.stringify(data))}::jsonb`,
        ];
        if (!keeps) {
          sets.push(`current_stage = ${bind(toStage)}`, 'current_stage_since = now()');
          // Reaching a final stage ends tracking: the chart is closed and takes no more steps.
          const target = await this.stageOf(tx, chart.workflow_id, toStage);
          if (target?.is_terminal) sets.push("status = 'CLOSED'");
        }
        for (const [column, value] of Object.entries(columns)) {
          sets.push(`${column} = ${bind(value)}`);
        }
        const updated = await tx.query(
          `UPDATE rt_charts SET ${sets.join(', ')} WHERE id = $1 AND version = $2 RETURNING version`,
          params,
        );
        if (updated.rows.length === 0) {
          throw new DomainError(
            409,
            'CHART_CHANGED',
            'This chart changed while you were working. Reload it to see the latest, then try again.',
          );
        }
        const version = expectedVersion + 1;
        await tx.query(
          `INSERT INTO chart_stage_history(chart_id, workflow_id, from_stage, to_stage, action, actor_id, actor_roles, reason, chart_version, details, summary)
           VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10::jsonb, $11)`,
          [
            chart.id,
            chart.workflow_id,
            chart.current_stage,
            toStage,
            action,
            actor.id,
            [...actor.roles],
            reason ?? null,
            version,
            JSON.stringify(values),
            summary,
          ],
        );
        await tx.query(
          `INSERT INTO audit_events(chart_id, actor_id, actor_roles, action, entity_type, entity_id, before_values, after_values, request_id)
           VALUES ($1::uuid, $2::uuid, $3::text[], $8::text, 'RT_CHART', $4::text, $5::jsonb, $6::jsonb, $7::uuid)`,
          [
            chart.id,
            actor.id,
            [...actor.roles],
            chart.id,
            JSON.stringify({ stage: chart.current_stage, version: expectedVersion }),
            JSON.stringify({ stage: toStage, version, action }),
            requestId,
            keeps ? 'CHART_UPDATE_POSTED' : 'CHART_STAGE_CHANGED',
          ],
        );
        const event = await tx.query<{ id: string }>(
          `INSERT INTO outbox_events(chart_id, event_type, payload, processed_at)
           VALUES ($1, $3, $2::jsonb, now()) RETURNING id`,
          [
            chart.id,
            JSON.stringify({
              chartId: chart.id,
              rtNumber: chart.display_number,
              fromStage: chart.current_stage,
              toStage,
              action,
            }),
            keeps ? 'CHART_UPDATE_POSTED' : 'CHART_STAGE_CHANGED',
          ],
        );
        if (!keeps && handoffNote) {
          await this.comments.addHandoff(tx, { chartId: chart.id, actor, body: handoffNote, stage: toStage });
        }
        if (!keeps) {
          await this.tellPeople(tx, {
            handoffNote,
            actor,
            chart,
            eventId: event.rows[0]!.id,
            action,
            toStage,
            reason: transition.requires_reason ? (reason ?? null) : null,
            data,
          });
        }
        return { status: 200, body: await this.view(actor, number, tx) };
      },
    );
  }

  /** Tells whoever the chart is now waiting for (inside the step's own transaction). */
  private async tellPeople(
    tx: Queryable,
    input: {
      actor: Actor;
      chart: ChartState;
      eventId: string;
      action: string;
      toStage: string;
      reason: string | null;
      data: ChartData;
      handoffNote?: string | null;
    },
  ): Promise<void> {
    const target = await tx.query<{ label: string; is_terminal: boolean }>(
      `SELECT label, is_terminal FROM workflow_stages WHERE workflow_id = $1 AND code = $2`,
      [input.chart.workflow_id, input.toStage],
    );
    const stage = target.rows[0];
    const base = {
      chartId: input.chart.id,
      rtNumber: input.chart.display_number,
      eventId: input.eventId,
      actor: input.actor,
    };
    if (stage?.is_terminal) {
      await this.notifications.chartFinished(tx, base);
    } else if (input.action === 'ASSIGN_CONTOURING') {
      await this.notifications.contouringAssigned(tx, {
        ...base,
        due: input.data.contourDue ?? null,
      });
    } else {
      await this.notifications.chartMoved(tx, {
        ...base,
        stage: input.toStage,
        stageLabel: stage?.label ?? input.toStage,
        sentBackReason: input.reason,
        handoffNote: input.handoffNote ?? null,
      });
    }
  }

  /** The optional note a person leaves for whoever the chart goes to next; empty when there is none. */
  private readHandoffNote(submitted: unknown, allowed: boolean): string | null {
    const values = (typeof submitted === 'object' && submitted !== null ? submitted : {}) as Record<string, unknown>;
    const raw = values[HANDOFF_KEY];
    if (!allowed || raw === undefined || raw === null) return null;
    if (typeof raw !== 'string') refuse([{ field: HANDOFF_KEY, message: 'Must be text.' }]);
    const note = (raw as string).trim();
    if (note.length > HANDOFF_MAX) {
      refuse([{ field: HANDOFF_KEY, message: `Keep it to ${HANDOFF_MAX} characters or fewer.` }]);
    }
    return note === '' ? null : note;
  }

  /** True when the other role has already posted its final update. */
  private async otherFinalPosted(db: Queryable, chartId: string, role: string): Promise<boolean> {
    const found = await db.query(
      `SELECT 1 FROM treatment_status_updates WHERE chart_id = $1 AND kind = 'FINAL' AND author_role <> $2`,
      [chartId, role],
    );
    return found.rows.length > 0;
  }

  private async loadState(db: Queryable, rtNumber: string, lock: boolean): Promise<ChartState> {
    const found = await db.query<ChartState>(
      `SELECT id, display_number, workflow_id, current_stage, status, version, planned_sessions, data,
              (created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS issued_on
         FROM rt_charts WHERE display_number = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [rtNumber],
    );
    const row = found.rows[0];
    if (!row) throw new DomainError(404, 'CHART_NOT_FOUND', `No chart has RT number ${rtNumber}.`);
    return row;
  }

  private async today(db: Queryable): Promise<string> {
    const found = await db.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS today`,
    );
    return found.rows[0]!.today;
  }

  private async stageOf(db: Queryable, workflowId: string, stage: string) {
    const found = await db.query<WeeklyStage>(
      `SELECT requires_weekly_update, weekly_update_roles, is_terminal
         FROM workflow_stages WHERE workflow_id = $1 AND code = $2`,
      [workflowId, stage],
    );
    return found.rows[0];
  }

  /** The steps this action code could be at the chart's stage, one per role that may take it. */
  private async candidatesFor(
    db: Queryable,
    chart: ChartState,
    action: string,
  ): Promise<TransitionRow[]> {
    if (action === WEEKLY) {
      const stage = await this.stageOf(db, chart.workflow_id, chart.current_stage);
      if (!stage?.requires_weekly_update) return [];
      return stage.weekly_update_roles.map((role) => ({
        action: WEEKLY,
        to_stage: chart.current_stage,
        role_code: role,
        requires_assignment: false,
        requires_reason: false,
        keeps_stage: true,
      }));
    }
    const found = await db.query<TransitionRow>(
      `SELECT action, to_stage, role_code, requires_assignment, requires_reason
         FROM workflow_transitions WHERE workflow_id = $1 AND from_stage = $2 AND action = $3`,
      [chart.workflow_id, chart.current_stage, action],
    );
    return found.rows;
  }

  /** Who has posted this week's Saturday update, for a chart in a stage that asks for them. */
  private async weeklyStatus(db: Queryable, chart: ChartState): Promise<WeeklyStatus | null> {
    const stage = await this.stageOf(db, chart.workflow_id, chart.current_stage);
    if (!stage?.requires_weekly_update || chart.status !== 'OPEN') return null;
    const weekEnding = saturdayOnOrBefore(await this.today(db));
    const posted = await db.query<{ author_role: string }>(
      `SELECT author_role FROM treatment_status_updates
        WHERE chart_id = $1 AND kind = 'WEEKLY' AND week_ending = $2`,
      [chart.id, weekEnding],
    );
    const done = new Set(posted.rows.map((row) => row.author_role));
    return {
      weekEnding,
      updates: stage.weekly_update_roles.map((role) => ({
        role: role as ClinicalRole,
        posted: done.has(role),
      })),
    };
  }

  private async context(
    db: Queryable,
    actor: Actor,
    chart: ChartState,
    role: string,
  ): Promise<ActionContext> {
    const today = await this.today(db);
    return {
      today,
      weekEnding: saturdayOnOrBefore(today),
      role,
      actor,
      tx: db,
      chart: {
        id: chart.id,
        rtNumber: chart.display_number,
        stage: chart.current_stage,
        plannedSessions: chart.planned_sessions,
        issuedOn: chart.issued_on,
        data: chart.data,
      },
    };
  }

  /** The definition's fields, with a required "reason" added for a step that sends a chart back. */
  private async fieldsFor(
    db: Queryable,
    definition: ActionDefinition,
    context: ActionContext,
    requiresReason: boolean,
  ): Promise<FieldDef[]> {
    const fields = await this.withStaff(db, await definition.fields(context));
    if (requiresReason && !fields.some((field) => field.key === 'reason')) {
      fields.unshift({
        key: 'reason',
        label: 'Why is it going back?',
        type: 'area',
        required: true,
        requiredMessage: 'Say why it is going back.',
        maxLength: 500,
        placeholder: 'Tell them what to fix so they do not have to ask.',
      });
    }
    return fields;
  }

  /** Fills in the people to choose from for "staff" fields: active, available staff with the field's role. */
  private async withStaff(db: Queryable, fields: FieldDef[]): Promise<FieldDef[]> {
    const filled: FieldDef[] = [];
    for (const field of fields) {
      if (field.type !== 'staff' || !field.staffRole) {
        filled.push(field);
        continue;
      }
      const people = await db.query<{ id: string; full_name: string }>(
        `SELECT u.id, u.full_name FROM staff_users u
           JOIN staff_roles r ON r.staff_id = u.id AND r.role_code = $1
          WHERE u.is_active AND u.is_available
          ORDER BY u.full_name, u.id`,
        [field.staffRole],
      );
      const options = people.rows.map((row) => ({ value: row.id, label: row.full_name }));
      filled.push({ ...field, options, default: field.default ?? options[0]?.value });
    }
    return filled;
  }

  private async availableFor(
    db: Queryable,
    actor: Actor,
    chart: ChartState,
  ): Promise<AvailableAction[]> {
    const found = await db.query<TransitionRow>(
      `SELECT action, to_stage, role_code, requires_assignment, requires_reason
         FROM workflow_transitions WHERE workflow_id = $1 AND from_stage = $2 ORDER BY action`,
      [chart.workflow_id, chart.current_stage],
    );
    const candidates = [...found.rows, ...(await this.candidatesFor(db, chart, WEEKLY))];
    const available: AvailableAction[] = [];
    for (const transition of candidates) {
      if (!actor.roles.includes(transition.role_code as never)) continue;
      const definition = CATALOGUE[transition.action];
      if (!definition) continue;
      if (transition.requires_assignment) {
        const assigned = await db.query(
          `SELECT 1 FROM assignments WHERE chart_id = $1 AND task_code = 'CONTOURING' AND staff_id = $2 AND ended_at IS NULL`,
          [chart.id, actor.id],
        );
        if (assigned.rows.length === 0) continue;
      }
      const context = await this.context(db, actor, chart, transition.role_code);
      if (transition.keeps_stage && (await postedThisWeek(context))) continue;
      if (transition.action === FINAL && (await postedFinal(context))) continue;
      const fields = await this.fieldsFor(db, definition, context, transition.requires_reason);
      const shown = fields.map(toField);
      if (!keepsStage(transition)) shown.push(HANDOFF_FIELD);
      available.push({
        action: transition.action,
        label: definition.label,
        requiresReason: transition.requires_reason,
        fields: shown,
        checks: definition.checks?.(context) ?? [],
      });
    }
    return available;
  }
}

/** True when this person's role has already posted the Saturday update for this week. */
async function postedThisWeek({ tx, chart, role, weekEnding }: ActionContext): Promise<boolean> {
  const found = await tx.query(
    `SELECT 1 FROM treatment_status_updates
      WHERE chart_id = $1 AND kind = 'WEEKLY' AND week_ending = $2 AND author_role = $3`,
    [chart.id, weekEnding, role],
  );
  return found.rows.length > 0;
}

/** True when this person's role has already posted its final update. */
async function postedFinal({ tx, chart, role }: ActionContext): Promise<boolean> {
  const found = await tx.query(
    `SELECT 1 FROM treatment_status_updates WHERE chart_id = $1 AND kind = 'FINAL' AND author_role = $2`,
    [chart.id, role],
  );
  return found.rows.length > 0;
}
