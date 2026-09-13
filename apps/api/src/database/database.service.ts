import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { readConfig } from '../config.js';

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
        "SELECT count(*)::text AS count FROM schema_migrations WHERE name = '001_initial.sql'",
      );
      return result.rows[0]?.count === '1';
    } catch {
      return false;
    }
  }

  async onApplicationShutdown() {
    await this.pool?.end();
  }
}
