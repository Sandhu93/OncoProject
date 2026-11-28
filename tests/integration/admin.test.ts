import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditList, StaffMember, WorkflowView } from '@oncotrack/contracts';
import { addStaff } from '../helpers/test-database.js';
import { startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

type Person = Awaited<ReturnType<WorkflowApp['signIn']>>;

describe('ADM-010 staff management, workflow view and audit viewer', () => {
  let s: WorkflowApp;
  let admin: Person & { username: string; password: string };
  let auditor: Person;
  let radiographer: Person;

  /** A signed-in person who holds some capabilities. */
  const withCapabilities = async (
    capabilities: ('MANAGE_STAFF' | 'VIEW_AUDIT')[],
    fullName: string,
  ) => {
    const staff = await addStaff(s.test.db, { roles: ['CONSULTANT'], capabilities, fullName });
    const { body } = await s
      .http()
      .post('/api/v1/auth/login')
      .send({ username: staff.username, password: staff.password })
      .expect(200);
    return { ...staff, token: body.access_token as string, roles: ['CONSULTANT' as const] };
  };

  beforeAll(async () => {
    s = await startWorkflowApp();
    admin = await withCapabilities(['MANAGE_STAFF', 'VIEW_AUDIT'], 'Admin Person');
    auditor = await withCapabilities(['VIEW_AUDIT'], 'Audit Person');
    radiographer = await s.signIn('radiographer', ['RADIOGRAPHER'], 'Rad One');
  });
  afterAll(() => s.close());

  const members = async (): Promise<StaffMember[]> =>
    (await s.as(admin).get('/admin/staff').expect(200)).body.items;
  const create = (body: object, key: string | null = randomUUID()) =>
    s.as(admin).post('/admin/staff', body, key);
  const newPassword = 'a long enough passphrase';

  describe('who may use it', () => {
    it('refuses staff pages to anyone without MANAGE_STAFF, and the audit to anyone without VIEW_AUDIT', async () => {
      for (const who of [radiographer, auditor]) {
        const refused = await s.as(who).get('/admin/staff').expect(403);
        expect(refused.body.code).toBe('CAPABILITY_REQUIRED');
      }
      await s.as(radiographer).get('/admin/audit').expect(403);
      await s.as(auditor).get('/admin/audit').expect(200);
      await s.as(radiographer).post('/admin/staff', { username: 'nope.person' }).expect(403);
    });

    it('needs a signed-in person for every route', async () => {
      for (const path of ['/admin/staff', '/admin/workflow', '/admin/audit']) {
        await s.http().get(`/api/v1${path}`).expect(401);
      }
    });
  });

  describe('staff accounts', () => {
    it('lists everyone with roles, access and last sign-in, without any secret', async () => {
      const list = await members();
      const me = list.find((m) => m.id === admin.id)!;
      expect(me).toMatchObject({
        username: admin.username,
        fullName: 'Admin Person',
        roles: ['CONSULTANT'],
        capabilities: ['MANAGE_STAFF', 'VIEW_AUDIT'],
        isActive: true,
        isAvailable: true,
      });
      expect(me.lastLoginAt).toEqual(expect.any(String));
      expect(JSON.stringify(list)).not.toMatch(/password|hash/i);
    });

    it('creates an account that can sign in, and records it without the password', async () => {
      const made = (
        await create({
          username: 'New.Resident',
          fullName: 'Dr New Resident',
          roles: ['JUNIOR_RESIDENT'],
          capabilities: [],
          password: newPassword,
        }).expect(201)
      ).body as StaffMember;
      expect(made).toMatchObject({
        username: 'new.resident',
        roles: ['JUNIOR_RESIDENT'],
        isActive: true,
      });
      await s
        .http()
        .post('/api/v1/auth/login')
        .send({ username: 'new.resident', password: newPassword })
        .expect(200);

      const audit = await s.test.db.query<{ after_values: unknown }>(
        "SELECT after_values FROM audit_events WHERE action = 'STAFF_CREATED' AND entity_id = $1",
        [made.id],
      );
      expect(audit.rows).toHaveLength(1);
      expect(JSON.stringify(audit.rows[0]!.after_values)).not.toContain(newPassword);
    });

    it('refuses bad input with a message for each field', async () => {
      const refused = await create({
        username: 'x',
        fullName: '',
        roles: ['WIZARD'],
        capabilities: ['EVERYTHING'],
        password: 'short',
      }).expect(400);
      expect(refused.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'capabilities',
        'fullName',
        'password',
        'roles',
        'username',
      ]);
      await create({
        username: 'no.role',
        fullName: 'No Role',
        roles: [],
        capabilities: [],
        password: newPassword,
      }).expect(400);
    });

    it('refuses a username that is already used, whatever its case', async () => {
      const refused = await create({
        username: 'NEW.RESIDENT',
        fullName: 'Someone Else',
        roles: ['SENIOR_RESIDENT'],
        password: newPassword,
      }).expect(409);
      expect(refused.body.code).toBe('USERNAME_TAKEN');
    });

    it('does not create twice when the same request is sent again', async () => {
      const key = randomUUID();
      const body = {
        username: 'once.only',
        fullName: 'Once Only',
        roles: ['PHYSICIST'],
        password: newPassword,
      };
      const first = await create(body, key).expect(201);
      const again = await create(body, key).expect(201);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(again.body.id).toBe(first.body.id);
      expect((await members()).filter((m) => m.username === 'once.only')).toHaveLength(1);
    });

    it('changes roles, access and availability, and audits what was before and after', async () => {
      const target = (await members()).find((m) => m.username === 'new.resident')!;
      const changed = (
        await s
          .as(admin)
          .post(`/admin/staff/${target.id}`, {
            fullName: 'Dr Renamed',
            roles: ['SENIOR_RESIDENT', 'JUNIOR_RESIDENT'],
            capabilities: ['VIEW_AUDIT'],
            isAvailable: false,
          })
          .expect(200)
      ).body as StaffMember;
      expect(changed).toMatchObject({
        fullName: 'Dr Renamed',
        roles: ['JUNIOR_RESIDENT', 'SENIOR_RESIDENT'],
        capabilities: ['VIEW_AUDIT'],
        isAvailable: false,
        isActive: true,
      });
      const audit = await s.test.db.query<{
        before_values: Record<string, unknown>;
        after_values: Record<string, unknown>;
      }>(
        "SELECT before_values, after_values FROM audit_events WHERE action = 'STAFF_UPDATED' AND entity_id = $1",
        [target.id],
      );
      expect(audit.rows[0]!.before_values).toMatchObject({
        fullName: 'Dr New Resident',
        isAvailable: true,
      });
      expect(audit.rows[0]!.after_values).toMatchObject({
        fullName: 'Dr Renamed',
        isAvailable: false,
      });
    });

    it('refuses an update that leaves someone with nothing, and a missing account', async () => {
      const target = (await members()).find((m) => m.username === 'new.resident')!;
      await s
        .as(admin)
        .post(`/admin/staff/${target.id}`, { roles: [], capabilities: [] })
        .expect(400);
      await s.as(admin).post(`/admin/staff/${randomUUID()}`, { isAvailable: true }).expect(404);
      await s.as(admin).post('/admin/staff/not-an-id', { isAvailable: true }).expect(404);
    });

    it('switching an account off signs it out at once and stops it signing in', async () => {
      const staff = await withCapabilities(['VIEW_AUDIT'], 'Soon Off');
      await s.as(staff).get('/admin/audit').expect(200);
      await s.as(admin).post(`/admin/staff/${staff.id}`, { isActive: false }).expect(200);
      await s.as(staff).get('/admin/audit').expect(401);
      await s
        .http()
        .post('/api/v1/auth/login')
        .send({ username: staff.username, password: staff.password })
        .expect(401);
      // Switching back on lets them sign in again.
      await s.as(admin).post(`/admin/staff/${staff.id}`, { isActive: true }).expect(200);
      await s
        .http()
        .post('/api/v1/auth/login')
        .send({ username: staff.username, password: staff.password })
        .expect(200);
    });

    it('sets a new password, which signs the person out and clears any lock', async () => {
      const staff = await withCapabilities(['VIEW_AUDIT'], 'Forgot Password');
      await s.test.db.query(
        `INSERT INTO login_throttle(username, failed_count, window_started_at, locked_until)
         VALUES ($1, 5, now(), now() + interval '15 minutes')`,
        [staff.username],
      );
      await s
        .as(admin)
        .post(`/admin/staff/${staff.id}/password`, { password: 'short' })
        .expect(400);
      await s
        .as(admin)
        .post(`/admin/staff/${staff.id}/password`, { password: newPassword })
        .expect(200);

      await s.as(staff).get('/admin/audit').expect(401);
      await s
        .http()
        .post('/api/v1/auth/login')
        .send({ username: staff.username, password: staff.password })
        .expect(401);
      await s
        .http()
        .post('/api/v1/auth/login')
        .send({ username: staff.username, password: newPassword })
        .expect(200);
      const throttle = await s.test.db.query('SELECT 1 FROM login_throttle WHERE username = $1', [
        staff.username,
      ]);
      expect(throttle.rows).toHaveLength(0);
      const audit = await s.test.db.query<{ after_values: unknown }>(
        "SELECT after_values FROM audit_events WHERE action = 'STAFF_PASSWORD_RESET' AND entity_id = $1",
        [staff.id],
      );
      expect(JSON.stringify(audit.rows[0]!.after_values)).not.toContain(newPassword);
    });

    it('will not let an administrator lock themselves or everyone out', async () => {
      const self = await s
        .as(admin)
        .post(`/admin/staff/${admin.id}`, { isActive: false })
        .expect(409);
      expect(self.body.code).toBe('CANNOT_SWITCH_OFF_SELF');
      const access = await s
        .as(admin)
        .post(`/admin/staff/${admin.id}`, { capabilities: ['VIEW_AUDIT'] })
        .expect(409);
      expect(access.body.code).toBe('CANNOT_REMOVE_OWN_ACCESS');

      // With a second administrator, the first can be demoted by the second but never the last.
      const second = await withCapabilities(['MANAGE_STAFF'], 'Second Admin');
      await s
        .as(second)
        .post(`/admin/staff/${admin.id}`, { capabilities: ['VIEW_AUDIT'] })
        .expect(200);
      const last = await s
        .as(second)
        .post(`/admin/staff/${second.id}`, { capabilities: [] })
        .expect(409);
      expect(last.body.code).toBe('CANNOT_REMOVE_OWN_ACCESS');
      // Put the first administrator back, so later tests have one.
      await s
        .as(second)
        .post(`/admin/staff/${admin.id}`, { capabilities: ['MANAGE_STAFF', 'VIEW_AUDIT'] })
        .expect(200);
      // The first administrator may remove the second, because they still hold the access themselves.
      await s.as(admin).post(`/admin/staff/${second.id}`, { isActive: false }).expect(200);
    });
  });

  describe('deleting an account', () => {
    const remove = (id: string, key: string | null = randomUUID()) => {
      const call = s
        .http()
        .delete(`/api/v1/admin/staff/${id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      if (key) call.set('Idempotency-Key', key);
      return call;
    };

    it('deletes an account nothing was ever recorded against, and says so in the audit', async () => {
      const made = (
        await create({
          username: 'mistake.entry',
          fullName: 'Entered By Mistake',
          roles: ['RADIOGRAPHER'],
          password: newPassword,
        }).expect(201)
      ).body as StaffMember;
      expect(made.canDelete).toBe(true);
      // A chart being issued tells radiographers, so this account has an inbox row. That is not history.
      await s.issueChart('DEL-1');

      const gone = await remove(made.id).expect(200);
      expect(gone.body.username).toBe('mistake.entry');
      expect((await members()).some((m) => m.id === made.id)).toBe(false);
      await s
        .http()
        .post('/api/v1/auth/login')
        .send({ username: 'mistake.entry', password: newPassword })
        .expect(401);

      const audit = await s.test.db.query<{ before_values: Record<string, unknown> }>(
        "SELECT before_values FROM audit_events WHERE action = 'STAFF_DELETED' AND entity_id = $1",
        [made.id],
      );
      expect(audit.rows[0]!.before_values).toMatchObject({ username: 'mistake.entry' });
    });

    it('refuses an account that appears in the history, and offers switching off instead', async () => {
      const person = (await members()).find((m) => m.id === radiographer.id)!;
      expect(person.canDelete).toBe(false);
      const refused = await remove(radiographer.id).expect(409);
      expect(refused.body.code).toBe('HAS_HISTORY');
      expect((await members()).some((m) => m.id === radiographer.id)).toBe(true);
    });

    it('refuses yourself, a missing account and anyone without the permission', async () => {
      expect((await remove(admin.id).expect(409)).body.code).toBe('CANNOT_DELETE_SELF');
      await remove(randomUUID()).expect(404);
      await remove('not-an-id').expect(404);
      const denied = await s
        .http()
        .delete(`/api/v1/admin/staff/${randomUUID()}`)
        .set('Authorization', `Bearer ${radiographer.token}`)
        .set('Idempotency-Key', randomUUID())
        .expect(403);
      expect(denied.body.code).toBe('CAPABILITY_REQUIRED');
    });
  });

  describe('the workflow view', () => {
    it('shows the active workflow to any signed-in person, with every stage and step', async () => {
      const { workflow } = (await s.as(radiographer).get('/admin/workflow').expect(200)).body as {
        workflow: WorkflowView;
      };
      expect(workflow).toMatchObject({ code: 'RT_PROPOSED', status: 'ACTIVE' });
      expect(workflow.approvedBy).toEqual(expect.any(String));
      expect(workflow.stages).toHaveLength(15);
      expect(workflow.stages[0]).toMatchObject({ position: 1, isInitial: true });
      expect(workflow.stages.at(-1)).toMatchObject({ code: 'TRACKING_ENDED', isTerminal: true });
      expect(workflow.transitions).toHaveLength(18);
      expect(
        workflow.transitions.every((t) => t.fromLabel && t.toLabel && t.actionLabel && t.role),
      ).toBe(true);
      const weekly = workflow.stages.filter((stage) => stage.weeklyUpdateRoles.length > 0);
      expect(weekly.length).toBeGreaterThan(0);
    });
  });

  describe('the audit viewer', () => {
    it('shows the newest first, with who did it, the chart and the values', async () => {
      await s.issueChart('AUD-1');
      const list = (await s.as(auditor).get('/admin/audit?limit=100').expect(200))
        .body as AuditList;
      expect(list.total).toBeGreaterThan(0);
      expect(list.actions).toEqual(expect.arrayContaining(['LOGIN_SUCCEEDED', 'STAFF_CREATED']));
      const times = list.items.map((item) => Date.parse(item.occurredAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      const issued = list.items.find((item) => item.rtNumber === 'AUD-1');
      expect(issued).toMatchObject({ actorRoles: ['CONSULTANT'], rtNumber: 'AUD-1' });
      expect(issued!.actorName).toEqual(expect.any(String));
    });

    it('filters by chart, action, person and date, and pages through the results', async () => {
      const byChart = (await s.as(auditor).get('/admin/audit?rt=aud-1').expect(200))
        .body as AuditList;
      expect(byChart.items.length).toBeGreaterThan(0);
      expect(byChart.items.every((item) => item.rtNumber === 'AUD-1')).toBe(true);

      const byAction = (
        await s.as(auditor).get('/admin/audit?action=STAFF_PASSWORD_RESET').expect(200)
      ).body as AuditList;
      expect(byAction.total).toBeGreaterThan(0);
      expect(byAction.items.every((item) => item.action === 'STAFF_PASSWORD_RESET')).toBe(true);

      const byPerson = (await s.as(auditor).get('/admin/audit?person=Admin%20Person').expect(200))
        .body as AuditList;
      expect(byPerson.total).toBeGreaterThan(0);
      expect(byPerson.items.every((item) => item.actorName === 'Admin Person')).toBe(true);

      const future = (await s.as(auditor).get('/admin/audit?from=2999-01-01').expect(200))
        .body as AuditList;
      expect(future).toMatchObject({ items: [], total: 0 });

      const first = (await s.as(auditor).get('/admin/audit?limit=2').expect(200)).body as AuditList;
      const second = (await s.as(auditor).get('/admin/audit?limit=2&offset=2').expect(200))
        .body as AuditList;
      expect(first.items).toHaveLength(2);
      expect(second.total).toBe(first.total);
      expect(second.items.map((i) => i.id)).not.toEqual(first.items.map((i) => i.id));
      const past = (
        await s
          .as(auditor)
          .get(`/admin/audit?offset=${first.total + 10}`)
          .expect(200)
      ).body as AuditList;
      expect(past).toMatchObject({ items: [], total: first.total });
    });

    it('treats a percent sign in the person filter as plain text', async () => {
      const found = (await s.as(auditor).get('/admin/audit?person=%25').expect(200))
        .body as AuditList;
      expect(found.total).toBe(0);
    });

    it('refuses bad filters with a message for each', async () => {
      const refused = await s
        .as(auditor)
        .get('/admin/audit?from=yesterday&to=2026-13-40&limit=0&offset=-1')
        .expect(400);
      expect(refused.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'from',
        'limit',
        'offset',
        'to',
      ]);
      await s.as(auditor).get('/admin/audit?limit=101').expect(400);
    });
  });
});
