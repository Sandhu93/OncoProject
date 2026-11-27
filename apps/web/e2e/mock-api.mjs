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

    return send(response, 200, PROFILE);
  }

  if (url === '/revoked-tokens') return send(response, 200, [...revokedTokens]);
  if (url === '/health') return send(response, 200, { ok: true });

  send(response, 404, { message: 'Not found' });
});

server.listen(MOCK_API_PORT, '127.0.0.1', () => {
  console.log(`Mock API listening on http://127.0.0.1:${MOCK_API_PORT}`);
});
