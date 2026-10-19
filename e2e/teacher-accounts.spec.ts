import { expect, test, type Page } from '@playwright/test';
import { openAs, resetData, TEACHER } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetData(page);
});

async function signInWithPassword(page: Page, login: string, password: string) {
  const form = page.getByRole('form', { name: 'Sign in with username' });
  await form.getByLabel('Username or email').fill(login);
  await form.getByLabel('Password').fill(password);
  await form.getByRole('button', { name: 'Sign in' }).click();
}

test('the teacher adds a student without email, who then signs in with a password', async ({ page }) => {
  await openAs(page, TEACHER, '/students');
  await page.getByRole('button', { name: 'Add student' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add student' });
  await dialog.getByLabel('Name', { exact: true }).fill('Haruko Sato');
  await dialog.getByLabel(/^Username/).fill('Haruko');
  await dialog.getByLabel(/^Password/).fill('lemon-harbor-88');
  await dialog.getByRole('button', { name: 'Add student' }).click();

  const card = dialog.getByRole('region', { name: 'Sign-in details' });
  await expect(card).toContainText('haruko');
  await expect(card).toContainText('lemon-harbor-88');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('row', { name: /Haruko Sato/ })).toContainText('@haruko · No email');

  const student = await page.context().newPage();
  await student.goto('/');
  await signInWithPassword(student, 'haruko', 'lemon-harbor-88');
  await expect(student.getByRole('heading', { name: 'Hi, Haruko' })).toBeVisible();
  await student.getByRole('button', { name: /Account menu/ }).click();
  await expect(student.getByText('No email address')).toBeVisible();
  await expect(student.getByRole('link', { name: 'Manage Google account' })).toBeHidden();
});

test('the teacher resets a student password', async ({ page }) => {
  await openAs(page, TEACHER, '/students');
  await page
    .getByRole('row', { name: /Yuki Tanaka/ })
    .getByRole('button', { name: 'View' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Yuki Tanaka' });
  await expect(dialog).toContainText('Google only (no password yet)');
  await dialog.getByRole('button', { name: 'Set username and password' }).click();
  const form = dialog.getByRole('form', { name: 'Set username and password' });
  await form.getByLabel(/^Username/).fill('yuki');
  await form.getByLabel(/^Password/).fill('river-maple-21');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('region', { name: 'Sign-in details' })).toContainText('river-maple-21');
  await expect(dialog).toContainText('Username "yuki"');

  const student = await page.context().newPage();
  await student.goto('/');
  await signInWithPassword(student, 'yuki', 'river-maple-21');
  await expect(student.getByRole('heading', { name: 'Hi, Yuki' })).toBeVisible();
});

test('sign-in leads with username and password, and points non-email users to the teacher', async ({ page }) => {
  await page.goto('/');
  const form = page.getByRole('form', { name: 'Sign in with username' });
  await form.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByText('No email on your account? Ask your teacher to reset your password.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await form.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByText("Don't use email? Ask your teacher to set up your account for you.")).toBeVisible();
});
