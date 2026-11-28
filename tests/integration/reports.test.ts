import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { ReportsView } from '@oncotrack/contracts';
import { addStaff } from '../helpers/test-database.js';
import { istToday, startWorkflowApp, type WorkflowApp } from '../helpers/workflow-app.js';
import { chartInTreatment } from '../helpers/walk.js';

const binary = (res: NodeJS.ReadableStream, done: (error: Error | null, body: Buffer) => void) => {
  const parts: Buffer[] = [];
  res.on('data', (part: Buffer) => parts.push(part));
  res.on('end', () => done(null, Buffer.concat(parts)));
};

describe('REP-010 reports', () => {
  let s: WorkflowApp;
  let reader: { id: string; token: string };

  const report = async (query = ''): Promise<ReportsView> =>
    (await s.as(reader).get(`/reports${query}`).expect(200)).body;

  /** Moves a chart's history, and the time it has been in its stage, back in time. The history is immutable, so only a test does this. */
  const backdate = async (
    rt: string,
    daysAgoByVersion: Record<number, number>,
    stageSince?: number,
  ) => {
    await s.test.db.query('ALTER TABLE chart_stage_history DISABLE TRIGGER immutable_history');
    for (const [version, days] of Object.entries(daysAgoByVersion)) {
      await s.test.db.query(
        `UPDATE chart_stage_history h SET occurred_at = now() - ($3::int * interval '1 day')
           FROM rt_charts c WHERE c.id = h.chart_id AND c.display_number = $1 AND h.chart_version = $2`,
        [rt, Number(version), days],
      );
    }
    await s.test.db.query('ALTER TABLE chart_stage_history ENABLE TRIGGER immutable_history');
    if (stageSince !== undefined) {
      await s.test.db.query(
        `UPDATE rt_charts SET current_stage_since = now() - ($2::int * interval '1 day') WHERE display_number = $1`,
        [rt, stageSince],
      );
    }
  };

  const giveDates = async (rt: string) => {
    const chart = await s.chart(s.consultant, rt);
    const radiographer = [...s.people.values()].find((p) => p.roles.includes('RADIOGRAPHER'))!;
    await s
      .act(radiographer, rt, 'GIVE_SIMULATION_DATES', chart.version, {
        mouldDate: istToday(1),
        mouldTime: '10:00',
        ctDate: istToday(3),
        ctTime: '11:00',
      })
      .expect(200);
  };

  beforeAll(async () => {
    s = await startWorkflowApp();
    await s.signIn('radiographer', ['RADIOGRAPHER']);
    await s.signIn('resident', ['JUNIOR_RESIDENT']);
    await s.signIn('senior', ['SENIOR_RESIDENT']);
    await s.signIn('physicist', ['PHYSICIST']);
    const staff = await addStaff(s.test.db, {
      roles: ['CONSULTANT'],
      capabilities: ['EXPORT_REPORTS'],
      fullName: 'Report Reader',
    });
    const { body } = await s
      .http()
      .post('/api/v1/auth/login')
      .send({ username: staff.username, password: staff.password })
      .expect(200);
    reader = { id: staff.id, token: body.access_token };
  });
  afterAll(() => s.close());

  it('is only for those who may export reports, in every form', async () => {
    const attempts = [
      () => s.as(s.consultant).get('/reports'),
      () => s.as(s.consultant).get('/reports/export.xlsx'),
      () => s.as(s.consultant).get('/reports/export/waiting'),
    ];
    for (const attempt of attempts) {
      expect((await attempt().expect(403)).body.code).toBe('CAPABILITY_REQUIRED');
    }
    await s.http().get('/api/v1/reports').expect(401);
  });

  it('reads the last 90 days unless told otherwise, and refuses a bad range as a whole', async () => {
    const view = await report();
    expect(view.range).toEqual({ from: istToday(-89), to: istToday() });
    expect(view.stallDays).toBe(3);

    const bad = await s.as(reader).get('/reports?from=2026-13-40&to=nope').expect(400);
    expect(bad.body.details.map((d: { field: string }) => d.field).sort()).toEqual(['from', 'to']);
    expect(
      (await s.as(reader).get('/reports?from=2026-11-10&to=2026-11-01').expect(400)).body.details[0]
        .message,
    ).toMatch(/cannot be after/);
    expect(
      (await s.as(reader).get('/reports?from=2020-01-01&to=2026-11-01').expect(400)).body.details[0]
        .message,
    ).toMatch(/no more than 800 days/);
  });

  it('measures how long charts waited in each stage, and how many are waiting now', async () => {
    await s.issueChart('W-1');
    await giveDates('W-1');
    await backdate('W-1', { 1: 10, 2: 6 }, 6); // waited 4 days to get dates; in the next stage for 6, the other for 7
    await s.issueChart('W-2');
    await giveDates('W-2');
    await backdate('W-2', { 1: 8, 2: 7 }, 7); // waited 1 day

    const { waiting } = await report();
    const issued = waiting.find((row) => row.stage === 'RT_CHART_ISSUED')!;
    expect(issued).toMatchObject({
      stageLabel: 'RT chart issued',
      phase: 'Getting ready',
      finished: 2,
      medianDays: 2.5,
      averageDays: 2.5,
      longestDays: 4,
      ninetiethDays: 3.7,
      waitingNow: 0,
      longestWaitingNowDays: null,
    });
    const dates = waiting.find((row) => row.stage === 'SIMULATION_DATES_GIVEN')!;
    expect(dates).toMatchObject({ finished: 0, medianDays: null, waitingNow: 2 });
    expect(dates.longestWaitingNowDays).toBeGreaterThanOrEqual(7);
    expect(dates.longestWaitingNowDays).toBeLessThan(7.1);
    // Every stage is listed, in workflow order, even with nothing to report.
    expect(waiting).toHaveLength(15);
    expect(waiting[0]!.stage).toBe('RT_CHART_ISSUED');
  });

  it('counts the stays that began in the range, and not those that began before it', async () => {
    const before = await report(`?from=${istToday(-200)}&to=${istToday(-100)}`);
    expect(before.waiting.every((row) => row.finished === 0 && row.medianDays === null)).toBe(true);
    // What is waiting now is waiting now, whatever range is asked for.
    expect(before.waiting.find((row) => row.stage === 'SIMULATION_DATES_GIVEN')!.waitingNow).toBe(
      2,
    );
  });

  it('does not count the last stay of a chart that was stopped as a wait', async () => {
    await s.issueChart('W-3');
    await backdate('W-3', { 1: 20 }, 20);
    expect(
      (await report()).waiting.find((row) => row.stage === 'RT_CHART_ISSUED')!.waitingNow,
    ).toBe(1);
    await s.test.db.query(
      "UPDATE rt_charts SET status = 'DISCONTINUED' WHERE display_number = 'W-3'",
    );
    expect(
      (await report()).waiting.find((row) => row.stage === 'RT_CHART_ISSUED')!.waitingNow,
    ).toBe(0);
  });

  it('lists stalled charts, longest first, with what each is waiting for and never treatment', async () => {
    await s.issueChart('S-FRESH');
    await chartInTreatment(s, 'S-TREAT');
    await backdate('S-TREAT', {}, 40);

    const { stalled } = await report();
    expect(stalled.map((row) => row.rtNumber)).toEqual(['W-2', 'W-1']);
    expect(stalled[1]).toEqual({
      rtNumber: 'W-1',
      stage: 'SIMULATION_DATES_GIVEN',
      stageLabel: 'Dates given',
      phase: 'Getting ready',
      daysInStage: 6,
      priority: 'ROUTINE',
      waitingFor: 'Waiting for the patient to attend the mould appointment',
      owner: 'Radiographer',
      assignedTo: null,
    });
    expect(stalled.some((row) => row.rtNumber === 'S-FRESH' || row.rtNumber === 'S-TREAT')).toBe(
      false,
    );
  });

  it('summarises treatment that started in the range: in treatment, finished, short and stopped', async () => {
    await chartInTreatment(s, 'T-FINISHED');
    await chartInTreatment(s, 'T-STOPPED');
    // T-FINISHED: 28 days, 20 of 25 sessions. T-STOPPED stopped part-way.
    await s.test.db.query(
      `UPDATE rt_charts SET data = data || $2::jsonb WHERE display_number = $1`,
      [
        'T-FINISHED',
        JSON.stringify({ startOn: istToday(-27), completeOn: istToday(), sessionsFinal: '20' }),
      ],
    );
    await s.test.db.query(
      `UPDATE rt_charts SET status = 'DISCONTINUED', data = data || $2::jsonb WHERE display_number = $1`,
      ['T-STOPPED', JSON.stringify({ sessionsDone: '5' })],
    );

    const { treatment } = await report();
    expect(treatment.summary).toEqual({
      started: 3,
      inTreatment: 1,
      finished: 1,
      stopped: 1,
      finishedShort: 1,
      averageDaysTaken: 28,
      sessionsGivenPercent: 80,
    });
    const finished = treatment.items.find((row) => row.rtNumber === 'T-FINISHED')!;
    expect(finished).toEqual({
      rtNumber: 'T-FINISHED',
      outcome: 'FINISHED',
      startedOn: istToday(-27),
      finishedOn: istToday(),
      daysTaken: 28,
      plannedSessions: 25,
      sessionsGiven: 20,
    });
    expect(treatment.items.find((row) => row.rtNumber === 'T-STOPPED')).toMatchObject({
      outcome: 'STOPPED',
      sessionsGiven: 5,
      finishedOn: null,
      daysTaken: null,
    });
    // A range that does not include the start leaves it out.
    const later = await report(`?from=${istToday(1)}&to=${istToday(30)}`);
    expect(later.treatment.items).toHaveLength(0);
    expect(later.treatment.summary).toMatchObject({
      started: 0,
      averageDaysTaken: null,
      sessionsGivenPercent: null,
    });
  });

  it('downloads all three reports as one workbook', async () => {
    const res = await s
      .as(reader)
      .get('/reports/export.xlsx')
      .buffer(true)
      .parse(binary as never)
      .expect(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="oncotrack-reports-${istToday(-89)}-to-${istToday()}.xlsx"`,
    );
    expect(res.headers['cache-control']).toBe('no-store');

    const files = unzipSync(new Uint8Array(res.body as Buffer));
    const workbook = strFromU8(files['xl/workbook.xml']!);
    for (const name of [
      'About',
      'Waiting time by stage',
      'Stalled charts',
      'Treatment completion',
    ]) {
      expect(workbook).toContain(name);
    }
    const shared = Object.entries(files)
      .filter(([path]) => path.startsWith('xl/') && path.endsWith('.xml'))
      .map(([, bytes]) => strFromU8(bytes))
      .join('');
    expect(shared).toContain('W-1');
    expect(shared).toContain('T-FINISHED');
    // Patients have no names here, but the file also never carries anything but RT numbers for charts.
    expect(shared).not.toContain('hospital_number');
  });

  it('downloads each report as CSV, for the range asked', async () => {
    const stalled = await s.as(reader).get('/reports/export/stalled').expect(200);
    expect(stalled.headers['content-type']).toMatch(/^text\/csv/);
    expect(stalled.headers['content-disposition']).toContain('oncotrack-stalled-charts-');
    expect(stalled.text.startsWith('﻿RT number,Stage,Phase,Days in stage')).toBe(true);
    expect(stalled.text).toContain(
      'W-1,Dates given,Getting ready,6,Routine,Waiting for the patient to attend the mould appointment,Radiographer,',
    );

    const waiting = await s.as(reader).get('/reports/export/waiting').expect(200);
    expect(waiting.text.split('\r\n')).toHaveLength(15 + 2);
    const treatment = await s
      .as(reader)
      .get(`/reports/export/treatment?from=${istToday(1)}&to=${istToday(2)}`)
      .expect(200);
    expect(treatment.text.split('\r\n')).toHaveLength(2);

    expect((await s.as(reader).get('/reports/export/everything').expect(404)).body.code).toBe(
      'NO_SUCH_REPORT',
    );
    await s.as(reader).get('/reports/export/waiting?from=bad').expect(400);
  });
});
