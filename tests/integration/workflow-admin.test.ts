import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkflowDraft } from '@oncotrack/contracts';
import { addStaff } from '../helpers/test-database.js';
import { startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';

type Person = Awaited<ReturnType<WorkflowApp['signIn']>>;

describe('WFA-010 changing the workflow from the app', () => {
  let s: WorkflowApp;
  let editor: { id: string; token: string };
  let senior: Person;
  let radiographer: Person;

  beforeAll(async () => {
    s = await startWorkflowApp();
    const staff = await addStaff(s.test.db, {
      roles: ['CONSULTANT'],
      capabilities: ['CONFIGURE_WORKFLOW'],
      fullName: 'Workflow Editor',
    });
    const { body } = await s
      .http()
      .post('/api/v1/auth/login')
      .send({ username: staff.username, password: staff.password })
      .expect(200);
    editor = { id: staff.id, token: body.access_token };
    senior = await s.signIn('senior', ['SENIOR_RESIDENT']);
    radiographer = await s.signIn('radiographer', ['RADIOGRAPHER']);
  });
  afterAll(() => s.close());

  const draft = async (): Promise<WorkflowDraft | null> =>
    (await s.as(editor).get('/admin/workflow/draft').expect(200)).body.draft;
  const edit = (body: object) => s.as(editor).post('/admin/workflow/draft/edit', body);
  const create = () => s.as(editor).post('/admin/workflow/draft', {});
  const approve = () => s.as(editor).post('/admin/workflow/draft/approve', {});
  const discard = () => s.as(editor).post('/admin/workflow/draft/discard', {});
  const active = async () =>
    (await s.as(radiographer).get('/admin/workflow').expect(200)).body.workflow;

  it('is only for those who may configure the workflow', async () => {
    const attempts = [
      () => s.as(s.consultant).get('/admin/workflow/draft'),
      () => s.as(radiographer).post('/admin/workflow/draft', {}),
      () => s.as(radiographer).post('/admin/workflow/draft/edit', {}),
      () => s.as(radiographer).post('/admin/workflow/draft/discard', {}),
      () => s.as(radiographer).post('/admin/workflow/draft/approve', {}),
    ];
    for (const attempt of attempts) {
      expect((await attempt().expect(403)).body.code).toBe('CAPABILITY_REQUIRED');
    }
  });

  it('starts with no draft, and nothing to edit, discard or approve', async () => {
    expect(await draft()).toBeNull();
    await edit({ label: 'x' }).expect(404);
    await discard().expect(404);
    await approve().expect(404);
  });

  it('starts a draft as a copy of the workflow in use, and only one at a time', async () => {
    const made = (await create().expect(201)).body as WorkflowDraft;
    expect(made).toMatchObject({
      code: 'RT_PROPOSED',
      version: 2,
      replacesVersion: 1,
      status: 'DRAFT',
      changes: [],
    });
    expect(made.stages).toHaveLength(15);
    expect(made.steps).toHaveLength(17);
    expect(made.steps.find((step) => step.action === 'POST_FINAL_UPDATE')!.roles).toEqual([
      'JUNIOR_RESIDENT',
      'RADIOGRAPHER',
    ]);
    expect((await create().expect(409)).body.code).toBe('DRAFT_EXISTS');
    // The workflow in use is untouched.
    expect(await active()).toMatchObject({ version: 1, status: 'ACTIVE' });
  });

  it('will not approve a draft that changes nothing', async () => {
    expect((await approve().expect(409)).body.code).toBe('NO_CHANGES');
  });

  it('refuses a bad change as a whole, naming each problem, and keeps the draft as it was', async () => {
    const refused = await edit({
      label: '',
      stages: [
        { code: 'NO_SUCH_STAGE', label: 'x' },
        { code: 'MOULD_DONE', label: '' },
        { code: 'CT_SIM_DONE', label: 'mould done' },
        { code: 'MOULD_DONE', weeklyUpdateRoles: ['RADIOGRAPHER'] },
        { code: 'TREATMENT_IN_PROGRESS', weeklyUpdateRoles: [] },
      ],
      steps: [
        { from: 'RT_CHART_ISSUED', action: 'NO_SUCH_STEP', roles: ['RADIOGRAPHER'] },
        { from: 'RT_CHART_ISSUED', action: 'GIVE_SIMULATION_DATES', roles: [] },
        { from: 'RT_CHART_ISSUED', action: 'GIVE_SIMULATION_DATES', roles: ['WIZARD'] },
      ],
    }).expect(400);
    const fields = refused.body.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'label',
        'stages.0',
        'stages.1.label',
        'stages.3.weeklyUpdateRoles',
        'stages.4.weeklyUpdateRoles',
        'steps.0',
        'steps.1.roles',
        'steps.2.roles',
      ]),
    );
    expect((await draft())!.changes).toEqual([]);

    const duplicate = await edit({
      stages: [{ code: 'CT_SIM_DONE', label: 'mould done' }],
    }).expect(400);
    expect(duplicate.body.details[0].message).toMatch(/Two stages cannot both be called/);
  });

  it('changes names, who may do a step and who posts Saturday updates, and says what differs', async () => {
    const changed = (
      await edit({
        label: 'RT workflow, revised',
        stages: [
          { code: 'SIMULATION_DATES_GIVEN', label: 'Appointments booked' },
          { code: 'TREATMENT_IN_PROGRESS', weeklyUpdateRoles: ['JUNIOR_RESIDENT'] },
        ],
        steps: [
          {
            from: 'RT_CHART_ISSUED',
            action: 'GIVE_SIMULATION_DATES',
            roles: ['SENIOR_RESIDENT', 'RADIOGRAPHER'],
          },
        ],
      }).expect(200)
    ).body as WorkflowDraft;

    expect(changed.label).toBe('RT workflow, revised');
    expect(changed.stages.find((stage) => stage.code === 'SIMULATION_DATES_GIVEN')!.label).toBe(
      'Appointments booked',
    );
    expect(changed.steps.find((step) => step.action === 'GIVE_SIMULATION_DATES')!.roles).toEqual([
      'RADIOGRAPHER',
      'SENIOR_RESIDENT',
    ]);
    expect(changed.changes).toEqual([
      expect.stringContaining('renamed from'),
      expect.stringContaining('"Dates given" is now called "Appointments booked"'),
      expect.stringContaining(
        'Saturday updates at "Treatment in progress" will come from the junior resident (now the junior resident and radiographer)',
      ),
      expect.stringContaining(
        'can be done by the radiographer and senior resident (now the radiographer)',
      ),
    ]);
    // Still not in use.
    expect(await active()).toMatchObject({
      version: 1,
      label: expect.not.stringContaining('revised'),
    });
  });

  it('can be thrown away, and a new draft starts again from what is in use', async () => {
    await discard().expect(200);
    expect(await draft()).toBeNull();
    const rows = await s.test.db.query("SELECT 1 FROM workflow_versions WHERE status = 'DRAFT'");
    expect(rows.rows).toHaveLength(0);
    const again = (await create().expect(201)).body as WorkflowDraft;
    expect(again.version).toBe(2);
    expect(again.changes).toEqual([]);
    await edit({
      label: 'RT workflow, revised',
      stages: [{ code: 'SIMULATION_DATES_GIVEN', label: 'Appointments booked' }],
      steps: [
        {
          from: 'RT_CHART_ISSUED',
          action: 'GIVE_SIMULATION_DATES',
          roles: ['SENIOR_RESIDENT', 'RADIOGRAPHER'],
        },
      ],
    }).expect(200);
  });

  it('approving makes new charts use it, while a chart already running finishes on the old one', async () => {
    const before = await s.issueChart('OLD-1');
    const oldChart = await s.chart(s.consultant, before);
    expect(
      (await s.chart(senior, before)).availableActions.map((a: { action: string }) => a.action),
    ).toEqual([]);

    const approved = (await approve().expect(200)).body;
    expect(approved.version).toBe(2);
    expect(approved.changes.length).toBeGreaterThan(0);

    const now = await active();
    expect(now).toMatchObject({
      version: 2,
      label: 'RT workflow, revised',
      approvedBy: 'Workflow Editor',
    });
    const states = await s.test.db.query<{ version: number; status: string }>(
      "SELECT version, status FROM workflow_versions WHERE code = 'RT_PROPOSED' ORDER BY version",
    );
    expect(states.rows).toEqual([
      { version: 1, status: 'RETIRED' },
      { version: 2, status: 'ACTIVE' },
    ]);

    // The chart that was already running is unchanged: same stage name, same people.
    const stillOld = await s.chart(senior, before);
    expect(stillOld.availableActions).toEqual([]);
    expect(oldChart.stage.code).toBe(stillOld.stage.code);

    // A chart issued now uses the new one: the senior resident may give the dates, and the stage names changed.
    const fresh = await s.issueChart('NEW-1');
    const newOffer = (await s.chart(senior, fresh)).availableActions.map(
      (a: { action: string }) => a.action,
    );
    expect(newOffer).toEqual(['GIVE_SIMULATION_DATES']);
    const gave = await s
      .act(senior, fresh, 'GIVE_SIMULATION_DATES', 1, {
        mouldDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        mouldTime: '10:00',
        ctDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
        ctTime: '11:00',
      })
      .expect(200);
    expect(gave.body.stage.label).toBe('Appointments booked');
    // The old chart still shows its original name for the same stage code.
    await s
      .act(radiographer, before, 'GIVE_SIMULATION_DATES', 1, {
        mouldDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        mouldTime: '10:00',
        ctDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
        ctTime: '11:00',
      })
      .expect(200);
    expect((await s.chart(s.consultant, before)).stage.label).toBe('Dates given');
  });

  it('records each step in the audit trail, with what changed', async () => {
    const trail = await s.test.db.query<{
      action: string;
      after_values: { changes?: string[] } | null;
    }>(
      "SELECT action, after_values FROM audit_events WHERE entity_type = 'WORKFLOW_VERSION' ORDER BY occurred_at, id",
    );
    expect(trail.rows.map((row) => row.action)).toEqual([
      'WORKFLOW_DRAFT_CREATED',
      'WORKFLOW_DRAFT_UPDATED',
      'WORKFLOW_DRAFT_DISCARDED',
      'WORKFLOW_DRAFT_CREATED',
      'WORKFLOW_DRAFT_UPDATED',
      'WORKFLOW_APPROVED',
    ]);
    expect(trail.rows.at(-1)!.after_values!.changes!.length).toBeGreaterThan(0);
  });

  it('cannot start a draft when nothing is in use to copy', async () => {
    await s.test.db.query(
      "UPDATE workflow_versions SET status = 'RETIRED' WHERE status = 'ACTIVE'",
    );
    expect((await create().expect(409)).body.code).toBe('NO_ACTIVE_WORKFLOW');
    expect(randomUUID()).toBeTruthy();
  });
});
