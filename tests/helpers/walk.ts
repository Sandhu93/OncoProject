import { istToday, type WorkflowApp } from './workflow-app.js';

/** A chart issued by the consultant and moved, by the right people, up to the stage "CT Sim done". */
export async function chartAtCtSimDone(s: WorkflowApp, rtNumber: string) {
  const radiographer = Object.values(Object.fromEntries(s.people)).find((p) =>
    p.roles.includes('RADIOGRAPHER'),
  );
  if (!radiographer) throw new Error('Sign in a radiographer first.');
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
