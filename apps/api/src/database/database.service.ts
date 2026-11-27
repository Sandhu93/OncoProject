import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';
import { readConfig } from '../config.js';

/** Every file in database/migrations must be listed here; a unit test enforces it. */
export const REQUIRED_MIGRATIONS = [
  '001_initial.sql',
  '002_numbering_throttle_weekly_updates.sql',
  '003_remove_patient_identity.sql',
] as const;

export type SqlParams = readonly unknown[];

/** The part of a database connection that services use, so tests can supply an in-memory server. */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: SqlParams,
  ): Promise<{ rows: T[]; rowCount: number }>;
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool | undefined;

  constructor() {
    const { databaseUrl } = readConfig();
    if (databaseUrl) {
      this.pool = new Pool({
        connectionString: databaseUrl,
        max: 10,
        connectionTimeoutMillis: 2000,
        statement_timeout: 3000,
      });
      // Pool background errors must not leak connection strings or crash the process.
      this.pool.on('error', () => console.error('Database connection unavailable.'));
    }
  }

  private requirePool(): Pool {
    if (!this.pool) throw new Error('Database is not configured.');
    return this.pool;
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, params: SqlParams = []) {
    const result = await this.requirePool().query<T>(text, [...params]);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }

  /** Runs `work` in one transaction: committed if it returns, rolled back if it throws. */
  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();
    try {
      await client.query('BEGIN');
      const tx: Queryable = {
        query: async <R extends QueryResultRow = QueryResultRow>(
          text: string,
          params: SqlParams = [],
        ) => {
          const result = await client.query<R>(text, [...params]);
          return { rows: result.rows, rowCount: result.rowCount ?? 0 };
        },
      };
      const output = await work(tx);
      await client.query('COMMIT');
      return output;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async isReady(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      const result = await this.pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM schema_migrations WHERE name = ANY($1::text[])',
        [REQUIRED_MIGRATIONS],
      );
      return result.rows[0]?.count === String(REQUIRED_MIGRATIONS.length);
    } catch {
      return false;
    }
  }

  async onApplicationShutdown() {
    await this.pool?.end();
  }
}
