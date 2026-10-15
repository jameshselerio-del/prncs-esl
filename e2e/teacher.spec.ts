import { expect, test } from '@playwright/test';
import { api, chooseTab, dialog, openAs, resetData, TEACHER, YUKI } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetData(page);
});

test('adds lesson details and feedback that the student then sees', async ({ page }) => {
  await openAs(page, TEACHER);
  await chooseTab(page, 'Table');
  await page
    .getByRole('row', { name: /Yuki Tanaka/ })
    .getByRole('button', { name: 'Details' })
    .click();
  const editor = dialog(page);
  await editor.getByLabel('Lesson').selectOption({ label: 'Job interview practice' });
  await editor.getByLabel('Materials (visible to student)').fill('Read pages 4-6 before class.');
  await editor.getByLabel('Private note (only you see this)').fill('Focus on confidence.');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toHaveCount(0);

  const mine = (await api(page, YUKI, 'myBookings')).data as Record<string, unknown>[];
  const next = mine.find((b) => b.topic === 'Business emails')!;
  expect(next).toMatchObject({ lessonId: 'lesson-interviews', materials: 'Read pages 4-6 before class.' });
  expect(next).not.toHaveProperty('privateNote');
});

test('records the outcome of a past class', async ({ page }) => {
  // The seed has a completed class from last week; record it as a no-show instead.
  await openAs(page, TEACHER);
  await chooseTab(page, 'Past');
  await chooseTab(page, 'Table');
  const row = page.getByRole('row', { name: /Yuki Tanaka/ });
  await expect(row).toContainText('Completed');
  await row.getByRole('button', { name: 'Details' }).click();
  await dialog(page).getByRole('button', { name: 'Mark no-show' }).click();
  await expect(row).toContainText('No-show');
});

test('books a class for a student outside the weekly hours', async ({ page }) => {
  await openAs(page, TEACHER);
  await page.getByRole('button', { name: 'Book for a student' }).click();
  const form = dialog(page);
  await form.getByLabel('Student').selectOption({ label: 'Yuki Tanaka (yuki@example.com)' });
  // Next Saturday: no weekly availability, so only the teacher can book it.
  const saturday = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    return d.toISOString().slice(0, 10);
  });
  await form.getByLabel(/^Date/).fill(saturday);
  await form.getByLabel('Start time').fill('15:00');
  await form.getByLabel('Topic (optional)').fill('Make-up class');
  await form.getByRole('button', { name: 'Book class' }).click();
  await expect(form).toHaveCount(0);

  await chooseTab(page, 'Table');
  await expect(page.getByRole('row', { name: /Make-up class/ })).toContainText('Yuki Tanaka');
  const mine = (await api(page, YUKI, 'myBookings')).data as { topic: string }[];
  expect(mine.map((b) => b.topic)).toContain('Make-up class');
});

test('cancels a class with a reason the student can see', async ({ page }) => {
  await openAs(page, TEACHER);
  await chooseTab(page, 'Table');
  await page
    .getByRole('row', { name: /Sofía García/ })
    .getByRole('button', { name: 'Details' })
    .click();
  await dialog(page)
    .getByRole('button', { name: /Cancel this class/ })
    .click();
  await dialog(page).getByLabel('Reason (sent to the student)').fill('Teacher unwell');
  await dialog(page).getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await chooseTab(page, 'Cancelled');
  await expect(page.getByRole('row', { name: /Sofía García/ })).toContainText('Cancelled');
});

test('saves availability and time off', async ({ page }) => {
  await openAs(page, TEACHER, '/availability');
  // Add Sunday hours and save.
  const sunday = page.locator('.week-row', { hasText: 'Sunday' });
  await sunday.getByRole('button', { name: '+ Add hours' }).click();
  await page.getByRole('button', { name: 'Save availability' }).click();
  await expect(page.getByText('Availability saved.')).toBeVisible();
  const schedule = (await api(page, TEACHER, 'schedule')).data as { rules: { weekday: number }[] };
  expect(schedule.rules.some((r) => r.weekday === 0)).toBe(true);

  await page.getByLabel('From', { exact: true }).fill('2030-12-24');
  await page.getByLabel('To', { exact: true }).fill('2030-12-26');
  await page.getByLabel('Note', { exact: true }).fill('Christmas');
  await page.getByRole('button', { name: 'Add time off' }).click();
  await expect(page.getByText('2030-12-24 → 2030-12-26')).toBeVisible();
});

test('deactivates a student, who is then signed out', async ({ page }) => {
  await openAs(page, TEACHER, '/students');
  await page
    .getByRole('row', { name: /Yuki Tanaka/ })
    .getByRole('button', { name: 'View' })
    .click();
  page.once('dialog', (d) => d.accept());
  await dialog(page).getByRole('button', { name: 'Deactivate student' }).click();
  await expect(dialog(page).getByRole('button', { name: 'Reactivate student' })).toBeVisible();
  expect(await api(page, YUKI, 'me')).toMatchObject({ ok: false, code: 'AUTH' });
});
