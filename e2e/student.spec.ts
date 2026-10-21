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
  await page.getByRole('region', { name: 'Chosen times' }).getByRole('button', { name: 'Book class' }).click();
  await dialog(page)
    .getByLabel(/What would you like to focus on/)
    .fill('Phone calls');
  await dialog(page)
    .getByRole('button', { name: /Book class/ })
    .click();

  // Students stay on the Book page after booking.
  await expect(page.getByRole('status')).toContainText('Your class is booked.');
  await expect(page).toHaveURL(/#\/book$/);
  await page.getByRole('link', { name: 'View My bookings' }).click();
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

test('books several classes at once, with a lesson, from the calendar view', async ({ page }) => {
  await openAs(page, MINH, '/book');
  await chooseTab(page, 'Calendar');
  const days = page.locator('.book-calendar-grid .day.open');
  await days.nth(0).click();
  const slots = page.locator('.slot-grid .slot');
  await slots.nth(0).click();
  // The next slot overlaps the chosen class, so it can't be picked as well.
  await expect(slots.nth(1)).toBeDisabled();
  await days.nth(1).click();
  await slots.nth(0).click();
  await expect(days.nth(0).locator('.picked')).toHaveText('1');

  const tray = page.getByRole('region', { name: 'Chosen times' });
  await expect(tray.getByRole('listitem')).toHaveCount(2);
  await tray.getByRole('button', { name: 'Book 2 classes' }).click();
  await dialog(page).getByRole('combobox').first().selectOption({ label: 'Small talk at work (Elementary)' });
  await expect(dialog(page)).toContainText('Greetings, weekend plans');
  await dialog(page)
    .getByRole('button', { name: /Book 2 classes/ })
    .click();

  const banner = page.getByRole('status');
  await expect(banner).toContainText('Your 2 classes are booked.');
  await expect(banner).toContainText('Small talk at work');
  await expect(tray).toContainText('No times chosen yet.');

  const mine = (await api(page, MINH, 'myBookings')).data as { lessonId: string | null }[];
  expect(mine.filter((b) => b.lessonId === 'lesson-small-talk')).toHaveLength(2);
});
