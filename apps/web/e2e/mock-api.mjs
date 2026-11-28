/**
 * A stand-in for the OncoTrack API, started by playwright.config.ts so the browser tests can log in
 * without PostgreSQL. It copies the real API's responses (apps/api/src/auth, docs/api/openapi.yaml).
 * Synthetic data only.
 *
 * POST /api/v1/auth/login  { username, password }
 *     200 { access_token, token_type, expires_in }  for the password in VALID_PASSWORD
 *     429 for the user "locked.user", 401 { message } otherwise
 * POST /api/v1/auth/logout  Bearer token  ->  204, and the token stops working
 * GET  /api/v1/auth/me      Bearer token  ->  200 profile, 401 for an unknown or revoked token
 * GET  /api/v1/charts?q&status&limit&offset   Bearer token -> { items, total }, urgent first then longest wait
 * GET  /api/v1/charts/by-number/:rtNumber     -> chart with history, 404 CHART_NOT_FOUND
 * GET  /api/v1/charts/queue                   -> every OPEN chart as a queue item; STEP-1/STEP-2 need the signed-in person
 * POST /api/v1/charts   Idempotency-Key       -> 201 chart; 403 for the token "resident-token" (not a consultant);
 *     400 VALIDATION_FAILED, 409 RT_NUMBER_EXISTS, 409 WORKFLOW_NOT_ACTIVE for the RT number "NOWORKFLOW"
 * POST /api/v1/charts/by-number/:rtNumber/actions/GIVE_SIMULATION_DATES   Idempotency-Key { expectedVersion, values }
 *     -> 200 chart at "Dates given"; 400 VALIDATION_FAILED when the mould date is empty; 409 CHART_CHANGED for
 *     the chart "CHANGED-1"; 403 for "resident-token". Only charts at "RT chart issued" offer this step.
 * POST /api/v1/charts/by-number/:rtNumber/comments   Idempotency-Key { body, forRole? } -> 201 chart with the comment added;
 *     400 VALIDATION_FAILED when the comment is empty
 * GET  /api/v1/admin/staff                 -> { items }; POST creates (400 VALIDATION_FAILED, 409 USERNAME_TAKEN);
 *     POST /admin/staff/:id changes one (409 CANNOT_SWITCH_OFF_SELF for the signed-in person); POST /admin/staff/:id/password
 * GET  /api/v1/admin/workflow, /api/v1/admin/audit?rt&action&person&from&to&limit&offset
 * GET  /api/v1/reports?from&to, /reports/export.xlsx, /reports/export/:name (EXPORT_REPORTS)
 * GET/POST /api/v1/admin/workflow/draft, POST .../draft/edit|discard|approve (CONFIGURE_WORKFLOW)
 *     (403 CAPABILITY_REQUIRED for the token "resident-token")
 * GET  /revoked-tokens                    ->  tokens revoked so far, for assertions
 */
import { createServer } from 'node:http';

export const MOCK_API_PORT = Number(process.env.MOCK_API_PORT ?? 4010);
export const VALID_PASSWORD = 'correct horse battery';

const PROFILE = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'synthetic.consultant',
  fullName: 'Synthetic Consultant',
  roles: ['CONSULTANT'],
  capabilities: ['MANAGE_STAFF', 'VIEW_AUDIT', 'CONFIGURE_WORKFLOW', 'EXPORT_REPORTS'],
};

const readJson = async request => {
  let body = '';

  for await (const chunk of request) body += chunk;

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const send = (response, status, data) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
};

const RESIDENT_PROFILE = {
  id: '00000000-0000-4000-8000-000000000002',
  username: 'synthetic.resident',
  fullName: 'Synthetic Resident',
  roles: ['JUNIOR_RESIDENT'],
  capabilities: [],
};

const profileFor = token => (token === 'resident-token' ? RESIDENT_PROFILE : PROFILE);

const STAGES = {
  CONTOURING: {
    stage: { code: 'CONTOURING', label: 'Contouring' },
    phase: 'Contouring',
    waitingFor: 'a junior resident to submit the contours',
    ownerRole: 'JUNIOR_RESIDENT',
  },
  RT_CHART_ISSUED: {
    stage: { code: 'RT_CHART_ISSUED', label: 'RT chart issued' },
    phase: 'Getting ready',
    waitingFor: 'the radiographer to give mould and CT Sim dates',
    ownerRole: 'RADIOGRAPHER',
  },
  SIMULATION_DATES_GIVEN: {
    stage: { code: 'SIMULATION_DATES_GIVEN', label: 'Dates given' },
    phase: 'Getting ready',
    waitingFor: 'the patient to attend the mould appointment',
    ownerRole: 'RADIOGRAPHER',
  },
};
const minutesAgo = minutes => new Date(Date.now() - minutes * 60_000).toISOString();

const makeChart = (rtNumber, change = {}) => {
  const minutesInStage = change.minutesInStage ?? 10;

  return {
    id: `chart-${rtNumber}`,
    rtNumber,
    ...STAGES[change.stageCode ?? 'CONTOURING'],
    stageSince: minutesAgo(minutesInStage),
    minutesInStage,
    status: 'OPEN',
    version: 1,
    plannedSessions: 25,
    priority: 'ROUTINE',
    planId: null,
    contourSetName: null,
    scanReference: null,
    issuedBy: 'Synthetic Consultant',
    createdAt: minutesAgo(minutesInStage),
    ...change,
    stageCode: undefined,
  };
};

const staffMembers = new Map(
  [
    {
      ...PROFILE,
      identityProvider: 'LOCAL',
      isActive: true,
      isAvailable: true,
      createdAt: minutesAgo(5000),
      lastLoginAt: minutesAgo(10),
      canDelete: false,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      username: 'synthetic.resident',
      fullName: 'Synthetic Resident',
      roles: ['JUNIOR_RESIDENT'],
      capabilities: [],
      identityProvider: 'LOCAL',
      isActive: true,
      isAvailable: true,
      createdAt: minutesAgo(5000),
      lastLoginAt: null,
      canDelete: true,
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      username: 'synthetic.directory',
      fullName: 'Synthetic Directory User',
      roles: ['PHYSICIST'],
      capabilities: [],
      identityProvider: 'DIRECTORY',
      isActive: true,
      isAvailable: true,
      createdAt: minutesAgo(5000),
      lastLoginAt: null,
      canDelete: false,
    },
  ].map(member => [member.id, member]),
);

const stageOf = (code, label, position, extra = {}) => ({
  code,
  label,
  phase: 'Getting ready',
  position,
  isInitial: false,
  isTerminal: false,
  weeklyUpdateRoles: [],
  ...extra,
});

const WORKFLOW = {
  code: 'RT_PROPOSED',
  version: 1,
  label: 'RT workflow (proposed)',
  status: 'ACTIVE',
  approvedBy: 'Synthetic Consultant',
  approvedAt: '2026-11-01T05:30:00.000Z',
  stages: [
    stageOf('RT_CHART_ISSUED', 'RT chart issued', 1, { isInitial: true }),
    stageOf('SIMULATION_DATES_GIVEN', 'Dates given', 2),
    stageOf('TREATMENT_STARTED', 'Treatment started', 3, {
      phase: 'Treatment',
      weeklyUpdateRoles: ['JUNIOR_RESIDENT', 'RADIOGRAPHER'],
    }),
    stageOf('TRACKING_ENDED', 'Tracking ended', 4, { phase: 'Finished', isTerminal: true }),
  ],
  transitions: [
    {
      from: 'RT_CHART_ISSUED',
      fromLabel: 'RT chart issued',
      action: 'GIVE_SIMULATION_DATES',
      actionLabel: 'Give mould and CT Sim dates',
      role: 'RADIOGRAPHER',
      to: 'SIMULATION_DATES_GIVEN',
      toLabel: 'Dates given',
      requiresReason: false,
      requiresAssignment: false,
    },
    {
      from: 'SIMULATION_DATES_GIVEN',
      fromLabel: 'Dates given',
      action: 'START_TREATMENT',
      actionLabel: 'Start treatment',
      role: 'RADIOGRAPHER',
      to: 'TREATMENT_STARTED',
      toLabel: 'Treatment started',
      requiresReason: false,
      requiresAssignment: false,
    },
  ],
};

const REPORTS = {
  range: { from: '2026-09-01', to: '2026-11-28' },
  stallDays: 3,
  generatedAt: '2026-11-28T10:00:00.000Z',
  waiting: [
    {
      stage: 'RT_CHART_ISSUED',
      stageLabel: 'RT chart issued',
      phase: 'Getting ready',
      finished: 12,
      medianDays: 2.5,
      averageDays: 3.1,
      ninetiethDays: 6.2,
      longestDays: 9,
      waitingNow: 2,
      longestWaitingNowDays: 4.5,
    },
    {
      stage: 'CONTOURING',
      stageLabel: 'Contouring',
      phase: 'Contouring',
      finished: 0,
      medianDays: null,
      averageDays: null,
      ninetiethDays: null,
      longestDays: null,
      waitingNow: 0,
      longestWaitingNowDays: null,
    },
  ],
  stalled: [
    {
      rtNumber: 'SEED-004',
      stage: 'CONTOURING',
      stageLabel: 'Contouring',
      phase: 'Contouring',
      daysInStage: 7,
      priority: 'URGENT',
      waitingFor: 'Waiting for the assigned junior resident to submit contouring',
      owner: 'Junior resident',
      assignedTo: 'Synthetic Resident',
    },
  ],
  treatment: {
    summary: {
      started: 3,
      inTreatment: 1,
      finished: 1,
      stopped: 1,
      finishedShort: 1,
      averageDaysTaken: 28,
      sessionsGivenPercent: 80,
    },
    items: [
      {
        rtNumber: 'SEED-010',
        outcome: 'FINISHED',
        startedOn: '2026-10-01',
        finishedOn: '2026-10-28',
        daysTaken: 28,
        plannedSessions: 25,
        sessionsGiven: 20,
      },
      {
        rtNumber: 'SEED-011',
        outcome: 'IN_TREATMENT',
        startedOn: '2026-11-10',
        finishedOn: null,
        daysTaken: null,
        plannedSessions: 25,
        sessionsGiven: 8,
      },
      {
        rtNumber: 'SEED-012',
        outcome: 'STOPPED',
        startedOn: '2026-10-05',
        finishedOn: null,
        daysTaken: null,
        plannedSessions: 25,
        sessionsGiven: 5,
      },
    ],
  },
};

let workflowDraft = null;

const ROLE_WORDS = {
  JUNIOR_RESIDENT: 'junior resident',
  SENIOR_RESIDENT: 'senior resident',
  CONSULTANT: 'consultant',
  PHYSICIST: 'physicist',
  RADIOGRAPHER: 'radiographer',
};
const CLINICAL = Object.keys(ROLE_WORDS);
const words = roles => (roles.length ? roles.map(role => ROLE_WORDS[role]).join(' and ') : 'no one');

const newDraft = () => ({
  code: WORKFLOW.code,
  version: 2,
  label: WORKFLOW.label,
  status: 'DRAFT',
  replacesVersion: 1,
  stages: WORKFLOW.stages.map(({ code, label, phase, position, isInitial, isTerminal, weeklyUpdateRoles }) => ({
    code,
    label,
    phase,
    position,
    isInitial,
    isTerminal,
    weeklyUpdateRoles: [...weeklyUpdateRoles],
  })),
  steps: WORKFLOW.transitions.map(({ from, fromLabel, action, actionLabel, role, to, toLabel }) => ({
    from,
    fromLabel,
    action,
    actionLabel,
    roles: [role],
    to,
    toLabel,
    requiresReason: false,
    requiresAssignment: false,
  })),
  changes: [],
});

const withChanges = draft => {
  const changes = [];

  if (draft.label !== WORKFLOW.label)
    changes.push(`The workflow is renamed from "${WORKFLOW.label}" to "${draft.label}".`);

  for (const stage of draft.stages) {
    const was = WORKFLOW.stages.find(item => item.code === stage.code);

    if (was.label !== stage.label) changes.push(`The stage "${was.label}" is now called "${stage.label}".`);

    if (was.weeklyUpdateRoles.join() !== stage.weeklyUpdateRoles.join()) {
      changes.push(
        `Saturday updates at "${stage.label}" will come from the ${words(stage.weeklyUpdateRoles)} (now the ${words(was.weeklyUpdateRoles)}).`,
      );
    }
  }

  for (const step of draft.steps) {
    const was = WORKFLOW.transitions.find(item => item.from === step.from && item.action === step.action);

    if (was.role !== step.roles.join()) {
      changes.push(
        `"${step.actionLabel}" at "${step.fromLabel}" can be done by the ${words(step.roles)} (now the ${words([was.role])}).`,
      );
    }
  }

  return { ...draft, changes };
};

const auditEntry = (id, action, rtNumber, actorName, minutes, after = null) => ({
  id,
  occurredAt: minutesAgo(minutes),
  action,
  entityType: rtNumber ? 'RT_CHART' : 'STAFF_USER',
  entityId: rtNumber ?? 'x',
  rtNumber,
  actorName,
  actorRoles: ['CONSULTANT'],
  before: null,
  after,
});

const AUDIT = [
  auditEntry('a-1', 'STAFF_CREATED', null, 'Synthetic Consultant', 5, { username: 'someone.new' }),
  auditEntry('a-2', 'ACTION_PERFORMED', 'SEED-001', 'Synthetic Consultant', 30, { stage: 'CONTOURING' }),
  auditEntry('a-3', 'CHART_ISSUED', 'SEED-001', 'Synthetic Consultant', 60),
  auditEntry('a-4', 'CHART_ISSUED', 'SEED-002', 'Synthetic Consultant', 90),
];

const notifications = [
  {
    id: 'n-1',
    kind: 'YOUR_TURN',
    message: 'SEED-001 is now at Contouring, waiting for the assigned junior resident to submit contouring.',
    rtNumber: 'SEED-001',
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    readAt: null,
  },
  {
    id: 'n-2',
    kind: 'SENT_BACK',
    message: 'SEED-002 was sent back to Contouring by Dr Rao. Reason: Brain stem is missing.',
    rtNumber: 'SEED-002',
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
    readAt: null,
  },
];
const charts = new Map();

const seed = () => {
  charts.clear();
  for (const chart of [
    makeChart('SEED-001', { priority: 'URGENT', minutesInStage: 185, planId: 'PLAN-7' }),
    makeChart('SEED-002', { minutesInStage: 3000, plannedSessions: null }),
    makeChart('SEED-CLOSED', { status: 'CLOSED', minutesInStage: 9000 }),
    makeChart('SEED/2026/3', { minutesInStage: 60 }),
    makeChart('STEP-1', { minutesInStage: 5, stageCode: 'RT_CHART_ISSUED' }),
    makeChart('STEP-2', { minutesInStage: 5, stageCode: 'RT_CHART_ISSUED' }),
    makeChart('CHANGED-1', { minutesInStage: 5, stageCode: 'RT_CHART_ISSUED' }),
  ]) {
    charts.set(chart.rtNumber, chart);
  }
  for (let number = 1; number <= 30; number++) {
    const rtNumber = `PAGE-${String(number).padStart(3, '0')}`;

    charts.set(rtNumber, makeChart(rtNumber, { minutesInStage: number }));
  }
};

seed();

const steps = new Map();
const comments = new Map();

const GIVE_DATES = {
  action: 'GIVE_SIMULATION_DATES',
  label: 'Give mould and CT Sim dates',
  requiresReason: false,
  checks: [],
  fields: [
    { key: 'mouldDate', label: 'Mould date', type: 'date', required: true, default: '2030-01-02' },
    { key: 'mouldTime', label: 'Mould time', type: 'time', required: true, default: '10:00' },
    { key: 'bookNote', label: 'Note', type: 'area', required: false, help: 'Anything the patient should know.' },
  ],
};

const detail = (chart, token) => ({
  ...chart,
  weekly: null,
  comments: comments.get(chart.rtNumber) ?? [],
  recorded: steps.has(chart.rtNumber) ? [{ label: 'Mould appointment', value: '2 Jan 2030, 10:00' }] : [],
  controls: [],
  availableActions: chart.stage.code === 'RT_CHART_ISSUED' && profileFor(token) === PROFILE ? [GIVE_DATES] : [],
  history: [
    {
      action: 'ISSUE_CHART',
      fromStage: null,
      fromStageLabel: null,
      toStage: 'RT_CHART_ISSUED',
      toStageLabel: 'RT chart issued',
      actorName: chart.issuedBy,
      actorRoles: ['CONSULTANT'],
      reason: null,
      summary: null,
      occurredAt: chart.createdAt,
    },
    ...(steps.has(chart.rtNumber)
      ? [
          {
            action: 'GIVE_SIMULATION_DATES',
            fromStage: 'RT_CHART_ISSUED',
            fromStageLabel: 'RT chart issued',
            toStage: 'SIMULATION_DATES_GIVEN',
            toStageLabel: 'Dates given',
            actorName: 'Synthetic Consultant',
            actorRoles: ['RADIOGRAPHER'],
            reason: null,
            summary: steps.get(chart.rtNumber),
            occurredAt: minutesAgo(0),
          },
        ]
      : []),
  ],
});

const RT_PATTERN = /^[A-Z0-9][A-Z0-9/._-]{0,39}$/;

const refuse = (response, status, code, message, details) =>
  send(response, status, { code, message, ...(details && { details }) });

const parseIssue = body => {
  const problems = [];
  const rtNumber = typeof body.rtNumber === 'string' ? body.rtNumber.trim().toUpperCase() : '';

  if (!rtNumber) problems.push({ field: 'rtNumber', message: 'Enter the RT number.' });
  else if (!RT_PATTERN.test(rtNumber)) {
    problems.push({
      field: 'rtNumber',
      message: 'Use up to 40 letters, digits and / . _ - only, starting with a letter or digit.',
    });
  }

  const sessions = body.plannedSessions;

  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 100) {
    problems.push({ field: 'plannedSessions', message: 'Enter a whole number from 1 to 100.' });
  }

  return { rtNumber, problems };
};

const revokedTokens = new Set();
const unauthorized = response =>
  send(response, 401, { statusCode: 401, error: 'Unauthorized', message: 'Staff authentication is required.' });

const bearer = request => request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];

const server = createServer(async (request, response) => {
  const { method, url } = request;

  if (method === 'POST' && url === '/api/v1/auth/login') {
    const { username, password } = await readJson(request);

    if (username === 'locked.user') {
      return send(response, 429, {
        message: 'Too many failed sign-in attempts. Try again later.',
        retryAfterSeconds: 900,
      });
    }

    if (username && password === VALID_PASSWORD) {
      return send(response, 200, { access_token: 'e2e-token', token_type: 'Bearer', expires_in: 43200 });
    }

    return send(response, 401, { statusCode: 401, error: 'Unauthorized', message: 'Invalid username or password.' });
  }

  if (method === 'POST' && url === '/api/v1/auth/logout') {
    const token = bearer(request);

    if (!token || revokedTokens.has(token)) return unauthorized(response);

    revokedTokens.add(token);
    response.writeHead(204);
    return response.end();
  }

  if (method === 'GET' && url === '/api/v1/auth/me') {
    const token = bearer(request);

    // Any token the tests set is accepted until it is revoked; "unknown-token" models a session the API forgot.
    if (!token || token === 'unknown-token' || revokedTokens.has(token)) return unauthorized(response);

    return send(response, 200, profileFor(token));
  }

  const route = new URL(url, 'http://mock');
  const staffToken = bearer(request);
  const signedIn = staffToken && staffToken !== 'unknown-token' && !revokedTokens.has(staffToken);

  if (route.pathname.startsWith('/api/v1/reports')) {
    if (!signedIn) return unauthorized(response);

    if (!profileFor(staffToken).capabilities.includes('EXPORT_REPORTS')) {
      return refuse(response, 403, 'CAPABILITY_REQUIRED', 'You do not have permission to use this page.');
    }

    const from = route.searchParams.get('from') || REPORTS.range.from;
    const to = route.searchParams.get('to') || REPORTS.range.to;

    if (from > to) {
      return refuse(response, 400, 'VALIDATION_FAILED', 'Some fields need attention.', [
        { field: 'from', message: 'The start cannot be after the end.' },
      ]);
    }

    if (route.pathname === '/api/v1/reports' && method === 'GET') {
      return send(response, 200, { ...REPORTS, range: { from, to } });
    }

    if (route.pathname === '/api/v1/reports/export.xlsx' && method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      return response.end(Buffer.from('PK-stand-in-workbook'));
    }

    const csv = /^\/api\/v1\/reports\/export\/(waiting|stalled|treatment)$/.exec(route.pathname);

    if (csv && method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });

      return response.end(`report,${csv[1]},${from},${to}\r\n`);
    }
  }

  if (route.pathname.startsWith('/api/v1/admin')) {
    if (!signedIn) return unauthorized(response);

    const allowed = profileFor(staffToken).capabilities;
    const need = capability =>
      allowed.includes(capability) ||
      (refuse(response, 403, 'CAPABILITY_REQUIRED', 'You do not have permission to use this page.'), false);

    if (method === 'GET' && route.pathname === '/api/v1/admin/workflow') {
      return send(response, 200, { workflow: WORKFLOW });
    }

    if (route.pathname.startsWith('/api/v1/admin/workflow/draft')) {
      if (!need('CONFIGURE_WORKFLOW')) return;

      const step = route.pathname.slice('/api/v1/admin/workflow/draft'.length);

      if (step === '' && method === 'GET') return send(response, 200, { draft: workflowDraft });

      if (step === '' && method === 'POST') {
        if (workflowDraft) return refuse(response, 409, 'DRAFT_EXISTS', 'A draft is already being prepared.');

        workflowDraft = withChanges(newDraft());

        return send(response, 201, workflowDraft);
      }

      if (!workflowDraft) return refuse(response, 404, 'NO_DRAFT', 'There is no draft.');

      if (step === '/discard' && method === 'POST') {
        workflowDraft = null;

        return send(response, 200, { discarded: true });
      }

      if (step === '/approve' && method === 'POST') {
        if (workflowDraft.changes.length === 0) {
          return refuse(response, 409, 'NO_CHANGES', 'The draft is the same as the workflow in use.');
        }

        // The stand-in only acknowledges the approval and clears the draft. It leaves the workflow it shows as it was,
        // because the tests run in parallel and share it; that approving changes what is in use is tested against the
        // real API (WFA-010).
        const { version, changes } = workflowDraft;

        workflowDraft = null;

        return send(response, 200, { version, changes });
      }

      if (step === '/edit' && method === 'POST') {
        const body = await readJson(request);
        const problems = [];
        const next = structuredClone(workflowDraft);

        if (body.label !== undefined) {
          if (!String(body.label).trim())
            problems.push({ field: 'label', message: 'Enter a name up to 120 characters.' });
          else next.label = String(body.label).trim();
        }

        (body.stages ?? []).forEach((item, index) => {
          const stage = next.stages.find(candidate => candidate.code === item.code);

          if (!stage) return problems.push({ field: `stages.${index}`, message: 'No such stage in this workflow.' });

          if (item.label !== undefined) {
            if (!String(item.label).trim()) {
              problems.push({ field: `stages.${index}.label`, message: 'Enter a name up to 80 characters.' });
            } else stage.label = String(item.label).trim();
          }

          if (item.weeklyUpdateRoles !== undefined) {
            if (!item.weeklyUpdateRoles.length) {
              problems.push({ field: `stages.${index}.weeklyUpdateRoles`, message: 'Choose at least one role.' });
            } else stage.weeklyUpdateRoles = item.weeklyUpdateRoles.filter(role => CLINICAL.includes(role));
          }
        });

        (body.steps ?? []).forEach((item, index) => {
          const found = next.steps.find(candidate => candidate.from === item.from && candidate.action === item.action);

          if (!found) return problems.push({ field: `steps.${index}`, message: 'No such step in this workflow.' });

          if (!item.roles?.length)
            problems.push({ field: `steps.${index}.roles`, message: 'Choose at least one role.' });
          else found.roles = item.roles;
        });

        if (problems.length) {
          return refuse(response, 400, 'VALIDATION_FAILED', 'Some fields need attention.', problems);
        }

        for (const item of next.steps) {
          item.fromLabel = next.stages.find(stage => stage.code === item.from).label;
          item.toLabel = next.stages.find(stage => stage.code === item.to).label;
        }

        workflowDraft = withChanges(next);

        return send(response, 200, workflowDraft);
      }
    }

    if (route.pathname === '/api/v1/admin/audit' && method === 'GET') {
      if (!need('VIEW_AUDIT')) return;

      const rt = (route.searchParams.get('rt') ?? '').toUpperCase();
      const action = route.searchParams.get('action') ?? '';
      const limit = Number(route.searchParams.get('limit') ?? 50);
      const offset = Number(route.searchParams.get('offset') ?? 0);
      const matching = AUDIT.filter(entry => (!rt || entry.rtNumber === rt) && (!action || entry.action === action));

      return send(response, 200, {
        items: matching.slice(offset, offset + limit),
        total: matching.length,
        actions: [...new Set(AUDIT.map(entry => entry.action))].sort(),
      });
    }

    if (route.pathname === '/api/v1/admin/staff' && method === 'GET') {
      if (!need('MANAGE_STAFF')) return;

      return send(response, 200, { items: [...staffMembers.values()], directoryEnabled: true });
    }

    if (route.pathname === '/api/v1/admin/staff' && method === 'POST') {
      if (!need('MANAGE_STAFF')) return;

      const body = await readJson(request);
      const username = String(body.username ?? '')
        .trim()
        .toLowerCase();
      const problems = [];

      if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
        problems.push({ field: 'username', message: 'Use 3 to 50 letters, numbers, dots, dashes or underscores.' });
      }
      if (!String(body.fullName ?? '').trim()) problems.push({ field: 'fullName', message: 'Enter the full name.' });
      if (!Array.isArray(body.roles) || body.roles.length === 0) {
        problems.push({ field: 'roles', message: 'Choose at least one role.' });
      }
      const directoryAccount = body.identityProvider === 'DIRECTORY';

      if (!directoryAccount && String(body.password ?? '').length < 12) {
        problems.push({ field: 'password', message: 'Use at least 12 characters.' });
      }
      if (problems.length > 0)
        return refuse(response, 400, 'VALIDATION_FAILED', 'Some fields need attention.', problems);
      if ([...staffMembers.values()].some(member => member.username === username)) {
        return refuse(response, 409, 'USERNAME_TAKEN', 'That username is already used.', [
          { field: 'username', message: 'That username is already used.' },
        ]);
      }

      const member = {
        id: `00000000-0000-4000-8000-0000000001${String(staffMembers.size).padStart(2, '0')}`,
        username,
        fullName: String(body.fullName).trim(),
        roles: body.roles,
        capabilities: body.capabilities ?? [],
        identityProvider: directoryAccount ? 'DIRECTORY' : 'LOCAL',
        isActive: true,
        isAvailable: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
        canDelete: true,
      };

      staffMembers.set(member.id, member);

      return send(response, 201, member);
    }

    const staffRoute = route.pathname.match(/^\/api\/v1\/admin\/staff\/([^/]+)(\/password)?$/);

    if (staffRoute && !staffRoute[2] && method === 'DELETE') {
      if (!need('MANAGE_STAFF')) return;

      const member = staffMembers.get(staffRoute[1]);

      if (!member) return refuse(response, 404, 'STAFF_NOT_FOUND', 'No such staff account.');
      if (member.id === PROFILE.id)
        return refuse(response, 409, 'CANNOT_DELETE_SELF', 'You cannot delete your own account.');
      if (!member.canDelete) {
        return refuse(response, 409, 'HAS_HISTORY', 'This account appears in the history, so it cannot be deleted.');
      }

      staffMembers.delete(member.id);

      return send(response, 200, member);
    }

    if (staffRoute && method === 'POST') {
      if (!need('MANAGE_STAFF')) return;

      const member = staffMembers.get(staffRoute[1]);

      if (!member) return refuse(response, 404, 'STAFF_NOT_FOUND', 'No such staff account.');

      const body = await readJson(request);

      if (staffRoute[2]) {
        if (String(body.password ?? '').length < 12) {
          return refuse(response, 400, 'VALIDATION_FAILED', 'Some fields need attention.', [
            { field: 'password', message: 'Use at least 12 characters.' },
          ]);
        }

        return send(response, 200, member);
      }

      if (member.id === PROFILE.id && body.isActive === false) {
        return refuse(response, 409, 'CANNOT_SWITCH_OFF_SELF', 'You cannot switch off your own account.');
      }

      for (const key of ['fullName', 'roles', 'capabilities', 'isActive', 'isAvailable']) {
        if (body[key] !== undefined) member[key] = body[key];
      }

      return send(response, 200, member);
    }

    return refuse(response, 404, 'NOT_FOUND', 'No such page.');
  }

  if (route.pathname.startsWith('/api/v1/notifications')) {
    if (!signedIn) return unauthorized(response);

    const unread = () => notifications.filter(item => !item.readAt).length;

    if (method === 'GET' && route.pathname === '/api/v1/notifications') {
      return send(response, 200, { items: notifications, unread: unread() });
    }

    if (method === 'GET' && route.pathname === '/api/v1/notifications/unread-count') {
      return send(response, 200, { unread: unread() });
    }

    if (method === 'POST' && route.pathname === '/api/v1/notifications/read-all') {
      const marked = unread();

      for (const item of notifications) item.readAt ??= new Date().toISOString();

      return send(response, 200, { marked });
    }

    const read = route.pathname.match(/^\/api\/v1\/notifications\/([^/]+)\/read$/);

    if (method === 'POST' && read) {
      const item = notifications.find(candidate => candidate.id === read[1]);

      if (!item)
        return send(response, 404, { code: 'NOTIFICATION_NOT_FOUND', message: 'That notification does not exist.' });

      item.readAt ??= new Date().toISOString();

      return send(response, 200, { ok: true });
    }
  }

  if (route.pathname.startsWith('/api/v1/charts')) {
    if (!signedIn) return unauthorized(response);

    if (method === 'GET' && route.pathname === '/api/v1/charts') {
      const q = (route.searchParams.get('q') ?? '').trim().toUpperCase();
      const status = route.searchParams.get('status');
      const limit = Number(route.searchParams.get('limit') ?? 25);
      const offset = Number(route.searchParams.get('offset') ?? 0);
      const matching = [...charts.values()]
        .filter(chart => (!q || chart.rtNumber.includes(q)) && (!status || chart.status === status))
        .sort(
          (a, b) =>
            Number(b.priority === 'URGENT') - Number(a.priority === 'URGENT') || b.minutesInStage - a.minutesInStage,
        );

      return send(response, 200, { items: matching.slice(offset, offset + limit), total: matching.length });
    }

    if (method === 'GET' && route.pathname === '/api/v1/charts/queue') {
      const open = [...charts.values()].filter(chart => chart.status === 'OPEN');
      const items = open
        .map(chart => {
          const needsYou = chart.rtNumber.startsWith('STEP-') || chart.rtNumber === 'SEED-001';
          const days = Math.floor(chart.minutesInStage / 1440);

          return {
            rtNumber: chart.rtNumber,
            priority: chart.priority,
            stage: chart.stage,
            phase: chart.phase,
            stageNumber: chart.stage.code === 'RT_CHART_ISSUED' ? 1 : 5,
            stageCount: 14,
            daysInStage: days,
            stalled: days >= 3,
            needsYou,
            nextStep: needsYou ? 'Give mould and CT Sim dates' : null,
            waitingOn: chart.stage.code === 'RT_CHART_ISSUED' ? 'Radiographer' : 'Junior resident',
            assignedTo: null,
            assignedToYou: false,
            dateLine: chart.stage.code === 'RT_CHART_ISSUED' ? 'Dates not recorded yet' : null,
            treatmentDay: null,
            sessionsDone: null,
            plannedSessions: chart.plannedSessions,
            weeklyMissing: [],
          };
        })
        .sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || b.daysInStage - a.daysInStage);

      return send(response, 200, {
        stallDays: 3,
        weekEnding: '2026-11-28',
        items,
        stages: [
          {
            code: 'RT_CHART_ISSUED',
            label: 'RT chart issued',
            phase: 'Getting ready',
            position: 1,
            open: items.filter(item => item.stage.code === 'RT_CHART_ISSUED').length,
            stalled: items.filter(item => item.stage.code === 'RT_CHART_ISSUED' && item.stalled).length,
            charts: items.filter(item => item.stage.code === 'RT_CHART_ISSUED').map(item => item.rtNumber),
          },
          {
            code: 'CONTOURING',
            label: 'Contouring',
            phase: 'Contouring and planning',
            position: 5,
            open: 0,
            stalled: 0,
            charts: [],
          },
          {
            code: 'TREATMENT_IN_PROGRESS',
            label: 'Treatment in progress',
            phase: 'Treatment',
            position: 13,
            open: 0,
            stalled: 0,
            charts: [],
          },
        ],
        totals: {
          open: items.length,
          gettingReady: items.length,
          stalled: items.filter(item => item.stalled).length,
          inTreatment: 0,
          saturdayUpdatesToCome: 0,
        },
      });
    }

    if (method === 'GET' && route.pathname === '/api/v1/charts/calendar') {
      const entry = (rtNumber, kind, date, time, resource, done) => ({
        rtNumber,
        kind,
        date,
        time,
        resource,
        done,
        stage: { code: 'SIMULATION_DATES_GIVEN', label: 'Dates given' },
      });
      const days = ['2026-11-28', '2026-11-29', '2026-11-30'].map(date => ({ date, entries: [] }));

      days[0].entries.push(entry('SEED-001', 'MOULD', '2026-11-28', '10:00', null, true));
      days[2].entries.push(entry('SEED-001', 'CT_SIM', '2026-11-30', '11:30', null, false));
      days[2].entries.push(entry('SEED-002', 'FIRST_TREATMENT', '2026-11-30', '15:00', 'LINAC 2', false));

      return send(response, 200, {
        today: '2026-11-28',
        from: '2026-11-28',
        to: '2026-11-30',
        late: [entry('SEED-003', 'MOULD', '2026-11-26', '09:00', null, false)],
        days,
      });
    }

    const byNumber = route.pathname.match(/^\/api\/v1\/charts\/by-number\/(.+)$/);

    if (method === 'GET' && byNumber) {
      const chart = charts.get(decodeURIComponent(byNumber[1]).toUpperCase());

      if (!chart) return refuse(response, 404, 'CHART_NOT_FOUND', `No chart has RT number ${byNumber[1]}.`);

      return send(response, 200, detail(chart, staffToken));
    }

    const commentRoute = route.pathname.match(/^\/api\/v1\/charts\/by-number\/(.+)\/comments$/);

    if (method === 'POST' && commentRoute) {
      const chart = charts.get(decodeURIComponent(commentRoute[1]).toUpperCase());
      const body = await readJson(request);

      if (!chart) return refuse(response, 404, 'CHART_NOT_FOUND', `No chart has RT number ${commentRoute[1]}.`);
      if (!request.headers['idempotency-key']) {
        return refuse(response, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header.');
      }
      if (!String(body.body ?? '').trim()) {
        return refuse(response, 400, 'VALIDATION_FAILED', 'Some fields need attention.', [
          { field: 'body', message: 'Write a comment.' },
        ]);
      }

      comments.set(chart.rtNumber, [
        ...(comments.get(chart.rtNumber) ?? []),
        {
          id: `k${(comments.get(chart.rtNumber)?.length ?? 0) + 1}`,
          kind: 'COMMENT',
          body: String(body.body).trim(),
          authorName: profileFor(staffToken).fullName,
          authorRoles: profileFor(staffToken).roles,
          forRole: body.forRole ?? null,
          stageLabel: chart.stage.label,
          createdAt: new Date().toISOString(),
        },
      ]);

      return send(response, 201, detail(chart, staffToken));
    }

    const step = route.pathname.match(/^\/api\/v1\/charts\/by-number\/(.+)\/actions\/([A-Z_]+)$/);

    if (method === 'POST' && step) {
      const chart = charts.get(decodeURIComponent(step[1]).toUpperCase());
      const body = await readJson(request);

      if (!chart) return refuse(response, 404, 'CHART_NOT_FOUND', `No chart has RT number ${step[1]}.`);
      if (profileFor(staffToken) !== PROFILE) {
        return refuse(response, 403, 'ROLE_NOT_ALLOWED', 'Only a radiographer can do this step.');
      }
      if (!request.headers['idempotency-key']) {
        return refuse(response, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header.');
      }
      if (chart.rtNumber === 'CHANGED-1' || body.expectedVersion !== chart.version) {
        return refuse(response, 409, 'CHART_CHANGED', 'The chart changed since you opened it.');
      }
      if (step[2] !== 'GIVE_SIMULATION_DATES' || chart.stage.code !== 'RT_CHART_ISSUED') {
        return refuse(response, 409, 'ACTION_NOT_AVAILABLE', 'This step is not available now.');
      }

      const values = body.values ?? {};

      if (!values.mouldDate) {
        return refuse(response, 400, 'VALIDATION_FAILED', 'Some fields need attention.', [
          { field: 'mouldDate', message: 'Enter mould date.' },
        ]);
      }

      Object.assign(chart, STAGES.SIMULATION_DATES_GIVEN, { version: chart.version + 1, minutesInStage: 0 });
      chart.stageSince = minutesAgo(0);
      steps.set(chart.rtNumber, `Mould booked for ${values.mouldDate} ${values.mouldTime}.`);

      return send(response, 200, detail(chart, staffToken));
    }

    if (method === 'POST' && route.pathname === '/api/v1/charts') {
      const body = await readJson(request);

      if (profileFor(staffToken) !== PROFILE) {
        return refuse(response, 403, 'ROLE_NOT_ALLOWED', 'Only a consultant can issue a chart.');
      }
      if (!request.headers['idempotency-key']) {
        return refuse(response, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header.');
      }

      const { rtNumber, problems } = parseIssue(body);

      if (problems.length > 0)
        return refuse(response, 400, 'VALIDATION_FAILED', 'Some fields need attention.', problems);
      if (rtNumber === 'NOWORKFLOW') {
        return refuse(response, 409, 'WORKFLOW_NOT_ACTIVE', 'No workflow is active yet.');
      }
      if (charts.has(rtNumber)) {
        return refuse(response, 409, 'RT_NUMBER_EXISTS', `A chart with RT number ${rtNumber} already exists.`);
      }

      const chart = makeChart(rtNumber, {
        plannedSessions: body.plannedSessions,
        priority: body.priority ?? 'ROUTINE',
        planId: body.planId ?? null,
        contourSetName: body.contourSetName ?? null,
        scanReference: body.scanReference ?? null,
        minutesInStage: 0,
        stageCode: 'RT_CHART_ISSUED',
      });

      charts.set(rtNumber, chart);

      return send(response, 201, chart);
    }
  }

  if (url === '/revoked-tokens') return send(response, 200, [...revokedTokens]);
  if (url === '/health') return send(response, 200, { ok: true });

  send(response, 404, { message: 'Not found' });
});

server.listen(MOCK_API_PORT, '127.0.0.1', () => {
  console.log(`Mock API listening on http://127.0.0.1:${MOCK_API_PORT}`);
});
