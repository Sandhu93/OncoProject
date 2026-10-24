import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { readConfig } from '../config.js';

/** Every file in database/migrations must be listed here; a unit test enforces it. */
export const REQUIRED_MIGRATIONS = [
  '001_initial.sql',
  '002_numbering_throttle_weekly_updates.sql',
] as const;

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
