import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../auth/actor.js';
import type { AuditEntry, AuditList } from '@oncotrack/contracts';
import { isIsoDate } from '../charts/actions/dates.js';
import { normaliseRtNumber } from '../charts/issue-chart.parse.js';
import { DatabaseService } from '../database/database.service.js';
import { DomainError, type FieldProblem } from '../transactions/domain-error.js';
import { requireCapability } from './capability.js';

export const AUDIT_PAGE_MAX = 100;

export interface AuditQuery {
  rt?: string;
  action?: string;
  person?: string;
  from?: string;
  to?: string;
  limit?: string;
  offset?: string;
}

interface Row {
  id: string;
  occurred_at: Date | string;
  action: string;
  entity_type: string;
  entity_id: string;
  rt_number: string | null;
  actor_name: string | null;
  actor_roles: string[];
  before_values: unknown;
  after_values: unknown;
  total: number;
}

/** The audit trail, newest first, with filters. Needs VIEW_AUDIT. */
@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(actor: Actor, query: AuditQuery): Promise<AuditList> {
    requireCapability(actor, 'VIEW_AUDIT');
    const problems: FieldProblem[] = [];
    const where: string[] = [];
    const params: unknown[] = [];
    const bind = (value: unknown) => `$${params.push(value)}`;

    if (query.rt?.trim()) where.push(`c.display_number = ${bind(normaliseRtNumber(query.rt))}`);
    if (query.action?.trim()) where.push(`a.action = ${bind(query.action.trim())}`);
    if (query.person?.trim()) {
      const needle = query.person.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
      where.push(
        `(u.full_name ILIKE ${bind(`%${needle}%`)} OR u.username ILIKE ${bind(`%${needle}%`)})`,
      );
    }
    for (const [key, op] of [
      ['from', '>='],
      ['to', '<='],
    ] as const) {
      const value = query[key]?.trim();
      if (!value) continue;
      if (!isIsoDate(value)) problems.push({ field: key, message: 'Use a date like 2026-12-01.' });
      else
        where.push(`(a.occurred_at AT TIME ZONE 'Asia/Kolkata')::date ${op} ${bind(value)}::date`);
    }
    const limit = query.limit === undefined || query.limit === '' ? 50 : Number(query.limit);
    const offset = query.offset === undefined || query.offset === '' ? 0 : Number(query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > AUDIT_PAGE_MAX) {
      problems.push({ field: 'limit', message: `Choose between 1 and ${AUDIT_PAGE_MAX}.` });
    }
    if (!Number.isInteger(offset) || offset < 0)
      problems.push({ field: 'offset', message: 'Must be 0 or more.' });
    if (problems.length > 0) {
      throw new DomainError(400, 'VALIDATION_FAILED', 'Some fields need attention.', problems);
    }

    const rows = await this.database.query<Row>(
      `SELECT a.id::text, a.occurred_at, a.action, a.entity_type, a.entity_id, c.display_number AS rt_number,
              u.full_name AS actor_name, a.actor_roles, a.before_values, a.after_values,
              count(*) OVER ()::int AS total
         FROM audit_events a
         LEFT JOIN rt_charts c ON c.id = a.chart_id
         LEFT JOIN staff_users u ON u.id = a.actor_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT ${bind(limit)} OFFSET ${bind(offset)}`,
      params,
    );
    const actions = await this.database.query<{ action: string }>(
      'SELECT DISTINCT action FROM audit_events ORDER BY action',
    );
    const items: AuditEntry[] = rows.rows.map((row) => ({
      id: row.id,
      occurredAt: (row.occurred_at instanceof Date
        ? row.occurred_at
        : new Date(row.occurred_at)
      ).toISOString(),
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      rtNumber: row.rt_number,
      actorName: row.actor_name,
      actorRoles: row.actor_roles,
      before: row.before_values,
      after: row.after_values,
    }));
    return {
      items,
      total: rows.rows[0]?.total ?? (await this.countAll(where, params.slice(0, -2))),
      actions: actions.rows.map((row) => row.action),
    };
  }

  /** The total when the page asked for is past the end, so no row carried it. */
  private async countAll(where: string[], params: unknown[]): Promise<number> {
    const found = await this.database.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_events a
         LEFT JOIN rt_charts c ON c.id = a.chart_id
         LEFT JOIN staff_users u ON u.id = a.actor_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
      params,
    );
    return found.rows[0]!.n;
  }
}
