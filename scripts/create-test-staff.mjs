// Creates (or resets) three local TEST accounts with a known password, for trying the app on a
// development machine. It refuses to run unless DATABASE_URL points at this computer, so the known
// password can never reach a real server.
//   npm run staff:create-test
// Set TEST_STAFF_PASSWORD to choose the password; otherwise the default below is used.
import { randomUUID } from 'node:crypto';
import { createPool } from './database.mjs';
import { checkPasswordPolicy, hashPassword } from '../apps/api/dist/auth/password.js';

const DEFAULT_PASSWORD = 'OncoTrack-Test-2026';
const ACCOUNTS = [
  {
    username: 'test.consultant',
    fullName: 'Test Consultant',
    roles: ['CONSULTANT'],
    capabilities: ['MANAGE_STAFF', 'CONFIGURE_WORKFLOW', 'VIEW_AUDIT', 'EXPORT_REPORTS'],
  },
  {
    username: 'test.resident',
    fullName: 'Test Junior Resident',
    roles: ['JUNIOR_RESIDENT'],
    capabilities: [],
  },
  {
    username: 'test.physicist',
    fullName: 'Test Physicist',
    roles: ['PHYSICIST'],
    capabilities: [],
  },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) fail('Set DATABASE_URL (run npm run env:init first).');
let host;
try {
  host = new URL(url).hostname;
} catch {
  fail('DATABASE_URL is not a valid address.');
}
if (
  !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) ||
  process.env.NODE_ENV === 'production'
) {
  fail(
    `Refusing to create test accounts: DATABASE_URL points at "${host}". ` +
      'This command is for a database on this computer only.',
  );
}

const password = process.env.TEST_STAFF_PASSWORD ?? DEFAULT_PASSWORD;
const problem = checkPasswordPolicy(password);
if (problem) fail(problem);
const passwordHash = await hashPassword(password);

const pool = createPool(url);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const account of ACCOUNTS) {
    const existing = await client.query('SELECT id FROM staff_users WHERE username = $1', [
      account.username,
    ]);
    let id;
    let action;
    if (existing.rowCount === 0) {
      id = randomUUID();
      action = 'STAFF_CREATED';
      await client.query(
        `INSERT INTO staff_users(id, username, full_name, identity_provider, password_hash, is_active)
         VALUES ($1, $2, $3, 'LOCAL', $4, true)`,
        [id, account.username, account.fullName, passwordHash],
      );
    } else {
      id = existing.rows[0].id;
      action = 'STAFF_PASSWORD_RESET';
      await client.query(
        'UPDATE staff_users SET full_name = $2, password_hash = $3, is_active = true WHERE id = $1',
        [id, account.fullName, passwordHash],
      );
      await client.query(
        'UPDATE staff_sessions SET revoked_at = now() WHERE staff_id = $1 AND revoked_at IS NULL',
        [id],
      );
      await client.query('DELETE FROM login_throttle WHERE username = $1', [account.username]);
      await client.query('DELETE FROM staff_roles WHERE staff_id = $1', [id]);
      await client.query('DELETE FROM staff_capabilities WHERE staff_id = $1', [id]);
    }
    for (const role of account.roles) {
      await client.query('INSERT INTO staff_roles(staff_id, role_code) VALUES ($1, $2)', [
        id,
        role,
      ]);
    }
    for (const capability of account.capabilities) {
      await client.query('INSERT INTO staff_capabilities(staff_id, capability) VALUES ($1, $2)', [
        id,
        capability,
      ]);
    }
    await client.query(
      `INSERT INTO audit_events(actor_id, action, entity_type, entity_id, request_id, after_values)
       VALUES (NULL, $4, 'STAFF_USER', $1::text, $2::uuid, $3::jsonb)`,
      [
        id,
        randomUUID(),
        JSON.stringify({
          username: account.username,
          roles: account.roles,
          capabilities: account.capabilities,
          via: 'staff:create-test script',
        }),
        action,
      ],
    );
    console.log(
      `${action === 'STAFF_CREATED' ? 'Created' : 'Reset  '} ${account.username}  (${account.roles.join(', ')})`,
    );
  }
  await client.query('COMMIT');
  console.log(`\nThese are TEST accounts. Password for all three: ${password}`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  fail(`Could not create the test accounts: ${error?.message ?? 'unknown error'}`);
} finally {
  client.release();
  await pool.end();
}
