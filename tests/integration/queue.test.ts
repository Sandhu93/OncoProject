import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChartQueue, QueueItem } from '@oncotrack/contracts';
import { chartAtCtSimDone, chartInTreatment } from '../helpers/walk.js';
import { istToday, startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

type Person = Awaited<ReturnType<WorkflowApp['signIn']>>;

describe('QUE-010 the queue of open charts, marked for the person asking', () => {
  let s: WorkflowApp;
  let consultant: Person;
  let radiographer: Person;
  let junior: Person;
  let otherJunior: Person;
  let senior: Person;

  beforeAll(async () => {
    s = await startWorkflowApp();
    consultant = s.consultant;
    radiographer = await s.signIn('radiographer', ['RADIOGRAPHER']);
    junior = await s.signIn('junior', ['JUNIOR_RESIDENT'], 'Dr Asha Rao');
    otherJunior = await s.signIn('junior2', ['JUNIOR_RESIDENT'], 'Dr Biju Nair');
    senior = await s.signIn('senior', ['SENIOR_RESIDENT']);
    await s.signIn('physicist', ['PHYSICIST']);
  });
  afterAll(() => s.close());

  const queue = async (who: Person): Promise<ChartQueue> =>
    (await s.as(who).get('/charts/queue').expect(200)).body;
  const item = (q: ChartQueue, rt: string): QueueItem => q.items.find((i) => i.rtNumber === rt)!;

  it('needs a signed-in person', async () => {
    await s.http().get('/api/v1/charts/queue').expect(401);
  });

  it('sends a new chart to the radiographer, with the stage and position', async () => {
    await s.issueChart('Q-1');
    const mine = item(await queue(radiographer), 'Q-1');
    expect(mine).toMatchObject({
      needsYou: true,
      nextStep: 'Give mould and CT Sim dates',
      waitingOn: 'Radiographer',
      stage: { code: 'RT_CHART_ISSUED' },
      phase: 'Getting ready',
      stageNumber: 1,
      stageCount: 14,
      daysInStage: 0,
      stalled: false,
      dateLine: 'Dates not recorded yet',
      priority: 'ROUTINE',
    });
    const theirs = item(await queue(consultant), 'Q-1');
    expect(theirs).toMatchObject({ needsYou: false, nextStep: null, waitingOn: 'Radiographer' });
  });

  it('shows the contouring only to the junior resident it is assigned to', async () => {
    await chartAtCtSimDone(s, 'Q-2');
    const chart = await s.chart(consultant, 'Q-2');
    const assign = chart.availableActions.find(
      (a: { action: string }) => a.action === 'ASSIGN_CONTOURING',
    );
    expect(assign).toBeTruthy();
    expect(item(await queue(consultant), 'Q-2')).toMatchObject({
      needsYou: true,
      waitingOn: 'Consultant',
    });
    await s
      .act(consultant, 'Q-2', 'ASSIGN_CONTOURING', chart.version, {
        resident: junior.id,
        contourDue: istToday(2),
      })
      .expect(200);
    const forJunior = item(await queue(junior), 'Q-2');
    expect(forJunior).toMatchObject({
      needsYou: true,
      assignedToYou: true,
      assignedTo: 'Dr Asha Rao',
      waitingOn: 'Junior resident Dr Asha Rao',
    });
    expect(forJunior.dateLine).toMatch(/^Contouring due \d+ \w+ \d{4}$/);
    expect(forJunior.nextStep).toMatch(/ontouring/);
    expect(item(await queue(otherJunior), 'Q-2')).toMatchObject({
      needsYou: false,
      assignedToYou: false,
      assignedTo: 'Dr Asha Rao',
    });
    expect(item(await queue(senior), 'Q-2').needsYou).toBe(false);
  });

  it('says when contouring is late, then offers verify and send back to the senior resident', async () => {
    await s.test.db.query(
      `UPDATE rt_charts SET data = jsonb_set(data, '{contourDue}', to_jsonb($2::text)) WHERE display_number = $1`,
      ['Q-2', istToday(-2)],
    );
    expect(item(await queue(junior), 'Q-2').dateLine).toMatch(/^Late: was due \d+ \w+ \d{4}$/);
    expect(item(await queue(junior), 'Q-2').nextStep).toBe('Submit contouring');

    const chart = await s.chart(junior, 'Q-2');
    await s
      .act(junior, 'Q-2', 'SUBMIT_CONTOURING', chart.version, { contourRef: 'Set A' })
      .expect(200);
    const forSenior = item(await queue(senior), 'Q-2');
    expect(forSenior).toMatchObject({
      needsYou: true,
      nextStep: 'Verify contouring, or send back',
      waitingOn: 'Senior resident',
      assignedTo: null,
    });
    expect(item(await queue(junior), 'Q-2').needsYou).toBe(false);
  });

  it('marks a chart stalled once it has waited the threshold, but never one in treatment', async () => {
    await s.issueChart('Q-3');
    await s.test.db.query(
      `UPDATE rt_charts SET current_stage_since = now() - interval '4 days' WHERE display_number = 'Q-3'`,
    );
    const q = await queue(consultant);
    expect(q.stallDays).toBe(3);
    expect(item(q, 'Q-3')).toMatchObject({ daysInStage: 4, stalled: true });
    expect(item(q, 'Q-1').stalled).toBe(false);

    await chartInTreatment(s, 'Q-4');
    await s.test.db.query(
      `UPDATE rt_charts SET current_stage_since = now() - interval '30 days' WHERE display_number = 'Q-4'`,
    );
    const later = await queue(consultant);
    expect(item(later, 'Q-4')).toMatchObject({ daysInStage: 30, stalled: false });
  });

  it('asks both roles for the Saturday update until each has posted', async () => {
    const before = await queue(junior);
    const treatment = item(before, 'Q-4');
    expect(treatment).toMatchObject({
      needsYou: true,
      nextStep: expect.stringMatching(/Post your Saturday update/),
      treatmentDay: 1,
      weeklyMissing: expect.arrayContaining(['JUNIOR_RESIDENT', 'RADIOGRAPHER']),
      plannedSessions: 25,
    });
    expect(treatment.waitingOn).toBe('Junior resident and radiographer (Saturday update)');
    expect(treatment.dateLine).toMatch(/^Started .* · \d+ of 25 sessions$/);
    expect(before.totals.saturdayUpdatesToCome).toBe(2);

    const chart = await s.chart(junior, 'Q-4');
    await s
      .act(junior, 'Q-4', 'POST_WEEKLY_UPDATE', chart.version, { sessionsTotal: '3', gap: 'No' })
      .expect(200);
    const after = await queue(junior);
    expect(item(after, 'Q-4').weeklyMissing).toEqual(['RADIOGRAPHER']);
    expect(after.totals.saturdayUpdatesToCome).toBe(1);
    expect(item(after, 'Q-4').waitingOn).toBe('Radiographer (Saturday update)');
    expect(item(await queue(radiographer), 'Q-4').needsYou).toBe(true);
    expect(item(after, 'Q-4').needsYou).toBe(false);
  });

  it('lists what needs the person first, urgent and longest-waiting leading, and treatment last', async () => {
    await s
      .as(consultant)
      .post('/charts', { rtNumber: 'Q-5', plannedSessions: 20, priority: 'URGENT' })
      .expect(201);
    const q = await queue(radiographer);
    const mine = q.items.filter((i) => i.needsYou).map((i) => i.rtNumber);
    expect(mine.indexOf('Q-5')).toBeLessThan(mine.indexOf('Q-3'));
    expect(mine.indexOf('Q-3')).toBeLessThan(mine.indexOf('Q-1'));
    expect(mine.at(-1)).toBe('Q-4');
    const firstOther = q.items.findIndex((i) => !i.needsYou);
    expect(q.items.slice(0, firstOther).every((i) => i.needsYou)).toBe(true);
  });

  it('counts getting ready, stalled and in treatment, and leaves out closed charts', async () => {
    await s.test.db.query(`UPDATE rt_charts SET status = 'CLOSED' WHERE display_number = 'Q-1'`);
    const q = await queue(consultant);
    expect(q.items.map((i) => i.rtNumber)).not.toContain('Q-1');
    expect(q.totals).toMatchObject({
      open: q.items.length,
      inTreatment: 1,
      gettingReady: q.items.length - 1,
      stalled: q.items.filter((i) => i.stalled).length,
    });
    expect(q.totals.stalled).toBeGreaterThanOrEqual(1);
  });
});
