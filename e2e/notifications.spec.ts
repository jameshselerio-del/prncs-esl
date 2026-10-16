import { expect, test, type Page } from '@playwright/test';
import { api, openAs, resetData, TEACHER, YUKI } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetData(page);
});

const bell = (page: Page) => page.getByRole('button', { name: /^Notifications/ });
const panel = (page: Page) => page.getByRole('region', { name: 'Notifications' });

test('a student sees their cancelled class in the bell and marks it read', async ({ page }) => {
  const cancelled = await api(page, TEACHER, 'cancelBooking', { id: 'booking-yuki-next', reason: 'Teacher is sick' });
  expect(cancelled.ok).toBe(true);

  await openAs(page, YUKI);
  // One unread update plus the "set up a password" suggestion.
  await expect(bell(page)).toHaveAccessibleName('Notifications, 2 new');
  await bell(page).click();
  const updates = panel(page).getByRole('region', { name: 'Updates' });
  await expect(updates.getByText(/Your teacher cancelled your class on/)).toBeVisible();
  await expect(updates.getByText('Reason: Teacher is sick')).toBeVisible();

  await panel(page).getByRole('button', { name: 'Mark all as read' }).click();
  await expect(bell(page)).toHaveAccessibleName('Notifications, 1 new');
  await expect(panel(page).getByRole('button', { name: 'Mark all as read' })).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(bell(page)).toBeFocused();
});

test('setup suggestions can be followed or dismissed for good', async ({ page }) => {
  await openAs(page, YUKI);
  await bell(page).click();
  const todo = panel(page).getByRole('region', { name: 'To do' });
  await expect(todo.getByText('Set up a username and password')).toBeVisible();

  await todo.getByRole('link', { name: 'Go to profile' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in with a password' })).toBeVisible();
  await expect(panel(page)).toBeHidden();

  await bell(page).click();
  await todo.getByRole('button', { name: 'Dismiss: Set up a username and password' }).click();
  // Only Yuki's old, already-read feedback update is left.
  await expect(todo).toBeHidden();
  await expect(panel(page).getByText(/New feedback on your class/)).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName('Notifications');

  await page.reload();
  await bell(page).click();
  await expect(panel(page).getByRole('region', { name: 'Updates' })).toBeVisible();
  await expect(todo).toBeHidden();
});

test('the teacher opens a new-booking update from the bell', async ({ page }) => {
  await openAs(page, TEACHER, '/students');
  await bell(page).click();
  const update = panel(page).getByRole('button', { name: /Sofía García booked a class/ });
  await expect(update).toContainText('Unread');
  await expect(update).toContainText('Topic: Interview next month');
  await update.click();
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  await bell(page).click();
  await expect(panel(page).getByRole('button', { name: /Sofía García booked a class/ })).not.toContainText('Unread');
});
