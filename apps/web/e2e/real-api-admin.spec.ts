import { expect, test } from '@playwright/test';

// Staff management against the real API on a real (in-memory) PostgreSQL: what a consultant does on the Staff page
// really changes who can sign in, and the audit trail records it.
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'correct horse battery';
const FIRST_PASSWORD = 'a long enough passphrase';
const STAMP = Date.now().toString(36);
const USERNAME = `real.new.${STAMP}`;
const FULL_NAME = `Real New Radiographer ${STAMP}`;

const logIn = async (page: import('@playwright/test').Page, username: string, password = PASSWORD) => {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
};

const logInAndWait = async (page: import('@playwright/test').Page, username: string) => {
  await logIn(page, username);
  await expect(page).toHaveURL('/dashboard');
};

test.describe('WEB-091 staff management with the real API', () => {
  test('a consultant adds an account and the new person can sign in with the first password', async ({ page }) => {
    await logIn(page, 'real.consultant');
    await expect(page).toHaveURL('/dashboard');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Staff', exact: true }).click();

    const form = page.getByRole('form', { name: 'Add an account' });

    await form.getByRole('textbox', { name: 'Full name' }).fill(FULL_NAME);
    await form.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
    await form.getByLabel('First password').fill(FIRST_PASSWORD);
    await form.getByRole('checkbox', { name: 'Radiographer' }).check();
    await form.getByRole('button', { name: 'Add account' }).click();

    await expect(page.getByRole('list', { name: 'Staff' })).toContainText(FULL_NAME);

    await logIn(page, USERNAME, FIRST_PASSWORD);
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText(FULL_NAME).first()).toBeVisible();

    // A radiographer holds no extra access, so the Staff and Audit pages are not offered, and the pages refuse.
    const nav = page.getByRole('navigation', { name: 'Main' });

    await expect(nav.getByRole('link', { name: 'Staff', exact: true })).toHaveCount(0);
    await page.goto('/staff');
    await expect(page.getByText('You do not have permission to manage staff accounts')).toBeVisible();
  });

  test('switching the account off signs them out and stops them signing in again', async ({ page, browser }) => {
    // The new person is signed in, in their own browser, while the consultant switches them off.
    const other = await browser.newContext();
    const otherPage = await other.newPage();

    await logIn(otherPage, USERNAME, FIRST_PASSWORD);
    await expect(otherPage).toHaveURL('/dashboard');

    await logInAndWait(page, 'real.consultant');
    await page.goto('/staff');

    const person = page.getByRole('listitem').filter({ hasText: USERNAME });

    await person.getByText(`Change ${FULL_NAME}`).click();

    const edit = person.getByRole('form', { name: `Edit ${FULL_NAME}` });

    await edit.getByRole('checkbox', { name: /Can sign in/ }).uncheck();
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(person).toContainText('Switched off');

    // Their open session no longer works.
    await otherPage.goto('/charts');
    await expect(otherPage).toHaveURL(/\/login/);
    await other.close();

    await logIn(page, USERNAME, FIRST_PASSWORD);
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid username' })).toHaveText(
      'Invalid username or password.',
    );
  });

  test('the audit trail records who added and changed the account, without any password', async ({ page }) => {
    await logInAndWait(page, 'real.consultant');
    await page.goto('/audit?action=STAFF_CREATED');

    const trail = page.getByRole('list', { name: 'Audit trail' });
    const created = trail.getByRole('listitem').filter({ hasText: USERNAME });

    await expect(created).toContainText('Staff created');
    await expect(created).toContainText('Real Test Consultant');
    await expect(trail).not.toContainText(FIRST_PASSWORD);

    await page.goto('/audit?action=STAFF_UPDATED');
    await expect(page.getByRole('list', { name: 'Audit trail' }).getByRole('listitem').first()).toContainText(
      'Staff updated',
    );
  });

  test('the workflow page shows the approved workflow to a radiographer', async ({ page, request }) => {
    await request.post('http://127.0.0.1:4021/activate-workflow');
    await logInAndWait(page, 'real.radiographer');
    await page.goto('/workflow');

    await expect(page.getByRole('heading', { name: 'Workflow', level: 1 })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Stages' }).getByRole('heading')).toHaveCount(15);
    await expect(page.getByText('Give mould and CT Sim dates').first()).toBeVisible();
  });

  test('an account never used can be deleted; one that signed in cannot', async ({ page }) => {
    await logInAndWait(page, 'real.consultant');
    await page.goto('/staff');

    const form = page.getByRole('form', { name: 'Add an account' });
    const name = `Entered By Mistake ${STAMP}`;

    await form.getByRole('textbox', { name: 'Full name' }).fill(name);
    await form.getByRole('textbox', { name: 'Username' }).fill(`real.mistake.${STAMP}`);
    await form.getByLabel('First password').fill(FIRST_PASSWORD);
    await form.getByRole('checkbox', { name: 'Physicist' }).check();
    await form.getByRole('button', { name: 'Add account' }).click();

    const mistake = page.getByRole('listitem').filter({ hasText: `real.mistake.${STAMP}` });

    await mistake.getByText(`Change ${name}`).click();
    await mistake.getByRole('button', { name: 'Delete this account' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: `real.mistake.${STAMP}` })).toHaveCount(0);

    // The account that signed in earlier has history, so there is nothing to delete it with.
    const used = page.getByRole('listitem').filter({ hasText: USERNAME });

    await used.getByText(`Change ${FULL_NAME}`).click();
    await expect(used.getByRole('button', { name: 'Delete this account' })).toHaveCount(0);
  });
});
