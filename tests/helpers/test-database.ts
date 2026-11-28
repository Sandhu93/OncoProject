import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import type { QueryResultRow } from 'pg';
import { hashPassword } from '../../apps/api/src/auth/password.js';
import type { DatabaseService, Queryable } from '../../apps/api/src/database/database.service.js';

type Params = readonly unknown[];

/** An in-memory PostgreSQL with every real migration applied. Synthetic data only. */
export async function createTestDatabase() {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  const directory = new URL('../../database/migrations/', import.meta.url);
  const names = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const name of names) await db.exec(await readFile(new URL(name, directory), 'utf8'));

  const run = async <T extends QueryResultRow>(
    target: { query: PGlite['query'] },
    text: string,
    params: Params,
  ) => {
    const result = await target.query<T>(text, [...params]);
    return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  const queryable = (target: { query: PGlite['query'] }): Queryable => ({
    query: <T extends QueryResultRow = QueryResultRow>(text: string, params: Params = []) =>
      run<T>(target, text, params),
  });
  const service = {
    isReady: async () => true,
    ...queryable(db),
    transaction: <T>(work: (tx: Queryable) => Promise<T>) =>
      db.transaction((tx) => work(queryable(tx as unknown as { query: PGlite['query'] }))),
  } as unknown as DatabaseService;

  return { db, service, query: queryable(db), close: () => db.close() };
}

export interface TestStaff {
  username?: string;
  password?: string;
  roles?: string[];
  capabilities?: string[];
  active?: boolean;
  fullName?: string;
}

export async function addStaff(db: PGlite, options: TestStaff = {}) {
  const id = randomUUID();
  const username = options.username ?? `staff-${id.slice(0, 8)}`;
  const password = options.password ?? 'correct horse battery';
  await db.query(
    `INSERT INTO staff_users(id, username, full_name, identity_provider, password_hash, is_active)
     VALUES ($1, $2, $5, 'LOCAL', $3, $4)`,
    [
      id,
      username,
      await hashPassword(password),
      options.active ?? true,
      options.fullName ?? 'Synthetic staff',
    ],
  );
  for (const role of options.roles ?? []) {
    await db.query('INSERT INTO staff_roles(staff_id, role_code) VALUES ($1, $2)', [id, role]);
  }
  for (const capability of options.capabilities ?? []) {
    await db.query('INSERT INTO staff_capabilities(staff_id, capability) VALUES ($1, $2)', [
      id,
      capability,
    ]);
  }
  return { id, username, password };
}
