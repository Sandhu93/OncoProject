import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NotificationList } from '@oncotrack/contracts';
import { chartAtCtSimDone, chartInTreatment } from '../helpers/walk.js';
import { istToday, startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

type Person = Awaited<ReturnType<WorkflowApp['signIn']>>;

describe('NOT-010 in-app notifications', () => {
  let s: WorkflowApp;
  let radiographer: Person;
  let junior: Person;
  let otherJunior: Person;
  let senior: Person;
  let physicist: Person;
  let secondConsultant: Person;

  beforeAll(async () => {
    s = await startWorkflowApp();
    radiographer = await s.signIn('radiographer', ['RADIOGRAPHER']);
    junior = await s.signIn('junior', ['JUNIOR_RESIDENT'], 'Dr Asha Rao');
    otherJunior = await s.signIn('junior2', ['JUNIOR_RESIDENT'], 'Dr Biju Nair');
    senior = await s.signIn('senior', ['SENIOR_RESIDENT']);
    physicist = await s.signIn('physicist', ['PHYSICIST']);
    secondConsultant = await s.signIn('consultant2', ['CONSULTANT'], 'Dr Second Consultant');
  });
  afterAll(() => s.close());

  const inbox = async (who: Person): Promise<NotificationList> =>
    (await s.as(who).get('/notifications').expect(200)).body;
  const mentioning = (list: NotificationList, rt: string) =>
    list.items.filter((n) => n.rtNumber === rt);

  it('needs a signed-in person', async () => {
    await s.http().get('/api/v1/notifications').expect(401);
    await s.http().get('/api/v1/notifications/unread-count').expect(401);
  });

  it('tells the radiographers, and nobody else, when a chart is issued', async () => {
    await s.issueChart('N-1');
    const mine = mentioning(await inbox(radiographer), 'N-1');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: 'YOUR_TURN', readAt: null });
    expect(mine[0]!.message).toBe(
      'N-1 is now at RT chart issued, waiting for the radiographer to give mould and CT Sim dates.',
    );
    for (const other of [junior, senior, physicist, s.consultant, secondConsultant]) {
      expect(mentioning(await inbox(other), 'N-1')).toHaveLength(0);
    }
    const count = await s.as(radiographer).get('/notifications/unread-count').expect(200);
    expect(count.body).toEqual({ unread: 1 });
  });

  it('tells every consultant when contouring is waiting to be assigned, but not the person who did the step', async () => {
    await chartAtCtSimDone(s, 'N-2');
    expect(mentioning(await inbox(s.consultant), 'N-2').map((n) => n.kind)).toEqual(['YOUR_TURN']);
    expect(mentioning(await inbox(secondConsultant), 'N-2')).toHaveLength(1);
    // The radiographer did every step up to here, so is not told about their own steps.
    expect(mentioning(await inbox(radiographer), 'N-2')).toHaveLength(1); // only the issue notice
  });

  it('tells only the assigned resident that contouring is theirs, with the due date and who assigned it', async () => {
    const chart = await s.chart(s.consultant, 'N-2');
    await s
      .act(s.consultant, 'N-2', 'ASSIGN_CONTOURING', chart.version, {
        resident: junior.id,
        contourDue: istToday(3),
      })
      .expect(200);
    const mine = mentioning(await inbox(junior), 'N-2');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: 'ASSIGNED' });
    expect(mine[0]!.message).toMatch(
      /^N-2 is assigned to you for contouring, due .+\. Assigned by /,
    );
    expect(mentioning(await inbox(otherJunior), 'N-2')).toHaveLength(0);
  });

  it('tells the senior resident when contours are submitted, and the resident, with the reason, when they are sent back', async () => {
    let chart = await s.chart(junior, 'N-2');
    chart = (
      await s
        .act(junior, 'N-2', 'SUBMIT_CONTOURING', chart.version, { contourRef: 'C-1' })
        .expect(200)
    ).body;
    expect(mentioning(await inbox(senior), 'N-2').map((n) => n.kind)).toEqual(['YOUR_TURN']);

    await s
      .act(senior, 'N-2', 'RETURN_CONTOURING', chart.version, { reason: 'Brain stem is missing.' })
      .expect(200);
    const back = mentioning(await inbox(junior), 'N-2').find((n) => n.kind === 'SENT_BACK');
    expect(back).toBeTruthy();
    expect(back!.message).toMatch(
      /^N-2 was sent back to Contouring by .+\. Reason: Brain stem is missing\.$/,
    );
    expect(mentioning(await inbox(otherJunior), 'N-2')).toHaveLength(0);
  });

  it('creates no notification when the step is refused', async () => {
    const before = (await inbox(senior)).items.length;
    const chart = await s.chart(junior, 'N-2');
    await s.act(junior, 'N-2', 'SUBMIT_CONTOURING', 1, {}).expect(409);
    await s.act(radiographer, 'N-2', 'SUBMIT_CONTOURING', chart.version, {}).expect(403);
    expect((await inbox(senior)).items).toHaveLength(before);
  });

  it('marks one notification, then all of them, read; and only your own', async () => {
    const list = await inbox(radiographer);
    expect(list.unread).toBeGreaterThan(0);
    const first = list.items[0]!;
    await s.as(radiographer).post(`/notifications/${first.id}/read`, {}, null).expect(200);
    const after = await inbox(radiographer);
    expect(after.unread).toBe(list.unread - 1);
    expect(after.items.find((n) => n.id === first.id)!.readAt).not.toBeNull();

    // Somebody else's notification, and nonsense, are both "not found".
    await s.as(junior).post(`/notifications/${first.id}/read`, {}, null).expect(404);
    await s.as(junior).post('/notifications/not-an-id/read', {}, null).expect(404);

    await s.as(radiographer).post('/notifications/read-all', {}, null).expect(200);
    expect((await inbox(radiographer)).unread).toBe(0);
    expect((await inbox(junior)).unread).toBeGreaterThan(0);
  });

  it('tells the consultants when treatment finishes', async () => {
    const chart = await chartInTreatment(s, 'N-3');
    await s
      .act(junior, 'N-3', 'COMPLETE_TREATMENT', chart.version, {
        completeOn: istToday(),
        sessionsFinal: '25',
      })
      .expect(200);
    // Treatment is complete: the junior resident and the radiographer are asked for final updates.
    const asked = mentioning(await inbox(radiographer), 'N-3').filter(
      (n) => n.kind === 'YOUR_TURN',
    );
    expect(asked.length).toBeGreaterThan(0);
    expect(
      mentioning(await inbox(s.consultant), 'N-3').filter((n) => n.kind === 'FINISHED'),
    ).toHaveLength(0);

    const after = await s.chart(junior, 'N-3');
    const mid = (await s.act(junior, 'N-3', 'POST_FINAL_UPDATE', after.version, {}).expect(200))
      .body;
    await s.act(radiographer, 'N-3', 'POST_FINAL_UPDATE', mid.version, {}).expect(200);
    const done = mentioning(await inbox(s.consultant), 'N-3').filter((n) => n.kind === 'FINISHED');
    expect(done).toHaveLength(1);
    expect(done[0]!.message).toBe('N-3: both final updates are in and tracking has ended.');
  });

  describe('reminders', () => {
    it('reminds whoever a stalled chart is waiting for, and the consultants, once', async () => {
      await s.issueChart('N-4');
      await s.test.db.query(
        `UPDATE rt_charts SET current_stage_since = now() - interval '5 days' WHERE display_number = 'N-4'`,
      );
      const first = await s.notifications.sweep();
      expect(first.stalled).toBeGreaterThanOrEqual(2);
      const stalled = (list: NotificationList) =>
        mentioning(list, 'N-4').filter((n) => n.kind === 'STALLED');
      expect(stalled(await inbox(radiographer))).toHaveLength(1);
      expect(stalled(await inbox(s.consultant))[0]!.message).toBe(
        'N-4 has been at RT chart issued for 5 days.',
      );
      expect(stalled(await inbox(junior))).toHaveLength(0);

      const again = await s.notifications.sweep();
      expect(again.stalled).toBe(0);
      expect(stalled(await inbox(radiographer))).toHaveLength(1);
    });

    it('reminds each role once a week about the Saturday updates it still owes', async () => {
      await chartInTreatment(s, 'N-5');
      await s.notifications.sweep();
      const mine = (await inbox(junior)).items.filter((n) => n.kind === 'WEEKLY_DUE');
      expect(mine).toHaveLength(1);
      expect(mine[0]!.message).toMatch(
        /^\d+ charts? needs? your Saturday update for the week ending \d{4}-\d{2}-\d{2}: /,
      );
      expect((await inbox(radiographer)).items.filter((n) => n.kind === 'WEEKLY_DUE')).toHaveLength(
        1,
      );
      expect((await inbox(senior)).items.filter((n) => n.kind === 'WEEKLY_DUE')).toHaveLength(0);

      await s.notifications.sweep();
      expect((await inbox(junior)).items.filter((n) => n.kind === 'WEEKLY_DUE')).toHaveLength(1);
    });
  });
});
