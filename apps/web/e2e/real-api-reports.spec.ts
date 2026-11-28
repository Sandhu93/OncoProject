import { expect, test } from '@playwright/test';

// Reports and the workflow editor against the real API on a real (in-memory) PostgreSQL.
test.describe.configure({ mode: 'serial' });

// A person approves the workflow in the real API; this is the stand-in for that (see e2e/real-api.mjs).
const CONTROL = 'http://127.0.0.1:4021';

test.beforeEach(async ({ request }) => {
  await request.post(`${CONTROL}/activate-workflow`);
});

const logIn = async (page: import('@playwright/test').Page, username: string) => {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/dashboard');
};

test.describe('WEB-094 reports with the real API', () => {
  test('someone without the permission is told so, and the download is refused', async ({ page }) => {
    await logIn(page, 'real.consultant');
    await page.goto('/reports');
    await expect(page.getByText('You do not have permission to read the reports')).toBeVisible();
    expect((await page.request.get('/reports/export?file=xlsx')).status()).toBe(403);
  });

  test('shows every stage and downloads a real workbook and CSV', async ({ page }) => {
    await logIn(page, 'real.manager');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Reports' }).click();

    await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();

    const waiting = page.getByRole('table', { name: 'Waiting time by stage' });

    // One row per stage of the workflow, plus the header row.
    await expect(waiting.getByRole('row')).toHaveCount(16);
    await expect(waiting.getByRole('row', { name: /RT chart issued/ })).toBeVisible();

    const workbook = await page.request.get(
      `/reports/export?file=xlsx&from=${await page.getByLabel('From').inputValue()}&to=${await page.getByLabel('To').inputValue()}`,
    );

    expect(workbook.status()).toBe(200);
    expect(workbook.headers()['content-type']).toContain('spreadsheetml');
    // An .xlsx file is a zip, which begins with "PK".
    expect((await workbook.body()).subarray(0, 2).toString()).toBe('PK');

    const csv = await page.request.get('/reports/export?file=waiting');

    expect((await csv.text()).startsWith('﻿Stage,Phase,Stays finished')).toBe(true);
  });

  test('a range the API refuses is shown beside the dates', async ({ page }) => {
    await logIn(page, 'real.manager');
    await page.goto('/reports?from=2026-11-10&to=2026-11-01');
    await expect(page.getByText('The start cannot be after the end.')).toBeVisible();
  });
});

test.describe('WEB-095 changing the workflow with the real API', () => {
  test('starts a draft, shows what changes, and can throw it away', async ({ page }) => {
    await logIn(page, 'real.manager');
    await page.goto('/workflow');
    await page.getByRole('link', { name: 'Change the workflow' }).click();
    await page.getByRole('button', { name: 'Start a draft' }).click();

    const form = page.getByRole('form', { name: 'Edit the draft' });

    await expect(form).toBeVisible();
    await expect(page.getByText('Nothing yet. The draft is the same as the workflow in use.')).toBeVisible();

    await form.getByRole('textbox', { name: 'Stage 2' }).fill('');
    await form.getByRole('button', { name: 'Save changes to the draft' }).click();
    await expect(form.getByText('Enter a name up to 80 characters.')).toBeVisible();

    await form.getByRole('textbox', { name: 'Stage 2' }).fill('Appointments booked');
    await form.getByRole('button', { name: 'Save changes to the draft' }).click();
    await expect(page.getByText(/is now called "Appointments booked"/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve and use for new charts' })).toBeEnabled();

    // Not approved: the workflow in use is unchanged.
    await page.getByRole('button', { name: 'Discard the draft' }).click();
    await expect(page.getByRole('button', { name: 'Start a draft' })).toBeVisible();
    await page.goto('/workflow');
    await expect(page.getByText('Appointments booked')).toHaveCount(0);
  });

  test('someone without the permission cannot open the editor', async ({ page }) => {
    await logIn(page, 'real.consultant');
    await page.goto('/workflow/edit');
    await expect(page.getByText('You do not have permission to change the workflow')).toBeVisible();
  });
});
