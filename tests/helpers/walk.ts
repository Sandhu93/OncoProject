import { istToday, type WorkflowApp } from './workflow-app.js';

/** A chart issued by the consultant and moved, by the right people, up to the stage "CT Sim done". */
const withRole = (s: WorkflowApp, role: string) => {
  const person = [...s.people.values()].find((p) => p.roles.includes(role as never));
  if (!person) throw new Error(`Sign in a ${role} first.`);
  return person;
};

export async function chartAtCtSimDone(s: WorkflowApp, rtNumber: string) {
  const radiographer = withRole(s, 'RADIOGRAPHER');
  await s.issueChart(rtNumber);
  let chart = await s.chart(radiographer, rtNumber);
  const steps: [string, object][] = [
    [
      'GIVE_SIMULATION_DATES',
      {
        mouldDate: istToday(1),
        mouldTime: '10:00',
        ctDate: istToday(3),
        ctTime: '11:00',
      },
    ],
    ['RECORD_MOULD_DONE', { mouldDoneOn: istToday() }],
    ['RECORD_CT_SIM_DONE', { ctDoneOn: istToday(), ctRef: 'CT-1' }],
  ];
  for (const [action, values] of steps) {
    chart = (await s.act(radiographer, rtNumber, action, chart.version, values).expect(200)).body;
  }
  return chart;
}

/** On to "Physics planning": the first junior resident contours, the senior resident verifies, the consultant approves. */
export async function chartAtPhysicsPlanning(s: WorkflowApp, rtNumber: string) {
  let chart = await chartAtCtSimDone(s, rtNumber);
  const resident = withRole(s, 'JUNIOR_RESIDENT');
  const senior = withRole(s, 'SENIOR_RESIDENT');
  const steps: [{ token: string }, string, object][] = [
    [s.consultant, 'ASSIGN_CONTOURING', { resident: resident.id, contourDue: istToday(3) }],
    [resident, 'SUBMIT_CONTOURING', { contourRef: 'C-1' }],
    [senior, 'VERIFY_CONTOURING', {}],
    [s.consultant, 'APPROVE_CONTOURING', {}],
  ];
  for (const [who, action, values] of steps) {
    chart = (await s.act(who, rtNumber, action, chart.version, values).expect(200)).body;
  }
  return chart;
}

/** On to "Plan approved". */
export async function chartAtPlanApproved(s: WorkflowApp, rtNumber: string) {
  let chart = await chartAtPhysicsPlanning(s, rtNumber);
  const physicist = withRole(s, 'PHYSICIST');
  chart = (
    await s.act(physicist, rtNumber, 'SUBMIT_PLAN', chart.version, { planId: 'PLAN-1' }).expect(200)
  ).body;
  chart = (
    await s
      .act(s.consultant, rtNumber, 'APPROVE_PLAN', chart.version, { approvedBy: 'Consultant' })
      .expect(200)
  ).body;
  return chart;
}
