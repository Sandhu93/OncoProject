import { expect, test } from '@playwright/test';

test('WEB-001 shows truthful availability and recovery', async ({ page }) => {
  let ready = false;
  await page.route('**/api/v1/health/*', (route) => {
    const available = route.request().url().endsWith('/live') || ready;
    return route.fulfill({
      status: available ? 200 : 503,
      json: { status: available ? 'ok' : 'unavailable', service: 'oncotrack-api' },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Every handoff, accounted for.' })).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Staff login and patient workflows are not implemented.', { exact: false }),
  ).toBeVisible();
  ready = true;
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByText('Available', { exact: true })).toHaveCount(2);
});

test('WEB-002 fits a small phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/api/v1/health/*', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
