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
 * POST /api/v1/charts   Idempotency-Key       -> 201 chart; 403 for the token "resident-token" (not a consultant);
 *     400 VALIDATION_FAILED, 409 RT_NUMBER_EXISTS, 409 WORKFLOW_NOT_ACTIVE for the RT number "NOWORKFLOW"
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
  capabilities: ['VIEW_AUDIT'],
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

const STAGE = { code: 'CONTOURING', label: 'Contouring' };
const minutesAgo = minutes => new Date(Date.now() - minutes * 60_000).toISOString();

const makeChart = (rtNumber, change = {}) => {
  const minutesInStage = change.minutesInStage ?? 10;

  return {
    id: `chart-${rtNumber}`,
    rtNumber,
    stage: STAGE,
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
  };
};

const charts = new Map();

const seed = () => {
  charts.clear();
  for (const chart of [
    makeChart('SEED-001', { priority: 'URGENT', minutesInStage: 185, planId: 'PLAN-7' }),
    makeChart('SEED-002', { minutesInStage: 3000, plannedSessions: null }),
    makeChart('SEED-CLOSED', { status: 'CLOSED', minutesInStage: 9000 }),
    makeChart('SEED/2026/3', { minutesInStage: 60 }),
  ]) {
    charts.set(chart.rtNumber, chart);
  }
  for (let number = 1; number <= 30; number++) {
    const rtNumber = `PAGE-${String(number).padStart(3, '0')}`;

    charts.set(rtNumber, makeChart(rtNumber, { minutesInStage: number }));
  }
};

seed();

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

    const byNumber = route.pathname.match(/^\/api\/v1\/charts\/by-number\/(.+)$/);

    if (method === 'GET' && byNumber) {
      const chart = charts.get(decodeURIComponent(byNumber[1]).toUpperCase());

      if (!chart) return refuse(response, 404, 'CHART_NOT_FOUND', `No chart has RT number ${byNumber[1]}.`);

      return send(response, 200, {
        ...chart,
        history: [
          {
            action: 'ISSUE_CHART',
            fromStage: null,
            fromStageLabel: null,
            toStage: chart.stage.code,
            toStageLabel: chart.stage.label,
            actorName: chart.issuedBy,
            actorRoles: ['CONSULTANT'],
            reason: null,
            occurredAt: chart.createdAt,
          },
        ],
      });
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
