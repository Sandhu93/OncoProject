// Creates one local staff account. Run on the server, by an administrator, after `npm run build`.
//   npm run staff:create -- <username> "<Full name>" ROLE[,ROLE] [CAPABILITY[,CAPABILITY]]
// The password is read from a hidden prompt (typed twice), or from STAFF_PASSWORD for scripted setup.
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { createPool } from './database.mjs';
import { checkPasswordPolicy, hashPassword } from '../apps/api/dist/auth/password.js';

const ROLES = ['JUNIOR_RESIDENT', 'SENIOR_RESIDENT', 'CONSULTANT', 'PHYSICIST', 'RADIOGRAPHER'];
const CAPABILITIES = ['MANAGE_STAFF', 'CONFIGURE_WORKFLOW', 'VIEW_AUDIT', 'EXPORT_REPORTS'];

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

const [usernameArg, fullName, roleArg = '', capabilityArg = ''] = process.argv.slice(2);
if (!usernameArg || !fullName) {
  fail(
    'Usage: npm run staff:create -- <username> "<Full name>" ROLE[,ROLE] [CAPABILITY[,CAPABILITY]]',
  );
}
const username = usernameArg.trim().toLowerCase();
const roles = roleArg.split(',').filter(Boolean);
const capabilities = capabilityArg.split(',').filter(Boolean);
for (const role of roles)
  if (!ROLES.includes(role)) fail(`Unknown role: ${role}. Use: ${ROLES.join(', ')}`);
for (const capability of capabilities) {
  if (!CAPABILITIES.includes(capability))
    fail(`Unknown capability: ${capability}. Use: ${CAPABILITIES.join(', ')}`);
}

let password = process.env.STAFF_PASSWORD;
if (password === undefined) {
  password = await promptHidden('Password: ');
  const again = await promptHidden('Type it again: ');
  if (password !== again) fail('The two passwords do not match. No account was created.');
}
const problem = checkPasswordPolicy(password);
if (problem) fail(problem);
const passwordHash = await hashPassword(password);

const pool = createPool(process.env.DATABASE_URL);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const id = randomUUID();
  await client.query(
    `INSERT INTO staff_users(id, username, full_name, identity_provider, password_hash, is_active)
     VALUES ($1, $2, $3, 'LOCAL', $4, true)`,
    [id, username, fullName.trim(), passwordHash],
  );
  for (const role of roles) {
    await client.query('INSERT INTO staff_roles(staff_id, role_code) VALUES ($1, $2)', [id, role]);
  }
  for (const capability of capabilities) {
    await client.query('INSERT INTO staff_capabilities(staff_id, capability) VALUES ($1, $2)', [
      id,
      capability,
    ]);
  }
  await client.query(
    `INSERT INTO audit_events(actor_id, action, entity_type, entity_id, request_id, after_values)
     VALUES (NULL, 'STAFF_CREATED', 'STAFF_USER', $1::text, gen_random_uuid(), $2::jsonb)`,
    [id, JSON.stringify({ username, roles, capabilities, via: 'staff:create script' })],
  );
  await client.query('COMMIT');
  console.log(`Created ${username} (${roles.join(', ') || 'no roles'}).`);
} catch (error) {
  await client.query('ROLLBACK');
  fail(
    error?.code === '23505'
      ? `Username ${username} already exists.`
      : 'Could not create the account. Check the roles, the migrations and DATABASE_URL.',
  );
} finally {
  client.release();
  await pool.end();
}
