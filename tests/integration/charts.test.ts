import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module.js';
import { configureApp } from '../../apps/api/src/bootstrap.js';
import { DatabaseService } from '../../apps/api/src/database/database.service.js';
import { addStaff, createTestDatabase } from '../helpers/test-database.js';

async function startApp() {
  const test = await createTestDatabase();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(test.service)
    .compile();
  const app = module.createNestApplication();
  configureApp(app);
  await app.init();
  const http = () => request(app.getHttpServer());
  const signIn = async (roles: string[]) => {
    const staff = await addStaff(test.db, { roles });
    const { body } = await http()
      .post('/api/v1/auth/login')
      .send({ username: staff.username, password: staff.password })
      .expect(200);
    return { staff, token: body.access_token as string };
  };
  const activateWorkflow = async (approver: string) => {
    const id = randomUUID();
    await test.db.query(
      "INSERT INTO workflow_versions(id, code, version, label) VALUES ($1::uuid, $2::text, 1, 'Synthetic test workflow')",
      [id, `workflow-${id}`],
    );
    await test.db.query(
      "INSERT INTO workflow_stages(workflow_id, code, label, display_order, is_initial) VALUES ($1, 'ISSUED', 'Chart issued', 0, true), ($1, 'NEXT', 'Next step', 1, false)",
      [id],
    );
    await test.db.query(
      "UPDATE workflow_versions SET status = 'ACTIVE', approved_by = $2, approved_at = now() WHERE id = $1",
      [id, approver],
    );
  };
  const close = async () => {
    await app.close();
    await test.close();
  };
  return { test, http, signIn, activateWorkflow, close };
}

const issue = (
  s: Awaited<ReturnType<typeof startApp>>,
  token: string,
  body: unknown,
  key: string | null = randomUUID(),
) => {
  const call = s.http().post('/api/v1/charts').set('Authorization', `Bearer ${token}`);
  if (key) call.set('Idempotency-Key', key);
  return call.send(body as object);
};

describe('CHART-001 issuing a chart', () => {
  let s: Awaited<ReturnType<typeof startApp>>;
  let consultant: Awaited<ReturnType<typeof s.signIn>>;
  beforeAll(async () => {
    s = await startApp();
    consultant = await s.signIn(['CONSULTANT']);
  });
  afterAll(() => s.close());

  it('refuses while no workflow has been approved, and saves nothing', async () => {
    const response = await issue(s, consultant.token, { rtNumber: 'RT-1', plannedSessions: 10 });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('WORKFLOW_NOT_ACTIVE');
    expect((await s.test.db.query('SELECT 1 FROM rt_charts')).rows).toHaveLength(0);
    expect((await s.test.db.query('SELECT 1 FROM idempotency_records')).rows).toHaveLength(0);
  });

  it('issues a chart with history, audit and outbox written together', async () => {
    await s.activateWorkflow(consultant.staff.id);
    const response = await issue(s, consultant.token, {
      rtNumber: ' rt-2026/0042 ',
      plannedSessions: 30,
      priority: 'URGENT',
      planId: 'PLAN-7',
      contourSetName: 'Set A',
      scanReference: 'CT-1',
    }).expect(201);
    expect(response.body).toMatchObject({
      rtNumber: 'RT-2026/0042',
      stage: { code: 'ISSUED', label: 'Chart issued' },
      status: 'OPEN',
      version: 1,
      plannedSessions: 30,
      priority: 'URGENT',
      planId: 'PLAN-7',
      contourSetName: 'Set A',
      scanReference: 'CT-1',
      issuedBy: 'Synthetic staff',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/patient|phone|hospital/i);

    const history = await s.test.db.query<{
      action: string;
      from_stage: string | null;
      to_stage: string;
      actor_roles: string[];
      chart_version: number;
    }>(
      'SELECT action, from_stage, to_stage, actor_roles, chart_version FROM chart_stage_history WHERE chart_id = $1',
      [response.body.id],
    );
    expect(history.rows).toEqual([
      {
        action: 'ISSUE_CHART',
        from_stage: null,
        to_stage: 'ISSUED',
        actor_roles: ['CONSULTANT'],
        chart_version: 1,
      },
    ]);
    const audit = await s.test.db.query<{
      actor_id: string;
      after_values: Record<string, unknown>;
    }>(
      "SELECT actor_id, after_values FROM audit_events WHERE action = 'CHART_ISSUED' AND chart_id = $1",
      [response.body.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.actor_id).toBe(consultant.staff.id);
    expect(audit.rows[0]?.after_values).toEqual({
      rtNumber: 'RT-2026/0042',
      plannedSessions: 30,
      priority: 'URGENT',
    });
    const outbox = await s.test.db.query(
      "SELECT 1 FROM outbox_events WHERE event_type = 'CHART_ISSUED' AND chart_id = $1",
      [response.body.id],
    );
    expect(outbox.rows).toHaveLength(1);
  });

  it('defaults to routine priority and treats blank references as absent', async () => {
    const response = await issue(s, consultant.token, {
      rtNumber: 'RT-3',
      plannedSessions: 5,
      planId: '   ',
    }).expect(201);
    expect(response.body).toMatchObject({
      priority: 'ROUTINE',
      planId: null,
      contourSetName: null,
      scanReference: null,
    });
  });

  it('refuses a duplicate RT number whatever its letter case', async () => {
    await issue(s, consultant.token, { rtNumber: 'RT-4', plannedSessions: 5 }).expect(201);
    const again = await issue(s, consultant.token, { rtNumber: 'rt-4', plannedSessions: 6 });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('RT_NUMBER_EXISTS');
  });

  it('lists every invalid field in one answer', async () => {
    const response = await issue(s, consultant.token, {
      rtNumber: 'bad number!',
      plannedSessions: 0,
      priority: 'LOW',
      planId: 'x'.repeat(61),
      scanReference: 5,
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'planId',
      'plannedSessions',
      'priority',
      'rtNumber',
      'scanReference',
    ]);
    const missing = await issue(s, consultant.token, {});
    expect(missing.body.details.map((d: { field: string }) => d.field)).toEqual([
      'rtNumber',
      'plannedSessions',
    ]);
  });

  it('only a consultant can issue, and only when signed in', async () => {
    const resident = await s.signIn(['JUNIOR_RESIDENT']);
    const refused = await issue(s, resident.token, { rtNumber: 'RT-5', plannedSessions: 5 });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('ROLE_NOT_ALLOWED');
    await s
      .http()
      .post('/api/v1/charts')
      .set('Idempotency-Key', randomUUID())
      .send({ rtNumber: 'RT-5', plannedSessions: 5 })
      .expect(401);
    // A forged role header changes nothing: roles come from the database.
    await s
      .http()
      .post('/api/v1/charts')
      .set('Authorization', `Bearer ${resident.token}`)
      .set('X-Role', 'CONSULTANT')
      .set('Idempotency-Key', randomUUID())
      .send({ rtNumber: 'RT-5', plannedSessions: 5 })
      .expect(403);
  });

  it('answers a retry with the first result and creates one chart', async () => {
    const key = randomUUID();
    const body = { rtNumber: 'RT-6', plannedSessions: 12 };
    const first = await issue(s, consultant.token, body, key).expect(201);
    const retry = await issue(s, consultant.token, body, key).expect(201);
    expect(retry.body).toEqual(first.body);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    const count = await s.test.db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM rt_charts WHERE display_number = 'RT-6'",
    );
    expect(count.rows[0]?.n).toBe('1');
    const other = await issue(s, consultant.token, { rtNumber: 'RT-7', plannedSessions: 12 }, key);
    expect(other.status).toBe(422);
    expect(other.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('requires an Idempotency-Key', async () => {
    const response = await issue(
      s,
      consultant.token,
      { rtNumber: 'RT-8', plannedSessions: 5 },
      null,
    );
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});

describe('CHART-002 listing and finding charts', () => {
  let s: Awaited<ReturnType<typeof startApp>>;
  let consultant: Awaited<ReturnType<typeof s.signIn>>;
  let resident: Awaited<ReturnType<typeof s.signIn>>;
  const get = (path: string, token: string) =>
    s.http().get(`/api/v1/charts${path}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    s = await startApp();
    consultant = await s.signIn(['CONSULTANT']);
    resident = await s.signIn(['JUNIOR_RESIDENT']);
    await s.activateWorkflow(consultant.staff.id);
    for (const [rtNumber, priority] of [
      ['RT-100', 'ROUTINE'],
      ['RT-200', 'URGENT'],
      ['RT-300', 'ROUTINE'],
      ['AB-1', 'ROUTINE'],
    ] as const) {
      await issue(s, consultant.token, { rtNumber, plannedSessions: 10, priority }).expect(201);
    }
    await s.test.db.query(
      "UPDATE rt_charts SET current_stage_since = now() - interval '3 hours' WHERE display_number = 'RT-300'",
    );
    await s.test.db.query(
      "UPDATE rt_charts SET current_stage_since = now() - interval '2 hours' WHERE display_number = 'AB-1'",
    );
    await s.test.db.query(
      "UPDATE rt_charts SET current_stage_since = now() - interval '1 hour' WHERE display_number = 'RT-100'",
    );
    await s.test.db.query("UPDATE rt_charts SET status = 'CLOSED' WHERE display_number = 'AB-1'");
  });
  afterAll(() => s.close());

  it('lets any signed-in staff member read, and nobody else', async () => {
    await get('', resident.token).expect(200);
    await s.http().get('/api/v1/charts').expect(401);
    await s.http().get('/api/v1/charts/by-number/RT-100').expect(401);
  });

  it('lists urgent charts first, then the one waiting longest', async () => {
    const { body } = await get('', resident.token).expect(200);
    expect(body.total).toBe(4);
    expect(body.items.map((c: { rtNumber: string }) => c.rtNumber)).toEqual([
      'RT-200',
      'RT-300',
      'AB-1',
      'RT-100',
    ]);
    expect(body.items[1].minutesInStage).toBeGreaterThanOrEqual(179);
  });

  it('searches by RT number in any letter case and filters by status', async () => {
    expect((await get('?q=rt-', resident.token)).body.items).toHaveLength(3);
    expect(
      (await get('?q=200', resident.token)).body.items.map((c: { rtNumber: string }) => c.rtNumber),
    ).toEqual(['RT-200']);
    expect(
      (await get('?status=CLOSED', resident.token)).body.items.map(
        (c: { rtNumber: string }) => c.rtNumber,
      ),
    ).toEqual(['AB-1']);
    expect((await get('?q=%25', resident.token)).body.total).toBe(0);
    const bad = await get('?status=NOPE', resident.token);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
  });

  it('pages the list and caps the page size', async () => {
    const page = await get('?limit=2&offset=1', resident.token);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.total).toBe(4);
    expect((await get('?limit=9999', resident.token)).body.items).toHaveLength(4);
  });

  it('finds one chart by RT number, with its history', async () => {
    const { body } = await get('/by-number/rt-200', resident.token).expect(200);
    expect(body.rtNumber).toBe('RT-200');
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      action: 'ISSUE_CHART',
      fromStage: null,
      toStage: 'ISSUED',
      actorRoles: ['CONSULTANT'],
    });
    const missing = await get('/by-number/RT-999', resident.token);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('CHART_NOT_FOUND');
  });
});
