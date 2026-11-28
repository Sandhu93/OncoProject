import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOGUE } from '../../apps/api/src/charts/actions/catalogue.js';
import { chartAtPatientInformed, chartAtPlanOnLinac, chartInTreatment } from '../helpers/walk.js';
import { istToday, startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

type Person = Awaited<ReturnType<WorkflowApp['signIn']>>;

describe('ACT-001 every action in the workflow has a step definition', () => {
  it('lists none missing', async () => {
    const s = await startWorkflowApp();
    try {
      const rows = await s.test.db.query<{ action: string }>(
        `SELECT DISTINCT t.action FROM workflow_transitions t
           JOIN workflow_versions w ON w.id = t.workflow_id WHERE w.status = 'ACTIVE'`,
      );
      // 18 transitions; the two ways of sending the contouring back share one action code.
      expect(rows.rows).toHaveLength(16);
      expect(rows.rows.map((r) => r.action).filter((a) => !CATALOGUE[a])).toEqual([]);
    } finally {
      await s.close();
    }
  });
});

describe('ACT-040 treatment: tell the patient, start, Saturday updates, finish', () => {
  let s: WorkflowApp;
  let radiographer: Person;
  let resident: Person;
  let senior: Person;

  beforeAll(async () => {
    s = await startWorkflowApp();
    radiographer = await s.signIn('radiographer', ['RADIOGRAPHER']);
    resident = await s.signIn('resident', ['JUNIOR_RESIDENT']);
    senior = await s.signIn('senior', ['SENIOR_RESIDENT']);
    await s.signIn('physicist', ['PHYSICIST']);
  });
  afterAll(() => s.close());

  const names = (offered: { action: string }[]) => offered.map((a) => a.action).sort();

  it('tells the radiographer what is in place before the patient is told', async () => {
    const chart = await chartAtPlanOnLinac(s, 'TR-1');
    expect(chart.stage.code).toBe('PLAN_ON_LINAC');
    expect((await s.chart(resident, 'TR-1')).availableActions).toEqual([]);

    const [offer] = (await s.chart(radiographer, 'TR-1')).availableActions;
    expect(offer.action).toBe('INFORM_PATIENT');
    expect(offer.checks).toEqual([
      { label: 'Contouring approved', ok: true, detail: expect.any(String) },
      { label: 'Plan approved', ok: true, detail: expect.any(String) },
      {
        label: 'LINAC slot reserved',
        ok: true,
        detail: expect.stringMatching(/, 09:00, LINAC 1$/),
      },
    ]);
    const field = (key: string) => offer.fields.find((f: { key: string }) => f.key === key);
    expect(field('informedHow').options.map((o: { value: string }) => o.value)).toEqual([
      'Phone',
      'In person',
      'Through the ward',
      'Other',
    ]);
    expect(field('arriveDate').default).toBe(istToday(12));
    expect(field('arriveTime').default).toBe('09:00');
  });

  it('refuses to tell the patient while something is missing, saying what', async () => {
    const chart = await chartAtPlanOnLinac(s, 'TR-2');
    await s.test.db.query(
      `UPDATE rt_charts SET data = data - 'contourApprovedOn' - 'firstSlotDate' WHERE display_number = 'TR-2'`,
    );

    const [offer] = (await s.chart(radiographer, 'TR-2')).availableActions;
    expect(
      offer.checks.filter((c: { ok: boolean }) => !c.ok).map((c: { label: string }) => c.label),
    ).toEqual(['Contouring approved', 'LINAC slot reserved']);
    const refused = await s
      .act(radiographer, 'TR-2', 'INFORM_PATIENT', chart.version, {
        informedHow: 'Phone',
        arriveDate: istToday(1),
        arriveTime: '09:00',
      })
      .expect(409);
    expect(refused.body.code).toBe('PREREQUISITES_MISSING');
    expect(refused.body.message).toBe(
      'The patient cannot be told yet. Still missing: contouring approved, linac slot reserved.',
    );
    expect((await s.chart(radiographer, 'TR-2')).stage.code).toBe('PLAN_ON_LINAC');
  });

  it('records how the patient was told and when to arrive, then waits for treatment to start', async () => {
    const chart = await chartAtPlanOnLinac(s, 'TR-3');
    const bad = await s
      .act(radiographer, 'TR-3', 'INFORM_PATIENT', chart.version, {
        informedHow: 'Pigeon',
        arriveDate: istToday(-1),
        arriveTime: '9',
      })
      .expect(400);
    expect(bad.body.details).toEqual(
      expect.arrayContaining([
        { field: 'informedHow', message: 'Choose one of the options.' },
        { field: 'arriveDate', message: 'Choose today or a later date.' },
        { field: 'arriveTime', message: 'Enter a time such as 10:30.' },
      ]),
    );

    const done = (
      await s
        .act(radiographer, 'TR-3', 'INFORM_PATIENT', chart.version, {
          informedHow: 'Through the ward',
          arriveDate: istToday(13),
          arriveTime: '08:30',
          informNote: 'Spoke to the attender.',
        })
        .expect(200)
    ).body;
    expect(done.stage.code).toBe('PATIENT_INFORMED');
    expect(done.waitingFor).toBe('the patient to arrive and treatment to start');
    expect(done.history.at(-1).summary).toMatch(
      /^Patient told by through the ward to arrive .*, 08:30\. Note: Spoke to the attender\.$/,
    );
    expect(done.recorded).toContainEqual({
      label: 'Patient told',
      value: expect.stringMatching(/, through the ward$/),
    });
    expect(done.recorded).toContainEqual({
      label: 'Patient to arrive',
      value: expect.stringMatching(/, 08:30$/),
    });
  });

  it('a junior resident records the start; the date cannot be in the future', async () => {
    const chart = await chartAtPatientInformed(s, 'TR-4');
    expect((await s.chart(radiographer, 'TR-4')).availableActions).toEqual([]);
    await s
      .act(senior, 'TR-4', 'START_TREATMENT', chart.version, { startOn: istToday() })
      .expect(403);

    const future = await s
      .act(resident, 'TR-4', 'START_TREATMENT', chart.version, { startOn: istToday(1) })
      .expect(400);
    expect(future.body.details).toContainEqual({
      field: 'startOn',
      message: 'This date is in the future.',
    });
    const early = await s
      .act(resident, 'TR-4', 'START_TREATMENT', chart.version, { startOn: istToday(-1) })
      .expect(400);
    expect(early.body.details).toContainEqual({
      field: 'startOn',
      message: 'This date is before the patient was told.',
    });

    const started = (
      await s
        .act(resident, 'TR-4', 'START_TREATMENT', chart.version, {
          startOn: istToday(),
          startNote: 'On time.',
        })
        .expect(200)
    ).body;
    expect(started.stage.code).toBe('TREATMENT_IN_PROGRESS');
    expect(started.waitingFor).toBe('weekly updates, then completion');
    expect(started.recorded).toContainEqual({
      label: 'Treatment started',
      value: expect.any(String),
    });
    expect(started.recorded).toContainEqual({ label: 'Sessions given so far', value: '0 of 25' });
    expect(started.weekly).toEqual({
      weekEnding: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      updates: [
        { role: 'JUNIOR_RESIDENT', posted: false },
        { role: 'RADIOGRAPHER', posted: false },
      ],
    });
    const stored = await s.test.db.query(
      'SELECT kind, author_role, note FROM treatment_status_updates WHERE chart_id = $1',
      [started.id],
    );
    expect(stored.rows).toEqual([
      { kind: 'TREATMENT_START', author_role: 'JUNIOR_RESIDENT', note: 'On time.' },
    ]);
  });

  it('offers the Saturday update to the junior resident and the radiographer, once each week', async () => {
    const chart = await chartInTreatment(s, 'TR-5');

    expect(names((await s.chart(resident, 'TR-5')).availableActions)).toEqual([
      'COMPLETE_TREATMENT',
      'POST_WEEKLY_UPDATE',
    ]);
    expect(names((await s.chart(radiographer, 'TR-5')).availableActions)).toEqual([
      'POST_WEEKLY_UPDATE',
    ]);
    expect((await s.chart(senior, 'TR-5')).availableActions).toEqual([]);
    expect((await s.chart(s.consultant, 'TR-5')).availableActions).toEqual([]);

    const weekly = (await s.chart(resident, 'TR-5')).availableActions.find(
      (a: { action: string }) => a.action === 'POST_WEEKLY_UPDATE',
    );
    const field = (key: string) => weekly.fields.find((f: { key: string }) => f.key === key);
    expect(field('sessionsTotal')).toMatchObject({ min: '0', max: '25', default: '5' });
    expect(field('gap').default).toBe('No');

    const tooMany = await s
      .act(resident, 'TR-5', 'POST_WEEKLY_UPDATE', chart.version, {
        sessionsTotal: '26',
        gap: 'No',
      })
      .expect(400);
    expect(tooMany.body.details).toContainEqual({
      field: 'sessionsTotal',
      message: 'Enter a number from 0 to 25.',
    });
    const gapNoNote = await s
      .act(resident, 'TR-5', 'POST_WEEKLY_UPDATE', chart.version, {
        sessionsTotal: '4',
        gap: 'Yes',
      })
      .expect(400);
    expect(gapNoNote.body.details).toContainEqual({
      field: 'weeklyNote',
      message: 'Say what happened: a note is needed if there was a gap.',
    });

    const posted = (
      await s
        .act(resident, 'TR-5', 'POST_WEEKLY_UPDATE', chart.version, {
          sessionsTotal: '5',
          gap: 'Yes',
          weeklyNote: 'Machine service on Tuesday.',
        })
        .expect(200)
    ).body;
    // Not a move to another stage: the chart stays, its version moves on, the history says what was posted.
    expect(posted.stage.code).toBe('TREATMENT_IN_PROGRESS');
    expect(posted.version).toBe(chart.version + 1);
    expect(posted.stageSince).toBe(chart.stageSince);
    expect(posted.history.at(-1)).toMatchObject({
      action: 'POST_WEEKLY_UPDATE',
      fromStage: 'TREATMENT_IN_PROGRESS',
      toStage: 'TREATMENT_IN_PROGRESS',
      actorRoles: ['JUNIOR_RESIDENT'],
      summary:
        'Saturday update posted. 5 of 25 sessions given. There was a gap in treatment this week. Note: Machine service on Tuesday.',
    });
    expect(posted.recorded).toContainEqual({ label: 'Sessions given so far', value: '5 of 25' });
    expect(posted.weekly.updates).toEqual([
      { role: 'JUNIOR_RESIDENT', posted: true },
      { role: 'RADIOGRAPHER', posted: false },
    ]);
    expect(names((await s.chart(resident, 'TR-5')).availableActions)).toEqual([
      'COMPLETE_TREATMENT',
    ]);
    expect(names((await s.chart(radiographer, 'TR-5')).availableActions)).toEqual([
      'POST_WEEKLY_UPDATE',
    ]);

    // The same person cannot post twice, even by asking the API directly.
    const again = await s
      .act(resident, 'TR-5', 'POST_WEEKLY_UPDATE', posted.version, {
        sessionsTotal: '6',
        gap: 'No',
      })
      .expect(409);
    expect(again.body.code).toBe('ALREADY_POSTED');

    // The radiographer posts theirs: sessions cannot go below what is already recorded.
    const below = await s
      .act(radiographer, 'TR-5', 'POST_WEEKLY_UPDATE', posted.version, {
        sessionsTotal: '4',
        gap: 'No',
      })
      .expect(400);
    expect(below.body.details).toContainEqual({
      field: 'sessionsTotal',
      message: 'Enter 5 or more: 5 were recorded before this update.',
    });
    const both = (
      await s
        .act(radiographer, 'TR-5', 'POST_WEEKLY_UPDATE', posted.version, {
          sessionsTotal: '5',
          gap: 'No',
        })
        .expect(200)
    ).body;
    expect(both.weekly.updates.every((u: { posted: boolean }) => u.posted)).toBe(true);

    const rows = await s.test.db.query<{ author_role: string; dow: number }>(
      `SELECT author_role, extract(dow FROM week_ending)::int AS dow FROM treatment_status_updates
        WHERE chart_id = $1 AND kind = 'WEEKLY' ORDER BY author_role`,
      [both.id],
    );
    expect(rows.rows).toEqual([
      { author_role: 'JUNIOR_RESIDENT', dow: 6 },
      { author_role: 'RADIOGRAPHER', dow: 6 },
    ]);
    const due = await s.test.db.query(
      'SELECT 1 FROM weekly_updates_due() WHERE due_chart_id = $1',
      [both.id],
    );
    expect(due.rows).toEqual([]);
  });

  it('finishing early needs a note; finishing all sessions does not; the chart is then closed', async () => {
    const chart = await chartInTreatment(s, 'TR-6');
    await s.act(s.consultant, 'TR-6', 'COMPLETE_TREATMENT', chart.version, {}).expect(403);

    const offer = (await s.chart(resident, 'TR-6')).availableActions.find(
      (a: { action: string }) => a.action === 'COMPLETE_TREATMENT',
    );
    const field = (key: string) => offer.fields.find((f: { key: string }) => f.key === key);
    expect(field('sessionsFinal')).toMatchObject({
      min: '0',
      max: '25',
      default: '25',
      help: '25 were planned.',
    });
    expect(field('completeOn').default).toBe(istToday());

    const tooMany = await s
      .act(resident, 'TR-6', 'COMPLETE_TREATMENT', chart.version, {
        completeOn: istToday(),
        sessionsFinal: '26',
      })
      .expect(400);
    expect(tooMany.body.details).toContainEqual({
      field: 'sessionsFinal',
      message: 'Enter a number from 0 to 25.',
    });
    const noNote = await s
      .act(resident, 'TR-6', 'COMPLETE_TREATMENT', chart.version, {
        completeOn: istToday(),
        sessionsFinal: '20',
      })
      .expect(400);
    expect(noNote.body.details).toContainEqual({
      field: 'completeNote',
      message: 'Say why treatment ended early.',
    });
    const future = await s
      .act(resident, 'TR-6', 'COMPLETE_TREATMENT', chart.version, {
        completeOn: istToday(2),
        sessionsFinal: '25',
      })
      .expect(400);
    expect(future.body.details).toContainEqual({
      field: 'completeOn',
      message: 'This date is in the future.',
    });

    const done = (
      await s
        .act(resident, 'TR-6', 'COMPLETE_TREATMENT', chart.version, {
          completeOn: istToday(),
          sessionsFinal: '20',
          completeNote: 'Patient transferred to another hospital.',
        })
        .expect(200)
    ).body;
    expect(done.stage.code).toBe('TREATMENT_COMPLETED');
    // Treatment is done but the chart stays open until both final updates are in.
    expect(done.status).toBe('OPEN');
    expect(done.waitingFor).toBe(
      'the junior resident and the radiographer to post their final updates',
    );
    expect(names(done.availableActions)).toEqual(['POST_FINAL_UPDATE']);
    expect(done.weekly).toBeNull();
    expect(done.history.at(-1).summary).toMatch(
      /^Treatment finished on .* after 20 of 25 sessions\. Note: Patient transferred to another hospital\.$/,
    );
    expect(done.recorded).toContainEqual({
      label: 'Treatment finished',
      value: expect.stringMatching(/, 20 sessions given$/),
    });
    const stored = await s.test.db.query(
      "SELECT kind, note FROM treatment_status_updates WHERE chart_id = $1 AND kind = 'COMPLETION'",
      [done.id],
    );
    expect(stored.rows).toEqual([
      { kind: 'COMPLETION', note: 'Patient transferred to another hospital.' },
    ]);

    // No more Saturday updates once treatment is complete.
    await s
      .act(resident, 'TR-6', 'POST_WEEKLY_UPDATE', done.version, { sessionsTotal: '20', gap: 'No' })
      .expect(409);
  });

  it('keeps the chart open until the junior resident and the radiographer have both posted a final update', async () => {
    const chart = await chartInTreatment(s, 'TR-8');
    const done = (
      await s
        .act(resident, 'TR-8', 'COMPLETE_TREATMENT', chart.version, {
          completeOn: istToday(),
          sessionsFinal: '25',
        })
        .expect(200)
    ).body;
    // Neither the senior resident nor the consultant has a final update to post.
    expect((await s.chart(senior, 'TR-8')).availableActions).toEqual([]);
    await s.act(s.consultant, 'TR-8', 'POST_FINAL_UPDATE', done.version, {}).expect(403);

    const first = (
      await s
        .act(resident, 'TR-8', 'POST_FINAL_UPDATE', done.version, {
          finalNote: 'Skin reaction mild.',
        })
        .expect(200)
    ).body;
    expect(first.stage.code).toBe('TREATMENT_COMPLETED');
    expect(first.status).toBe('OPEN');
    expect(first.history.at(-1).summary).toBe('Final update posted. Note: Skin reaction mild.');
    expect(first.recorded).toContainEqual({
      label: 'Final update, junior resident',
      value: expect.any(String),
    });
    // The resident cannot post a second one; the radiographer still can.
    expect((await s.chart(resident, 'TR-8')).availableActions).toEqual([]);
    const again = await s.act(resident, 'TR-8', 'POST_FINAL_UPDATE', first.version, {}).expect(409);
    expect(['ALREADY_POSTED', 'ACTION_NOT_AVAILABLE']).toContain(again.body.code);
    expect(names((await s.chart(radiographer, 'TR-8')).availableActions)).toEqual([
      'POST_FINAL_UPDATE',
    ]);

    const last = (
      await s.act(radiographer, 'TR-8', 'POST_FINAL_UPDATE', first.version, {}).expect(200)
    ).body;
    expect(last.stage.code).toBe('TRACKING_ENDED');
    expect(last.status).toBe('CLOSED');
    expect(last.availableActions).toEqual([]);
    const stored = await s.test.db.query(
      "SELECT author_role FROM treatment_status_updates WHERE chart_id = $1 AND kind = 'FINAL' ORDER BY author_role",
      [last.id],
    );
    expect(stored.rows).toEqual([
      { author_role: 'JUNIOR_RESIDENT' },
      { author_role: 'RADIOGRAPHER' },
    ]);
  });

  it('lets the radiographer post first; the resident then ends tracking', async () => {
    const chart = await chartInTreatment(s, 'TR-9');
    const done = (
      await s
        .act(resident, 'TR-9', 'COMPLETE_TREATMENT', chart.version, {
          completeOn: istToday(),
          sessionsFinal: '25',
        })
        .expect(200)
    ).body;
    const first = (
      await s.act(radiographer, 'TR-9', 'POST_FINAL_UPDATE', done.version, {}).expect(200)
    ).body;
    expect(first.status).toBe('OPEN');
    const last = (await s.act(resident, 'TR-9', 'POST_FINAL_UPDATE', first.version, {}).expect(200))
      .body;
    expect(last.stage.code).toBe('TRACKING_ENDED');
    expect(last.status).toBe('CLOSED');
  });

  it('a full course needs no note', async () => {
    const chart = await chartInTreatment(s, 'TR-7');
    const done = (
      await s
        .act(resident, 'TR-7', 'COMPLETE_TREATMENT', chart.version, {
          completeOn: istToday(),
          sessionsFinal: '25',
        })
        .expect(200)
    ).body;

    expect(done.history.at(-1).summary).toBe(
      `Treatment finished on ${done.history.at(-1).summary.match(/on (.*) after/)[1]} after 25 of 25 sessions.`,
    );
    expect(done.status).toBe('OPEN');
    expect(done.stage.code).toBe('TREATMENT_COMPLETED');
  });
});
