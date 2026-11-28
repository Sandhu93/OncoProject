// Seeds the PROPOSED RT workflow (14 stages, as in docs/product/rt-workflow-proposal.md and the prototype)
// and approves it, so charts can be issued while you try the app on your own computer. It is NOT yet the
// department's workflow: that needs the consultant's confirmation (D-01). Refuses unless the database is on this computer and named *_dev.
//   npm run workflow:activate-dev
// Needs a consultant account to record as the approver (run npm run staff:create-test first).
import { readFile } from 'node:fs/promises';
import { createPool } from './database.mjs';

const WORKFLOW_ID = '00000000-0000-4000-8000-000000000002';
// The earlier 3-stage placeholder, retired here if an older run of this script activated it.
const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000001';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) fail('Set DATABASE_URL (run npm run env:init first).');
let parsed;
try {
  parsed = new URL(url);
} catch {
  fail('DATABASE_URL is not a valid address.');
}
const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
const devDatabase = parsed.pathname.endsWith('_dev');
if (process.env.NODE_ENV !== 'development' || !local || !devDatabase) {
  fail(
    'Refusing to activate the development workflow: it needs NODE_ENV=development and a database ' +
      `named *_dev on this computer (found host "${parsed.hostname}", database "${parsed.pathname.slice(1)}").`,
  );
}

const pool = createPool(url);
const client = await pool.connect().catch(() => {
  fail(
    'Cannot reach the database. Is it running (docker compose up -d --wait db) and is DATABASE_URL right?',
  );
});
try {
  await client.query('BEGIN');
  const existing = await client.query('SELECT status FROM workflow_versions WHERE id = $1', [
    WORKFLOW_ID,
  ]);
  if (existing.rows[0]?.status === 'ACTIVE') {
    await client.query('ROLLBACK');
    console.log('The development workflow is already active. Nothing to do.');
  } else {
    if (existing.rowCount === 0) {
      await client.query(
        await readFile(
          new URL('../database/seeds/rt-workflow-proposed.sql', import.meta.url),
          'utf8',
        ),
      );
    }
    await client.query(
      "UPDATE workflow_versions SET status = 'RETIRED' WHERE id = $1 AND status = 'ACTIVE'",
      [PLACEHOLDER_ID],
    );
    const approver = await client.query(
      `SELECT u.id FROM staff_users u JOIN staff_roles r ON r.staff_id = u.id AND r.role_code = 'CONSULTANT'
        WHERE u.is_active ORDER BY (u.username = 'test.consultant') DESC, u.created_at LIMIT 1`,
    );
    if (approver.rowCount === 0) {
      await client.query('ROLLBACK');
      fail('No consultant account to record as the approver. Run npm run staff:create-test first.');
    }
    const approverId = approver.rows[0].id;
    await client.query(
      "UPDATE workflow_versions SET status = 'ACTIVE', approved_by = $2, approved_at = now() WHERE id = $1",
      [WORKFLOW_ID, approverId],
    );
    await client.query(
      `INSERT INTO audit_events(actor_id, action, entity_type, entity_id, request_id, after_values)
       VALUES ($1::uuid, 'WORKFLOW_ACTIVATED_DEV', 'WORKFLOW_VERSION', $2::text, gen_random_uuid(), $3::jsonb)`,
      [approverId, WORKFLOW_ID, JSON.stringify({ via: 'workflow:activate-dev script' })],
    );
    await client.query('COMMIT');
    console.log(
      'Proposed RT workflow activated (14 stages, from RT chart issued to Treatment completed). ' +
        'It is the proposal awaiting the consultant, not yet the department workflow.',
    );
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  fail(`Could not activate the development workflow: ${error?.message ?? 'unknown error'}`);
} finally {
  client.release();
  await pool.end();
}
