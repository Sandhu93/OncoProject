/**
 * The real OncoTrack API (apps/api/dist) on an in-memory PostgreSQL with every real migration applied,
 * for the "real-api" browser tests. Nothing is mocked except the database server. Synthetic data only.
 * Needs `npm run build -w @oncotrack/api` first.
 */
import 'reflect-metadata';

import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { Test } from '@nestjs/testing';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

import { AppModule } from '../../api/dist/app.module.js';
import { hashPassword } from '../../api/dist/auth/password.js';
import { configureApp } from '../../api/dist/bootstrap.js';
import { DatabaseService } from '../../api/dist/database/database.service.js';

export const REAL_API_PORT = Number(process.env.REAL_API_PORT ?? 4020);
export const REAL_CONTROL_PORT = Number(process.env.REAL_CONTROL_PORT ?? 4021);
export const REAL_PASSWORD = 'correct horse battery';

const db = new PGlite({ extensions: { btree_gist } });

await db.waitReady;

const migrations = new URL('../../../database/migrations/', import.meta.url);

for (const name of (await readdir(migrations)).filter(file => /^\d+_.+\.sql$/.test(file)).sort()) {
  await db.exec(await readFile(new URL(name, migrations), 'utf8'));
}

const run = async (target, text, params = []) => {
  const result = await target.query(text, [...params]);

  return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
};

const queryable = target => ({ query: (text, params) => run(target, text, params) });
const database = {
  isReady: async () => true,
  ...queryable(db),
  transaction: work => db.transaction(tx => work(queryable(tx))),
};

const staff = async (username, fullName, roles, capabilities = []) => {
  const { rows } = await db.query(
    `INSERT INTO staff_users(username, full_name, identity_provider, password_hash)
     VALUES ($1, $2, 'LOCAL', $3) RETURNING id`,
    [username, fullName, await hashPassword(REAL_PASSWORD)],
  );
  const id = rows[0].id;

  for (const role of roles) await db.query('INSERT INTO staff_roles(staff_id, role_code) VALUES ($1, $2)', [id, role]);
  for (const capability of capabilities) {
    await db.query('INSERT INTO staff_capabilities(staff_id, capability) VALUES ($1, $2)', [id, capability]);
  }
};

await staff('real.consultant', 'Real Test Consultant', ['CONSULTANT'], ['VIEW_AUDIT']);
await staff('real.radiographer', 'Real Test Radiographer', ['RADIOGRAPHER']);
await staff('real.locked', 'Real Test Locked', ['PHYSICIST']);

const testingModule = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(DatabaseService)
  .useValue(database)
  .compile();
const app = testingModule.createNestApplication();

configureApp(app);
await app.listen(REAL_API_PORT, '127.0.0.1');
console.log(`Real API on in-memory PostgreSQL listening on http://127.0.0.1:${REAL_API_PORT}`);

/**
 * A small control port for the browser tests, because a workflow can only be approved by a person in the real
 * system and the tests have no such screen yet.
 *   GET  /workflow           -> { active }
 *   POST /activate-workflow  -> approves the proposed 14-stage RT workflow as real.consultant
 */
const hasActiveWorkflow = async () =>
  (await db.query("SELECT 1 FROM workflow_versions WHERE status = 'ACTIVE'")).rows.length > 0;

const activateWorkflow = async () => {
  const approver = (await db.query("SELECT id FROM staff_users WHERE username = 'real.consultant'")).rows[0].id;

  // The same proposed 14-stage workflow the development script uses.
  await db.exec(await readFile(new URL('../../../database/seeds/rt-workflow-proposed.sql', import.meta.url), 'utf8'));
  await db.query(
    "UPDATE workflow_versions SET status = 'ACTIVE', approved_by = $1, approved_at = now() WHERE code = 'RT_PROPOSED'",
    [approver],
  );
};

createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');

  if (request.method === 'GET' && request.url === '/workflow') {
    return response.end(JSON.stringify({ active: await hasActiveWorkflow() }));
  }

  if (request.method === 'POST' && request.url === '/activate-workflow') {
    if (!(await hasActiveWorkflow())) await activateWorkflow();

    return response.end(JSON.stringify({ active: true }));
  }

  response.statusCode = 404;
  response.end('{}');
}).listen(REAL_CONTROL_PORT, '127.0.0.1');
