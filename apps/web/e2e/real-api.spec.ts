import { expect, test } from '@playwright/test';

import { COOKIE_NAMES } from '../constants/cookie';

// These run against the real API on a real (in-memory) PostgreSQL: see e2e/real-api.mjs.
const PASSWORD = 'correct horse battery';
const REAL_API = 'http://127.0.0.1:4020/api/v1';

const logIn = async (page: import('@playwright/test').Page, username: string, password = PASSWORD) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
};

test.describe('WEB-020 the web app with the real API', () => {
  test('logs in and shows the roles and capabilities the database holds', async ({ page }) => {
    await logIn(page, 'real.consultant');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Signed in as Real Test Consultant' })).toBeVisible();
    await expect(page.getByText('Roles: Consultant')).toBeVisible();
    await expect(page.getByText('Also allowed to: Manage staff, View audit trail')).toBeVisible();
  });

  test('another account sees its own role, not a role chosen in the browser', async ({ page }) => {
    await logIn(page, 'real.radiographer');

    await expect(page.getByRole('heading', { name: 'Signed in as Real Test Radiographer' })).toBeVisible();
    await expect(page.getByText('Roles: Radiographer')).toBeVisible();
    await expect(page.getByText('Also allowed to')).toHaveCount(0);
  });

  test('a username is not case-sensitive', async ({ page }) => {
    await logIn(page, '  Real.Consultant ');

    await expect(page).toHaveURL('/dashboard');
  });

  test('a wrong password gets the same message as an unknown user', async ({ page }) => {
    await logIn(page, 'real.consultant', 'not the password!');
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid username' })).toHaveText(
      'Invalid username or password.',
    );

    await logIn(page, 'nobody.here', 'not the password!');
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid username' })).toHaveText(
      'Invalid username or password.',
    );
  });

  test('logging out ends the session on the API, so the old token no longer works', async ({
    page,
    context,
    request,
  }) => {
    await logIn(page, 'real.radiographer');
    await expect(page).toHaveURL('/dashboard');

    const token = (await context.cookies()).find(cookie => cookie.name === COOKIE_NAMES.ACCESS_TOKEN)!.value;
    const before = await request.get(`${REAL_API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });

    expect(before.status()).toBe(200);

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL('/login');

    const after = await request.get(`${REAL_API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });

    expect(after.status()).toBe(401);
    expect((await context.cookies()).some(cookie => cookie.name === COOKIE_NAMES.ACCESS_TOKEN)).toBe(false);
  });

  test('a session the API has ended sends the user back to login', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: COOKIE_NAMES.ACCESS_TOKEN, value: 'A'.repeat(43), url: baseURL! }]);

    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login\?redirect=/);
  });

  test('repeated wrong passwords lock the account, even for the right password', async ({ page }) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await logIn(page, 'real.locked', 'wrong password!!');
      await expect(page.getByRole('alert').filter({ hasText: 'Invalid username' })).toBeVisible();
    }

    await logIn(page, 'real.locked');

    await expect(page.getByRole('alert').filter({ hasText: 'Too many failed' })).toBeVisible();
    await expect(page).toHaveURL('/login');
  });
});
