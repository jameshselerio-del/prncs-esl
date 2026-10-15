import { expect, test } from '@playwright/test';
import { api, chooseTab, dialog, MINH, openAs, resetData, YUKI } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetData(page);
});

test('home shows the next class with lesson details and past feedback', async ({ page }) => {
  await openAs(page, YUKI);
  await expect(page.getByRole('heading', { name: 'Hi, Yuki' })).toBeVisible();
  const hero = page.locator('.hero');
  await expect(hero).toContainText('Business emails');
  await expect(hero.getByRole('link', { name: 'Join class' })).toHaveAttribute('href', /meet\.example\.com/);
  await expect(page.getByText('Great progress! Practise past-tense verbs for next time.')).toBeVisible();
  // The teacher's private note never reaches the student.
  await expect(page.getByText(/push for longer answers/)).toHaveCount(0);
  await expect(page.locator('.lesson summary', { hasText: 'Job interview practice' })).toBeVisible();
});

test('home always offers booking and summarises upcoming classes', async ({ page }) => {
  await openAs(page, YUKI);
  // Yuki already has a class booked, and the booking button is still there.
  const cta = page.getByRole('region', { name: 'Book your next class' });
  await expect(cta.getByRole('link', { name: /Book a class/ })).toBeVisible();

  const summary = page.getByRole('region', { name: 'Upcoming classes' });
  await expect(summary).toContainText('1 booked');
  await expect(summary.getByRole('button', { name: /Business emails/ })).toBeVisible();
  await summary.getByRole('link', { name: 'View My bookings' }).click();
  await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible();

  await page.goBack();
  await cta.getByRole('link', { name: /Book a class/ }).click();
  await expect(page.getByRole('heading', { name: /Book a class/ })).toBeVisible();
  // The Home page itself has no slot picker any more.
  await page.goBack();
  await expect(page.locator('.slot')).toHaveCount(0);
});

test('books a class, sees it in all three views, and the slot disappears for others', async ({ page }) => {
  await openAs(page, YUKI, '/book');
  const firstSlot = page.locator('.slot-grid .slot').first();
  const time = (await firstSlot.textContent())!;
  await firstSlot.click();
  await dialog(page)
    .getByLabel(/What would you like to focus on/)
    .fill('Phone calls');
  await dialog(page).getByRole('button', { name: 'Book class' }).click();

  await expect(page.getByText('Your class is booked.')).toBeVisible();
  await chooseTab(page, 'Table');
  await expect(page.getByRole('row', { name: /Phone calls/ })).toContainText('Confirmed');

  await chooseTab(page, 'Calendar');
  await expect(page.locator('.calendar .chip', { hasText: 'Phone calls' })).toBeVisible();

  await chooseTab(page, 'Timeline');
  await expect(page.locator('.timeline-card', { hasText: 'Phone calls' })).toContainText(time);

  // The server no longer offers that time to anyone else.
  const mine = (await api(page, YUKI, 'myBookings')).data as { topic: string; start: string }[];
  const booked = mine.find((b) => b.topic === 'Phone calls')!;
  const open = (await api(page, MINH, 'availability')).data as { start: string }[];
  expect(open.map((s) => s.start)).not.toContain(booked.start);
});

test('cancels a class before the notice period', async ({ page }) => {
  await openAs(page, YUKI, '/bookings');
  await chooseTab(page, 'Table');
  await page
    .getByRole('row', { name: /Business emails/ })
    .getByRole('button', { name: 'Details' })
    .click();
  await dialog(page).getByRole('button', { name: 'Cancel class' }).click();
  await dialog(page).getByLabel('Reason (optional)').fill('Travelling');
  await dialog(page).getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(dialog(page)).toHaveCount(0);

  await chooseTab(page, 'Cancelled');
  await expect(page.getByRole('row', { name: /Business emails/ })).toContainText('Cancelled');
});

test('updates the profile time zone and sees times in the new zone', async ({ page }) => {
  await openAs(page, YUKI, '/profile');
  await page.getByLabel('Time zone').selectOption('Europe/London');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Book a class' }).click();
  await expect(page.getByText('Times are shown in Europe/London.')).toBeVisible();
});

test('students cannot reach teacher pages', async ({ page }) => {
  await openAs(page, YUKI, '/students');
  await expect(page.getByRole('link', { name: 'Students' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Hi, Yuki' })).toBeVisible();
  // The API refuses teacher actions too, not just the UI.
  expect(await api(page, YUKI, 'allBookings')).toMatchObject({ ok: false, error: 'Only the teacher can do this.' });
});
