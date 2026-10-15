import { expect, test } from '@playwright/test';
import { resetData } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetData(page);
});

test('a new Google user completes a profile and becomes a student', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New student (not registered)' }).click();

  await expect(page.getByRole('heading', { name: /Welcome to/ })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Nora New');
  await page.getByLabel('English level').selectOption({ label: 'Intermediate' });
  await page.getByLabel('Learning goals').fill('Business meetings');
  await page.getByRole('button', { name: 'Create my account' }).click();

  await expect(page.getByRole('heading', { name: 'Hi, Nora' })).toBeVisible();
  await expect(page.getByText('You have no upcoming classes.')).toBeVisible();
});

test('signing out returns to the sign-in screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Yuki Tanaka/ }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Yuki' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: /Yuki Tanaka/ })).toBeVisible();
});
