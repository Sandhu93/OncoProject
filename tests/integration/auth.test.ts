import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module.js';
import { LOGIN_MAX_FAILURES } from '../../apps/api/src/auth/auth.service.js';
import { configureApp } from '../../apps/api/src/bootstrap.js';
import { DatabaseService } from '../../apps/api/src/database/database.service.js';
import { addStaff, createTestDatabase } from '../helpers/test-database.js';

describe('AUTH-002 staff sign-in, session and sign-out', () => {
  let app: INestApplication;
  let test: Awaited<ReturnType<typeof createTestDatabase>>;
  const http = () => request(app.getHttpServer());
  const login = (username: string, password: string) =>
    http().post('/api/v1/auth/login').send({ username, password });

  beforeAll(async () => {
    test = await createTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(test.service)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await test.close();
  });

  it('signs in, returns a token the template can store, and reports the server-side roles', async () => {
    const staff = await addStaff(test.db, {
      roles: ['JUNIOR_RESIDENT', 'RADIOGRAPHER'],
      capabilities: ['VIEW_AUDIT'],
    });
    const response = await login(staff.username, staff.password).expect(200);
    expect(response.body.token_type).toBe('Bearer');
    expect(response.body.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body.expires_in).toBeGreaterThan(11 * 3600);

    const me = await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${response.body.access_token}`)
      .set('X-Role', 'CONSULTANT')
      .expect(200);
    expect(me.body).toEqual({
      id: staff.id,
      username: staff.username,
      fullName: 'Synthetic staff',
      roles: ['JUNIOR_RESIDENT', 'RADIOGRAPHER'],
      capabilities: ['VIEW_AUDIT'],
    });
    expect(JSON.stringify(me.body)).not.toMatch(/password|hash/i);
  });

  it('stores only a hash of the token and records sign-in in the audit trail', async () => {
    const staff = await addStaff(test.db, { roles: ['PHYSICIST'] });
    const { body } = await login(staff.username, staff.password).expect(200);
    const sessions = await test.db.query<{ token_hash: string }>(
      'SELECT token_hash FROM staff_sessions WHERE staff_id = $1',
      [staff.id],
    );
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0]?.token_hash).toBe(
      createHash('sha256').update(body.access_token).digest('hex'),
    );
    expect(sessions.rows[0]?.token_hash).not.toBe(body.access_token);
    const audit = await test.db.query<{ action: string; actor_roles: string[] }>(
      'SELECT action, actor_roles FROM audit_events WHERE actor_id = $1',
      [staff.id],
    );
    expect(audit.rows).toEqual([{ action: 'LOGIN_SUCCEEDED', actor_roles: ['PHYSICIST'] }]);
  });

  it('gives the same answer for a wrong password and an unknown name', async () => {
    const staff = await addStaff(test.db);
    const wrong = await login(staff.username, 'not the password!').expect(401);
    const unknown = await login('nobody-here', 'not the password!').expect(401);
    expect(wrong.body.message).toBe('Invalid username or password.');
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('treats the username case-insensitively and trims spaces', async () => {
    const staff = await addStaff(test.db, { username: 'case.check' });
    await login('  Case.Check ', staff.password).expect(200);
  });

  it('refuses inactive accounts and ends their existing sessions', async () => {
    const staff = await addStaff(test.db);
    const { body } = await login(staff.username, staff.password).expect(200);
    await test.db.query('UPDATE staff_users SET is_active = false WHERE id = $1', [staff.id]);
    await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.access_token}`)
      .expect(401);
    await login(staff.username, staff.password).expect(401);
  });

  it('refuses directory accounts that have no local password', async () => {
    await test.db.query(
      "INSERT INTO staff_users(username, full_name, identity_provider, external_subject) VALUES ('directory.user', 'Synthetic', 'DIRECTORY', 'subject-1')",
    );
    await login('directory.user', 'anything at all!').expect(401);
  });

  it('locks a name after repeated failures, even for the right password, and audits known accounts', async () => {
    const staff = await addStaff(test.db);
    for (let attempt = 0; attempt < LOGIN_MAX_FAILURES; attempt++) {
      await login(staff.username, 'wrong password!!').expect(401);
    }
    const locked = await login(staff.username, staff.password).expect(429);
    expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);
    const failures = await test.db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_events WHERE actor_id = $1 AND action = 'LOGIN_FAILED'",
      [staff.id],
    );
    expect(failures.rows[0]?.count).toBe(String(LOGIN_MAX_FAILURES));
  });

  it('clears the failure count after a successful sign-in', async () => {
    const staff = await addStaff(test.db);
    await login(staff.username, 'wrong password!!').expect(401);
    await login(staff.username, staff.password).expect(200);
    const row = await test.db.query('SELECT 1 FROM login_throttle WHERE username = $1', [
      staff.username,
    ]);
    expect(row.rows).toHaveLength(0);
  });

  it('does not store text typed for an unknown name', async () => {
    await login('typed-by-mistake-secret', 'wrong password!!').expect(401);
    const audit = await test.db.query("SELECT 1 FROM audit_events WHERE entity_id LIKE '%secret%'");
    expect(audit.rows).toHaveLength(0);
  });

  it('revokes the session on sign-out and audits it', async () => {
    const staff = await addStaff(test.db);
    const { body } = await login(staff.username, staff.password).expect(200);
    const auth = { Authorization: `Bearer ${body.access_token}` };
    await http().post('/api/v1/auth/logout').set(auth).expect(204);
    await http().get('/api/v1/auth/me').set(auth).expect(401);
    const audit = await test.db.query<{ action: string }>(
      "SELECT action FROM audit_events WHERE actor_id = $1 AND action = 'LOGOUT'",
      [staff.id],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('refuses expired sessions', async () => {
    const staff = await addStaff(test.db);
    const { body } = await login(staff.username, staff.password).expect(200);
    await test.db.query(
      "UPDATE staff_sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE staff_id = $1",
      [staff.id],
    );
    await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.access_token}`)
      .expect(401);
  });

  it('refuses missing, malformed and unknown tokens', async () => {
    await http().get('/api/v1/auth/me').expect(401);
    await http().get('/api/v1/auth/me').set('Authorization', 'Basic abc').expect(401);
    await http().get('/api/v1/auth/me').set('Authorization', 'Bearer short').expect(401);
    await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${'A'.repeat(43)}`)
      .expect(401);
  });

  it('rejects malformed login bodies without touching the database', async () => {
    await http().post('/api/v1/auth/login').send({}).expect(400);
    await http().post('/api/v1/auth/login').send({ username: 1, password: 2 }).expect(400);
    await http().post('/api/v1/auth/login').send({ username: '', password: 'x' }).expect(400);
    await http()
      .post('/api/v1/auth/login')
      .send({ username: 'a', password: 'x'.repeat(129) })
      .expect(400);
  });
});
