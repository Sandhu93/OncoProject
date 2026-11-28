import type { APIRequestContext } from '@playwright/test';

/**
 * Drives the real API directly, so a browser test can start from a chart that is already part-way through the
 * workflow instead of clicking through every earlier step.
 */
const API = 'http://127.0.0.1:4020/api/v1';
const PASSWORD = 'correct horse battery';

export const istDay = (offset = 0): string => {
  const base = new Date(Date.now() + offset * 86_400_000);

  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(base);
};

const tokens = new Map<string, string>();

const tokenFor = async (request: APIRequestContext, username: string) => {
  const known = tokens.get(username);

  if (known) return known;

  const response = await request.post(`${API}/auth/login`, { data: { username, password: PASSWORD } });
  const token = ((await response.json()) as { access_token: string }).access_token;

  tokens.set(username, token);

  return token;
};

export const apiAs = async (request: APIRequestContext, username: string) => {
  const headers = { Authorization: `Bearer ${await tokenFor(request, username)}` };

  return {
    get: async (path: string) => (await request.get(`${API}${path}`, { headers })).json(),
    post: async (path: string, data: object) => {
      const response = await request.post(`${API}${path}`, {
        headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
        data,
      });

      if (!response.ok()) throw new Error(`${path} -> ${response.status()} ${await response.text()}`);

      return response.json();
    },
  };
};

/** One workflow step through the API, as the named account; reads the chart's version first. */
export const step = async (
  request: APIRequestContext,
  username: string,
  rtNumber: string,
  action: string,
  values: Record<string, string> = {},
) => {
  const api = await apiAs(request, username);
  const chart = await api.get(`/charts/by-number/${encodeURIComponent(rtNumber)}`);

  return api.post(`/charts/by-number/${encodeURIComponent(rtNumber)}/actions/${action}`, {
    expectedVersion: chart.version,
    values,
  });
};

/** Issues a chart and has the radiographer do the three getting-ready steps. It ends at "CT Sim done". */
export const chartAtCtSimDone = async (request: APIRequestContext, rtNumber: string) => {
  await (await apiAs(request, 'real.consultant')).post('/charts', { rtNumber, plannedSessions: 20 });
  await step(request, 'real.radiographer', rtNumber, 'GIVE_SIMULATION_DATES', {
    mouldDate: istDay(1),
    mouldTime: '10:00',
    ctDate: istDay(3),
    ctTime: '11:00',
  });
  await step(request, 'real.radiographer', rtNumber, 'RECORD_MOULD_DONE', { mouldDoneOn: istDay() });
  await step(request, 'real.radiographer', rtNumber, 'RECORD_CT_SIM_DONE', { ctDoneOn: istDay() });
};

/** On to "Physics planning": assigned to Real Junior Anand, submitted, verified and approved. */
export const chartAtPhysicsPlanning = async (request: APIRequestContext, rtNumber: string) => {
  await chartAtCtSimDone(request, rtNumber);

  const consultant = await apiAs(request, 'real.consultant');
  const staff = await consultant.get('/charts/by-number/' + encodeURIComponent(rtNumber));
  const resident = (
    staff.availableActions[0].fields.find((field: { key: string }) => field.key === 'resident') as {
      options: { value: string; label: string }[];
    }
  ).options.find(option => option.label === 'Real Junior Anand')!.value;

  await step(request, 'real.consultant', rtNumber, 'ASSIGN_CONTOURING', { resident, contourDue: istDay(3) });
  await step(request, 'real.junior', rtNumber, 'SUBMIT_CONTOURING', { contourRef: 'C-1' });
  await step(request, 'real.senior', rtNumber, 'VERIFY_CONTOURING');
  await step(request, 'real.consultant', rtNumber, 'APPROVE_CONTOURING');
};

/** On to "Plan approved". */
export const chartAtPlanApproved = async (request: APIRequestContext, rtNumber: string) => {
  await chartAtPhysicsPlanning(request, rtNumber);
  await step(request, 'real.physicist', rtNumber, 'SUBMIT_PLAN', { planId: 'PLAN-1' });
  await step(request, 'real.consultant', rtNumber, 'APPROVE_PLAN', { approvedBy: 'Consultant' });
};

let slot = 30;

/** On to "Plan on LINAC", with a first treatment slot of its own. */
export const chartAtPlanOnLinac = async (request: APIRequestContext, rtNumber: string) => {
  await chartAtPlanApproved(request, rtNumber);
  await step(request, 'real.physicist', rtNumber, 'SEND_PLAN_TO_LINAC', {
    linacMachine: 'LINAC 2',
    firstSlotDate: istDay(slot++),
    firstSlotTime: '08:00',
  });
};
