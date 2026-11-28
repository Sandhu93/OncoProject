import { Inject, Injectable } from '@nestjs/common';
import type { NotificationItem, NotificationList } from '@oncotrack/contracts';
import type { Actor } from '../auth/actor.js';
import {
  FINAL_UPDATE_ROLES,
  FINAL_UPDATE_STAGE,
  STAGE_INFO,
} from '../charts/actions/stage-info.js';
import { saturdayOnOrBefore } from '../charts/actions/dates.js';
import { readConfig } from '../config.js';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import { DomainError } from '../transactions/domain-error.js';

const TREATMENT_STAGE = 'TREATMENT_IN_PROGRESS';

interface Notice {
  chartId: string;
  rtNumber: string;
  /** The outbox event the notice belongs to. */
  eventId: string;
  kind: string;
  message: string;
  recipients: readonly string[];
  /** Set for reminders, so the same reminder is only ever created once per person. */
  dedupeKey?: string;
}

interface NotificationRow {
  id: string;
  kind: string;
  message: string;
  rt_number: string | null;
  created_at: Date;
  read_at: Date | null;
}

const toItem = (row: NotificationRow): NotificationItem => ({
  id: row.id,
  kind: row.kind,
  message: row.message,
  rtNumber: row.rt_number,
  createdAt: row.created_at.toISOString(),
  readAt: row.read_at ? row.read_at.toISOString() : null,
});

/**
 * In-app notifications. A handoff, send-back or assignment notifies the people it concerns inside the same
 * transaction that records it, so a person is told if and only if the change really happened.
 * Reminders (stalled charts, Saturday updates) come from `sweep`, run on a timer.
 */
/** The first part of a message, for a one-line notice. */
const preview = (text: string, max = 200) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

@Injectable()
export class NotificationService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** Active staff holding any of these roles. */
  async staffWithRoles(db: Queryable, roles: readonly string[]): Promise<string[]> {
    if (roles.length === 0) return [];
    const found = await db.query<{ id: string }>(
      `SELECT DISTINCT u.id FROM staff_users u JOIN staff_roles r ON r.staff_id = u.id
        WHERE u.is_active AND r.role_code = ANY($1::text[])`,
      [[...roles]],
    );
    return found.rows.map((row) => row.id);
  }

  /** Writes the notices, one per recipient, skipping anyone named in `exclude` (the person who just acted). */
  async notify(db: Queryable, notice: Notice, exclude: readonly string[] = []): Promise<number> {
    const recipients = [...new Set(notice.recipients)].filter((id) => !exclude.includes(id));
    let created = 0;
    for (const recipient of recipients) {
      const inserted = await db.query(
        `INSERT INTO notifications(recipient_id, event_id, chart_id, kind, message, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [
          recipient,
          notice.eventId,
          notice.chartId,
          notice.kind,
          notice.message,
          notice.dedupeKey ?? null,
        ],
      );
      created += inserted.rowCount;
    }
    return created;
  }

  /** Who the chart is now waiting for at this stage: the assigned resident in contouring, else the stage's role. */
  async whoIsNext(db: Queryable, chartId: string, stage: string): Promise<string[]> {
    if (stage === 'CONTOURING') {
      const assigned = await db.query<{ staff_id: string }>(
        `SELECT staff_id FROM assignments WHERE chart_id = $1 AND task_code = 'CONTOURING' AND ended_at IS NULL`,
        [chartId],
      );
      if (assigned.rows.length > 0) return assigned.rows.map((row) => row.staff_id);
    }
    if (stage === FINAL_UPDATE_STAGE) return this.staffWithRoles(db, FINAL_UPDATE_ROLES);
    const owner = STAGE_INFO[stage]?.owner;
    return owner ? this.staffWithRoles(db, [owner]) : [];
  }

  /** The chart has moved (or was issued): tell whoever it is now waiting for. */
  async chartMoved(
    db: Queryable,
    input: {
      chartId: string;
      rtNumber: string;
      eventId: string;
      stage: string;
      stageLabel: string;
      actor: Pick<Actor, 'id' | 'fullName'>;
      sentBackReason?: string | null;
      handoffNote?: string | null;
    },
  ): Promise<void> {
    const waiting = STAGE_INFO[input.stage]?.waiting;
    const sentBack = Boolean(input.sentBackReason);
    const message = sentBack
      ? `${input.rtNumber} was sent back to ${input.stageLabel} by ${input.actor.fullName}. Reason: ${input.sentBackReason}`
      : waiting
        ? `${input.rtNumber} is now at ${input.stageLabel}, waiting for ${waiting}.`
        : `${input.rtNumber} has moved to ${input.stageLabel}.`;
    const note = input.handoffNote ? ` Note from ${input.actor.fullName}: ${preview(input.handoffNote)}` : '';
    await this.notify(
      db,
      {
        chartId: input.chartId,
        rtNumber: input.rtNumber,
        eventId: input.eventId,
        kind: sentBack ? 'SENT_BACK' : 'YOUR_TURN',
        message: message + note,
        recipients: await this.whoIsNext(db, input.chartId, input.stage),
      },
      [input.actor.id],
    );
  }

  /** A comment: tell the role it is for, or whoever the chart is waiting for. */
  async commentAdded(
    db: Queryable,
    input: {
      chartId: string;
      rtNumber: string;
      eventId: string;
      stage: string;
      forRole: string | null;
      actor: Pick<Actor, 'id' | 'fullName'>;
      body: string;
    },
  ): Promise<void> {
    let recipients: string[];
    if (input.forRole === null) {
      recipients = await this.whoIsNext(db, input.chartId, input.stage);
    } else if (input.forRole === 'JUNIOR_RESIDENT') {
      // The resident the chart is assigned to, if any, rather than every junior resident.
      const assigned = await db.query<{ staff_id: string }>(
        `SELECT staff_id FROM assignments WHERE chart_id = $1 AND task_code = 'CONTOURING' AND ended_at IS NULL`,
        [input.chartId],
      );
      recipients =
        assigned.rows.length > 0
          ? assigned.rows.map((row) => row.staff_id)
          : await this.staffWithRoles(db, ['JUNIOR_RESIDENT']);
    } else {
      recipients = await this.staffWithRoles(db, [input.forRole]);
    }
    await this.notify(
      db,
      {
        chartId: input.chartId,
        rtNumber: input.rtNumber,
        eventId: input.eventId,
        kind: 'COMMENT',
        message: `${input.rtNumber}: ${input.actor.fullName} wrote: ${preview(input.body)}`,
        recipients,
      },
      [input.actor.id],
    );
  }

  /** A junior resident has been given the contouring. */
  async contouringAssigned(
    db: Queryable,
    input: {
      chartId: string;
      rtNumber: string;
      eventId: string;
      due: string | null;
      actor: Pick<Actor, 'id' | 'fullName'>;
    },
  ): Promise<void> {
    await this.notify(
      db,
      {
        chartId: input.chartId,
        rtNumber: input.rtNumber,
        eventId: input.eventId,
        kind: 'ASSIGNED',
        message: `${input.rtNumber} is assigned to you for contouring${input.due ? `, due ${input.due}` : ''}. Assigned by ${input.actor.fullName}.`,
        recipients: await this.whoIsNext(db, input.chartId, 'CONTOURING'),
      },
      [input.actor.id],
    );
  }

  /** Treatment finished: tell the consultants, who watch the whole department. */
  async chartFinished(
    db: Queryable,
    input: { chartId: string; rtNumber: string; eventId: string; actor: Pick<Actor, 'id'> },
  ): Promise<void> {
    await this.notify(
      db,
      {
        chartId: input.chartId,
        rtNumber: input.rtNumber,
        eventId: input.eventId,
        kind: 'FINISHED',
        message: `${input.rtNumber}: both final updates are in and tracking has ended.`,
        recipients: await this.staffWithRoles(db, ['CONSULTANT']),
      },
      [input.actor.id],
    );
  }

  // ---- the inbox ----

  async list(actor: Actor, limit = 50): Promise<NotificationList> {
    const rows = await this.database.query<NotificationRow>(
      `SELECT n.id, n.kind, n.message, c.display_number AS rt_number, n.created_at, n.read_at
         FROM notifications n LEFT JOIN rt_charts c ON c.id = n.chart_id
        WHERE n.recipient_id = $1 ORDER BY n.created_at DESC, n.id LIMIT $2`,
      [actor.id, Math.min(Math.max(limit, 1), 200)],
    );
    return { items: rows.rows.map(toItem), unread: await this.unread(actor) };
  }

  async unread(actor: Pick<Actor, 'id'>): Promise<number> {
    const found = await this.database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL`,
      [actor.id],
    );
    return found.rows[0]!.count;
  }

  async markRead(actor: Actor, id: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new DomainError(404, 'NOTIFICATION_NOT_FOUND', 'That notification does not exist.');
    }
    const updated = await this.database.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1::uuid AND recipient_id = $2`,
      [id, actor.id],
    );
    if (updated.rowCount === 0) {
      throw new DomainError(404, 'NOTIFICATION_NOT_FOUND', 'That notification does not exist.');
    }
  }

  async markAllRead(actor: Actor): Promise<number> {
    const updated = await this.database.query(
      `UPDATE notifications SET read_at = now() WHERE recipient_id = $1 AND read_at IS NULL`,
      [actor.id],
    );
    return updated.rowCount;
  }

  // ---- reminders ----

  /**
   * Creates the reminders that are due: a chart that has waited too long (to whoever it is waiting for and to the
   * consultants) and, once a week, the Saturday updates a person still owes. Safe to run as often as you like:
   * each reminder is created once per person.
   */
  async sweep(): Promise<{ stalled: number; weekly: number }> {
    const { stallDays } = readConfig();
    const stalled = await this.database.transaction(async (tx) => {
      const charts = await tx.query<{
        id: string;
        rt_number: string;
        stage: string;
        label: string;
        since: string;
        days: number;
      }>(
        `SELECT c.id, c.display_number AS rt_number, c.current_stage AS stage, s.label,
                extract(epoch FROM c.current_stage_since)::bigint::text AS since,
                ((now() AT TIME ZONE 'Asia/Kolkata')::date - (c.current_stage_since AT TIME ZONE 'Asia/Kolkata')::date)::int AS days
           FROM rt_charts c JOIN workflow_stages s ON s.workflow_id = c.workflow_id AND s.code = c.current_stage
          WHERE c.status = 'OPEN' AND c.current_stage <> $1`,
        [TREATMENT_STAGE],
      );
      const consultants = await this.staffWithRoles(tx, ['CONSULTANT']);
      let count = 0;
      for (const chart of charts.rows) {
        if (chart.days < stallDays) continue;
        const event = await tx.query<{ id: string }>(
          `INSERT INTO outbox_events(chart_id, event_type, payload, processed_at)
           VALUES ($1, 'CHART_STALLED', $2::jsonb, now()) RETURNING id`,
          [
            chart.id,
            JSON.stringify({ rtNumber: chart.rt_number, stage: chart.stage, days: chart.days }),
          ],
        );
        const waiting = await this.whoIsNext(tx, chart.id, chart.stage);
        count += await this.notify(tx, {
          chartId: chart.id,
          rtNumber: chart.rt_number,
          eventId: event.rows[0]!.id,
          kind: 'STALLED',
          message: `${chart.rt_number} has been at ${chart.label} for ${chart.days} days.`,
          recipients: [...waiting, ...consultants],
          dedupeKey: `stalled:${chart.id}:${chart.stage}:${chart.since}`,
        });
      }
      return count;
    });

    const weekly = await this.database.transaction(async (tx) => {
      const today = (
        await tx.query<{ today: string }>(
          `SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS today`,
        )
      ).rows[0]!.today;
      const weekEnding = saturdayOnOrBefore(today);
      const owed = await tx.query<{ chart_id: string; rt_number: string; role: string }>(
        `SELECT c.id AS chart_id, c.display_number AS rt_number, role
           FROM rt_charts c
           JOIN workflow_stages s ON s.workflow_id = c.workflow_id AND s.code = c.current_stage
           CROSS JOIN LATERAL unnest(s.weekly_update_roles) AS role
          WHERE c.status = 'OPEN' AND s.requires_weekly_update
            AND NOT EXISTS (
              SELECT 1 FROM treatment_status_updates u
               WHERE u.chart_id = c.id AND u.kind = 'WEEKLY' AND u.week_ending = $1 AND u.author_role = role)`,
        [weekEnding],
      );
      let count = 0;
      for (const role of new Set(owed.rows.map((row) => row.role))) {
        const charts = owed.rows.filter((row) => row.role === role);
        const event = await tx.query<{ id: string }>(
          `INSERT INTO outbox_events(chart_id, event_type, payload, processed_at)
           VALUES ($1, 'WEEKLY_UPDATES_DUE', $2::jsonb, now()) RETURNING id`,
          [charts[0]!.chart_id, JSON.stringify({ role, weekEnding, charts: charts.length })],
        );
        const noun = charts.length === 1 ? 'chart needs' : 'charts need';
        count += await this.notify(tx, {
          chartId: charts[0]!.chart_id,
          rtNumber: charts[0]!.rt_number,
          eventId: event.rows[0]!.id,
          kind: 'WEEKLY_DUE',
          message: `${charts.length} ${noun} your Saturday update for the week ending ${weekEnding}: ${charts.map((c) => c.rt_number).join(', ')}.`,
          recipients: await this.staffWithRoles(tx, [role]),
          dedupeKey: `weekly:${weekEnding}`,
        });
      }
      return count;
    });
    return { stalled, weekly };
  }
}
