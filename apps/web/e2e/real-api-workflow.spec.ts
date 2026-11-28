import { expect, test } from '@playwright/test';

// The workflow, step by step, in a browser against the real API on a real (in-memory) PostgreSQL.
// Each describe issues its own chart so the tests do not depend on each other's charts.
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'correct horse battery';
const CONTROL = 'http://127.0.0.1:4021';
const STAMP = Date.now().toString(36).toUpperCase();

const logIn = async (page: import('@playwright/test').Page, username: string) => {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/dashboard');
};

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

test.describe('WEB-051 getting ready: the radiographer steps', () => {
  const rtNumber = `WF/${STAMP}/1`;

  test('a consultant issues the chart', async ({ page, request }) => {
    await request.post(`${CONTROL}/activate-workflow`);
    await logIn(page, 'real.consultant');
    await page.goto('/charts/new');
    await page.getByLabel('RT number').fill(rtNumber);
    await page.getByLabel('Planned sessions').fill('20');
    await page.getByRole('button', { name: 'Issue chart' }).click();

    await expect(page).toHaveURL(`/charts/${encodeURIComponent(rtNumber)}`);
    await expect(page.getByText('Waiting for the radiographer to give mould and CT Sim dates')).toBeVisible();
    // Not the consultant's step.
    await expect(page.getByText('This step is not yours to take.')).toBeVisible();
    await expect(page.getByRole('form')).toHaveCount(0);
  });

  test('the radiographer gives the dates with the offered defaults', async ({ page }) => {
    await logIn(page, 'real.radiographer');
    await page.goto(`/charts/${encodeURIComponent(rtNumber)}`);

    await page.getByLabel(/What the patient must do/).fill('Full bladder please.');
    await page.getByRole('button', { name: 'Give mould and CT Sim dates' }).click();

    await expect(page.getByText('Waiting for the patient to attend the mould appointment')).toBeVisible();
    await expect(page.getByText('Mould appointment', { exact: true })).toBeVisible();
    await expect(page.getByText('CT Sim appointment', { exact: true })).toBeVisible();
    await expect(page.getByRole('row', { name: /Give simulation dates/i })).toContainText('Full bladder please.');
    await expect(page.getByRole('row', { name: /Give simulation dates/i })).toContainText('Real Test Radiographer');
  });

  test('a mould date in the past is refused where the person is looking, and nothing is saved', async ({ page }) => {
    const rt = `WF/${STAMP}/PAST`;

    await logIn(page, 'real.consultant');
    await page.goto('/charts/new');
    await page.getByLabel('RT number').fill(rt);
    await page.getByLabel('Planned sessions').fill('5');
    await page.getByRole('button', { name: 'Issue chart' }).click();
    await expect(page).toHaveURL(`/charts/${encodeURIComponent(rt)}`);

    await logIn(page, 'real.radiographer');
    await page.goto(`/charts/${encodeURIComponent(rt)}`);
    await page.getByLabel('Mould date').fill('2020-01-01');
    await page.getByRole('button', { name: 'Give mould and CT Sim dates' }).click();

    await expect(page.getByLabel('Mould date')).toHaveAccessibleDescription('Choose today or a later date.');
    await expect(page.getByLabel('Mould date')).toHaveValue('2020-01-01');
    await expect(page.getByText('Waiting for the radiographer to give mould and CT Sim dates')).toBeVisible();
  });

  test('then mould done and CT Sim done, in order', async ({ page }) => {
    await logIn(page, 'real.radiographer');
    await page.goto(`/charts/${encodeURIComponent(rtNumber)}`);

    await expect(page.getByLabel('Date the mould was made')).toHaveValue(today());
    await page.getByRole('button', { name: 'Record mould done' }).click();
    await expect(page.getByText('Waiting for the patient to attend CT simulation')).toBeVisible();

    await page.getByLabel(/Scan reference/).fill('CT-77');
    await page.getByRole('button', { name: 'Record CT Sim done' }).click();

    await expect(page.getByText('Waiting for a junior resident to be assigned for contouring')).toBeVisible();
    await expect(page.getByText('CT-77').first()).toBeVisible();
    await expect(page.getByRole('form')).toHaveCount(0);
    await expect(page.getByText('This step is not yours to take.')).toBeVisible();
  });
});
