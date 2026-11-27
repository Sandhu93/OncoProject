import { expect, test } from '@playwright/test';

test('WEB-001 the home page sends a logged-out visitor to login without console errors', async ({ page }) => {
  const errors: string[] = [];

  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { level: 1, name: 'Log in to OncoTrack' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});

test('WEB-002 the login page fits a small phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/login');

  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('WEB-003 unknown pages show the not-found page with a 404', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page).toHaveTitle(/^Page not found \| /);
});

test('WEB-004 responses carry the security headers', async ({ request }) => {
  const headers = (await request.get('/login')).headers();

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('WEB-005 robots.txt keeps every crawler out', async ({ request }) => {
  const body = await (await request.get('/robots.txt')).text();

  expect(body).toContain('User-Agent: *');
  expect(body).toContain('Disallow: /');
});

test('WEB-006 the login page uses no external resources', async ({ page }) => {
  const external: string[] = [];

  page.on('request', request => {
    const { hostname } = new URL(request.url());

    if (!['localhost', '127.0.0.1'].includes(hostname)) external.push(request.url());
  });
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  expect(external).toEqual([]);
});
