import { expect, test } from '@playwright/test';

import { chartAtCtSimDone, chartAtPhysicsPlanning, chartAtPlanApproved, istDay } from './workflow-api';

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

test.describe('WEB-052 contouring: assign, submit, verify, approve, send back', () => {
  const rtNumber = `WF/${STAMP}/2`;
  const open = (page: import('@playwright/test').Page) => page.goto(`/charts/${encodeURIComponent(rtNumber)}`);

  test('the consultant picks a junior resident and a due date', async ({ page, request }) => {
    await request.post(`${CONTROL}/activate-workflow`);
    await chartAtCtSimDone(request, rtNumber);
    await logIn(page, 'real.consultant');
    await open(page);

    await expect(page.getByText('Waiting for a junior resident to be assigned for contouring')).toBeVisible();
    const choice = page.getByLabel('Junior resident', { exact: true });

    await expect(choice.getByRole('option')).toHaveText(['Real Junior Anand', 'Real Junior Bina']);
    await choice.selectOption({ label: 'Real Junior Bina' });
    await page.getByLabel('Instructions for the resident').fill('Both parotids please.');
    await page.getByRole('button', { name: 'Assign a junior resident' }).click();

    await expect(page.getByText('Waiting for the assigned junior resident to submit contouring')).toBeVisible();
    await expect(page.getByText('Contouring assigned to', { exact: true })).toBeVisible();
    await expect(page.getByText('Real Junior Bina').first()).toBeVisible();
    await expect(page.getByRole('row', { name: /Assigned to Real Junior Bina/ })).toContainText(
      'Both parotids please.',
    );
  });

  test('the other junior resident is not offered the step; the assigned one submits', async ({ page }) => {
    await logIn(page, 'real.junior');
    await open(page);
    await expect(page.getByText('This step is not yours to take.')).toBeVisible();
    await expect(page.getByRole('form')).toHaveCount(0);

    await logIn(page, 'real.junior2');
    await open(page);
    await page.getByLabel(/Contour set name/).fill('C-2001');
    await page.getByRole('button', { name: 'Submit contouring' }).click();

    await expect(page.getByText('Waiting for the senior resident to verify the contouring')).toBeVisible();
    await expect(page.getByText('C-2001').first()).toBeVisible();
  });

  test('a senior resident must give a reason to send it back, then the chart returns to the resident', async ({
    page,
  }) => {
    await logIn(page, 'real.senior');
    await open(page);
    await page.getByRole('button', { name: 'Send back' }).click();

    await expect(page.getByLabel('Why is it going back?')).toHaveAccessibleDescription(/Say why it is going back\./);

    await page.getByLabel('Why is it going back?').fill('Left lung is missing.');
    await page.getByRole('button', { name: 'Send back' }).click();

    await expect(page.getByText('Waiting for the assigned junior resident to submit contouring')).toBeVisible();
    await expect(page.getByRole('row', { name: /Send back to junior resident/ })).toContainText(
      'Reason: Left lung is missing.',
    );
    await expect(page.getByText('Contouring submitted', { exact: true })).toHaveCount(0);
  });

  test('submit again, then the senior resident verifies and the consultant approves', async ({ page }) => {
    await logIn(page, 'real.junior2');
    await open(page);
    await page.getByRole('button', { name: 'Submit contouring' }).click();
    await expect(page.getByText('Waiting for the senior resident to verify the contouring')).toBeVisible();

    await logIn(page, 'real.senior');
    await open(page);
    await page.getByRole('button', { name: 'Verify contouring' }).click();
    await expect(page.getByText('Waiting for the consultant to approve the contouring')).toBeVisible();

    await logIn(page, 'real.consultant');
    await open(page);
    await page.getByLabel('Comment (optional)').fill('Good.');
    await page.getByRole('button', { name: 'Approve contouring' }).click();

    await expect(page.getByText('Waiting for the physicist to build and submit the plan')).toBeVisible();
    await expect(page.getByText('Contouring approved', { exact: true })).toBeVisible();
    await expect(page.getByText('Contouring verified by senior resident', { exact: true })).toBeVisible();
  });
});

test.describe('WEB-053 planning: plan, approve, send back, send to the LINAC', () => {
  const rtNumber = `WF/${STAMP}/3`;
  const open = (page: import('@playwright/test').Page, rt = rtNumber) => page.goto(`/charts/${encodeURIComponent(rt)}`);

  test('the physicist must give a plan ID, then submits the plan', async ({ page, request }) => {
    await request.post(`${CONTROL}/activate-workflow`);
    await chartAtPhysicsPlanning(request, rtNumber);
    await logIn(page, 'real.physicist');
    await open(page);

    await expect(page.getByText('Waiting for the physicist to build and submit the plan')).toBeVisible();
    await page.getByRole('button', { name: 'Submit plan for approval' }).click();
    await expect(page.getByLabel('Plan ID')).toHaveAccessibleDescription(/Enter plan ID\./);

    await page.getByLabel('Plan ID').fill('PLAN-5871');
    await page.getByLabel('Note for the consultant').fill('Two arcs.');
    await page.getByRole('button', { name: 'Submit plan for approval' }).click();

    await expect(page.getByText('Waiting for the consultant or treating doctor to approve the plan')).toBeVisible();
    await expect(
      page.getByRole('row', { name: /Plan PLAN-5871 submitted for approval\. Note: Two arcs\./ }),
    ).toBeVisible();
  });

  test('the consultant sends it back with a reason; the physicist submits again', async ({ page }) => {
    await logIn(page, 'real.consultant');
    await open(page);
    await page.getByLabel('Why is it going back?').fill('Dose to the cord is too high.');
    await page.getByRole('button', { name: 'Send back' }).click();

    await expect(page.getByText('Waiting for the physicist to build and submit the plan')).toBeVisible();
    await expect(page.getByText('Plan submitted', { exact: true })).toHaveCount(0);

    await logIn(page, 'real.physicist');
    await open(page);
    await page.getByLabel('Plan ID').fill('PLAN-5872');
    await page.getByRole('button', { name: 'Submit plan for approval' }).click();
    await expect(page.getByText('Waiting for the consultant or treating doctor to approve the plan')).toBeVisible();
  });

  test('approved by the treating doctor, then sent to the LINAC with a reserved first slot', async ({ page }) => {
    await logIn(page, 'real.consultant');
    await open(page);
    await page.getByLabel('Approved by').selectOption('Treating doctor');
    await page.getByRole('button', { name: 'Approve plan' }).click();

    await expect(page.getByText('Waiting for the approved plan to be sent to the LINAC')).toBeVisible();
    await expect(page.getByRole('definition').filter({ hasText: /by the treating doctor/ })).toBeVisible();

    await logIn(page, 'real.physicist');
    await open(page);
    await expect(page.getByLabel('Machine')).toHaveValue('LINAC 1');
    await expect(page.getByLabel('First treatment time')).toHaveValue('09:00');
    await page.getByLabel('First treatment date').fill(istDay(20));
    await page.getByRole('button', { name: 'Send plan to LINAC' }).click();

    await expect(page.getByText('Waiting for the radiographer to inform the patient')).toBeVisible();
    await expect(page.getByText('First treatment slot', { exact: true })).toBeVisible();
    await expect(page.getByText(/, LINAC 1$/).first()).toBeVisible();
  });

  test('a slot another chart already holds is refused on the time field, naming that chart', async ({
    page,
    request,
  }) => {
    const other = `WF/${STAMP}/3B`;

    await chartAtPlanApproved(request, other);
    await logIn(page, 'real.physicist');
    await open(page, other);
    await page.getByLabel('First treatment date').fill(istDay(20));
    await page.getByRole('button', { name: 'Send plan to LINAC' }).click();

    await expect(page.getByLabel('First treatment time')).toHaveAccessibleDescription(
      `LINAC 1 is already booked at that time for ${rtNumber}.`,
    );
    await expect(page.getByLabel('First treatment date')).toHaveValue(istDay(20));

    await page.getByLabel('First treatment time').fill('10:00');
    await page.getByRole('button', { name: 'Send plan to LINAC' }).click();
    await expect(page.getByText('Waiting for the radiographer to inform the patient')).toBeVisible();
  });
});
