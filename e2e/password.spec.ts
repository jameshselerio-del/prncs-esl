import { expect, test, type Page } from '@playwright/test';
import { api, API_URL, openAs, resetData, YUKI } from './helpers';

const PASSWORD = 'green tea 123';

test.beforeEach(async ({ page }) => {
  await resetData(page);
});

const signInForm = (page: Page) => page.getByRole('form', { name: 'Sign in with username' });

async function signInWithPassword(page: Page, login: string, password: string) {
  const form = signInForm(page);
  await form.getByLabel('Username or email').fill(login);
  await form.getByLabel('Password').fill(password);
  await form.getByRole('button', { name: 'Sign in' }).click();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(signInForm(page)).toBeVisible();
}

test('a student adds a username and password, then signs in with them', async ({ page }) => {
  await openAs(page, YUKI, '/profile');
  await expect(page.getByRole('heading', { name: 'Sign in with a password' })).toBeVisible();
  await page.getByLabel('Username').fill('Yuki.T');
  await page.getByLabel(/^New password/).fill(PASSWORD);
  await page.getByLabel('Confirm new password').fill('something else');
  await page.getByRole('button', { name: 'Turn on password sign-in' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');

  await page.getByLabel('Confirm new password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Turn on password sign-in' }).click();
  await expect(page.getByRole('status')).toContainText('You can now sign in as “yuki.t”');
  await expect(page.getByRole('heading', { name: 'Username and password' })).toBeVisible();

  // A fresh page, so the init script that signs in as Yuki through Google doesn't run again.
  const fresh = await page.context().newPage();
  await fresh.goto('/');
  await signInWithPassword(fresh, 'yuki.t', 'wrong password');
  await expect(fresh.getByRole('alert')).toHaveText('Incorrect username or password.');
  await signInWithPassword(fresh, 'YUKI.T', PASSWORD);
  await expect(fresh.getByRole('heading', { name: 'Hi, Yuki' })).toBeVisible();
});

test('a password user changes their password and stays signed in', async ({ page }) => {
  const set = await api(page, YUKI, 'setPassword', { username: 'yuki', currentPassword: '', newPassword: PASSWORD });
  expect(set.ok).toBe(true);
  await page.goto('/');
  await signInWithPassword(page, 'yuki@example.com', PASSWORD);
  await expect(page.getByRole('heading', { name: 'Hi, Yuki' })).toBeVisible();

  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('link', { name: /Profile/ }).click();
  await page.getByLabel('Current password').fill('not my password');
  await page.getByLabel(/^New password/).fill('matcha latte 9');
  await page.getByLabel('Confirm new password').fill('matcha latte 9');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('alert')).toHaveText('Your current password is incorrect.');

  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('status')).toHaveText('Password changed.');

  // The session was swapped for one tied to the new password, so the app keeps working.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My bookings' }).click();
  await expect(page.getByRole('heading', { name: /My bookings/ })).toBeVisible();

  await signOut(page);
  await signInWithPassword(page, 'yuki', PASSWORD);
  await expect(page.getByRole('alert')).toHaveText('Incorrect username or password.');
  await signInWithPassword(page, 'yuki', 'matcha latte 9');
  await expect(page.getByRole('button', { name: 'Account menu for Yuki Tanaka' })).toBeVisible();
});

test('a forgotten password is reset with an emailed code', async ({ page }) => {
  await api(page, YUKI, 'setPassword', { username: 'yuki', currentPassword: '', newPassword: PASSWORD });
  await page.goto('/');
  await signInForm(page).getByRole('button', { name: 'Forgot password?' }).click();
  const forgot = page.getByRole('form', { name: 'Reset password' });
  await forgot.getByLabel('Username or email').fill('yuki');
  await forgot.getByRole('button', { name: 'Email me a code' }).click();

  const reset = page.getByRole('form', { name: 'Set a new password' });
  await expect(reset.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const mail = (await (await page.request.get(`${API_URL}/__mock/mail`)).json()) as { to: string; body: string }[];
  const code = /reset your password is (\d{6})/.exec(mail.filter((m) => m.to === 'yuki@example.com').at(-1)!.body)![1];

  await reset.getByLabel('Code').fill(code);
  await reset.getByLabel(/^New password/).fill('hojicha 2026');
  await reset.getByLabel('Confirm new password').fill('hojicha 2026');
  await reset.getByRole('button', { name: 'Set new password and sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Yuki' })).toBeVisible();
});
