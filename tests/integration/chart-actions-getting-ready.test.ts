import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { istToday, startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

describe('ACT-010 getting ready: dates, mould, CT Sim (radiographer)', () => {
  let s: WorkflowApp;
  let radiographer: Awaited<ReturnType<WorkflowApp['signIn']>>;
  let resident: Awaited<ReturnType<WorkflowApp['signIn']>>;
  const dates = () => ({
    mouldDate: istToday(1),
    mouldTime: '10:00',
    ctDate: istToday(3),
    ctTime: '11:00',
    bookNote: 'Come with a full bladder.',
  });

  beforeAll(async () => {
    s = await startWorkflowApp();
    radiographer = await s.signIn('radiographer', ['RADIOGRAPHER']);
    resident = await s.signIn('resident', ['JUNIOR_RESIDENT']);
  });
  afterAll(() => s.close());

  it('offers the radiographer the first step, with sensible defaults, and nobody else', async () => {
    await s.issueChart('GR-1');

    const mine = await s.chart(radiographer, 'GR-1');
    expect(mine.stage.code).toBe('RT_CHART_ISSUED');
    expect(mine.waitingFor).toBe('the radiographer to give mould and CT Sim dates');
    expect(mine.ownerRole).toBe('RADIOGRAPHER');
    expect(mine.phase).toBe('Getting ready');
    expect(mine.availableActions).toHaveLength(1);
    const [action] = mine.availableActions;
    expect(action).toMatchObject({
      action: 'GIVE_SIMULATION_DATES',
      label: 'Give mould and CT Sim dates',
      requiresReason: false,
    });
    const mouldDate = action.fields.find((f: { key: string }) => f.key === 'mouldDate');
    expect(mouldDate).toMatchObject({
      type: 'date',
      required: true,
      min: istToday(),
      default: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(action.fields.find((f: { key: string }) => f.key === 'mouldTime').default).toBe('10:00');
    expect(action.fields.find((f: { key: string }) => f.key === 'ctTime').default).toBe('11:00');

    expect((await s.chart(resident, 'GR-1')).availableActions).toEqual([]);
    expect((await s.chart(s.consultant, 'GR-1')).availableActions).toEqual([]);
  });

  it('records the dates: stage, facts, history sentence, audit and outbox in one go', async () => {
    await s.issueChart('GR-2');
    const before = await s.chart(radiographer, 'GR-2');

    const done = await s
      .act(radiographer, 'GR-2', 'GIVE_SIMULATION_DATES', before.version, dates())
      .expect(200);

    expect(done.body.stage).toEqual({ code: 'SIMULATION_DATES_GIVEN', label: 'Dates given' });
    expect(done.body.version).toBe(before.version + 1);
    expect(done.body.waitingFor).toBe('the patient to attend the mould appointment');
    expect(done.body.recorded).toEqual([
      { label: 'Mould appointment', value: expect.stringContaining('10:00') },
      { label: 'CT Sim appointment', value: expect.stringContaining('11:00') },
    ]);
    const last = done.body.history.at(-1);
    expect(last).toMatchObject({
      action: 'GIVE_SIMULATION_DATES',
      fromStage: 'RT_CHART_ISSUED',
      toStage: 'SIMULATION_DATES_GIVEN',
    });
    expect(last.summary).toMatch(
      /^Mould booked for .*10:00\. CT Sim booked for .*11:00\. Note: Come with a full bladder\.$/,
    );

    const audit = await s.test.db.query<{ action: string }>(
      "SELECT action FROM audit_events WHERE entity_id = $1 AND action = 'CHART_STAGE_CHANGED'",
      [done.body.id],
    );
    expect(audit.rows).toHaveLength(1);
    const outbox = await s.test.db.query(
      "SELECT 1 FROM outbox_events WHERE chart_id = $1 AND event_type = 'CHART_STAGE_CHANGED'",
      [done.body.id],
    );
    expect(outbox.rows).toHaveLength(1);
    const stored = await s.test.db.query<{ data: Record<string, string> }>(
      'SELECT data FROM rt_charts WHERE id = $1',
      [done.body.id],
    );
    expect(stored.rows[0]!.data).toMatchObject({ mouldTime: '10:00', datesGivenOn: istToday() });
  });

  it('replays the same request instead of recording it twice', async () => {
    await s.issueChart('GR-3');
    const before = await s.chart(radiographer, 'GR-3');
    const key = randomUUID();

    const first = await s
      .act(radiographer, 'GR-3', 'GIVE_SIMULATION_DATES', before.version, dates(), key)
      .expect(200);
    const again = await s
      .act(radiographer, 'GR-3', 'GIVE_SIMULATION_DATES', before.version, dates(), key)
      .expect(200);

    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.version).toBe(first.body.version);
    expect((await s.chart(radiographer, 'GR-3')).history).toHaveLength(2);
  });

  it.each([
    [
      'a mould date in the past',
      { mouldDate: istToday(-1) },
      'mouldDate',
      'Choose today or a later date.',
    ],
    [
      'a CT Sim date before the mould',
      { mouldDate: istToday(5), ctDate: istToday(4) },
      'ctDate',
      'CT Sim cannot be before the mould date.',
    ],
    ['a date that does not exist', { mouldDate: '2026-02-30' }, 'mouldDate', 'Enter a real date.'],
    ['a bad time', { mouldTime: '25:00' }, 'mouldTime', 'Enter a time such as 10:30.'],
    ['no mould time', { mouldTime: '' }, 'mouldTime', 'Enter mould time.'],
    [
      'a note that is too long',
      { bookNote: 'x'.repeat(501) },
      'bookNote',
      'Use at most 500 characters.',
    ],
  ])('refuses %s and saves nothing', async (_name, change, field, message) => {
    const rt = `GR-V-${randomUUID().slice(0, 6).toUpperCase()}`;
    await s.issueChart(rt);
    const before = await s.chart(radiographer, rt);

    const response = await s
      .act(radiographer, rt, 'GIVE_SIMULATION_DATES', before.version, { ...dates(), ...change })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.details).toContainEqual({ field, message });
    const after = await s.chart(radiographer, rt);
    expect(after.version).toBe(before.version);
    expect(after.stage.code).toBe('RT_CHART_ISSUED');
    expect(after.history).toHaveLength(1);
  });

  it('refuses the wrong role, the wrong stage, a stale version and an unknown step', async () => {
    await s.issueChart('GR-4');
    const chart = await s.chart(radiographer, 'GR-4');

    const wrongRole = await s
      .act(resident, 'GR-4', 'GIVE_SIMULATION_DATES', chart.version, dates())
      .expect(403);
    expect(wrongRole.body.code).toBe('ROLE_NOT_ALLOWED');
    expect(wrongRole.body.message).toBe('Only a radiographer can do this step.');

    const wrongStage = await s
      .act(radiographer, 'GR-4', 'RECORD_CT_SIM_DONE', chart.version, { ctDoneOn: istToday() })
      .expect(409);
    expect(wrongStage.body.code).toBe('ACTION_NOT_AVAILABLE');

    const stale = await s
      .act(radiographer, 'GR-4', 'GIVE_SIMULATION_DATES', chart.version + 7, dates())
      .expect(409);
    expect(stale.body.code).toBe('CHART_CHANGED');

    await s.act(radiographer, 'GR-4', 'NOT_A_STEP', chart.version, {}).expect(409);
    await s
      .as(radiographer)
      .post('/charts/by-number/GR-4/actions/GIVE_SIMULATION_DATES', { values: dates() })
      .expect(400);
    await s
      .as(radiographer)
      .post('/charts/by-number/NOPE-1/actions/GIVE_SIMULATION_DATES', {
        expectedVersion: 1,
        values: dates(),
      })
      .expect(404);
    expect((await s.chart(radiographer, 'GR-4')).history).toHaveLength(1);
  });

  it('two people acting on the same version: one wins, the other is told the chart changed', async () => {
    await s.issueChart('GR-5');
    const other = await s.signIn('radiographer2', ['RADIOGRAPHER']);
    const chart = await s.chart(radiographer, 'GR-5');

    await s.act(radiographer, 'GR-5', 'GIVE_SIMULATION_DATES', chart.version, dates()).expect(200);
    const late = await s
      .act(other, 'GR-5', 'GIVE_SIMULATION_DATES', chart.version, dates())
      .expect(409);

    expect(late.body.code).toBe('CHART_CHANGED');
  });

  it('walks mould done and CT Sim done in order, with the date rules', async () => {
    await s.issueChart('GR-6');
    let chart = await s.chart(radiographer, 'GR-6');
    chart = (
      await s.act(radiographer, 'GR-6', 'GIVE_SIMULATION_DATES', chart.version, dates()).expect(200)
    ).body;

    const action = chart.availableActions[0];
    expect(action.action).toBe('RECORD_MOULD_DONE');
    const doneOn = action.fields.find((f: { key: string }) => f.key === 'mouldDoneOn');
    expect(doneOn).toMatchObject({ max: istToday(), default: istToday(), required: true });

    const future = await s
      .act(radiographer, 'GR-6', 'RECORD_MOULD_DONE', chart.version, { mouldDoneOn: istToday(2) })
      .expect(400);
    expect(future.body.details).toContainEqual({
      field: 'mouldDoneOn',
      message: 'This date is in the future.',
    });
    const early = await s
      .act(radiographer, 'GR-6', 'RECORD_MOULD_DONE', chart.version, { mouldDoneOn: istToday(-3) })
      .expect(400);
    expect(early.body.details).toContainEqual({
      field: 'mouldDoneOn',
      message: 'This date is before the chart was issued.',
    });

    chart = (
      await s
        .act(radiographer, 'GR-6', 'RECORD_MOULD_DONE', chart.version, {
          mouldDoneOn: istToday(),
          mouldNote: 'Remade once.',
        })
        .expect(200)
    ).body;
    expect(chart.stage.code).toBe('MOULD_DONE');
    expect(chart.history.at(-1).summary).toMatch(/^Mould done on .*\. Note: Remade once\.$/);
    expect(chart.recorded).toContainEqual({ label: 'Mould done', value: expect.any(String) });

    const missing = await s
      .act(radiographer, 'GR-6', 'RECORD_CT_SIM_DONE', chart.version, {})
      .expect(400);
    expect(missing.body.details).toContainEqual({
      field: 'ctDoneOn',
      message: 'Enter date of the CT Sim.',
    });
    const beforeMould = await s
      .act(radiographer, 'GR-6', 'RECORD_CT_SIM_DONE', chart.version, { ctDoneOn: istToday(-1) })
      .expect(400);
    expect(beforeMould.body.details).toContainEqual({
      field: 'ctDoneOn',
      message: 'CT Sim cannot be before the mould.',
    });
    const tooLong = await s
      .act(radiographer, 'GR-6', 'RECORD_CT_SIM_DONE', chart.version, {
        ctDoneOn: istToday(),
        ctRef: 'x'.repeat(31),
      })
      .expect(400);
    expect(tooLong.body.details).toContainEqual({
      field: 'ctRef',
      message: 'Use at most 30 characters.',
    });

    chart = (
      await s
        .act(radiographer, 'GR-6', 'RECORD_CT_SIM_DONE', chart.version, {
          ctDoneOn: istToday(),
          ctRef: 'CT-9',
        })
        .expect(200)
    ).body;
    expect(chart.stage).toEqual({ code: 'CT_SIM_DONE', label: 'CT Sim done' });
    expect(chart.scanReference).toBe('CT-9');
    expect(chart.waitingFor).toBe('a junior resident to be assigned for contouring');
    expect(chart.history.map((h: { action: string }) => h.action)).toEqual([
      'ISSUE_CHART',
      'GIVE_SIMULATION_DATES',
      'RECORD_MOULD_DONE',
      'RECORD_CT_SIM_DONE',
    ]);
    expect(chart.availableActions).toEqual([]);
  });
});
