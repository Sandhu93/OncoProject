import { Inject, Injectable } from '@nestjs/common';
import { CLINICAL_ROLES, type ChartComment, type ClinicalRole } from '@oncotrack/contracts';
import type { Actor } from '../auth/actor.js';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import { DomainError } from '../transactions/domain-error.js';
import { NotificationService } from '../notifications/notification.service.js';
import { CommandService } from '../transactions/command.service.js';
import { normaliseRtNumber } from './issue-chart.parse.js';

export const COMMENT_MAX = 1000;
export const HANDOFF_MAX = 500;

interface CommentRow {
  id: string;
  kind: 'COMMENT' | 'HANDOFF';
  body: string;
  author_name: string;
  author_roles: string[];
  for_role: string | null;
  stage_label: string | null;
  created_at: Date | string;
}

const iso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();

/** The discussion on a chart: comments from anyone signed in, and the notes left when a chart is passed on. */
@Injectable()
export class CommentsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandService) private readonly commands: CommandService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  /** Oldest first. */
  async list(db: Queryable, chartId: string): Promise<ChartComment[]> {
    const found = await db.query<CommentRow>(
      `SELECT c.id, c.kind, c.body, u.full_name AS author_name, c.author_roles, c.for_role,
              s.label AS stage_label, c.created_at
         FROM chart_comments c
         JOIN staff_users u ON u.id = c.author_id
         JOIN rt_charts r ON r.id = c.chart_id
         LEFT JOIN workflow_stages s ON s.workflow_id = r.workflow_id AND s.code = c.stage_code
        WHERE c.chart_id = $1 ORDER BY c.created_at, c.id`,
      [chartId],
    );
    return found.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      body: row.body,
      authorName: row.author_name,
      authorRoles: row.author_roles as ClinicalRole[],
      forRole: (row.for_role as ClinicalRole | null) ?? null,
      stageLabel: row.stage_label ?? '',
      createdAt: iso(row.created_at),
    }));
  }

  /** Writes the note that goes with a step (inside that step's transaction). */
  async addHandoff(
    tx: Queryable,
    input: { chartId: string; actor: Actor; body: string; stage: string },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO chart_comments(chart_id, author_id, author_roles, kind, body, stage_code)
       VALUES ($1, $2, $3::text[], 'HANDOFF', $4, $5)`,
      [input.chartId, input.actor.id, [...input.actor.roles], input.body, input.stage],
    );
  }

  /** Adds a comment, tells the role it is for (or whoever the chart is waiting for), and returns it. */
  async post(actor: Actor, key: string | undefined, rtNumber: string, body: unknown) {
    const number = normaliseRtNumber(rtNumber);
    const input = (typeof body === 'object' && body !== null ? body : {}) as {
      body?: unknown;
      forRole?: unknown;
    };
    const text = typeof input.body === 'string' ? input.body.trim() : '';
    const problems: { field: string; message: string }[] = [];
    if (text === '') problems.push({ field: 'body', message: 'Write a comment.' });
    else if (text.length > COMMENT_MAX) {
      problems.push({ field: 'body', message: `Keep it to ${COMMENT_MAX} characters or fewer.` });
    }
    const forRole = input.forRole === undefined || input.forRole === null || input.forRole === '' ? null : input.forRole;
    if (forRole !== null && !(CLINICAL_ROLES as readonly unknown[]).includes(forRole)) {
      problems.push({ field: 'forRole', message: 'Choose a role from the list.' });
    }
    if (problems.length > 0) {
      throw new DomainError(400, 'VALIDATION_FAILED', 'Some fields need attention.', problems);
    }

    return this.commands.run(
      actor,
      { operation: 'chart.comment', key, payload: { rtNumber: number, body: text, forRole } },
      async (tx, { requestId }) => {
        const chart = await tx.query<{
          id: string;
          display_number: string;
          current_stage: string;
          workflow_id: string;
        }>(
          `SELECT id, display_number, current_stage, workflow_id FROM rt_charts WHERE display_number = $1`,
          [number],
        );
        const row = chart.rows[0];
        if (!row) {
          throw new DomainError(404, 'CHART_NOT_FOUND', `No chart has RT number ${number}.`);
        }
        const saved = await tx.query<{ id: string }>(
          `INSERT INTO chart_comments(chart_id, author_id, author_roles, kind, body, for_role, stage_code)
           VALUES ($1, $2, $3::text[], 'COMMENT', $4, $5, $6) RETURNING id`,
          [row.id, actor.id, [...actor.roles], text, forRole, row.current_stage],
        );
        await tx.query(
          `INSERT INTO audit_events(chart_id, actor_id, actor_roles, action, entity_type, entity_id, before_values, after_values, request_id)
           VALUES ($1::uuid, $2::uuid, $3::text[], 'CHART_COMMENT_ADDED', 'CHART_COMMENT', $4::text, NULL, $5::jsonb, $6::uuid)`,
          [
            row.id,
            actor.id,
            [...actor.roles],
            saved.rows[0]!.id,
            JSON.stringify({ forRole, stage: row.current_stage }),
            requestId,
          ],
        );
        const event = await tx.query<{ id: string }>(
          `INSERT INTO outbox_events(chart_id, event_type, payload, processed_at)
           VALUES ($1, 'CHART_COMMENT_ADDED', $2::jsonb, now()) RETURNING id`,
          [row.id, JSON.stringify({ chartId: row.id, rtNumber: row.display_number, forRole })],
        );
        await this.notifications.commentAdded(tx, {
          chartId: row.id,
          rtNumber: row.display_number,
          eventId: event.rows[0]!.id,
          stage: row.current_stage,
          forRole: forRole as ClinicalRole | null,
          actor,
          body: text,
        });
        return { status: 201, body: { id: saved.rows[0]!.id } };
      },
    );
  }
}
