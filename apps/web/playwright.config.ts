import { defineConfig, devices } from '@playwright/test';

// Their own ports, so a `next dev` on 5173 or the API on 3000 is never mistaken for a test server.
const MOCK_PORT = Number(process.env.PORT ?? 3100);
const REAL_PORT = 3101;
const MOCK_API_PORT = 4010;
const REAL_API_PORT = 4020;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'on-first-retry' },
  projects: [
    {
      // Fast and independent of the API: a stand-in API that copies the real responses (e2e/mock-api.mjs).
      name: 'chromium',
      testIgnore: 'real-api.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${MOCK_PORT}` },
    },
    {
      // The same web app against the real API on an in-memory PostgreSQL (e2e/real-api.mjs).
      name: 'real-api',
      testMatch: 'real-api.spec.ts',
      workers: 1,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${REAL_PORT}` },
    },
  ],
  webServer: [
    {
      command: 'node e2e/mock-api.mjs',
      url: `http://127.0.0.1:${MOCK_API_PORT}/health`,
      env: { MOCK_API_PORT: String(MOCK_API_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      // Needs `npm run build -w @oncotrack/api` first.
      command: 'node e2e/real-api.mjs',
      url: `http://127.0.0.1:${REAL_API_PORT}/api/v1/health/live`,
      env: { REAL_API_PORT: String(REAL_API_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Production builds, the same code that gets deployed. Build first with `npm run build`.
      command: `npm run start -- --port ${MOCK_PORT}`,
      url: `http://localhost:${MOCK_PORT}`,
      env: { API_URL: `http://127.0.0.1:${MOCK_API_PORT}/api/v1` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run start -- --port ${REAL_PORT}`,
      url: `http://localhost:${REAL_PORT}`,
      env: { API_URL: `http://127.0.0.1:${REAL_API_PORT}/api/v1` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
