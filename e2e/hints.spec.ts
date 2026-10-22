import { expect, test } from '@playwright/test';
import { openAs, resetData, YUKI } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetData(page);
});

test('translation hints show in Japanese by default, switch to Traditional Chinese, and turn off', async ({ page }) => {
  await openAs(page, YUKI, '/book');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByText('レッスン予約')).toBeVisible();
  // Hints don't change what screen readers announce.
  await expect(nav.getByRole('link', { name: 'Book a class', exact: true })).toBeVisible();

  // The ⓘ shows a longer translation on tap.
  await page.getByRole('button', { name: 'Show translation' }).first().click();
  await expect(page.getByRole('note')).toContainText('キャンセルできます');

  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('radio', { name: '繁體中文' }).check();
  await expect(nav.getByText('預約課程')).toBeVisible();

  await page.getByRole('radio', { name: 'Off' }).check();
  await expect(nav.getByText('預約課程')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show translation' })).toHaveCount(0);

  // The choice is remembered.
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByText('レッスン予約')).toBeHidden();
});

test('the sign-in page offers the hint language before signing in', async ({ page }) => {
  await page.goto('/');
  const form = page.getByRole('form', { name: 'Sign in with username' });
  await expect(form.getByText('ログイン', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: '繁體中文' }).check();
  await expect(form.getByText('登入', { exact: true })).toBeVisible();
});
