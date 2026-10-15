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

test('the terms and privacy policy are linked from sign-in and load', async ({ page }) => {
  await page.goto('/');
  const termsPopup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Terms of Service' }).click();
  const terms = await termsPopup;
  await expect(terms.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  await expect(terms.getByRole('article').getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
    'href',
    'privacy.html',
  );
  await terms.close();

  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Privacy Policy' }).click();
  const policy = await popup;
  await expect(policy.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await expect(policy.getByRole('link', { name: 'jamesh.selerio@gmail.com' })).toHaveAttribute(
    'href',
    'mailto:jamesh.selerio@gmail.com',
  );
});
