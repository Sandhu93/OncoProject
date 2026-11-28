import { expect, test } from '@playwright/test';

import { COOKIE_NAMES } from '../constants/cookie';

const VALID_PASSWORD = 'correct horse battery'; // see e2e/mock-api.mjs
const MOCK_API = 'http://127.0.0.1:4010';

test.describe('WEB-010 logging in', () => {
  test('a protected page sends a logged-out user to login, and back after logging in', async ({ page }) => {
    await page.goto('/dashboard?tab=reports');

    await expect(page).toHaveURL(/\/login\?redirect=/);

    await page.getByLabel('Username').fill('synthetic.consultant');
    await page.getByLabel('Password').fill(VALID_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL('/dashboard?tab=reports');
    await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), / })).toBeVisible();
  });

  test('the dashboard shows the role the API reports, with no way to pick another', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('synthetic.consultant');
    await page.getByLabel('Password').fill(VALID_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('heading', { name: 'Signed in as Synthetic Consultant' })).toBeVisible();
    await expect(page.getByText('Consultant', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Viewing as')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
  });

  test('the access token is stored where page scripts cannot read it', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('synthetic.consultant');
    await page.getByLabel('Password').fill(VALID_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL('/dashboard');

    const token = (await context.cookies()).find(cookie => cookie.name === COOKIE_NAMES.ACCESS_TOKEN);

    expect(token).toMatchObject({ value: 'e2e-token', httpOnly: true, sameSite: 'Lax' });
    expect(await page.evaluate(() => document.cookie)).not.toContain(COOKIE_NAMES.ACCESS_TOKEN);
  });

  test('wrong credentials show the API’s message and keep the username', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('synthetic.consultant');
    await page.getByLabel('Password').fill('wrong password!!');
    await page.getByRole('button', { name: 'Log in' }).click();

    // Filter by text: Next.js adds its own empty role="alert" route announcer to every page.
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid username' })).toHaveText(
      'Invalid username or password.',
    );
    await expect(page.getByLabel('Username')).toHaveValue('synthetic.consultant');
    await expect(page).toHaveURL('/login');
  });

  test('a locked-out name shows the lockout message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('locked.user');
    await page.getByLabel('Password').fill(VALID_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Too many failed' })).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('an empty username is caught before calling the API', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('   ');
    await page.getByLabel('Password').fill('x');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByLabel('Username')).toHaveAccessibleDescription('Enter your username.');
  });

  test('a logged-in user visiting login goes to the dashboard', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: COOKIE_NAMES.ACCESS_TOKEN, value: 'e2e-token', url: baseURL! }]);

    await page.goto('/login');

    await expect(page).toHaveURL('/dashboard');
  });
});

test.describe('WEB-011 logging out and expired sessions', () => {
  test('the logout button revokes the token on the API and clears the session', async ({
    page,
    context,
    baseURL,
    request,
  }) => {
    const token = `logout-${Date.now()}`;

    await context.addCookies([
      ...Object.values(COOKIE_NAMES).map(name => ({ name, value: token, url: baseURL! })),
      { name: 'unrelated', value: 'kept', url: baseURL! },
    ]);

    await page.goto('/dashboard');
    await page.getByRole('button', { name: /^Account menu/ }).click();
    await page.getByRole('button', { name: 'Log out' }).click();

    await expect(page).toHaveURL('/login');
    expect((await context.cookies()).map(cookie => cookie.name)).toEqual(['unrelated']);
    expect(await (await request.get(`${MOCK_API}/revoked-tokens`)).json()).toContain(token);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a session the API no longer accepts sends the user to login, keeping the page to return to', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: COOKIE_NAMES.ACCESS_TOKEN, value: 'unknown-token', url: baseURL! }]);

    await page.goto('/dashboard?tab=reports');

    await expect(page).toHaveURL(/\/login\?redirect=/);
    expect((await context.cookies()).find(cookie => cookie.name === COOKIE_NAMES.ACCESS_TOKEN)).toBeUndefined();
  });

  test('the session-end route sends the user to login, keeping the redirect', async ({ request }) => {
    const response = await request.get('/api/auth/clear?redirect=abc', { maxRedirects: 0 });
    const location = new URL(response.headers().location ?? '', 'http://localhost');

    expect(response.status()).toBe(307);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('redirect')).toBe('abc');
  });

  test('another site cannot log a user out', async ({ request }) => {
    const response = await request.get('/api/auth/clear', {
      maxRedirects: 0,
      headers: { 'Sec-Fetch-Site': 'cross-site', Cookie: `${COOKIE_NAMES.ACCESS_TOKEN}=e2e-token` },
    });

    expect(response.status()).toBe(307);
    expect(response.headers()['set-cookie'] ?? '').not.toContain(COOKIE_NAMES.ACCESS_TOKEN);
  });
});
