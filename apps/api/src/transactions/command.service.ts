import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import type { Actor } from '../auth/actor.js';
import { DomainError } from './domain-error.js';

const KEY_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A repeated request within this time returns the saved answer instead of running again. */
export const IDEMPOTENCY_TTL_HOURS = 24;

export interface CommandResult<T> {
  status: number;
  body: T;
}

export interface CommandContext {
  /** Shared by every audit and outbox row written for this one request. */
  requestId: string;
}

/** The same data always gives the same text, whatever order its keys were written in. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Runs one state-changing command the way docs/architecture/overview.md requires: in a single
 * transaction, once per idempotency key. Retrying the same request returns the first answer;
 * reusing a key for a different request is refused; a refused or failed command saves nothing,
 * so the same key can be tried again.
 */
@Injectable()
export class CommandService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async run<T>(
    actor: Actor,
    options: { operation: string; key: string | undefined; payload: unknown },
    work: (tx: Queryable, context: CommandContext) => Promise<CommandResult<T>>,
  ): Promise<CommandResult<T> & { replayed: boolean }> {
    const key = options.key?.trim();
    if (!key || !KEY_FORMAT.test(key)) {
      throw new DomainError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Send an Idempotency-Key header containing a UUID.',
      );
    }
    const requestHash = createHash('sha256')
      .update(canonicalJson({ operation: options.operation, payload: options.payload }))
      .digest('hex');

    return this.database.transaction(async (tx) => {
      // Two requests with the same key wait for each other here instead of both running.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${actor.id}:${key.toLowerCase()}`,
      ]);
      const existing = await tx.query<{
        request_hash: string;
        response_status: number;
        response_body: T;
        expired: boolean;
      }>(
        `SELECT request_hash, response_status, response_body, expires_at <= now() AS expired
           FROM idempotency_records WHERE actor_id = $1 AND request_key = $2::uuid`,
        [actor.id, key],
      );
      const saved = existing.rows[0];
      if (saved && !saved.expired) {
        if (saved.request_hash !== requestHash) {
          throw new DomainError(
            422,
            'IDEMPOTENCY_KEY_REUSED',
            'This Idempotency-Key was already used for a different request.',
          );
        }
        return { status: saved.response_status, body: saved.response_body, replayed: true };
      }
      if (saved) {
        await tx.query(
          'DELETE FROM idempotency_records WHERE actor_id = $1 AND request_key = $2::uuid',
          [actor.id, key],
        );
      }

      const requestIdRow = await tx.query<{ id: string }>('SELECT gen_random_uuid() AS id');
      const result = await work(tx, { requestId: requestIdRow.rows[0]!.id });
      await tx.query(
        `INSERT INTO idempotency_records(actor_id, request_key, request_hash, response_status, response_body, expires_at)
         VALUES ($1, $2::uuid, $3, $4, $5::jsonb, now() + make_interval(hours => $6))`,
        [
          actor.id,
          key,
          requestHash,
          result.status,
          JSON.stringify(result.body),
          IDEMPOTENCY_TTL_HOURS,
        ],
      );
      return { ...result, replayed: false };
    });
  }
}
