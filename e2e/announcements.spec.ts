import { expect, test } from '@playwright/test';
import { API_URL, openAs, resetData, TEACHER, YUKI } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetData(page);
});

test('the teacher sends a personalized announcement that a student reads from the bell', async ({ page }) => {
  await openAs(page, TEACHER, '/announcements');
  const form = page.getByRole('form', { name: 'New announcement' });
  await form.getByLabel('Title').fill('No class on Friday, {first name}');
  await form.getByLabel('Message').fill('Hi ');
  await form.getByRole('button', { name: '+ First name' }).click();
  await form.getByLabel('Message').press('End');
  await form.getByLabel('Message').pressSequentially(', see you next week!');
  await form.getByLabel('Choose students').check();
  await form
    .getByRole('list', { name: 'Students' })
    .getByLabel(/Yuki Tanaka/)
    .check();

  const preview = form.getByRole('region', { name: 'Preview' });
  await expect(preview).toContainText('Preview for Yuki Tanaka');
  await expect(preview).toContainText('Hi Yuki, see you next week!');

  page.once('dialog', (d) => d.accept());
  await form.getByRole('button', { name: 'Send to 1 student' }).click();
  await expect(form.getByRole('status')).toHaveText('Sent to 1 student(s).');
  await expect(page.getByText('No class on Friday, {first name}')).toBeVisible();
  await expect(page.getByText(/1 student · email and app/)).toBeVisible();

  const mail = (await (await page.request.get(`${API_URL}/__mock/mail`)).json()) as { to: string; body: string }[];
  expect(mail.find((m) => m.to === 'yuki@example.com')?.body).toContain('Hi Yuki, see you next week!');

  const student = await page.context().newPage();
  await student.addInitScript((t) => sessionStorage.setItem('idToken', t), YUKI);
  await student.goto('/');
  await student.getByRole('button', { name: /^Notifications/ }).click();
  await student.getByRole('button', { name: /New announcement: No class on Friday, Yuki/ }).click();
  await expect(student.getByRole('heading', { name: /Announcements/ })).toBeVisible();
  await expect(student.getByRole('heading', { name: 'No class on Friday, Yuki' })).toBeVisible();
  await expect(student.getByText('Hi Yuki, see you next week!')).toBeVisible();
});

test('students only see announcements sent to them', async ({ page }) => {
  await openAs(page, YUKI, '/announcements');
  await expect(page.getByText('No announcements yet.')).toBeVisible();
});
