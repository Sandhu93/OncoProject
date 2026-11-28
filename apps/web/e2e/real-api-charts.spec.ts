import { expect, test } from '@playwright/test';

// These run against the real API on a real (in-memory) PostgreSQL: see e2e/real-api.mjs. They run in order,
// on one worker, because the first needs a database with no active workflow and the rest need one.
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'correct horse battery';
const CONTROL = 'http://127.0.0.1:4021';
const STAMP = Date.now().toString(36).toUpperCase();

const logIn = async (page: import('@playwright/test').Page, username: string) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/dashboard');
};

test.describe('WEB-040 charts with the real API', () => {
  test('before a workflow is approved, issuing is refused with a plain explanation', async ({ page, request }) => {
    // A server reused from an earlier local run may already have a workflow; a fresh one never does.
    test.skip(
      ((await (await request.get(`${CONTROL}/workflow`)).json()) as { active: boolean }).active,
      'workflow already active',
    );

    await logIn(page, 'real.consultant');
    await page.goto('/charts/new');
    await page.getByLabel('RT number').fill(`NOWF-${STAMP}`);
    await page.getByLabel('Planned sessions').fill('10');
    await page.getByRole('button', { name: 'Issue chart' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'No workflow' })).toContainText('No workflow is active yet');
  });

  test('a consultant issues a chart, finds it by RT number and opens it with its history', async ({
    page,
    request,
  }) => {
    await request.post(`${CONTROL}/activate-workflow`);
    await logIn(page, 'real.consultant');

    const rtNumber = `E2E/${STAMP}/1`;

    await page.goto('/charts/new');
    await page.getByLabel('RT number').fill(rtNumber.toLowerCase());
    await page.getByLabel('Planned sessions').fill('30');
    await page.getByLabel('Priority').selectOption('URGENT');
    await page.getByLabel(/Scan reference/).fill('CT-1');
    await page.getByRole('button', { name: 'Issue chart' }).click();

    await expect(page).toHaveURL(`/charts/${encodeURIComponent(rtNumber)}`);
    await expect(page.getByRole('heading', { name: rtNumber, level: 1 })).toBeVisible();
    await expect(page.getByText('Chart issued').first()).toBeVisible();
    await expect(page.getByText('CT-1')).toBeVisible();
    await expect(page.getByRole('row', { name: /Chart issued/ })).toContainText('RT chart issued');
    await expect(page.getByText('RT chart issued for')).toBeVisible();
    await expect(page.getByRole('row', { name: /Chart issued/ })).toContainText('Real Test Consultant');

    await page.goto(`/charts?q=${encodeURIComponent(rtNumber)}`);
    await expect(page.getByRole('row', { name: new RegExp(STAMP) })).toContainText('Urgent');
  });

  test('the same RT number cannot be issued twice, whatever the case', async ({ page, request }) => {
    await request.post(`${CONTROL}/activate-workflow`);
    await logIn(page, 'real.consultant');

    for (const [attempt, typed] of [`E2E-${STAMP}-DUP`, `e2e-${STAMP}-dup`].entries()) {
      await page.goto('/charts/new');
      await page.getByLabel('RT number').fill(typed);
      await page.getByLabel('Planned sessions').fill('5');
      await page.getByRole('button', { name: 'Issue chart' }).click();

      if (attempt === 0) await expect(page).toHaveURL(/\/charts\/E2E-/);
    }

    await expect(page.getByLabel('RT number')).toHaveAccessibleDescription(
      /A chart with this RT number already exists\./,
    );
  });

  test('a radiographer sees charts but the API would refuse an issue, and the page does not offer it', async ({
    page,
  }) => {
    await logIn(page, 'real.radiographer');
    await page.goto('/charts');

    await expect(page.getByRole('heading', { name: 'Charts', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Issue a chart' })).toHaveCount(0);

    await page.goto('/charts/new');
    await expect(page.getByRole('status')).toHaveText('Only a consultant can issue a chart.');
  });

  test('an unknown RT number is a not-found page', async ({ page }) => {
    await logIn(page, 'real.consultant');

    const response = await page.goto('/charts/DOES-NOT-EXIST');

    expect(response?.status()).toBe(404);
  });
});
