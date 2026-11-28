import { Inject, Injectable } from '@nestjs/common';
import {
  CLINICAL_ROLES,
  type ClinicalRole,
  type WorkflowDraft,
  type WorkflowStageView,
  type WorkflowStepView,
} from '@oncotrack/contracts';
import { randomUUID } from 'node:crypto';
import type { Actor } from '../auth/actor.js';
import { CATALOGUE } from '../charts/actions/catalogue.js';
import { STAGE_INFO } from '../charts/actions/stage-info.js';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import { CommandService } from '../transactions/command.service.js';
import { DomainError, type FieldProblem } from '../transactions/domain-error.js';
import { requireCapability } from './capability.js';

const ROLE_NAMES: Record<ClinicalRole, string> = {
  JUNIOR_RESIDENT: 'junior resident',
  SENIOR_RESIDENT: 'senior resident',
  CONSULTANT: 'consultant',
  PHYSICIST: 'physicist',
  RADIOGRAPHER: 'radiographer',
};
const STAGE_LABEL_MAX = 80;
const VERSION_LABEL_MAX = 120;

interface Version {
  id: string;
  code: string;
  version: number;
  label: string;
  status: string;
}
interface Shape {
  version: Version;
  stages: WorkflowStageView[];
  steps: WorkflowStepView[];
}

const names = (roles: readonly ClinicalRole[]): string =>
  roles.length === 0
    ? 'no one'
    : roles
        .map((role) => ROLE_NAMES[role])
        .join(' and ')
        .replace(/^./, (c) => c);

const refuse = (problems: FieldProblem[]): never => {
  throw new DomainError(400, 'VALIDATION_FAILED', 'Some fields need attention.', problems);
};

/**
 * Preparing, reviewing and approving a new version of the workflow. What a step asks for and checks is part of the
 * program, so a draft can only change names, who may do each step and who posts Saturday updates. Approving it
 * makes it the version new charts start on; a chart already running finishes on the version it began with.
 * Needs CONFIGURE_WORKFLOW.
 */
@Injectable()
export class WorkflowAdminService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandService) private readonly commands: CommandService,
  ) {}

  /** The draft, if there is one, with what it changes. */
  async draft(actor: Actor): Promise<{ draft: WorkflowDraft | null }> {
    requireCapability(actor, 'CONFIGURE_WORKFLOW');
    return { draft: await this.currentDraft(this.database) };
  }

  /** Starts a draft as a copy of the workflow in use. */
  async create(actor: Actor, key: string | undefined) {
    requireCapability(actor, 'CONFIGURE_WORKFLOW');
    return this.commands.run(
      actor,
      { operation: 'workflow.draft.create', key, payload: {} },
      async (tx, { requestId }) => {
        const active = await this.activeVersion(tx, true);
        if (!active) {
          throw new DomainError(
            409,
            'NO_ACTIVE_WORKFLOW',
            'No workflow has been approved yet, so there is nothing to copy.',
          );
        }
        const existing = await tx.query(
          "SELECT 1 FROM workflow_versions WHERE code = $1 AND status = 'DRAFT'",
          [active.code],
        );
        if (existing.rows.length > 0) {
          throw new DomainError(
            409,
            'DRAFT_EXISTS',
            'A draft is already being prepared. Finish or discard it first.',
          );
        }
        const next = await tx.query<{ n: number }>(
          'SELECT max(version)::int + 1 AS n FROM workflow_versions WHERE code = $1',
          [active.code],
        );
        const id = randomUUID();
        const version = next.rows[0]!.n;
        await tx.query(
          "INSERT INTO workflow_versions(id, code, version, label, status) VALUES ($1, $2, $3, $4, 'DRAFT')",
          [id, active.code, version, active.label],
        );
        await tx.query(
          `INSERT INTO workflow_stages(workflow_id, code, label, display_order, is_initial, is_terminal,
                                       requires_weekly_update, weekly_update_roles)
           SELECT $1, code, label, display_order, is_initial, is_terminal, requires_weekly_update, weekly_update_roles
             FROM workflow_stages WHERE workflow_id = $2`,
          [id, active.id],
        );
        await tx.query(
          `INSERT INTO workflow_transitions(workflow_id, from_stage, action, to_stage, role_code,
                                            requires_assignment, requires_reason, prerequisites)
           SELECT $1, from_stage, action, to_stage, role_code, requires_assignment, requires_reason, prerequisites
             FROM workflow_transitions WHERE workflow_id = $2`,
          [id, active.id],
        );
        await this.audit(tx, actor, requestId, 'WORKFLOW_DRAFT_CREATED', id, null, {
          code: active.code,
          version,
          copiedFromVersion: active.version,
        });
        return { status: 201, body: (await this.currentDraft(tx))! };
      },
    );
  }

  /** Changes the draft. Only what is sent changes. */
  async update(actor: Actor, key: string | undefined, body: unknown) {
    requireCapability(actor, 'CONFIGURE_WORKFLOW');
    const input = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >;

    return this.commands.run(
      actor,
      { operation: 'workflow.draft.update', key, payload: input },
      async (tx, { requestId }) => {
        const draft = await this.draftVersion(tx, true);
        if (!draft) throw new DomainError(404, 'NO_DRAFT', 'There is no draft to change.');
        const before = await this.currentDraft(tx);
        const problems: FieldProblem[] = [];
        const shape = await this.load(tx, draft);

        if (input.label !== undefined) {
          const label = typeof input.label === 'string' ? input.label.trim() : '';
          if (label.length < 1 || label.length > VERSION_LABEL_MAX) {
            problems.push({
              field: 'label',
              message: `Enter a name up to ${VERSION_LABEL_MAX} characters.`,
            });
          } else {
            await tx.query('UPDATE workflow_versions SET label = $2 WHERE id = $1', [
              draft.id,
              label,
            ]);
          }
        }

        const stagesInput = input.stages;
        if (stagesInput !== undefined) {
          if (!Array.isArray(stagesInput))
            problems.push({ field: 'stages', message: 'Send a list of stages.' });
          else {
            const labels = new Map(shape.stages.map((stage) => [stage.code, stage.label]));
            const weekly = new Map(
              shape.stages.map((stage) => [stage.code, stage.weeklyUpdateRoles]),
            );
            const fields: { code: string; label?: string; roles?: ClinicalRole[] }[] = [];
            stagesInput.forEach((raw, index) => {
              const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
                string,
                unknown
              >;
              const code = typeof item.code === 'string' ? item.code : '';
              const field = `stages.${index}`;
              if (!labels.has(code)) {
                problems.push({ field, message: 'No such stage in this workflow.' });
                return;
              }
              const entry: { code: string; label?: string; roles?: ClinicalRole[] } = { code };
              if (item.label !== undefined) {
                const label = typeof item.label === 'string' ? item.label.trim() : '';
                if (label.length < 1 || label.length > STAGE_LABEL_MAX) {
                  problems.push({
                    field: `${field}.label`,
                    message: `Enter a name up to ${STAGE_LABEL_MAX} characters.`,
                  });
                } else {
                  entry.label = label;
                  labels.set(code, label);
                }
              }
              if (item.weeklyUpdateRoles !== undefined) {
                const roles = this.readRoles(item.weeklyUpdateRoles);
                if (!weekly.get(code)?.length) {
                  problems.push({
                    field: `${field}.weeklyUpdateRoles`,
                    message:
                      'Saturday updates are not part of this stage, and cannot be added to it here.',
                  });
                } else if (!roles || roles.length === 0) {
                  problems.push({
                    field: `${field}.weeklyUpdateRoles`,
                    message: 'Choose at least one role.',
                  });
                } else entry.roles = roles;
              }
              fields.push(entry);
            });
            const seen = new Set<string>();
            for (const label of labels.values()) {
              const lower = label.toLowerCase();
              if (seen.has(lower))
                problems.push({
                  field: 'stages',
                  message: `Two stages cannot both be called "${label}".`,
                });
              seen.add(lower);
            }
            if (problems.length === 0) {
              for (const entry of fields) {
                if (entry.label !== undefined) {
                  await tx.query(
                    'UPDATE workflow_stages SET label = $3 WHERE workflow_id = $1 AND code = $2',
                    [draft.id, entry.code, entry.label],
                  );
                }
                if (entry.roles) {
                  await tx.query(
                    'UPDATE workflow_stages SET weekly_update_roles = $3::text[] WHERE workflow_id = $1 AND code = $2',
                    [draft.id, entry.code, entry.roles],
                  );
                }
              }
            }
          }
        }

        const stepsInput = input.steps;
        if (stepsInput !== undefined) {
          if (!Array.isArray(stepsInput))
            problems.push({ field: 'steps', message: 'Send a list of steps.' });
          else {
            const edits: { from: string; action: string; roles: ClinicalRole[] }[] = [];
            stepsInput.forEach((raw, index) => {
              const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
                string,
                unknown
              >;
              const from = String(item.from ?? '');
              const action = String(item.action ?? '');
              const field = `steps.${index}`;
              if (!shape.steps.some((step) => step.from === from && step.action === action)) {
                problems.push({ field, message: 'No such step in this workflow.' });
                return;
              }
              const roles = this.readRoles(item.roles);
              if (!roles || roles.length === 0) {
                problems.push({ field: `${field}.roles`, message: 'Choose at least one role.' });
                return;
              }
              edits.push({ from, action, roles });
            });
            if (problems.length === 0) {
              for (const edit of edits) {
                const model = await tx.query<{
                  to_stage: string;
                  requires_assignment: boolean;
                  requires_reason: boolean;
                  prerequisites: string[];
                }>(
                  `SELECT to_stage, requires_assignment, requires_reason, prerequisites FROM workflow_transitions
                    WHERE workflow_id = $1 AND from_stage = $2 AND action = $3 LIMIT 1`,
                  [draft.id, edit.from, edit.action],
                );
                const row = model.rows[0]!;
                await tx.query(
                  'DELETE FROM workflow_transitions WHERE workflow_id = $1 AND from_stage = $2 AND action = $3',
                  [draft.id, edit.from, edit.action],
                );
                for (const role of edit.roles) {
                  await tx.query(
                    `INSERT INTO workflow_transitions(workflow_id, from_stage, action, to_stage, role_code,
                                                      requires_assignment, requires_reason, prerequisites)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[])`,
                    [
                      draft.id,
                      edit.from,
                      edit.action,
                      row.to_stage,
                      role,
                      row.requires_assignment,
                      row.requires_reason,
                      row.prerequisites,
                    ],
                  );
                }
              }
            }
          }
        }

        if (problems.length > 0) refuse(problems);
        const after = (await this.currentDraft(tx))!;
        await this.audit(
          tx,
          actor,
          requestId,
          'WORKFLOW_DRAFT_UPDATED',
          draft.id,
          { changes: before?.changes ?? [] },
          {
            label: after.label,
            changes: after.changes,
          },
        );
        return { status: 200, body: after };
      },
    );
  }

  /** Throws the draft away. */
  async discard(actor: Actor, key: string | undefined) {
    requireCapability(actor, 'CONFIGURE_WORKFLOW');
    return this.commands.run(
      actor,
      { operation: 'workflow.draft.discard', key, payload: {} },
      async (tx, { requestId }) => {
        const draft = await this.draftVersion(tx, true);
        if (!draft) throw new DomainError(404, 'NO_DRAFT', 'There is no draft to discard.');
        await tx.query('DELETE FROM workflow_transitions WHERE workflow_id = $1', [draft.id]);
        await tx.query('DELETE FROM workflow_stages WHERE workflow_id = $1', [draft.id]);
        await tx.query('DELETE FROM workflow_versions WHERE id = $1', [draft.id]);
        await this.audit(
          tx,
          actor,
          requestId,
          'WORKFLOW_DRAFT_DISCARDED',
          draft.id,
          { version: draft.version },
          null,
        );
        return { status: 200, body: { discarded: true as const } };
      },
    );
  }

  /** Makes the draft the workflow in use and retires the one it replaces. */
  async approve(actor: Actor, key: string | undefined) {
    requireCapability(actor, 'CONFIGURE_WORKFLOW');
    return this.commands.run(
      actor,
      { operation: 'workflow.draft.approve', key, payload: {} },
      async (tx, { requestId }) => {
        const draft = await this.draftVersion(tx, true);
        if (!draft) throw new DomainError(404, 'NO_DRAFT', 'There is no draft to approve.');
        const view = (await this.currentDraft(tx))!;
        if (view.changes.length === 0) {
          throw new DomainError(
            409,
            'NO_CHANGES',
            'The draft is the same as the workflow in use, so there is nothing to approve.',
          );
        }
        const active = await this.activeVersion(tx, true);
        if (!active)
          throw new DomainError(
            409,
            'NO_ACTIVE_WORKFLOW',
            'There is no workflow in use to replace.',
          );
        await tx.query("UPDATE workflow_versions SET status = 'RETIRED' WHERE id = $1", [
          active.id,
        ]);
        await tx.query(
          "UPDATE workflow_versions SET status = 'ACTIVE', approved_by = $2, approved_at = now() WHERE id = $1",
          [draft.id, actor.id],
        );
        await this.audit(
          tx,
          actor,
          requestId,
          'WORKFLOW_APPROVED',
          draft.id,
          { version: active.version },
          {
            version: draft.version,
            label: view.label,
            changes: view.changes,
          },
        );
        return { status: 200, body: { version: draft.version, changes: view.changes } };
      },
    );
  }

  private readRoles(value: unknown): ClinicalRole[] | null {
    if (
      !Array.isArray(value) ||
      value.some((role) => !(CLINICAL_ROLES as readonly string[]).includes(role as string))
    ) {
      return null;
    }
    return [...new Set(value as ClinicalRole[])];
  }

  private async activeVersion(db: Queryable, lock = false): Promise<Version | null> {
    const found = await db.query<Version>(
      `SELECT id, code, version, label, status FROM workflow_versions WHERE status = 'ACTIVE'
        ORDER BY version DESC LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    );
    return found.rows[0] ?? null;
  }

  private async draftVersion(db: Queryable, lock = false): Promise<Version | null> {
    const active = await this.activeVersion(db, lock);
    if (!active) return null;
    const found = await db.query<Version>(
      `SELECT id, code, version, label, status FROM workflow_versions WHERE code = $1 AND status = 'DRAFT'
        ORDER BY version DESC LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
      [active.code],
    );
    return found.rows[0] ?? null;
  }

  private async load(db: Queryable, version: Version): Promise<Shape> {
    const stages = await db.query<{
      code: string;
      label: string;
      is_initial: boolean;
      is_terminal: boolean;
      weekly_update_roles: string[];
    }>(
      `SELECT code, label, is_initial, is_terminal, weekly_update_roles FROM workflow_stages
        WHERE workflow_id = $1 ORDER BY display_order`,
      [version.id],
    );
    const labels = new Map(stages.rows.map((stage) => [stage.code, stage.label]));
    const order = new Map(stages.rows.map((stage, index) => [stage.code, index]));
    const transitions = await db.query<{
      from_stage: string;
      action: string;
      to_stage: string;
      role_code: string;
      requires_reason: boolean;
      requires_assignment: boolean;
    }>(
      `SELECT from_stage, action, to_stage, role_code, requires_reason, requires_assignment
         FROM workflow_transitions WHERE workflow_id = $1 ORDER BY role_code`,
      [version.id],
    );
    const grouped = new Map<string, WorkflowStepView>();
    for (const row of transitions.rows) {
      const key = `${row.from_stage}|${row.action}`;
      const existing = grouped.get(key);
      if (existing) {
        grouped.set(key, {
          ...existing,
          roles: [...existing.roles, row.role_code as ClinicalRole],
        });
      } else {
        grouped.set(key, {
          from: row.from_stage,
          fromLabel: labels.get(row.from_stage) ?? row.from_stage,
          action: row.action,
          actionLabel: CATALOGUE[row.action]?.label ?? row.action,
          roles: [row.role_code as ClinicalRole],
          to: row.to_stage,
          toLabel: labels.get(row.to_stage) ?? row.to_stage,
          requiresReason: row.requires_reason,
          requiresAssignment: row.requires_assignment,
        });
      }
    }
    return {
      version,
      stages: stages.rows.map((stage, index) => ({
        code: stage.code,
        label: stage.label,
        phase: STAGE_INFO[stage.code]?.phase ?? null,
        position: index + 1,
        isInitial: stage.is_initial,
        isTerminal: stage.is_terminal,
        weeklyUpdateRoles: stage.weekly_update_roles as ClinicalRole[],
      })),
      steps: [...grouped.values()].sort(
        (a, b) =>
          (order.get(a.from) ?? 0) - (order.get(b.from) ?? 0) || a.action.localeCompare(b.action),
      ),
    };
  }

  private async currentDraft(db: Queryable): Promise<WorkflowDraft | null> {
    const draft = await this.draftVersion(db);
    const active = await this.activeVersion(db);
    if (!draft || !active) return null;
    const [mine, base] = await Promise.all([this.load(db, draft), this.load(db, active)]);
    return {
      code: draft.code,
      version: draft.version,
      label: draft.label,
      status: 'DRAFT',
      replacesVersion: active.version,
      stages: mine.stages,
      steps: mine.steps,
      changes: this.describeChanges(base, mine),
    };
  }

  private describeChanges(base: Shape, draft: Shape): string[] {
    const changes: string[] = [];
    if (base.version.label !== draft.version.label) {
      changes.push(
        `The workflow is renamed from "${base.version.label}" to "${draft.version.label}".`,
      );
    }
    for (const stage of draft.stages) {
      const was = base.stages.find((item) => item.code === stage.code);
      if (!was) continue;
      if (was.label !== stage.label)
        changes.push(`The stage "${was.label}" is now called "${stage.label}".`);
      if (was.weeklyUpdateRoles.join() !== stage.weeklyUpdateRoles.join()) {
        changes.push(
          `Saturday updates at "${stage.label}" will come from the ${names(stage.weeklyUpdateRoles)} (now the ${names(was.weeklyUpdateRoles)}).`,
        );
      }
    }
    for (const step of draft.steps) {
      const was = base.steps.find((item) => item.from === step.from && item.action === step.action);
      if (was && was.roles.join() !== step.roles.join()) {
        changes.push(
          `"${step.actionLabel}" at "${step.fromLabel}" can be done by the ${names(step.roles)} (now the ${names(was.roles)}).`,
        );
      }
    }
    return changes;
  }

  private async audit(
    tx: Queryable,
    actor: Actor,
    requestId: string,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO audit_events(actor_id, actor_roles, action, entity_type, entity_id, before_values, after_values, request_id)
       VALUES ($1::uuid, $2::text[], $3::text, 'WORKFLOW_VERSION', $4::text, $5::jsonb, $6::jsonb, $7::uuid)`,
      [
        actor.id,
        [...actor.roles],
        action,
        entityId,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
        requestId,
      ],
    );
  }
}
