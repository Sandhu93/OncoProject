import { Inject, Injectable } from '@nestjs/common';
import type { ClinicalRole, WorkflowView } from '@oncotrack/contracts';
import { CATALOGUE } from '../charts/actions/catalogue.js';
import { STAGE_INFO } from '../charts/actions/stage-info.js';
import { DatabaseService } from '../database/database.service.js';

/** The workflow the department is running, for reading. Changing it is a controlled act, not a screen. */
@Injectable()
export class WorkflowViewService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async active(): Promise<{ workflow: WorkflowView | null }> {
    const found = await this.database.query<{
      id: string;
      code: string;
      version: number;
      label: string;
      approved_at: Date | string | null;
      approved_by: string | null;
    }>(
      `SELECT w.id, w.code, w.version, w.label, w.approved_at, u.full_name AS approved_by
         FROM workflow_versions w LEFT JOIN staff_users u ON u.id = w.approved_by
        WHERE w.status = 'ACTIVE' ORDER BY w.version DESC LIMIT 1`,
    );
    const workflow = found.rows[0];
    if (!workflow) return { workflow: null };

    const stages = await this.database.query<{
      code: string;
      label: string;
      display_order: number;
      is_initial: boolean;
      is_terminal: boolean;
      weekly_update_roles: string[];
    }>(
      `SELECT code, label, display_order, is_initial, is_terminal, weekly_update_roles
         FROM workflow_stages WHERE workflow_id = $1 ORDER BY display_order`,
      [workflow.id],
    );
    const labels = new Map(stages.rows.map((stage) => [stage.code, stage.label]));
    const order = new Map(stages.rows.map((stage, index) => [stage.code, index]));
    const transitions = await this.database.query<{
      from_stage: string;
      action: string;
      to_stage: string;
      role_code: string;
      requires_reason: boolean;
      requires_assignment: boolean;
    }>(
      `SELECT from_stage, action, to_stage, role_code, requires_reason, requires_assignment
         FROM workflow_transitions WHERE workflow_id = $1`,
      [workflow.id],
    );

    return {
      workflow: {
        code: workflow.code,
        version: workflow.version,
        label: workflow.label,
        status: 'ACTIVE',
        approvedBy: workflow.approved_by,
        approvedAt: workflow.approved_at
          ? (workflow.approved_at instanceof Date
              ? workflow.approved_at
              : new Date(workflow.approved_at)
            ).toISOString()
          : null,
        stages: stages.rows.map((stage, index) => ({
          code: stage.code,
          label: stage.label,
          phase: STAGE_INFO[stage.code]?.phase ?? null,
          position: index + 1,
          isInitial: stage.is_initial,
          isTerminal: stage.is_terminal,
          weeklyUpdateRoles: stage.weekly_update_roles as ClinicalRole[],
        })),
        transitions: transitions.rows
          .map((row) => ({
            from: row.from_stage,
            fromLabel: labels.get(row.from_stage) ?? row.from_stage,
            action: row.action,
            actionLabel: CATALOGUE[row.action]?.label ?? row.action,
            role: row.role_code as ClinicalRole,
            to: row.to_stage,
            toLabel: labels.get(row.to_stage) ?? row.to_stage,
            requiresReason: row.requires_reason,
            requiresAssignment: row.requires_assignment,
          }))
          .sort(
            (a, b) =>
              (order.get(a.from) ?? 0) - (order.get(b.from) ?? 0) ||
              a.action.localeCompare(b.action) ||
              a.role.localeCompare(b.role),
          ),
      },
    };
  }
}
