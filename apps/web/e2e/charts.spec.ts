import { expect, type Page, test } from '@playwright/test';

import { COOKIE_NAMES } from '../constants/cookie';

// Against the stand-in API (e2e/mock-api.mjs). Each test that creates a chart uses its own RT number,
// because the tests run in parallel and share the stand-in's data.
const signIn = (context: import('@playwright/test').BrowserContext, baseURL: string, token = 'e2e-token') =>
  context.addCookies([{ name: COOKIE_NAMES.ACCESS_TOKEN, value: token, url: baseURL }]);

const fillRequired = async (page: Page, rtNumber: string, sessions = '25') => {
  await page.getByLabel('RT number').fill(rtNumber);
  await page.getByLabel('Planned sessions').fill(sessions);
};

test.describe('WEB-030 the charts list', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL!);
  });

  test('shows open charts, urgent first, with how long each has waited', async ({ page }) => {
    await page.goto('/charts');

    await expect(page.getByRole('heading', { name: 'Charts', level: 1 })).toBeVisible();

    const rows = page.getByRole('row');

    await expect(rows.nth(1)).toContainText('SEED-001');
    await expect(rows.nth(1)).toContainText('Urgent');
    await expect(rows.nth(1)).toContainText('3 h 5 min');
    await expect(page.getByRole('row', { name: /SEED-CLOSED/ })).toHaveCount(0);
  });

  test('finds a chart by RT number, whatever the case', async ({ page }) => {
    await page.goto('/charts');
    await page.getByLabel('RT number').fill('seed-002');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page).toHaveURL(/q=seed-002/);
    await expect(page.getByRole('row', { name: /SEED-002/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /SEED-001/ })).toHaveCount(0);
  });

  test('the status filter can show closed charts', async ({ page }) => {
    await page.goto('/charts');
    await page.getByLabel('Status').selectOption('CLOSED');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page.getByRole('row', { name: /SEED-CLOSED/ })).toContainText('Contouring');
    await expect(page.getByRole('row', { name: /SEED-001/ })).toHaveCount(0);
  });

  test('says so when nothing matches', async ({ page }) => {
    await page.goto('/charts?q=NO-SUCH-CHART');

    await expect(page.getByRole('status')).toHaveText('No charts match this search.');
  });

  test('pages through a long list and keeps the search', async ({ page }) => {
    await page.goto('/charts?q=PAGE&status=OPEN');

    await expect(page.getByText('Showing 1–25 of 30')).toBeVisible();
    await page.getByRole('link', { name: 'Next' }).click();

    await expect(page).toHaveURL(/q=PAGE.*page=2|page=2.*q=PAGE/);
    await expect(page.getByText('Showing 26–30 of 30')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Next' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Previous' }).click();
    await expect(page.getByText('Showing 1–25 of 30')).toBeVisible();
  });

  test('is reached from the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Charts' }).click();

    await expect(page).toHaveURL('/charts');
  });

  test('a logged-out visitor is sent to login and back', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/charts?q=SEED');

    await expect(page).toHaveURL(/\/login\?redirect=/);
  });
});

test.describe('WEB-031 one chart', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL!);
  });

  test('opens from the list and shows details and history', async ({ page }) => {
    await page.goto('/charts?q=SEED-001');
    await page.getByRole('link', { name: 'SEED-001' }).click();

    await expect(page).toHaveURL('/charts/SEED-001');
    await expect(page.getByRole('heading', { name: 'SEED-001', level: 1 })).toBeVisible();
    await expect(page.getByText('PLAN-7')).toBeVisible();
    await expect(page.getByRole('row', { name: /Chart issued/ })).toContainText('Synthetic Consultant');
  });

  test('an RT number with slashes works in the address', async ({ page }) => {
    await page.goto('/charts?q=SEED/2026');
    await page.getByRole('link', { name: 'SEED/2026/3' }).click();

    await expect(page).toHaveURL('/charts/SEED%2F2026%2F3');
    await expect(page.getByRole('heading', { name: 'SEED/2026/3', level: 1 })).toBeVisible();
  });

  test('an unknown RT number shows the not-found page', async ({ page }) => {
    const response = await page.goto('/charts/NO-SUCH');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
  });
});

test.describe('WEB-032 issuing a chart', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL!);
  });

  test('issues a chart and opens it', async ({ page }) => {
    await page.goto('/charts');
    await page.getByRole('link', { name: 'Issue a chart' }).click();

    await expect(page).toHaveURL('/charts/new');
    await fillRequired(page, ' e2e-issue-1 ', '30');
    await page.getByLabel('Priority').selectOption('URGENT');
    await page.getByLabel(/Plan ID/).fill('PLAN-9');
    await page.getByRole('button', { name: 'Issue chart' }).click();

    await expect(page).toHaveURL('/charts/E2E-ISSUE-1');
    await expect(page.getByRole('heading', { name: 'E2E-ISSUE-1', level: 1 })).toBeVisible();
    await expect(page.getByText('PLAN-9')).toBeVisible();
    await expect(page.getByText('Urgent')).toBeVisible();
  });

  test('says what to fix without sending anything, and keeps what was typed', async ({ page }) => {
    await page.goto('/charts/new');
    await page.getByLabel('Priority').selectOption('URGENT');
    await page.getByLabel('Planned sessions').fill('500');
    await page.getByRole('button', { name: 'Issue chart' }).click();

    await expect(page.getByLabel('Planned sessions')).toHaveAccessibleDescription(/whole number from 1 to 100/);
    await expect(page.getByLabel('Planned sessions')).toHaveValue('500');
    await expect(page.getByLabel('Priority')).toHaveValue('URGENT');
    await expect(page).toHaveURL('/charts/new');
  });

  test("shows the API's complaint about the RT number on its field", async ({ page }) => {
    await page.goto('/charts/new');
    await fillRequired(page, 'bad number!');
    await page.getByRole('button', { name: 'Issue chart' }).click();

    await expect(page.getByLabel('RT number')).toHaveAccessibleDescription(/letters, digits and/);
    await expect(page.getByLabel('RT number')).toHaveValue('bad number!');
  });

  test('refuses an RT number that already exists', async ({ page }) => {
    await page.goto('/charts/new');
    await fillRequired(page, 'seed-001');
    await page.getByRole('button', { name: 'Issue chart' }).click();

    await expect(page.getByLabel('RT number')).toHaveAccessibleDescription(
      /A chart with this RT number already exists\./,
    );
  });

  test('explains that no workflow is active', async ({ page }) => {
    await page.goto('/charts/new');
    await fillRequired(page, 'noworkflow');
    await page.getByRole('button', { name: 'Issue chart' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'No workflow' })).toContainText('No workflow is active yet');
  });

  test('warns that the reference fields take no patient names or clinical details', async ({ page }) => {
    await page.goto('/charts/new');

    for (const label of [/Plan ID/, /Contour set name/, /Scan reference/]) {
      await expect(page.getByLabel(label)).toHaveAccessibleDescription(/Never a patient name or clinical detail/);
    }
  });
});

test.describe('WEB-033 who can issue charts', () => {
  test('a resident sees the list but is not offered the form', async ({ page, context, baseURL }) => {
    await signIn(context, baseURL!, 'resident-token');

    await page.goto('/charts');
    await expect(page.getByRole('row', { name: /SEED-001/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Issue a chart' })).toHaveCount(0);

    await page.goto('/charts/new');
    await expect(page.getByRole('status')).toHaveText('Only a consultant can issue a chart.');
    await expect(page.getByLabel('RT number')).toHaveCount(0);
  });
});

test.describe('WEB-050 recording a workflow step', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL!);
  });

  test('shows who the chart waits for and the step form, and records it', async ({ page }) => {
    await page.goto('/charts/STEP-1');

    await expect(
      page.getByText('Waiting for the radiographer to give mould and CT Sim dates (Radiographer).'),
    ).toBeVisible();
    await expect(page.getByRole('form', { name: 'Give mould and CT Sim dates' })).toBeVisible();
    await expect(page.getByLabel('Note (optional)')).toHaveAccessibleDescription('Anything the patient should know.');

    await page.getByRole('button', { name: 'Give mould and CT Sim dates' }).click();

    await expect(page.getByText('Waiting for the patient to attend the mould appointment')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recorded so far' })).toBeVisible();
    await expect(page.getByText('Mould appointment', { exact: true })).toBeVisible();
    await expect(page.getByRole('row', { name: /Mould and CT Sim dates given/ })).toContainText(
      'Mould booked for 2030-01-02 10:00.',
    );
  });

  test('keeps what was typed and explains a field that needs attention', async ({ page }) => {
    await page.goto('/charts/STEP-2');
    await page.getByLabel('Mould date').fill('');
    await page.getByLabel('Note (optional)').fill('Come early.');
    await page.getByRole('button', { name: 'Give mould and CT Sim dates' }).click();

    await expect(page.getByText('Enter mould date.')).toBeVisible();
    await expect(page.getByLabel('Mould date')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Mould date')).toHaveAccessibleDescription('Enter mould date.');
    await expect(page.getByLabel('Note (optional)')).toHaveValue('Come early.');
    await expect(page).toHaveURL('/charts/STEP-2');
  });

  test('tells the person when the chart changed while they were working', async ({ page }) => {
    await page.goto('/charts/CHANGED-1');
    await page.getByRole('button', { name: 'Give mould and CT Sim dates' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'changed while you were working' })).toBeVisible();
  });

  test('a person who cannot do the step is not offered the form', async ({ page, context, baseURL }) => {
    await signIn(context, baseURL!, 'resident-token');
    await page.goto('/charts/SEED-001');

    await expect(
      page.getByText('Waiting for a junior resident to submit the contours (Junior resident).'),
    ).toBeVisible();
    await expect(page.getByText('This step is not yours to take.')).toBeVisible();
    // Only the comment form: there is no step to take.
    await expect(page.getByRole('form').filter({ hasNotText: 'Add a comment' })).toHaveCount(0);
  });

  test('adds a comment to the discussion, and asks for text', async ({ page }) => {
    await page.goto('/charts/SEED-002');
    await expect(page.getByText('No comments yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Add comment' }).click();
    await expect(page.getByText('Write a comment.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Comment', exact: true })).toHaveAccessibleDescription(
      /Operational notes only/,
    );

    await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Is the CT slot confirmed?');
    await page.getByRole('combobox', { name: /^For/ }).selectOption('RADIOGRAPHER');
    await page.getByRole('button', { name: 'Add comment' }).click();

    const list = page.getByRole('list', { name: 'Comments, oldest first' });

    await expect(list).toContainText('Is the CT slot confirmed?');
    await expect(list).toContainText('for Radiographer');
    await expect(list).toContainText('Synthetic Consultant');
    await expect(page.getByText('No comments yet.')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue('');
  });
});

test.describe('WEB-060 the queue and the overview', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL!);
  });

  test('the dashboard leads with what needs the signed-in person and lists everyone else’s', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Needs you', level: 2 })).toBeVisible();
    await expect(page.getByRole('status').first()).toHaveText(/charts need you/);

    const mine = page.getByRole('list', { name: 'Charts that need you' });

    await expect(mine.getByRole('listitem').first()).toContainText('SEED-001');
    await expect(mine.getByRole('listitem').first()).toContainText('Urgent');
    await expect(mine.getByRole('link', { name: 'STEP-1' })).toBeVisible();
    await expect(mine.getByText('Give mould and CT Sim dates').first()).toBeVisible();

    const others = page.getByRole('table', { name: 'Charts waiting on other people' });

    await expect(others.getByRole('row', { name: /SEED-002/ })).toContainText('Junior resident');
    await expect(others.getByRole('row', { name: /STEP-1/ })).toHaveCount(0);
  });

  test('the overview shows the tiles and filters the charts', async ({ page }) => {
    await page.goto('/overview');

    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await expect(page.getByText('Saturday updates to come', { exact: true })).toBeVisible();
    await expect(page.getByText('Stalled over 3 days')).toBeVisible();
    await expect(page.getByRole('row', { name: /SEED-002/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^All \(\d+\)$/ })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: /^Stalled \(0\)$/ }).click();

    await expect(page).toHaveURL(/filter=stalled/);
    await expect(page.getByRole('status')).toHaveText('No charts match this view.');

    await page.getByRole('link', { name: /^Getting ready/ }).click();

    await expect(page.getByRole('row', { name: /SEED-002/ })).toBeVisible();
    await expect(page.getByRole('progressbar').first()).toBeVisible();
  });
});

test.describe('WEB-080 calendar, Saturday updates and stages', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL!);
  });

  test('the calendar shows each day, the late ones, and moves by a window', async ({ page }) => {
    await page.goto('/calendar');

    await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();

    const late = page.getByRole('region', { name: 'Not recorded as done' });

    await expect(late.getByRole('link', { name: 'SEED-003' })).toBeVisible();

    const monday = page.getByRole('listitem', { name: 'Mon 30 Nov' });

    await expect(monday).toContainText('11:30');
    await expect(monday).toContainText('LINAC 2');
    await expect(page.getByRole('listitem', { name: 'Sun 29 Nov' })).toContainText('Nothing booked.');

    await page.getByRole('link', { name: 'Next 3 days' }).click();
    await expect(page).toHaveURL(/\/calendar\?from=2026-12-01/);
  });

  test('the Saturday updates page leads with the week', async ({ page }) => {
    await page.goto('/saturday');

    await expect(page.getByRole('heading', { name: 'Saturday updates', level: 1 })).toBeVisible();
    await expect(page.getByText(/Week ending/)).toContainText('28 Nov 2026');
    await expect(page.getByText('No chart is in treatment.')).toBeVisible();
  });

  test('the stage map lists the workflow by phase with the charts in each stage', async ({ page }) => {
    await page.goto('/stages');

    await expect(page.getByRole('heading', { name: 'Stages', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Getting ready', level: 2 })).toBeVisible();
    await expect(page.getByRole('listitem', { name: 'RT chart issued' }).getByRole('link').first()).toBeVisible();
    await expect(page.getByRole('listitem', { name: 'Contouring' })).toContainText('0 open');
  });

  test('every page is reached from the main navigation', async ({ page }) => {
    await page.goto('/dashboard');

    for (const [name, url] of [
      ['Calendar', '/calendar'],
      ['Saturday updates', '/saturday'],
      ['Stages', '/stages'],
    ] as const) {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(url);
    }
  });

  test('a logged-out visitor is sent to log in', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/calendar');

    await expect(page).toHaveURL(/\/login\?redirect=/);
  });
});

test.describe('WEB-070 the inbox', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, baseURL!);
  });

  test('lists what has reached the person, marks them read, and the bell follows', async ({ page }) => {
    await page.goto('/notifications');

    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('2 unread.');
    await expect(page.getByRole('link', { name: /^Inbox/ })).toContainText('2');

    const list = page.getByRole('list', { name: 'Notifications' });
    const sentBack = list.getByRole('listitem').filter({ hasText: 'Brain stem is missing.' });

    await expect(sentBack).toContainText('Sent back');
    await expect(sentBack.getByRole('link', { name: 'Open SEED-002' })).toHaveAttribute('href', '/charts/SEED-002');

    await sentBack.getByRole('button', { name: 'Mark as read' }).click();
    await expect(page.getByRole('status')).toHaveText('1 unread.');

    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(page.getByRole('status')).toHaveText('Nothing new.');
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
  });
});

test.describe('WEB-092 changing the workflow', () => {
  // These share the one draft the stand-in API holds.
  test.describe.configure({ mode: 'serial' });

  test('someone without the permission is told so', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!, 'resident-token');
    await page.goto('/workflow/edit');
    await expect(page.getByText('You do not have permission to change the workflow')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Change the workflow' })).toHaveCount(0);
  });

  test('prepares a draft, sees what will change, then approves it', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!);
    await page.goto('/workflow');
    await page.getByRole('link', { name: 'Change the workflow' }).click();

    await expect(page.getByRole('heading', { name: 'Change the workflow', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Start a draft' }).click();

    const form = page.getByRole('form', { name: 'Edit the draft' });

    await expect(form).toBeVisible();
    await expect(page.getByText('Nothing yet. The draft is the same as the workflow in use.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve and use for new charts' })).toBeDisabled();

    // A bad entry is refused with a message beside it.
    await form.getByRole('textbox', { name: 'Stage 2' }).fill('');
    await form.getByRole('button', { name: 'Save changes to the draft' }).click();
    await expect(form.getByText('Enter a name up to 80 characters.')).toBeVisible();

    await form.getByRole('textbox', { name: 'Stage 2' }).fill('Appointments booked');
    await form
      .getByRole('checkbox', { name: 'Senior resident may Give mould and CT Sim dates at RT chart issued' })
      .check();
    await form.getByRole('button', { name: 'Save changes to the draft' }).click();

    const changes = page.getByRole('region', { name: 'What will change' });

    await expect(changes).toContainText('"Dates given" is now called "Appointments booked"');
    await expect(changes).toContainText('can be done by the senior resident and radiographer');

    await page.getByRole('button', { name: 'Approve and use for new charts' }).click();
    await expect(page).toHaveURL(/\/workflow$/);
    await expect(page.getByRole('heading', { name: 'Workflow', level: 1 })).toBeVisible();
  });

  test('a draft can be thrown away', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!);
    await page.goto('/workflow/edit');
    await page.getByRole('button', { name: 'Start a draft' }).click();
    await expect(page.getByRole('form', { name: 'Edit the draft' })).toBeVisible();

    await page.getByRole('button', { name: 'Discard the draft' }).click();
    await expect(page.getByRole('button', { name: 'Start a draft' })).toBeVisible();
  });
});

test.describe('WEB-090 staff, workflow and audit', () => {
  test('the nav shows Staff and Audit only to those who hold them', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!);
    await page.goto('/charts');

    const nav = page.getByRole('navigation', { name: 'Main' });

    await expect(nav.getByRole('link', { name: 'Staff', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Audit', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Workflow', exact: true })).toBeVisible();

    await context.clearCookies();
    await signIn(context, baseURL!, 'resident-token');
    await page.goto('/charts');
    await expect(nav.getByRole('link', { name: 'Workflow', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Staff', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Audit', exact: true })).toHaveCount(0);
  });

  test('someone without the permission is told so and sees no accounts', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!, 'resident-token');

    await page.goto('/staff');
    await expect(page.getByText('You do not have permission to manage staff accounts')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Staff' })).toHaveCount(0);

    await page.goto('/audit');
    await expect(page.getByText('You do not have permission to read the audit trail')).toBeVisible();
  });

  test('adds an account, with a message beside each field that needs attention', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!);
    await page.goto('/staff');

    await expect(page.getByRole('heading', { name: 'Staff', level: 1 })).toBeVisible();

    const list = page.getByRole('list', { name: 'Staff' });

    await expect(list).toContainText('Synthetic Consultant');
    await expect(list).toContainText('Synthetic Resident');

    const form = page.getByRole('form', { name: 'Add an account' });

    await form.getByRole('textbox', { name: 'Full name' }).fill('Dr New Person');
    await form.getByRole('textbox', { name: 'Username' }).fill('e2e.new.account');
    await form.getByLabel('First password').fill('short');
    await form.getByRole('button', { name: 'Add account' }).click();

    await expect(form.getByText('Use at least 12 characters.')).toBeVisible();
    await expect(form.getByText('Choose at least one role.')).toBeVisible();
    // What was typed is kept; the password never is.
    await expect(form.getByRole('textbox', { name: 'Username' })).toHaveValue('e2e.new.account');
    await expect(form.getByLabel('First password')).toHaveValue('');

    await form.getByLabel('First password').fill('a long enough passphrase');
    await form.getByRole('checkbox', { name: 'Radiographer' }).check();
    await form.getByRole('button', { name: 'Add account' }).click();

    await expect(form.getByRole('status')).toContainText('Dr New Person can now sign in.');
    await expect(list).toContainText('Dr New Person');
    await expect(list).toContainText('Has not signed in yet');
    await expect(form.getByRole('textbox', { name: 'Username' })).toHaveValue('');
  });

  test('changes an account, and will not let you switch yourself off', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!);
    await page.goto('/staff');

    const resident = page.getByRole('listitem').filter({ hasText: 'synthetic.resident' });

    await resident.getByText('Change Synthetic Resident').click();

    const form = resident.getByRole('form', { name: 'Edit Synthetic Resident' });

    await form.getByRole('checkbox', { name: /Available for new work/ }).uncheck();
    await form.getByRole('button', { name: 'Save changes' }).click();

    await expect(form.getByRole('status')).toHaveText('Saved.');
    await expect(resident).toContainText('Not available');

    const me = page.getByRole('listitem').filter({ hasText: 'synthetic.consultant' });

    await me.getByText('Change Synthetic Consultant').click();
    await expect(
      me.getByRole('form', { name: 'Edit Synthetic Consultant' }).getByRole('checkbox', { name: /Can sign in/ }),
    ).toBeDisabled();
  });

  test('a new password needs at least twelve characters', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!);
    await page.goto('/staff');

    const resident = page.getByRole('listitem').filter({ hasText: 'synthetic.resident' });

    await resident.getByText('Change Synthetic Resident').click();

    const form = resident.getByRole('form', { name: 'New password for Synthetic Resident' });

    await form.getByLabel('New password').fill('short');
    await form.getByRole('button', { name: 'Set password' }).click();
    await expect(form.getByText('Use at least 12 characters.')).toBeVisible();

    await form.getByLabel('New password').fill('a long enough passphrase');
    await form.getByRole('button', { name: 'Set password' }).click();
    await expect(form.getByRole('status')).toContainText('Password set.');
  });

  test('the workflow page shows every stage and the steps out of it', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!, 'resident-token');
    await page.goto('/workflow');

    await expect(page.getByRole('heading', { name: 'Workflow', level: 1 })).toBeVisible();
    await expect(page.getByText(/version 1/)).toContainText('Approved by Synthetic Consultant');

    const stages = page
      .getByRole('list', { name: 'Stages' })
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading') });

    await expect(stages).toHaveCount(4);
    await expect(stages.first()).toContainText('Where every chart starts');
    await expect(stages.first()).toContainText('Give mould and CT Sim dates by Radiographer → Dates given');
    await expect(stages.nth(2)).toContainText('Saturday update: Junior resident and Radiographer');
    await expect(stages.last()).toContainText('Where tracking ends');
    await expect(stages.last()).toContainText('No further steps.');
  });

  test('the audit page lists entries and narrows by chart', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!);
    await page.goto('/audit');

    await expect(page.getByRole('heading', { name: 'Audit trail', level: 1 })).toBeVisible();

    const trail = page.getByRole('list', { name: 'Audit trail' });

    await expect(trail.getByRole('listitem')).toHaveCount(4);
    await expect(trail.getByRole('listitem').first()).toContainText('Staff created');

    await page
      .getByRole('searchbox')
      .or(page.getByRole('textbox', { name: 'RT number' }))
      .first()
      .fill('seed-002');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page).toHaveURL(/\/audit\?rt=seed-002/);
    await expect(trail.getByRole('listitem')).toHaveCount(1);
    await expect(trail).toContainText('Chart issued');

    await page.getByLabel('What happened').selectOption('STAFF_CREATED');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('Nothing in the audit trail matches this search.')).toBeVisible();
  });

  test('deletes an account that was never used, and offers nothing for one that was', async ({
    context,
    baseURL,
    page,
  }) => {
    await signIn(context, baseURL!);
    await page.goto('/staff');

    const form = page.getByRole('form', { name: 'Add an account' });

    await form.getByRole('textbox', { name: 'Full name' }).fill('Entered By Mistake');
    await form.getByRole('textbox', { name: 'Username' }).fill('e2e.delete.me');
    await form.getByLabel('First password').fill('a long enough passphrase');
    await form.getByRole('checkbox', { name: 'Physicist' }).check();
    await form.getByRole('button', { name: 'Add account' }).click();

    const person = page.getByRole('listitem').filter({ hasText: 'e2e.delete.me' });

    await person.getByText('Change Entered By Mistake').click();
    await person.getByRole('button', { name: 'Delete this account' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'e2e.delete.me' })).toHaveCount(0);

    // Someone with a sign-in on record has history: no delete.
    const used = page.getByRole('listitem').filter({ hasText: 'synthetic.consultant' });

    await expect(used.getByRole('button', { name: 'Delete this account' })).toHaveCount(0);
  });

  test('adds a directory account without a password, and shows it as one', async ({ context, baseURL, page }) => {
    await signIn(context, baseURL!);
    await page.goto('/staff');

    const form = page.getByRole('form', { name: 'Add an account' });

    await form.getByRole('textbox', { name: 'Full name' }).fill('Dr From Directory');
    await form.getByRole('textbox', { name: 'Username' }).fill('e2e.directory.new');
    await form.getByRole('radio', { name: /hospital directory/ }).check();
    await expect(form.getByLabel('First password')).toHaveCount(0);
    await form.getByRole('checkbox', { name: 'Senior resident' }).check();
    await form.getByRole('button', { name: 'Add account' }).click();

    const person = page.getByRole('listitem').filter({ hasText: 'e2e.directory.new' });

    await expect(person).toContainText('Directory');
    await person.getByText('Change Dr From Directory').click();
    await expect(person.getByText('password is changed there')).toBeVisible();
    await expect(person.getByRole('form', { name: /New password for/ })).toHaveCount(0);
  });
});
