import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../apps/api/src/app.module.js';
import { configureApp } from '../../apps/api/src/bootstrap.js';
import { DirectoryService } from '../../apps/api/src/auth/directory.service.js';
import { DatabaseService } from '../../apps/api/src/database/database.service.js';
import { NotificationService } from '../../apps/api/src/notifications/notification.service.js';
import { addStaff, createTestDatabase } from './test-database.js';

export type Role =
  'CONSULTANT' | 'SENIOR_RESIDENT' | 'JUNIOR_RESIDENT' | 'PHYSICIST' | 'RADIOGRAPHER';

/** Today in India Standard Time, the same day the API uses. */
export const istToday = (offsetDays = 0): string => {
  const base = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  base.setDate(base.getDate() + offsetDays);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
};

/**
 * The real API on an in-memory PostgreSQL with the proposed 14-stage RT workflow approved, and one account
 * per role. Synthetic data only.
 */
export async function startWorkflowApp(options: { directory?: DirectoryService } = {}) {
  const test = await createTestDatabase();
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(test.service);
  if (options.directory) builder.overrideProvider(DirectoryService).useValue(options.directory);
  const module = await builder.compile();
  const app = module.createNestApplication();
  configureApp(app);
  await app.init();
  const http = () => request(app.getHttpServer());

  const people = new Map<string, { id: string; token: string; roles: Role[] }>();
  const signIn = async (name: string, roles: Role[], fullName?: string) => {
    const staff = await addStaff(test.db, { roles, ...(fullName ? { fullName } : {}) });
    const { body } = await http()
      .post('/api/v1/auth/login')
      .send({ username: staff.username, password: staff.password })
      .expect(200);
    const person = { id: staff.id as string, token: body.access_token as string, roles };
    people.set(name, person);
    return person;
  };

  const consultant = await signIn('consultant', ['CONSULTANT']);
  await test.db.exec(
    await readFile(
      new URL('../../database/seeds/rt-workflow-proposed.sql', import.meta.url),
      'utf8',
    ),
  );
  await test.db.query(
    "UPDATE workflow_versions SET status = 'ACTIVE', approved_by = $1, approved_at = now() WHERE code = 'RT_PROPOSED'",
    [consultant.id],
  );

  const as = (who: { token: string }) => ({
    get: (url: string) => http().get(`/api/v1${url}`).set('Authorization', `Bearer ${who.token}`),
    post: (url: string, body: unknown, key: string | null = randomUUID()) => {
      const call = http().post(`/api/v1${url}`).set('Authorization', `Bearer ${who.token}`);
      if (key) call.set('Idempotency-Key', key);
      return call.send(body as object);
    },
  });

  /** Issues a chart as the consultant and returns its RT number. */
  const issueChart = async (rtNumber: string, plannedSessions = 25) => {
    await as(consultant).post('/charts', { rtNumber, plannedSessions }).expect(201);
    return rtNumber;
  };
  const chart = async (who: { token: string }, rtNumber: string) =>
    (
      await as(who)
        .get(`/charts/by-number/${encodeURIComponent(rtNumber)}`)
        .expect(200)
    ).body;
  const act = (
    who: { token: string },
    rtNumber: string,
    action: string,
    version: number,
    values: object,
    key?: string | null,
  ) =>
    as(who).post(
      `/charts/by-number/${encodeURIComponent(rtNumber)}/actions/${action}`,
      { expectedVersion: version, values },
      key,
    );

  const notifications = app.get(NotificationService);
  const close = async () => {
    await app.close();
    await test.close();
  };
  return {
    test,
    http,
    as,
    signIn,
    consultant,
    issueChart,
    chart,
    act,
    close,
    people,
    notifications,
  };
}
export type WorkflowApp = Awaited<ReturnType<typeof startWorkflowApp>>;
