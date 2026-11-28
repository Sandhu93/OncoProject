import { Inject, Injectable } from '@nestjs/common';
import type { ActionField, AvailableAction, ChartDetail } from '@oncotrack/contracts';
import type { Actor } from '../auth/actor.js';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import { CommandService } from '../transactions/command.service.js';
import { DomainError, type FieldProblem } from '../transactions/domain-error.js';
import { CATALOGUE } from './actions/catalogue.js';
import { readValues, refuse } from './actions/fields.js';
import { recordedFacts } from './actions/recorded.js';
import type { ActionContext, ActionDefinition, ChartData, FieldDef } from './actions/types.js';
import { ChartsService } from './charts.service.js';
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
}

/** Strips the server-only parts of a field before it is sent to a screen. */
function toField(field: FieldDef): ActionField {
  const visible: Partial<FieldDef> = { ...field };
  delete visible.minMessage;
  delete visible.maxMessage;
  delete visible.requiredWhen;
  return (field.requiredWhen ? { ...visible, required: false } : visible) as ActionField;
}

@Injectable()
export class ChartActionsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandService) private readonly commands: CommandService,
    @Inject(ChartsService) private readonly charts: ChartsService,
  ) {}

  /** A chart with its history and the steps this person may take on it now. */
  async view(actor: Actor, rtNumber: string, db: Queryable = this.database): Promise<ChartDetail> {
    const base = await this.charts.readDetail(db, rtNumber);
    const state = await this.loadState(db, normaliseRtNumber(rtNumber), false);
    const availableActions =
      state.status === 'OPEN'
        ? await this.availableFor(db, actor, state)
        : ([] as AvailableAction[]);
    return { ...base, recorded: recordedFacts(state.data), availableActions };
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
        const transitions = await tx.query<TransitionRow>(
          `SELECT action, to_stage, role_code, requires_assignment, requires_reason
             FROM workflow_transitions WHERE workflow_id = $1 AND from_stage = $2 AND action = $3`,
          [chart.workflow_id, chart.current_stage, action],
        );
        if (transitions.rows.length === 0) {
          throw new DomainError(
            409,
            'ACTION_NOT_AVAILABLE',
            "This step is not available at the chart's current stage.",
          );
        }
        const transition = transitions.rows.find((row) =>
          actor.roles.includes(row.role_code as never),
        );
        if (!transition) {
          const who = ROLE_WORDS[transitions.rows[0]!.role_code] ?? 'another role';
          throw new DomainError(403, 'ROLE_NOT_ALLOWED', `Only a ${who} can do this step.`);
        }
        const definition = CATALOGUE[action];
        if (!definition) {
          throw new DomainError(409, 'ACTION_NOT_AVAILABLE', 'This step cannot be recorded yet.');
        }
        const context = await this.context(tx, actor, chart);
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
        definition.assertReady?.(context);

        const fields = await this.fieldsFor(tx, definition, context, transition.requires_reason);
        const { values, problems } = readValues(fields, input.values);
        const extra: FieldProblem[] =
          problems.length === 0 ? await (definition.validate?.(values, context) ?? []) : [];
        if (problems.length > 0 || extra.length > 0) refuse([...problems, ...extra]);

        const summary = definition.summary(values, context);
        const { reason, ...facts } = values;
        const data: ChartData = { ...chart.data, ...facts };
        if (definition.stamp) data[definition.stamp] = context.today;
        for (const cleared of definition.clear ?? []) delete data[cleared];

        await definition.afterApply?.(values, context);

        const columns = definition.columns?.(values) ?? {};
        const sets = [
          'current_stage = $3',
          'current_stage_since = now()',
          'version = version + 1',
          'updated_at = now()',
          'data = $4::jsonb',
        ];
        const params: unknown[] = [
          chart.id,
          expectedVersion,
          transition.to_stage,
          JSON.stringify(data),
        ];
        for (const [column, value] of Object.entries(columns)) {
          params.push(value);
          sets.push(`${column} = $${params.length}`);
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
            transition.to_stage,
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
           VALUES ($1::uuid, $2::uuid, $3::text[], 'CHART_STAGE_CHANGED', 'RT_CHART', $4::text, $5::jsonb, $6::jsonb, $7::uuid)`,
          [
            chart.id,
            actor.id,
            [...actor.roles],
            chart.id,
            JSON.stringify({ stage: chart.current_stage, version: expectedVersion }),
            JSON.stringify({ stage: transition.to_stage, version, action }),
            requestId,
          ],
        );
        await tx.query(
          `INSERT INTO outbox_events(chart_id, event_type, payload) VALUES ($1, 'CHART_STAGE_CHANGED', $2::jsonb)`,
          [
            chart.id,
            JSON.stringify({
              chartId: chart.id,
              rtNumber: chart.display_number,
              fromStage: chart.current_stage,
              toStage: transition.to_stage,
              action,
            }),
          ],
        );
        return { status: 200, body: await this.view(actor, number, tx) };
      },
    );
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

  private async context(db: Queryable, actor: Actor, chart: ChartState): Promise<ActionContext> {
    const today = await db.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS today`,
    );
    return {
      today: today.rows[0]!.today,
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
    void db;
    const fields = definition.fields(context);
    if (requiresReason && !fields.some((field) => field.key === 'reason')) {
      fields.unshift({
        key: 'reason',
        label: 'Why is it going back?',
        type: 'area',
        required: true,
        maxLength: 500,
        placeholder: 'Tell them what to fix so they do not have to ask.',
      });
    }
    return fields;
  }

  private async availableFor(
    db: Queryable,
    actor: Actor,
    chart: ChartState,
  ): Promise<AvailableAction[]> {
    const transitions = await db.query<TransitionRow>(
      `SELECT action, to_stage, role_code, requires_assignment, requires_reason
         FROM workflow_transitions WHERE workflow_id = $1 AND from_stage = $2 ORDER BY action`,
      [chart.workflow_id, chart.current_stage],
    );
    const context = await this.context(db, actor, chart);
    const available: AvailableAction[] = [];
    for (const transition of transitions.rows) {
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
      const fields = await this.fieldsFor(db, definition, context, transition.requires_reason);
      available.push({
        action: transition.action,
        label: definition.label,
        requiresReason: transition.requires_reason,
        fields: fields.map(toField),
        checks: definition.checks?.(context) ?? [],
      });
    }
    return available;
  }
}
