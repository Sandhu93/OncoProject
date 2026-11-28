import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NotificationList } from '@oncotrack/contracts';
import { chartAtCtSimDone, chartInTreatment } from '../helpers/walk.js';
import { istToday, startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

type Person = Awaited<ReturnType<WorkflowApp['signIn']>>;

describe('CTL-010 consultant controls', () => {
  let s: WorkflowApp;
  let radiographer: Person;
  let junior: Person;
  let otherJunior: Person;
  let senior: Person;
  let secondConsultant: Person;

  beforeAll(async () => {
    s = await startWorkflowApp();
    radiographer = await s.signIn('radiographer', ['RADIOGRAPHER']);
    junior = await s.signIn('junior', ['JUNIOR_RESIDENT'], 'Dr Asha Rao');
    otherJunior = await s.signIn('junior2', ['JUNIOR_RESIDENT'], 'Dr Biju Nair');
    senior = await s.signIn('senior', ['SENIOR_RESIDENT']);
    await s.signIn('physicist', ['PHYSICIST']);
    secondConsultant = await s.signIn('consultant2', ['CONSULTANT'], 'Dr Second Consultant');
  });
  afterAll(() => s.close());

  const inbox = async (who: Person): Promise<NotificationList> =>
    (await s.as(who).get('/notifications').expect(200)).body;
  const kinds = async (who: Person, rt: string) =>
    (await inbox(who)).items.filter((n) => n.rtNumber === rt);
  const control = (who: Person, rt: string, action: string, version: number, values: object) =>
    s.act(who, rt, action, version, values);

  /** Assigned to the first junior resident and waiting for the contours. */
  const chartInContouring = async (rt: string) => {
    const chart = await chartAtCtSimDone(s, rt);
    return (
      await s
        .act(s.consultant, rt, 'ASSIGN_CONTOURING', chart.version, {
          resident: junior.id,
          contourDue: istToday(3),
        })
        .expect(200)
    ).body;
  };

  it('offers nothing to anyone but a consultant, and refuses them if they try', async () => {
    const chart = await chartInContouring('K-1');
    for (const who of [radiographer, junior, senior]) {
      expect((await s.chart(who, 'K-1')).controls).toEqual([]);
    }
    const refused = await control(junior, 'K-1', 'DISCONTINUE_CHART', chart.version, {
      reason: 'Because.',
    }).expect(403);
    expect(refused.body.code).toBe('ROLE_NOT_ALLOWED');
    expect(
      (await s.chart(s.consultant, 'K-1')).controls.map((c: { action: string }) => c.action),
    ).toEqual(['REASSIGN_CONTOURING', 'RETURN_TO_STAGE', 'DISCONTINUE_CHART']);
  });

  describe('reassigning the contouring', () => {
    it('hands it to another resident, tells both, and the old one can no longer submit', async () => {
      const chart = await chartInContouring('K-2');
      const offer = (await s.chart(s.consultant, 'K-2')).controls.find(
        (c: { action: string }) => c.action === 'REASSIGN_CONTOURING',
      );
      const residents = offer.fields.find((f: { key: string }) => f.key === 'resident');
      // The current resident is not offered.
      expect(residents.options.map((o: { value: string }) => o.value)).toEqual([otherJunior.id]);

      await control(s.consultant, 'K-2', 'REASSIGN_CONTOURING', chart.version, {
        resident: otherJunior.id,
      })
        .expect(400)
        .then((res) =>
          expect(res.body.details).toContainEqual({
            field: 'reason',
            message: 'Say why it is being reassigned.',
          }),
        );

      const moved = (
        await control(s.consultant, 'K-2', 'REASSIGN_CONTOURING', chart.version, {
          resident: otherJunior.id,
          reason: 'Dr Rao is on leave.',
        }).expect(200)
      ).body;
      expect(moved.stage.code).toBe('CONTOURING');
      expect(moved.history.at(-1)).toMatchObject({
        action: 'REASSIGN_CONTOURING',
        reason: 'Dr Rao is on leave.',
        summary:
          'Contouring reassigned from Dr Asha Rao to Dr Biju Nair. Reason: Dr Rao is on leave.',
      });
      expect((await kinds(otherJunior, 'K-2')).map((n) => n.kind)).toEqual(['ASSIGNED']);
      const taken = await kinds(junior, 'K-2');
      const message = taken.find((n) => n.kind === 'REASSIGNED')?.message;
      expect(message).toMatch(
        /^K-2 was taken off you and given to Dr Biju Nair by .+\. Reason: Dr Rao is on leave\.$/,
      );
      const old = await control(junior, 'K-2', 'SUBMIT_CONTOURING', moved.version, {}).expect(403);
      expect(old.body.code).toBe('NOT_ASSIGNED');
      await control(otherJunior, 'K-2', 'SUBMIT_CONTOURING', moved.version, {}).expect(200);
      const ended = await s.test.db.query(
        `SELECT count(*)::int AS n FROM assignments a JOIN rt_charts c ON c.id = a.chart_id
          WHERE c.display_number = 'K-2' AND a.ended_at IS NOT NULL`,
      );
      expect(ended.rows[0]).toEqual({ n: 1 });
    });

    it('is only offered while the chart is in contouring', async () => {
      const chart = await chartAtCtSimDone(s, 'K-3');
      expect(chart.stage.code).toBe('CT_SIM_DONE');
      expect(
        (await s.chart(s.consultant, 'K-3')).controls.map((c: { action: string }) => c.action),
      ).not.toContain('REASSIGN_CONTOURING');
      const refused = await control(s.consultant, 'K-3', 'REASSIGN_CONTOURING', chart.version, {
        resident: junior.id,
        reason: 'x',
      }).expect(409);
      expect(refused.body.code).toBe('ACTION_NOT_AVAILABLE');
    });
  });

  describe('returning to an earlier stage', () => {
    it('moves the chart back, tells whoever it goes back to, and keeps it in the history', async () => {
      const chart = await chartInContouring('K-4');
      const offer = (await s.chart(s.consultant, 'K-4')).controls.find(
        (c: { action: string }) => c.action === 'RETURN_TO_STAGE',
      );
      const stages = offer.fields.find((f: { key: string }) => f.key === 'stage').options;
      expect(stages.map((o: { value: string }) => o.value)).toEqual([
        'RT_CHART_ISSUED',
        'SIMULATION_DATES_GIVEN',
        'MOULD_DONE',
        'CT_SIM_DONE',
      ]);

      await control(s.consultant, 'K-4', 'RETURN_TO_STAGE', chart.version, {
        stage: 'MOULD_DONE',
        reason: 'The CT needs repeating.',
      })
        .expect(200)
        .then((res) => {
          expect(res.body.stage.code).toBe('MOULD_DONE');
          expect(res.body.history.at(-1)).toMatchObject({
            action: 'RETURN_TO_STAGE',
            fromStage: 'CONTOURING',
            toStage: 'MOULD_DONE',
            summary:
              'Returned from Contouring to Mould done by the consultant. Reason: The CT needs repeating.',
          });
        });
      const told = (await kinds(radiographer, 'K-4')).filter((n) => n.kind === 'SENT_BACK');
      expect(told).toHaveLength(1);
      expect(told[0]!.message).toContain('Reason: The CT needs repeating.');
    });

    it('refuses a stage that is not earlier, and is not offered once treatment has started', async () => {
      const chart = await chartInContouring('K-5');
      const refused = await control(s.consultant, 'K-5', 'RETURN_TO_STAGE', chart.version, {
        stage: 'PLAN_APPROVED',
        reason: 'x',
      }).expect(400);
      expect(refused.body.code).toBe('VALIDATION_FAILED');

      const treating = await chartInTreatment(s, 'K-6');
      expect(
        (await s.chart(s.consultant, 'K-6')).controls.map((c: { action: string }) => c.action),
      ).toEqual(['DISCONTINUE_CHART']);
      await control(s.consultant, 'K-6', 'RETURN_TO_STAGE', treating.version, {
        stage: 'CONTOURING',
        reason: 'x',
      }).expect(409);
    });
  });

  describe('discontinuing and reopening', () => {
    it('stops the chart, tells who it was waiting for, and takes no more steps', async () => {
      const chart = await chartInContouring('K-7');
      const stopped = (
        await control(s.consultant, 'K-7', 'DISCONTINUE_CHART', chart.version, {
          reason: 'Patient chose treatment elsewhere.',
        }).expect(200)
      ).body;
      expect(stopped.status).toBe('DISCONTINUED');
      expect(stopped.availableActions).toEqual([]);
      expect(stopped.history.at(-1).summary).toBe(
        'Chart discontinued. Reason: Patient chose treatment elsewhere.',
      );
      // The resident it was waiting for, and the other consultant; not the one who did it.
      expect((await kinds(junior, 'K-7')).map((n) => n.kind)).toContain('DISCONTINUED');
      expect((await kinds(secondConsultant, 'K-7')).map((n) => n.kind)).toContain('DISCONTINUED');
      expect((await kinds(s.consultant, 'K-7')).map((n) => n.kind)).not.toContain('DISCONTINUED');

      const refused = await s
        .act(junior, 'K-7', 'SUBMIT_CONTOURING', stopped.version, {})
        .expect(409);
      expect(refused.body).toMatchObject({
        code: 'CHART_CLOSED',
        message: 'This chart was discontinued, so no more steps can be recorded.',
      });
      expect(
        (await s.chart(s.consultant, 'K-7')).controls.map((c: { action: string }) => c.action),
      ).toEqual(['REOPEN_CHART']);
      const queue = (await s.as(junior).get('/charts/queue').expect(200)).body;
      expect(queue.items.find((i: { rtNumber: string }) => i.rtNumber === 'K-7')).toBeUndefined();
    });

    it('reopens it at the stage it was stopped at, and tells who it waits for', async () => {
      const chart = await chartInContouring('K-8');
      const stopped = (
        await control(s.consultant, 'K-8', 'DISCONTINUE_CHART', chart.version, {
          reason: 'Pause.',
        }).expect(200)
      ).body;
      const reopened = (
        await control(s.consultant, 'K-8', 'REOPEN_CHART', stopped.version, {
          reason: 'Patient came back.',
        }).expect(200)
      ).body;
      expect(reopened.status).toBe('OPEN');
      expect(reopened.stage.code).toBe('CONTOURING');
      expect(reopened.history.at(-1).summary).toBe(
        'Chart reopened at Contouring. Reason: Patient came back.',
      );
      expect((await kinds(junior, 'K-8')).map((n) => n.kind)).toContain('YOUR_TURN');
      await s.act(junior, 'K-8', 'SUBMIT_CONTOURING', reopened.version, {}).expect(200);
    });

    it('does not offer to discontinue a chart that has ended, or reopen one that is open', async () => {
      const chart = await chartInContouring('K-9');
      await control(s.consultant, 'K-9', 'REOPEN_CHART', chart.version, { reason: 'x' }).expect(
        409,
      );
      await s.test.db.query("UPDATE rt_charts SET status = 'CLOSED' WHERE display_number = 'K-9'");
      expect((await s.chart(s.consultant, 'K-9')).controls).toEqual([]);
    });
  });

  it('refuses a stale version and records a repeated request once', async () => {
    const chart = await chartInContouring('K-10');
    const stale = await control(s.consultant, 'K-10', 'DISCONTINUE_CHART', chart.version + 5, {
      reason: 'x',
    }).expect(409);
    expect(stale.body.code).toBe('CHART_CHANGED');

    const key = randomUUID();
    const first = await s
      .act(s.consultant, 'K-10', 'DISCONTINUE_CHART', chart.version, { reason: 'Stopped.' }, key)
      .expect(200);
    const again = await s
      .act(s.consultant, 'K-10', 'DISCONTINUE_CHART', chart.version, { reason: 'Stopped.' }, key)
      .expect(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.version).toBe(first.body.version);
    const audit = await s.test.db.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'CHART_DISCONTINUED' AND chart_id = $1`,
      [first.body.id],
    );
    expect(audit.rows[0]).toEqual({ n: 1 });
  });
});
