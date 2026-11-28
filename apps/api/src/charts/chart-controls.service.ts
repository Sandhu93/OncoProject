import { Inject, Injectable } from '@nestjs/common';
import type { ActionField, AvailableAction, ChartDetail } from '@oncotrack/contracts';
import type { Actor } from '../auth/actor.js';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { CommandService } from '../transactions/command.service.js';
import { DomainError } from '../transactions/domain-error.js';
import { readValues, refuse } from './actions/fields.js';
import type { FieldDef } from './actions/types.js';
import { normaliseRtNumber } from './issue-chart.parse.js';

/**
 * The consultant's overrides. These are not steps of the workflow: they are how the department head fixes what
 * went wrong (the wrong resident, a chart sent forward too soon, a patient who will not be treated). Each one
 * needs a reason, is recorded in the chart's history and the audit trail, and tells the people it affects.
 * Only a consultant may use them.
 */
export const CONTROL_ACTIONS = [
  'REASSIGN_CONTOURING',
  'RETURN_TO_STAGE',
  'DISCONTINUE_CHART',
  'REOPEN_CHART',
] as const;
type Control = (typeof CONTROL_ACTIONS)[number];

const CONTOURING_STAGE = 'CONTOURING';

interface ControlledChart {
  id: string;
  display_number: string;
  workflow_id: string;
  current_stage: string;
  status: string;
  version: number;
  data: Record<string, string>;
}

interface StageRow {
  code: string;
  label: string;
  display_order: number;
  is_terminal: boolean;
  requires_weekly_update: boolean;
}

const reasonField = (label: string, requiredMessage: string): FieldDef => ({
  key: 'reason',
  label,
  type: 'area',
  required: true,
  requiredMessage,
  maxLength: 500,
});

const LABELS: Record<Control, string> = {
  REASSIGN_CONTOURING: 'Reassign contouring to another junior resident',
  RETURN_TO_STAGE: 'Return the chart to an earlier stage',
  DISCONTINUE_CHART: 'Discontinue this chart',
  REOPEN_CHART: 'Reopen this discontinued chart',
};

const WHEN_TO_USE: Record<Control, string> = {
  REASSIGN_CONTOURING: 'The new resident is told, and the one it was taken from.',
  RETURN_TO_STAGE: 'Only before treatment starts. Whoever the chart goes back to is told why.',
  DISCONTINUE_CHART:
    'Stops the chart, for example when the patient will not be treated here. It can be reopened.',
  REOPEN_CHART: 'Puts the chart back at the stage it was stopped at.',
};

const isControl = (action: string): action is Control =>
  (CONTROL_ACTIONS as readonly string[]).includes(action);

@Injectable()
export class ChartControlsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandService) private readonly commands: CommandService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  isControl(action: string): boolean {
    return isControl(action);
  }

  /** The overrides this person may use on this chart now. Empty for everyone but a consultant. */
  async availableFor(
    db: Queryable,
    actor: Actor,
    chart: ControlledChart,
  ): Promise<AvailableAction[]> {
    if (!actor.roles.includes('CONSULTANT')) return [];
    const offered: AvailableAction[] = [];
    for (const action of CONTROL_ACTIONS) {
      const fields = await this.fieldsFor(db, action, chart);
      if (fields === null) continue;
      offered.push({
        action,
        label: LABELS[action],
        // The reason is an ordinary required field here; "requiresReason" is what makes a step read "Send back".
        requiresReason: false,
        fields: fields.map(toField),
        checks: [{ label: 'What it does', ok: true, detail: WHEN_TO_USE[action] }],
      });
    }
    return offered;
  }

  /** The fields of an override, or null when it does not apply to this chart. */
  private async fieldsFor(
    db: Queryable,
    action: Control,
    chart: ControlledChart,
  ): Promise<FieldDef[] | null> {
    const open = chart.status === 'OPEN';
    switch (action) {
      case 'REASSIGN_CONTOURING': {
        if (!open || chart.current_stage !== CONTOURING_STAGE) return null;
        const people = await db.query<{ id: string; full_name: string }>(
          `SELECT u.id, u.full_name FROM staff_users u
             JOIN staff_roles r ON r.staff_id = u.id AND r.role_code = 'JUNIOR_RESIDENT'
            WHERE u.is_active AND u.is_available
              AND u.id NOT IN (SELECT staff_id FROM assignments
                                WHERE chart_id = $1 AND task_code = 'CONTOURING' AND ended_at IS NULL)
            ORDER BY u.full_name, u.id`,
          [chart.id],
        );
        const options = people.rows.map((row) => ({ value: row.id, label: row.full_name }));
        if (options.length === 0) return null;
        return [
          {
            key: 'resident',
            label: 'New junior resident',
            type: 'staff',
            required: true,
            requiredMessage: 'Choose a junior resident.',
            staffRole: 'JUNIOR_RESIDENT',
            options,
            default: options[0]!.value,
          },
          reasonField('Why is it being reassigned?', 'Say why it is being reassigned.'),
        ];
      }
      case 'RETURN_TO_STAGE': {
        if (!open) return null;
        const earlier = await this.earlierStages(db, chart);
        if (earlier.length === 0) return null;
        return [
          {
            key: 'stage',
            label: 'Return to',
            type: 'select',
            required: true,
            requiredMessage: 'Choose the stage to return to.',
            options: earlier.map((stage) => ({ value: stage.code, label: stage.label })),
            default: earlier[earlier.length - 1]!.code,
          },
          reasonField('Why is it being returned?', 'Say why it is being returned.'),
        ];
      }
      case 'DISCONTINUE_CHART':
        return open
          ? [reasonField('Why is it being discontinued?', 'Say why it is being discontinued.')]
          : null;
      case 'REOPEN_CHART':
        return chart.status === 'DISCONTINUED'
          ? [reasonField('Why is it being reopened?', 'Say why it is being reopened.')]
          : null;
    }
  }

  /** Stages before this one, oldest first, and only while treatment has not started. */
  private async earlierStages(db: Queryable, chart: ControlledChart): Promise<StageRow[]> {
    const stages = await db.query<StageRow>(
      `SELECT code, label, display_order, is_terminal, requires_weekly_update
         FROM workflow_stages WHERE workflow_id = $1 ORDER BY display_order`,
      [chart.workflow_id],
    );
    const current = stages.rows.find((stage) => stage.code === chart.current_stage);
    const treatment = stages.rows.find((stage) => stage.requires_weekly_update);
    if (!current || current.is_terminal) return [];
    if (treatment && current.display_order >= treatment.display_order) return [];
    return stages.rows.filter(
      (stage) => stage.display_order < current.display_order && !stage.is_terminal,
    );
  }

  async perform(
    actor: Actor,
    key: string | undefined,
    rtNumber: string,
    action: string,
    body: unknown,
    view: (tx: Queryable) => Promise<ChartDetail>,
  ) {
    if (!isControl(action)) {
      throw new DomainError(409, 'ACTION_NOT_AVAILABLE', 'This step is not available.');
    }
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
        operation: `chart.control.${action}`,
        key,
        payload: { rtNumber: number, expectedVersion, values: input.values ?? {} },
      },
      async (tx, { requestId }) => {
        const found = await tx.query<ControlledChart>(
          `SELECT id, display_number, workflow_id, current_stage, status, version, data
             FROM rt_charts WHERE display_number = $1 FOR UPDATE`,
          [number],
        );
        const chart = found.rows[0];
        if (!chart)
          throw new DomainError(404, 'CHART_NOT_FOUND', `No chart has RT number ${number}.`);
        if (!actor.roles.includes('CONSULTANT')) {
          throw new DomainError(403, 'ROLE_NOT_ALLOWED', 'Only a consultant can do this.');
        }
        if (chart.version !== expectedVersion) {
          throw new DomainError(
            409,
            'CHART_CHANGED',
            'This chart changed while you were working. Reload it to see the latest, then try again.',
          );
        }
        const fields = await this.fieldsFor(tx, action, chart);
        if (fields === null) {
          throw new DomainError(
            409,
            'ACTION_NOT_AVAILABLE',
            'This is not available for the chart as it is now.',
          );
        }
        const { values, problems } = readValues(fields, input.values);
        if (problems.length > 0) refuse(problems);
        const reason = values.reason!;

        const applied = await this.apply(tx, action, chart, values, actor);
        const toStage = applied.toStage ?? chart.current_stage;

        const updated = await tx.query(
          `UPDATE rt_charts
              SET version = version + 1, updated_at = now(), data = $3::jsonb,
                  status = $4, current_stage = $5,
                  current_stage_since = CASE WHEN $5 <> current_stage OR $6 THEN now() ELSE current_stage_since END
            WHERE id = $1 AND version = $2 RETURNING version`,
          [
            chart.id,
            expectedVersion,
            JSON.stringify({ ...chart.data, ...applied.data }),
            applied.status ?? chart.status,
            toStage,
            applied.restartClock === true,
          ],
        );
        if (updated.rows.length === 0) {
          throw new DomainError(409, 'CHART_CHANGED', 'This chart changed while you were working.');
        }
        const version = expectedVersion + 1;
        await tx.query(
          `INSERT INTO chart_stage_history(chart_id, workflow_id, from_stage, to_stage, action, actor_id, actor_roles, reason, chart_version, summary)
           VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10)`,
          [
            chart.id,
            chart.workflow_id,
            chart.current_stage,
            toStage,
            action,
            actor.id,
            [...actor.roles],
            reason,
            version,
            `${applied.summary} Reason: ${reason}`,
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
            JSON.stringify({
              stage: chart.current_stage,
              status: chart.status,
              version: expectedVersion,
            }),
            JSON.stringify({
              stage: toStage,
              status: applied.status ?? chart.status,
              version,
              action,
            }),
            requestId,
            applied.audit,
          ],
        );
        const event = await tx.query<{ id: string }>(
          `INSERT INTO outbox_events(chart_id, event_type, payload, processed_at)
           VALUES ($1, $2, $3::jsonb, now()) RETURNING id`,
          [
            chart.id,
            applied.audit,
            JSON.stringify({ chartId: chart.id, rtNumber: chart.display_number, action, toStage }),
          ],
        );
        await applied.tell(event.rows[0]!.id);
        return { status: 200, body: await view(tx) };
      },
    );
  }

  private async apply(
    tx: Queryable,
    action: Control,
    chart: ControlledChart,
    values: Record<string, string>,
    actor: Actor,
  ): Promise<{
    summary: string;
    audit: string;
    toStage?: string;
    status?: string;
    restartClock?: boolean;
    data?: Record<string, string>;
    tell: (eventId: string) => Promise<void>;
  }> {
    const reason = values.reason!;
    const base = { chartId: chart.id, rtNumber: chart.display_number };
    const stageLabel = async (code: string) =>
      (
        await tx.query<{ label: string }>(
          `SELECT label FROM workflow_stages WHERE workflow_id = $1 AND code = $2`,
          [chart.workflow_id, code],
        )
      ).rows[0]?.label ?? code;

    switch (action) {
      case 'REASSIGN_CONTOURING': {
        const previous = await tx.query<{ staff_id: string; full_name: string }>(
          `SELECT a.staff_id, u.full_name FROM assignments a JOIN staff_users u ON u.id = a.staff_id
            WHERE a.chart_id = $1 AND a.task_code = 'CONTOURING' AND a.ended_at IS NULL`,
          [chart.id],
        );
        const next = await tx.query<{ full_name: string }>(
          `SELECT full_name FROM staff_users WHERE id = $1`,
          [values.resident],
        );
        await tx.query(
          `UPDATE assignments SET ended_at = now()
            WHERE chart_id = $1 AND task_code = 'CONTOURING' AND ended_at IS NULL`,
          [chart.id],
        );
        await tx.query(
          `INSERT INTO assignments(chart_id, task_code, staff_id, assigned_by) VALUES ($1, 'CONTOURING', $2, $3)`,
          [chart.id, values.resident, actor.id],
        );
        const from = previous.rows[0];
        const to = next.rows[0]!.full_name;
        return {
          summary: `Contouring reassigned${from ? ` from ${from.full_name}` : ''} to ${to}.`,
          audit: 'CHART_REASSIGNED',
          data: { contourAssignee: to },
          tell: async (eventId) => {
            await this.notifications.notify(
              tx,
              {
                ...base,
                eventId,
                kind: 'ASSIGNED',
                message: `${chart.display_number} is assigned to you for contouring. Reassigned by ${actor.fullName}. Reason: ${reason}`,
                recipients: [values.resident!],
              },
              [actor.id],
            );
            if (from) {
              await this.notifications.notify(
                tx,
                {
                  ...base,
                  eventId,
                  kind: 'REASSIGNED',
                  message: `${chart.display_number} was taken off you and given to ${to} by ${actor.fullName}. Reason: ${reason}`,
                  recipients: [from.staff_id],
                },
                [actor.id],
              );
            }
          },
        };
      }
      case 'RETURN_TO_STAGE': {
        const stage = values.stage!;
        const allowed = await this.earlierStages(tx, chart);
        if (!allowed.some((candidate) => candidate.code === stage)) {
          refuse([{ field: 'stage', message: 'Choose one of the stages listed.' }]);
        }
        const from = await stageLabel(chart.current_stage);
        const to = await stageLabel(stage);
        return {
          summary: `Returned from ${from} to ${to} by the consultant.`,
          audit: 'CHART_STAGE_OVERRIDDEN',
          toStage: stage,
          tell: async (eventId) => {
            await this.notifications.chartMoved(tx, {
              ...base,
              eventId,
              stage,
              stageLabel: to,
              actor,
              sentBackReason: reason,
            });
          },
        };
      }
      case 'DISCONTINUE_CHART':
        return {
          summary: 'Chart discontinued.',
          audit: 'CHART_DISCONTINUED',
          status: 'DISCONTINUED',
          tell: async (eventId) => {
            const waiting = await this.notifications.whoIsNext(tx, chart.id, chart.current_stage);
            const consultants = await this.notifications.staffWithRoles(tx, ['CONSULTANT']);
            await this.notifications.notify(
              tx,
              {
                ...base,
                eventId,
                kind: 'DISCONTINUED',
                message: `${chart.display_number} was discontinued by ${actor.fullName}. Reason: ${reason}`,
                recipients: [...waiting, ...consultants],
              },
              [actor.id],
            );
          },
        };
      case 'REOPEN_CHART':
        return {
          summary: `Chart reopened at ${await stageLabel(chart.current_stage)}.`,
          audit: 'CHART_REOPENED',
          status: 'OPEN',
          restartClock: true,
          tell: async (eventId) => {
            await this.notifications.notify(
              tx,
              {
                ...base,
                eventId,
                kind: 'YOUR_TURN',
                message: `${chart.display_number} was reopened by ${actor.fullName} at ${await stageLabel(chart.current_stage)}. Reason: ${reason}`,
                recipients: await this.notifications.whoIsNext(tx, chart.id, chart.current_stage),
              },
              [actor.id],
            );
          },
        };
    }
  }
}

/** Strips the server-only parts of a field before it is sent to a screen. */
function toField(field: FieldDef): ActionField {
  const visible: Partial<FieldDef> = { ...field };
  delete visible.requiredMessage;
  delete visible.minMessage;
  delete visible.maxMessage;
  delete visible.requiredWhen;
  return visible as ActionField;
}
