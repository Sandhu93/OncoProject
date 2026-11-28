import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chartAtCtSimDone } from '../helpers/walk.js';
import { istToday, startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

type Person = Awaited<ReturnType<WorkflowApp['signIn']>>;

describe('ACT-020 contouring: assign, submit, verify, approve, send back', () => {
  let s: WorkflowApp;
  let radiographer: Person;
  let residentA: Person;
  let residentB: Person;
  let senior: Person;

  beforeAll(async () => {
    s = await startWorkflowApp();
    radiographer = await s.signIn('radiographer', ['RADIOGRAPHER']);
    residentA = await s.signIn('residentA', ['JUNIOR_RESIDENT'], 'Resident Anand');
    residentB = await s.signIn('residentB', ['JUNIOR_RESIDENT'], 'Resident Bina');
    senior = await s.signIn('senior', ['SENIOR_RESIDENT']);
  });
  afterAll(() => s.close());

  const assign = (rt: string, version: number, who: Person, change: object = {}) =>
    s.act(s.consultant, rt, 'ASSIGN_CONTOURING', version, {
      resident: who.id,
      contourDue: istToday(3),
      ...change,
    });

  it('offers only the consultant the assignment, with the junior residents to choose from', async () => {
    const chart = await chartAtCtSimDone(s, 'CN-1');

    expect(chart.stage.code).toBe('CT_SIM_DONE');
    expect(chart.waitingFor).toBe('a junior resident to be assigned for contouring');
    expect(chart.ownerRole).toBe('CONSULTANT');
    expect((await s.chart(radiographer, 'CN-1')).availableActions).toEqual([]);
    expect((await s.chart(residentA, 'CN-1')).availableActions).toEqual([]);

    const mine = (await s.chart(s.consultant, 'CN-1')).availableActions;
    expect(mine).toHaveLength(1);
    const field = mine[0].fields.find((f: { key: string }) => f.key === 'resident');
    expect(field.type).toBe('staff');
    expect(field.required).toBe(true);
    expect(field.options.map((o: { label: string }) => o.label)).toEqual([
      'Resident Anand',
      'Resident Bina',
    ]);
    expect(field.default).toBe(field.options[0].value);
    const due = mine[0].fields.find((f: { key: string }) => f.key === 'contourDue');
    expect(due.min).toBe(istToday());
    expect(due.default).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refuses a person who is not a junior resident, a past due date, or nobody chosen', async () => {
    await chartAtCtSimDone(s, 'CN-2');
    const chart = await s.chart(s.consultant, 'CN-2');

    const notAResident = await assign('CN-2', chart.version, senior).expect(400);
    expect(notAResident.body.details).toContainEqual({
      field: 'resident',
      message: 'Choose one of the options.',
    });
    const past = await assign('CN-2', chart.version, residentA, {
      contourDue: istToday(-1),
    }).expect(400);
    expect(past.body.details).toContainEqual({
      field: 'contourDue',
      message: 'Choose today or a later date.',
    });
    const nobody = await s
      .act(s.consultant, 'CN-2', 'ASSIGN_CONTOURING', chart.version, {
        contourDue: istToday(2),
      })
      .expect(400);
    expect(nobody.body.details).toContainEqual({
      field: 'resident',
      message: 'Choose a junior resident.',
    });
    await s.act(radiographer, 'CN-2', 'ASSIGN_CONTOURING', chart.version, {}).expect(403);
    expect((await s.chart(s.consultant, 'CN-2')).stage.code).toBe('CT_SIM_DONE');
  });

  it('assigns one resident: only they can submit, and everyone sees who has it', async () => {
    await chartAtCtSimDone(s, 'CN-3');
    let chart = await s.chart(s.consultant, 'CN-3');
    chart = (
      await assign('CN-3', chart.version, residentA, {
        contourInstructions: 'Both parotids please.',
      }).expect(200)
    ).body;

    expect(chart.stage.code).toBe('CONTOURING');
    expect(chart.waitingFor).toBe('the assigned junior resident to submit contouring');
    expect(chart.recorded).toContainEqual({
      label: 'Contouring assigned to',
      value: 'Resident Anand',
    });
    expect(chart.recorded).toContainEqual({
      label: 'Contouring due by',
      value: expect.any(String),
    });
    expect(chart.history.at(-1).summary).toMatch(
      /^Assigned to Resident Anand\. Contouring due .*\. Note: Both parotids please\.$/,
    );
    const rows = await s.test.db.query(
      "SELECT staff_id, assigned_by, ended_at FROM assignments WHERE chart_id = $1 AND task_code = 'CONTOURING'",
      [chart.id],
    );
    expect(rows.rows).toEqual([
      { staff_id: residentA.id, assigned_by: s.consultant.id, ended_at: null },
    ]);

    // The other resident is not offered it, and the API refuses them even if they try.
    expect((await s.chart(residentB, 'CN-3')).availableActions).toEqual([]);
    const refused = await s
      .act(residentB, 'CN-3', 'SUBMIT_CONTOURING', chart.version, { contourRef: 'X' })
      .expect(403);
    expect(refused.body.code).toBe('NOT_ASSIGNED');

    const offered = (await s.chart(residentA, 'CN-3')).availableActions;
    expect(offered.map((a: { action: string }) => a.action)).toEqual(['SUBMIT_CONTOURING']);
  });

  it('walks submit, verify and approve, then sends the chart to physics planning', async () => {
    await chartAtCtSimDone(s, 'CN-4');
    let chart = await s.chart(s.consultant, 'CN-4');
    chart = (await assign('CN-4', chart.version, residentB).expect(200)).body;

    const tooLong = await s
      .act(residentB, 'CN-4', 'SUBMIT_CONTOURING', chart.version, { contourRef: 'x'.repeat(41) })
      .expect(400);
    expect(tooLong.body.details).toContainEqual({
      field: 'contourRef',
      message: 'Use at most 40 characters.',
    });

    chart = (
      await s
        .act(residentB, 'CN-4', 'SUBMIT_CONTOURING', chart.version, {
          contourRef: 'C-4001',
          contourNote: 'Brainstem is close.',
        })
        .expect(200)
    ).body;
    expect(chart.stage.code).toBe('SENIOR_VERIFICATION');
    expect(chart.waitingFor).toBe('the senior resident to verify the contouring');
    expect(chart.contourSetName).toBe('C-4001');
    expect(chart.history.at(-1).summary).toBe(
      'Contouring submitted as C-4001. Note: Brainstem is close.',
    );
    expect(chart.availableActions).toEqual([]);

    const seniorOffer = (await s.chart(senior, 'CN-4')).availableActions;
    expect(seniorOffer.map((a: { action: string }) => a.action).sort()).toEqual([
      'RETURN_CONTOURING',
      'VERIFY_CONTOURING',
    ]);
    const sendBack = seniorOffer.find((a: { action: string }) => a.action === 'RETURN_CONTOURING');
    expect(sendBack.requiresReason).toBe(true);
    expect(sendBack.fields[0]).toMatchObject({
      key: 'reason',
      required: true,
      label: 'Why is it going back?',
    });

    chart = (
      await s
        .act(senior, 'CN-4', 'VERIFY_CONTOURING', chart.version, { seniorNote: 'Fine.' })
        .expect(200)
    ).body;
    expect(chart.stage.code).toBe('CONSULTANT_CONTOUR_APPROVAL');
    expect(chart.recorded).toContainEqual({
      label: 'Contouring verified by senior resident',
      value: expect.any(String),
    });
    // A senior resident cannot approve, nor a consultant verify.
    await s.act(senior, 'CN-4', 'APPROVE_CONTOURING', chart.version, {}).expect(403);

    chart = (await s.act(s.consultant, 'CN-4', 'APPROVE_CONTOURING', chart.version, {}).expect(200))
      .body;
    expect(chart.stage.code).toBe('PHYSICS_PLANNING');
    expect(chart.waitingFor).toBe('the physicist to build and submit the plan');
    expect(chart.history.map((h: { action: string }) => h.action)).toEqual([
      'ISSUE_CHART',
      'GIVE_SIMULATION_DATES',
      'RECORD_MOULD_DONE',
      'RECORD_CT_SIM_DONE',
      'ASSIGN_CONTOURING',
      'SUBMIT_CONTOURING',
      'VERIFY_CONTOURING',
      'APPROVE_CONTOURING',
    ]);
    expect(chart.recorded).toContainEqual({
      label: 'Contouring approved',
      value: expect.any(String),
    });
  });

  it('a senior resident sending it back needs a reason, and the resident must submit again', async () => {
    await chartAtCtSimDone(s, 'CN-5');
    let chart = await s.chart(s.consultant, 'CN-5');
    chart = (await assign('CN-5', chart.version, residentA).expect(200)).body;
    chart = (
      await s
        .act(residentA, 'CN-5', 'SUBMIT_CONTOURING', chart.version, { contourRef: 'C-5001' })
        .expect(200)
    ).body;

    const noReason = await s
      .act(senior, 'CN-5', 'RETURN_CONTOURING', chart.version, {})
      .expect(400);
    expect(noReason.body.details).toContainEqual({
      field: 'reason',
      message: 'Say why it is going back.',
    });
    expect((await s.chart(senior, 'CN-5')).stage.code).toBe('SENIOR_VERIFICATION');

    chart = (
      await s
        .act(senior, 'CN-5', 'RETURN_CONTOURING', chart.version, {
          reason: 'Left lung is missing.',
        })
        .expect(200)
    ).body;
    expect(chart.stage.code).toBe('CONTOURING');
    expect(chart.contourSetName).toBeNull();
    expect(chart.recorded.map((r: { label: string }) => r.label)).not.toContain(
      'Contouring submitted',
    );
    const last = chart.history.at(-1);
    expect(last).toMatchObject({ action: 'RETURN_CONTOURING', reason: 'Left lung is missing.' });
    expect(last.summary).toBe('Send back to junior resident. Reason: Left lung is missing.');

    // The same resident has it again; the other still cannot take it.
    await s.act(residentB, 'CN-5', 'SUBMIT_CONTOURING', chart.version, {}).expect(403);
    chart = (
      await s
        .act(residentA, 'CN-5', 'SUBMIT_CONTOURING', chart.version, { contourRef: 'C-5002' })
        .expect(200)
    ).body;
    expect(chart.contourSetName).toBe('C-5002');
  });

  it("a consultant sending it back also takes back the senior resident's check", async () => {
    await chartAtCtSimDone(s, 'CN-6');
    let chart = await s.chart(s.consultant, 'CN-6');
    chart = (await assign('CN-6', chart.version, residentA).expect(200)).body;
    chart = (
      await s
        .act(residentA, 'CN-6', 'SUBMIT_CONTOURING', chart.version, { contourRef: 'C-6' })
        .expect(200)
    ).body;
    chart = (await s.act(senior, 'CN-6', 'VERIFY_CONTOURING', chart.version, {}).expect(200)).body;
    expect(chart.recorded.map((r: { label: string }) => r.label)).toContain(
      'Contouring verified by senior resident',
    );

    chart = (
      await s
        .act(s.consultant, 'CN-6', 'RETURN_CONTOURING', chart.version, {
          reason: 'Redo the target volume.',
        })
        .expect(200)
    ).body;

    expect(chart.stage.code).toBe('CONTOURING');
    const labels = chart.recorded.map((r: { label: string }) => r.label);
    expect(labels).not.toContain('Contouring verified by senior resident');
    expect(labels).not.toContain('Contouring submitted');
    expect(labels).toContain('Contouring assigned to');
    expect(chart.history.at(-1).actorRoles).toEqual(['CONSULTANT']);
  });
});
