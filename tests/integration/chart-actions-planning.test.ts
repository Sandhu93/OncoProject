import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chartAtPhysicsPlanning, chartAtPlanApproved } from '../helpers/walk.js';
import { istToday, startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

type Person = Awaited<ReturnType<WorkflowApp['signIn']>>;

describe('ACT-030 planning: plan, approve, send back, send to the LINAC', () => {
  let s: WorkflowApp;
  let physicist: Person;
  let resident: Person;

  beforeAll(async () => {
    s = await startWorkflowApp();
    await s.signIn('radiographer', ['RADIOGRAPHER']);
    resident = await s.signIn('resident', ['JUNIOR_RESIDENT']);
    await s.signIn('senior', ['SENIOR_RESIDENT']);
    physicist = await s.signIn('physicist', ['PHYSICIST']);
  });
  afterAll(() => s.close());

  it('offers the plan to the physicist only, with the plan ID required and short', async () => {
    const chart = await chartAtPhysicsPlanning(s, 'PL-1');

    expect(chart.stage.code).toBe('PHYSICS_PLANNING');
    expect(chart.ownerRole).toBe('PHYSICIST');
    expect((await s.chart(s.consultant, 'PL-1')).availableActions).toEqual([]);
    expect((await s.chart(resident, 'PL-1')).availableActions).toEqual([]);
    const offer = (await s.chart(physicist, 'PL-1')).availableActions[0];
    expect(offer.action).toBe('SUBMIT_PLAN');
    expect(offer.fields.find((f: { key: string }) => f.key === 'planId')).toMatchObject({
      required: true,
      maxLength: 30,
    });

    const missing = await s.act(physicist, 'PL-1', 'SUBMIT_PLAN', chart.version, {}).expect(400);
    expect(missing.body.details).toContainEqual({ field: 'planId', message: 'Enter plan ID.' });
    const tooLong = await s
      .act(physicist, 'PL-1', 'SUBMIT_PLAN', chart.version, { planId: 'P'.repeat(31) })
      .expect(400);
    expect(tooLong.body.details).toContainEqual({
      field: 'planId',
      message: 'Use at most 30 characters.',
    });
    await s
      .act(s.consultant, 'PL-1', 'SUBMIT_PLAN', chart.version, { planId: 'PLAN-1' })
      .expect(403);
    expect((await s.chart(physicist, 'PL-1')).stage.code).toBe('PHYSICS_PLANNING');
  });

  it('submit, then approve by the consultant or the treating doctor', async () => {
    let chart = await chartAtPhysicsPlanning(s, 'PL-2');
    chart = (
      await s
        .act(physicist, 'PL-2', 'SUBMIT_PLAN', chart.version, {
          planId: 'PLAN-5871',
          planNote: 'Two arcs.',
        })
        .expect(200)
    ).body;

    expect(chart.stage.code).toBe('PLAN_APPROVAL');
    expect(chart.planId).toBe('PLAN-5871');
    expect(chart.waitingFor).toBe('the consultant or treating doctor to approve the plan');
    expect(chart.history.at(-1).summary).toBe(
      'Plan PLAN-5871 submitted for approval. Note: Two arcs.',
    );
    expect(chart.recorded).toContainEqual({ label: 'Plan submitted', value: expect.any(String) });

    const offered = (await s.chart(s.consultant, 'PL-2')).availableActions;
    expect(offered.map((a: { action: string }) => a.action).sort()).toEqual([
      'APPROVE_PLAN',
      'RETURN_PLAN',
    ]);
    const approve = offered.find((a: { action: string }) => a.action === 'APPROVE_PLAN');
    const by = approve.fields.find((f: { key: string }) => f.key === 'approvedBy');
    expect(by.options.map((o: { value: string }) => o.value)).toEqual([
      'Consultant',
      'Treating doctor',
    ]);
    expect(by.default).toBe('Consultant');

    const stranger = await s
      .act(s.consultant, 'PL-2', 'APPROVE_PLAN', chart.version, { approvedBy: 'Somebody' })
      .expect(400);
    expect(stranger.body.details).toContainEqual({
      field: 'approvedBy',
      message: 'Choose one of the options.',
    });
    await s
      .act(physicist, 'PL-2', 'APPROVE_PLAN', chart.version, { approvedBy: 'Consultant' })
      .expect(403);

    chart = (
      await s
        .act(s.consultant, 'PL-2', 'APPROVE_PLAN', chart.version, { approvedBy: 'Treating doctor' })
        .expect(200)
    ).body;
    expect(chart.stage.code).toBe('PLAN_APPROVED');
    expect(chart.history.at(-1).summary).toBe('Plan approved by the treating doctor.');
    expect(chart.recorded).toContainEqual({
      label: 'Plan approved',
      value: expect.stringMatching(/, by the treating doctor$/),
    });
    expect(chart.waitingFor).toBe('the approved plan to be sent to the LINAC');
  });

  it('sending the plan back needs a reason and takes back the plan ID', async () => {
    let chart = await chartAtPhysicsPlanning(s, 'PL-3');
    chart = (
      await s.act(physicist, 'PL-3', 'SUBMIT_PLAN', chart.version, { planId: 'PLAN-A' }).expect(200)
    ).body;

    const noReason = await s
      .act(s.consultant, 'PL-3', 'RETURN_PLAN', chart.version, {})
      .expect(400);
    expect(noReason.body.details).toContainEqual({
      field: 'reason',
      message: 'Say why it is going back.',
    });

    chart = (
      await s
        .act(s.consultant, 'PL-3', 'RETURN_PLAN', chart.version, {
          reason: 'Dose to the cord is too high.',
        })
        .expect(200)
    ).body;
    expect(chart.stage.code).toBe('PHYSICS_PLANNING');
    expect(chart.planId).toBeNull();
    expect(chart.recorded.map((r: { label: string }) => r.label)).not.toContain('Plan submitted');
    expect(chart.history.at(-1).summary).toBe(
      'Send back to physicist. Reason: Dose to the cord is too high.',
    );

    chart = (
      await s.act(physicist, 'PL-3', 'SUBMIT_PLAN', chart.version, { planId: 'PLAN-B' }).expect(200)
    ).body;
    expect(chart.planId).toBe('PLAN-B');
  });

  it('offers a free first slot on LINAC 1 and refuses a slot that is already taken', async () => {
    let first = await chartAtPlanApproved(s, 'PL-4');
    const offer = (await s.chart(physicist, 'PL-4')).availableActions[0];
    expect(offer.action).toBe('SEND_PLAN_TO_LINAC');
    const field = (key: string) => offer.fields.find((f: { key: string }) => f.key === key);
    expect(field('linacMachine').default).toBe('LINAC 1');
    expect(field('firstSlotTime').default).toBe('09:00');
    const suggested = field('firstSlotDate').default as string;
    expect(suggested >= istToday(2)).toBe(true);
    expect(new Date(`${suggested}T00:00:00Z`).getUTCDay()).not.toBe(0);

    const past = await s
      .act(physicist, 'PL-4', 'SEND_PLAN_TO_LINAC', first.version, {
        linacMachine: 'LINAC 1',
        firstSlotDate: istToday(-1),
        firstSlotTime: '09:00',
      })
      .expect(400);
    expect(past.body.details).toContainEqual({
      field: 'firstSlotDate',
      message: 'Choose today or a later date.',
    });

    first = (
      await s
        .act(physicist, 'PL-4', 'SEND_PLAN_TO_LINAC', first.version, {
          linacMachine: 'LINAC 1',
          firstSlotDate: suggested,
          firstSlotTime: '09:00',
          linacNote: 'Check the couch.',
        })
        .expect(200)
    ).body;
    expect(first.stage.code).toBe('PLAN_ON_LINAC');
    expect(first.waitingFor).toBe('the radiographer to inform the patient');
    expect(first.history.at(-1).summary).toMatch(
      /^Plan sent to LINAC 1\. First treatment .*, 09:00\. Note: Check the couch\.$/,
    );
    expect(first.recorded).toContainEqual({
      label: 'Plan sent to LINAC',
      value: expect.stringMatching(/, LINAC 1$/),
    });
    expect(first.recorded).toContainEqual({
      label: 'First treatment slot',
      value: expect.any(String),
    });

    // A second chart: the suggestion moves on to a free day, and the taken slot is refused by name.
    const second = await chartAtPlanApproved(s, 'PL-5');
    const next = (await s.chart(physicist, 'PL-5')).availableActions[0];
    expect(next.fields.find((f: { key: string }) => f.key === 'firstSlotDate').default).not.toBe(
      suggested,
    );

    const clash = await s
      .act(physicist, 'PL-5', 'SEND_PLAN_TO_LINAC', second.version, {
        linacMachine: 'LINAC 1',
        firstSlotDate: suggested,
        firstSlotTime: '09:00',
      })
      .expect(400);
    expect(clash.body.details).toContainEqual({
      field: 'firstSlotTime',
      message: 'LINAC 1 is already booked at that time for PL-4.',
    });
    expect((await s.chart(physicist, 'PL-5')).stage.code).toBe('PLAN_APPROVED');

    // Another machine, another time, or another day is fine.
    for (const [index, change] of [
      { linacMachine: 'LINAC 2' },
      { firstSlotTime: '10:00' },
    ].entries()) {
      const rt = `PL-6${index}`;
      const chart = await chartAtPlanApproved(s, rt);
      await s
        .act(physicist, rt, 'SEND_PLAN_TO_LINAC', chart.version, {
          linacMachine: 'LINAC 1',
          firstSlotDate: suggested,
          firstSlotTime: '09:00',
          ...change,
        })
        .expect(200);
    }
  });

  it('a slot is free again once that patient has started treatment', async () => {
    const a = await chartAtPlanApproved(s, 'PL-7');
    const day = istToday(5);
    const slot = { linacMachine: 'LINAC 2', firstSlotDate: day, firstSlotTime: '14:00' };
    await s.act(physicist, 'PL-7', 'SEND_PLAN_TO_LINAC', a.version, slot).expect(200);

    const b = await chartAtPlanApproved(s, 'PL-8');
    await s.act(physicist, 'PL-8', 'SEND_PLAN_TO_LINAC', b.version, slot).expect(400);

    await s.test.db.query(
      `UPDATE rt_charts SET data = data || '{"startOn":"2026-01-01"}'::jsonb WHERE display_number = 'PL-7'`,
    );
    await s.act(physicist, 'PL-8', 'SEND_PLAN_TO_LINAC', b.version, slot).expect(200);
  });

  it('two people reserving the same slot at once: one gets it, the other is refused', async () => {
    const a = await chartAtPlanApproved(s, 'PL-9');
    const b = await chartAtPlanApproved(s, 'PL-10');
    const slot = { linacMachine: 'LINAC 1', firstSlotDate: istToday(9), firstSlotTime: '16:30' };

    const results = await Promise.all([
      s.act(physicist, 'PL-9', 'SEND_PLAN_TO_LINAC', a.version, slot),
      s.act(physicist, 'PL-10', 'SEND_PLAN_TO_LINAC', b.version, slot),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});
