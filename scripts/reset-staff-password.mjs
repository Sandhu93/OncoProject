// Sets a new password for an existing local staff account, ends its sessions and clears any lockout.
// Run on the server, by an administrator, after `npm run build`.
//   npm run staff:reset-password -- <username>
// The password is read from a hidden prompt (typed twice), or from STAFF_PASSWORD for scripted use.
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { createPool } from './database.mjs';
import { checkPasswordPolicy, hashPassword } from '../apps/api/dist/auth/password.js';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) process.stdout.write(chunk);
        callback();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

const usernameArg = process.argv[2];
if (!usernameArg) fail('Usage: npm run staff:reset-password -- <username>');
const username = usernameArg.trim().toLowerCase();

let password = process.env.STAFF_PASSWORD;
if (password === undefined) {
  password = await promptHidden('New password: ');
  const again = await promptHidden('Type it again: ');
  if (password !== again) fail('The two passwords do not match. Nothing was changed.');
}
const problem = checkPasswordPolicy(password);
if (problem) fail(problem);
const passwordHash = await hashPassword(password);

const pool = createPool(process.env.DATABASE_URL);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const found = await client.query('SELECT id, is_active FROM staff_users WHERE username = $1', [
    username,
  ]);
  if (found.rowCount === 0) {
    await client.query('ROLLBACK');
    fail(`No account named ${username}. Create it with npm run staff:create.`);
  }
  const { id, is_active: isActive } = found.rows[0];
  await client.query('UPDATE staff_users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
  await client.query(
    'UPDATE staff_sessions SET revoked_at = now() WHERE staff_id = $1 AND revoked_at IS NULL',
    [id],
  );
  await client.query('DELETE FROM login_throttle WHERE username = $1', [username]);
  await client.query(
    `INSERT INTO audit_events(actor_id, action, entity_type, entity_id, request_id, after_values)
     VALUES (NULL, 'STAFF_PASSWORD_RESET', 'STAFF_USER', $1::text, $2::uuid, $3::jsonb)`,
    [id, randomUUID(), JSON.stringify({ username, via: 'staff:reset-password script' })],
  );
  await client.query('COMMIT');
  console.log(
    `Password changed for ${username}; their sessions were ended and any lockout cleared.`,
  );
  if (!isActive) console.log('Note: this account is switched off, so it still cannot log in.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  fail(`Could not reset the password: ${error?.message ?? 'unknown error'}`);
} finally {
  client.release();
  await pool.end();
}
