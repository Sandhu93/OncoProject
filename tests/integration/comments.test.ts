import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NotificationList } from '@oncotrack/contracts';
import { randomUUID } from 'node:crypto';
import { istToday, startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

type Person = Awaited<ReturnType<WorkflowApp['signIn']>>;

describe('COM-010 comments and handoff notes', () => {
  let s: WorkflowApp;
  let radiographer: Person;
  let radiographer2: Person;
  let junior: Person;
  let senior: Person;

  beforeAll(async () => {
    s = await startWorkflowApp();
    radiographer = await s.signIn('radiographer', ['RADIOGRAPHER'], 'Radiographer One');
    radiographer2 = await s.signIn('radiographer2', ['RADIOGRAPHER'], 'Radiographer Two');
    junior = await s.signIn('junior', ['JUNIOR_RESIDENT'], 'Dr Asha Rao');
    senior = await s.signIn('senior', ['SENIOR_RESIDENT']);
  });
  afterAll(() => s.close());

  const inbox = async (who: Person): Promise<NotificationList> =>
    (await s.as(who).get('/notifications').expect(200)).body;
  const comment = (who: Person, rt: string, body: object, key: string | null = randomUUID()) =>
    s.as(who).post(`/charts/by-number/${encodeURIComponent(rt)}/comments`, body, key);
  const forChart = async (who: Person, rt: string) =>
    (await inbox(who)).items.filter((n) => n.rtNumber === rt && n.kind === 'COMMENT');

  it('needs a signed-in person, an Idempotency-Key, and a chart that exists', async () => {
    await s.http().post('/api/v1/charts/by-number/C-1/comments').send({ body: 'hi' }).expect(401);
    await s.issueChart('C-1');
    const missing = await comment(junior, 'C-1', { body: 'hello' }, null).expect(400);
    expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    await comment(junior, 'NO-SUCH', { body: 'hello' }).expect(404);
  });

  it('adds a comment to the chart for anyone signed in, and shows it with who wrote it', async () => {
    const posted = await comment(junior, 'C-1', { body: 'Is the CT slot confirmed?' }).expect(201);
    expect(posted.body.comments).toHaveLength(1);
    expect(posted.body.comments[0]).toMatchObject({
      kind: 'COMMENT',
      body: 'Is the CT slot confirmed?',
      authorName: 'Dr Asha Rao',
      authorRoles: ['JUNIOR_RESIDENT'],
      forRole: null,
      stageLabel: 'RT chart issued',
    });
    const seen = await s.chart(senior, 'C-1');
    expect(seen.comments.map((c: { body: string }) => c.body)).toEqual([
      'Is the CT slot confirmed?',
    ]);
    const audit = await s.test.db.query(
      "SELECT action FROM audit_events WHERE action = 'CHART_COMMENT_ADDED'",
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('tells whoever the chart is waiting for when no role is chosen, but not the writer', async () => {
    // C-1 is waiting for the radiographer.
    const told = await forChart(radiographer, 'C-1');
    expect(told).toHaveLength(1);
    expect(told[0]!.message).toBe('C-1: Dr Asha Rao wrote: Is the CT slot confirmed?');
    expect(await forChart(junior, 'C-1')).toHaveLength(0);
    expect(await forChart(senior, 'C-1')).toHaveLength(0);
  });

  it('tells only the role a comment is addressed to', async () => {
    await comment(radiographer, 'C-1', {
      body: 'Please look at this one.',
      forRole: 'SENIOR_RESIDENT',
    }).expect(201);
    expect(await forChart(senior, 'C-1')).toHaveLength(1);
    expect(await forChart(junior, 'C-1')).toHaveLength(0);
    expect(await forChart(s.consultant, 'C-1')).toHaveLength(0);
    const detail = await s.chart(junior, 'C-1');
    expect(detail.comments.at(-1)).toMatchObject({
      forRole: 'SENIOR_RESIDENT',
      authorName: expect.any(String),
    });
  });

  it('refuses an empty, over-long or badly addressed comment, saving nothing', async () => {
    const before = (await s.chart(junior, 'C-1')).comments.length;
    for (const body of [
      { body: '   ' },
      {},
      { body: 'x'.repeat(1001) },
      { body: 'ok', forRole: 'JANITOR' },
    ]) {
      const refused = await comment(junior, 'C-1', body).expect(400);
      expect(refused.body.code).toBe('VALIDATION_FAILED');
    }
    expect((await s.chart(junior, 'C-1')).comments).toHaveLength(before);
  });

  it('records the same comment once when the request is sent twice', async () => {
    const key = randomUUID();
    const before = (await s.chart(junior, 'C-1')).comments.length;
    await comment(junior, 'C-1', { body: 'Only once, please.' }, key).expect(201);
    const again = await comment(junior, 'C-1', { body: 'Only once, please.' }, key).expect(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect((await s.chart(junior, 'C-1')).comments).toHaveLength(before + 1);
  });

  it('keeps a note left when passing a chart on, and sends it with the notice', async () => {
    await s.issueChart('C-2');
    const offer = (await s.chart(radiographer, 'C-2')).availableActions.find(
      (a: { action: string }) => a.action === 'GIVE_SIMULATION_DATES',
    );
    // The step offers an optional note, and send-back or Saturday steps do not.
    expect(offer.fields.at(-1)).toMatchObject({
      key: 'handoffNote',
      type: 'area',
      required: false,
    });

    const chart = await s.chart(radiographer, 'C-2');
    const note = 'Patient has a morning-only schedule.';
    const moved = (
      await s
        .act(radiographer, 'C-2', 'GIVE_SIMULATION_DATES', chart.version, {
          mouldDate: istToday(1),
          mouldTime: '10:00',
          ctDate: istToday(3),
          ctTime: '11:00',
          handoffNote: note,
        })
        .expect(200)
    ).body;
    expect(moved.comments).toHaveLength(1);
    expect(moved.comments[0]).toMatchObject({
      kind: 'HANDOFF',
      body: note,
      stageLabel: moved.stage.label,
      authorRoles: ['RADIOGRAPHER'],
    });
    // The note is not one of the step's recorded values.
    expect(moved.history.at(-1).summary).not.toContain('morning-only');
    // The note travels with the notice to the other radiographer; the sender is not told about their own step.
    const told = (await inbox(radiographer2)).items.filter(
      (n) => n.rtNumber === 'C-2' && n.kind === 'YOUR_TURN',
    );
    expect(told[0]!.message).toContain(`Note from Radiographer One: ${note}`);
    expect((await inbox(radiographer)).items.filter((n) => n.message.includes(note))).toHaveLength(
      0,
    );
  });

  it('refuses a handoff note that is too long, and ignores a blank one', async () => {
    await s.issueChart('C-3');
    const chart = await s.chart(radiographer, 'C-3');
    const dates = {
      mouldDate: istToday(1),
      mouldTime: '10:00',
      ctDate: istToday(3),
      ctTime: '11:00',
    };
    const tooLong = await s
      .act(radiographer, 'C-3', 'GIVE_SIMULATION_DATES', chart.version, {
        ...dates,
        handoffNote: 'x'.repeat(501),
      })
      .expect(400);
    expect(tooLong.body.details).toContainEqual({
      field: 'handoffNote',
      message: 'Keep it to 500 characters or fewer.',
    });
    const moved = (
      await s
        .act(radiographer, 'C-3', 'GIVE_SIMULATION_DATES', chart.version, {
          ...dates,
          handoffNote: '   ',
        })
        .expect(200)
    ).body;
    expect(moved.comments).toEqual([]);
  });

  it('allows comments on a closed chart too', async () => {
    await s.test.db.query("UPDATE rt_charts SET status = 'CLOSED' WHERE display_number = 'C-1'");
    await comment(junior, 'C-1', { body: 'For the record.' }).expect(201);
  });
});
