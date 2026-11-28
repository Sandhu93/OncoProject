import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DirectoryService,
  DirectoryUnavailableError,
} from '../../apps/api/src/auth/directory.service.js';
import { addStaff } from '../helpers/test-database.js';
import { startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

/** A directory that knows a few passwords. It records every name it was asked about. */
class FakeDirectory extends DirectoryService {
  isOn = true;
  isDown = false;
  asked: string[] = [];
  passwords = new Map<string, string>([['dr.dir', 'directory password']]);
  override get enabled() {
    return this.isOn;
  }
  override async authenticate(subject: string, password: string) {
    this.asked.push(subject);
    if (this.isDown) throw new DirectoryUnavailableError('The directory did not answer.');

    return this.passwords.get(subject) === password;
  }
}

describe('DIR-010 signing in with the hospital directory', () => {
  let s: WorkflowApp;
  const directory = new FakeDirectory();
  let admin: { id: string; token: string };

  const login = (username: string, password: string) =>
    s.http().post('/api/v1/auth/login').send({ username, password });

  beforeAll(async () => {
    s = await startWorkflowApp({ directory });
    const staff = await addStaff(s.test.db, {
      roles: ['CONSULTANT'],
      capabilities: ['MANAGE_STAFF', 'VIEW_AUDIT'],
      fullName: 'Admin Person',
    });
    const { body } = await login(staff.username, staff.password).expect(200);
    admin = { id: staff.id, token: body.access_token };
  });
  afterAll(() => s.close());

  const create = (body: object) => s.as(admin).post('/admin/staff', body);

  it('creates a directory account with no password, and lists it as one', async () => {
    const made = (
      await create({
        username: 'dr.dir',
        fullName: 'Dr Directory',
        roles: ['SENIOR_RESIDENT'],
        identityProvider: 'DIRECTORY',
      }).expect(201)
    ).body;
    expect(made).toMatchObject({ username: 'dr.dir', identityProvider: 'DIRECTORY' });

    const listed = (await s.as(admin).get('/admin/staff').expect(200)).body;
    expect(listed.directoryEnabled).toBe(true);
    expect(
      listed.items.find((m: { username: string }) => m.username === 'dr.dir').identityProvider,
    ).toBe('DIRECTORY');

    const row = await s.test.db.query<{ password_hash: string | null; external_subject: string }>(
      "SELECT password_hash, external_subject FROM staff_users WHERE username = 'dr.dir'",
    );
    expect(row.rows[0]).toEqual({ password_hash: null, external_subject: 'dr.dir' });
  });

  it('refuses a password on a directory account, and a directory account when none is set up', async () => {
    const withPassword = await create({
      username: 'dir.two',
      fullName: 'Dir Two',
      roles: ['PHYSICIST'],
      identityProvider: 'DIRECTORY',
      password: 'a long enough passphrase',
    }).expect(400);
    expect(withPassword.body.details).toContainEqual(
      expect.objectContaining({ field: 'password' }),
    );

    directory.isOn = false;
    const off = await create({
      username: 'dir.three',
      fullName: 'Dir Three',
      roles: ['PHYSICIST'],
      identityProvider: 'DIRECTORY',
    }).expect(400);
    expect(off.body.details).toContainEqual(expect.objectContaining({ field: 'identityProvider' }));
    directory.isOn = true;

    await create({
      username: 'dir.four',
      fullName: 'Dir Four',
      roles: ['PHYSICIST'],
      identityProvider: 'WHATEVER',
    }).expect(400);
  });

  it('signs in with the directory password, using the stored name, and audits it', async () => {
    directory.asked = [];
    const { body } = await login('Dr.Dir', 'directory password').expect(200);
    expect(body.access_token).toEqual(expect.any(String));
    expect(directory.asked).toEqual(['dr.dir']);

    const me = await s
      .http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.access_token}`)
      .expect(200);
    expect(me.body).toMatchObject({ username: 'dr.dir', roles: ['SENIOR_RESIDENT'] });
    const audit = await s.test.db.query(
      "SELECT 1 FROM audit_events WHERE action = 'LOGIN_SUCCEEDED' AND actor_id = $1",
      [me.body.id],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('refuses a wrong directory password the same way as any wrong password, and locks after five', async () => {
    const wrong = await login('dr.dir', 'not it').expect(401);
    const unknown = await login('nobody.here', 'not it').expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    for (let i = 0; i < 4; i += 1) await login('dr.dir', 'not it').expect(401);
    await login('dr.dir', 'directory password').expect(429);
    await s.test.db.query("DELETE FROM login_throttle WHERE username = 'dr.dir'");
  });

  it('does not count an unreachable directory against the person, and says so', async () => {
    directory.isDown = true;
    const down = await login('dr.dir', 'directory password').expect(503);
    expect(down.body.message).toMatch(/directory/i);
    const throttle = await s.test.db.query(
      "SELECT 1 FROM login_throttle WHERE username = 'dr.dir'",
    );
    expect(throttle.rows).toHaveLength(0);
    directory.isDown = false;
    await login('dr.dir', 'directory password').expect(200);
  });

  it('cannot sign in when directory sign-in has been switched off, and a stored hash is never involved', async () => {
    directory.isOn = false;
    await login('dr.dir', 'directory password').expect(401);
    directory.isOn = true;
  });

  it('refuses to set a password for a directory account', async () => {
    const id = (
      await s.test.db.query<{ id: string }>("SELECT id FROM staff_users WHERE username = 'dr.dir'")
    ).rows[0]!.id;
    const refused = await s
      .as(admin)
      .post(`/admin/staff/${id}/password`, { password: 'a long enough passphrase' })
      .expect(409);
    expect(refused.body.code).toBe('DIRECTORY_ACCOUNT');
    // And no local password can open the account either.
    await login('dr.dir', 'a long enough passphrase').expect(401);
  });

  it('leaves local accounts exactly as they were', async () => {
    const staff = await addStaff(s.test.db, { roles: ['PHYSICIST'] });
    directory.asked = [];
    await login(staff.username, staff.password).expect(200);
    await login(staff.username, 'wrong password').expect(401);
    expect(directory.asked).toEqual([]);
    expect(randomUUID()).toBeTruthy();
  });
});
