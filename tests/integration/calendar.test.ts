import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Calendar, ChartQueue } from '@oncotrack/contracts';
import { chartAtPlanOnLinac, chartInTreatment } from '../helpers/walk.js';
import { istToday, startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

type Person = Awaited<ReturnType<WorkflowApp['signIn']>>;

describe('CAL-010 the calendar and the stage map', () => {
  let s: WorkflowApp;
  let radiographer: Person;
  let junior: Person;

  beforeAll(async () => {
    s = await startWorkflowApp();
    radiographer = await s.signIn('radiographer', ['RADIOGRAPHER']);
    junior = await s.signIn('junior', ['JUNIOR_RESIDENT']);
    await s.signIn('senior', ['SENIOR_RESIDENT']);
    await s.signIn('physicist', ['PHYSICIST']);
  });
  afterAll(() => s.close());

  const calendar = async (who: Person, query = ''): Promise<Calendar> =>
    (await s.as(who).get(`/charts/calendar${query}`).expect(200)).body;
  const queue = async (who: Person): Promise<ChartQueue> =>
    (await s.as(who).get('/charts/queue').expect(200)).body;

  it('needs a signed-in person and sensible dates', async () => {
    await s.http().get('/api/v1/charts/calendar').expect(401);
    const bad = await s.as(junior).get('/charts/calendar?from=tomorrow').expect(400);
    expect(bad.body.details).toContainEqual({
      field: 'from',
      message: 'Use a date like 2026-12-01.',
    });
    await s.as(junior).get('/charts/calendar?days=0').expect(400);
    await s.as(junior).get('/charts/calendar?days=32').expect(400);
  });

  it('is empty when no dates have been given, and covers 14 days from today by default', async () => {
    const empty = await calendar(junior);
    expect(empty.today).toBe(istToday());
    expect(empty.from).toBe(istToday());
    expect(empty.to).toBe(istToday(13));
    expect(empty.days).toHaveLength(14);
    expect(empty.days.every((d) => d.entries.length === 0)).toBe(true);
    expect(empty.late).toEqual([]);
  });

  it('shows the mould and CT Sim a radiographer gave, in time order, for everyone', async () => {
    await s.issueChart('CAL-1');
    await s.issueChart('CAL-2');
    for (const [rt, mould, ct] of [
      ['CAL-1', '11:00', '09:00'],
      ['CAL-2', '09:30', '14:00'],
    ] as const) {
      const chart = await s.chart(radiographer, rt);
      await s
        .act(radiographer, rt, 'GIVE_SIMULATION_DATES', chart.version, {
          mouldDate: istToday(1),
          mouldTime: mould,
          ctDate: istToday(2),
          ctTime: ct,
        })
        .expect(200);
    }
    const cal = await calendar(junior);
    const tomorrow = cal.days.find((d) => d.date === istToday(1))!;
    expect(tomorrow.entries.map((e) => [e.rtNumber, e.kind, e.time, e.done])).toEqual([
      ['CAL-2', 'MOULD', '09:30', false],
      ['CAL-1', 'MOULD', '11:00', false],
    ]);
    const dayAfter = cal.days.find((d) => d.date === istToday(2))!;
    expect(dayAfter.entries.map((e) => [e.rtNumber, e.kind, e.time])).toEqual([
      ['CAL-1', 'CT_SIM', '09:00'],
      ['CAL-2', 'CT_SIM', '14:00'],
    ]);
    expect(tomorrow.entries[0]!.stage).toEqual({
      code: 'SIMULATION_DATES_GIVEN',
      label: 'Dates given',
    });
  });

  it('marks what is done, and lists past appointments that were never recorded as late', async () => {
    // CAL-3's mould was due yesterday and nobody recorded it.
    await s.issueChart('CAL-3');
    const chart = await s.chart(radiographer, 'CAL-3');
    await s
      .act(radiographer, 'CAL-3', 'GIVE_SIMULATION_DATES', chart.version, {
        mouldDate: istToday(1),
        mouldTime: '10:00',
        ctDate: istToday(2),
        ctTime: '11:00',
      })
      .expect(200);
    await s.test.db.query(
      `UPDATE rt_charts SET data = data || jsonb_build_object('mouldDate', $1::text) WHERE display_number = 'CAL-3'`,
      [istToday(-1)],
    );
    const late = (await calendar(junior)).late;
    expect(late.map((e) => [e.rtNumber, e.kind, e.date])).toEqual([
      ['CAL-3', 'MOULD', istToday(-1)],
    ]);

    // Recording the mould as done takes it off the late list but keeps it, ticked, on its day.
    const fresh = await s.chart(radiographer, 'CAL-3');
    await s
      .act(radiographer, 'CAL-3', 'RECORD_MOULD_DONE', fresh.version, { mouldDoneOn: istToday() })
      .expect(200);
    const cal = await calendar(junior, `?from=${istToday(-1)}&days=3`);
    expect(cal.late).toEqual([]);
    expect(cal.days[0]!.entries.find((e) => e.rtNumber === 'CAL-3')).toMatchObject({
      kind: 'MOULD',
      done: true,
    });
  });

  it('shows the first treatment with its machine, and drops charts that have ended', async () => {
    await chartAtPlanOnLinac(s, 'CAL-4');
    const first = (await calendar(junior, '?days=31')).days.flatMap((d) => d.entries);
    const slot = first.find((e) => e.rtNumber === 'CAL-4' && e.kind === 'FIRST_TREATMENT')!;
    expect(slot.resource).toMatch(/^LINAC/);
    expect(slot.done).toBe(false);

    await s.test.db.query("UPDATE rt_charts SET status = 'CLOSED' WHERE display_number = 'CAL-4'");
    const after = (await calendar(junior, '?days=31')).days.flatMap((d) => d.entries);
    expect(after.some((e) => e.rtNumber === 'CAL-4')).toBe(false);
  });

  it('honours the window asked for', async () => {
    const cal = await calendar(junior, `?from=${istToday(1)}&days=1`);
    expect(cal.days.map((d) => d.date)).toEqual([istToday(1)]);
    expect(cal.to).toBe(istToday(1));
  });

  describe('the stage map', () => {
    it('lists every stage of the workflow in order, with the open charts in each', async () => {
      await chartInTreatment(s, 'CAL-5');
      const q = await queue(junior);
      expect(q.stages.map((st) => st.position)).toEqual(q.stages.map((_, i) => i + 1));
      expect(q.stages[0]).toMatchObject({
        code: 'RT_CHART_ISSUED',
        label: 'RT chart issued',
        phase: 'Getting ready',
      });
      expect(q.stages.at(-1)).toMatchObject({ code: 'TRACKING_ENDED', open: 0, charts: [] });
      const dates = q.stages.find((st) => st.code === 'SIMULATION_DATES_GIVEN')!;
      expect(dates.charts).toEqual(expect.arrayContaining(['CAL-1', 'CAL-2']));
      expect(dates.open).toBe(dates.charts.length);
      const treating = q.stages.find((st) => st.code === 'TREATMENT_IN_PROGRESS')!;
      expect(treating.charts).toContain('CAL-5');
      expect(q.stages.reduce((sum, st) => sum + st.open, 0)).toBe(q.totals.open);
    });
  });
});
