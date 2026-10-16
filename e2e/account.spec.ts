import { expect, test } from '@playwright/test';
import { API_URL, openAs, resetData, TEACHER, YUKI } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetData(page);
});

test('the account menu shows the profile and links, and closes with Escape', async ({ page }) => {
  await openAs(page, YUKI);
  const button = page.getByRole('button', { name: 'Account menu for Yuki Tanaka' });
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Profile' })).toHaveCount(0);

  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const panel = page.getByRole('region', { name: 'Account' });
  await expect(panel).toContainText('yuki@example.com');
  await expect(panel).toContainText('Student');
  await expect(panel).toContainText('Asia/Tokyo');

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();

  await button.click();
  await panel.getByRole('link', { name: 'Profile settings' }).click();
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  await expect(panel).toHaveCount(0);
});

test('the teacher menu links to availability', async ({ page }) => {
  await openAs(page, TEACHER);
  await page.getByRole('button', { name: /Account menu/ }).click();
  const panel = page.getByRole('region', { name: 'Account' });
  await expect(panel).toContainText('Teacher');
  await panel.getByRole('link', { name: /Availability/ }).click();
  await expect(page.getByRole('heading', { name: 'Availability' })).toBeVisible();
});

test('the theme choice applies at once and is remembered', async ({ page }) => {
  await openAs(page, YUKI);
  const html = page.locator('html');
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(34, 39, 36)');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('radio', { name: 'System' }).check();
  await expect(html).not.toHaveAttribute('data-theme', /.+/);
});

test('every page has the footer with the legal links', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Terms of Service' })).toBeVisible();
  // A fresh page: going from / to /#/bookings is only a hash change, so the sign-in script wouldn't run.
  const signedIn = await page.context().newPage();
  await openAs(signedIn, YUKI, '/bookings');
  const footer = signedIn.getByRole('contentinfo');
  await expect(footer.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
  await expect(footer).toContainText('Komorebi English');
  await signedIn.close();
});

test('a branded loading screen shows while the account loads', async ({ page }) => {
  // Hold the first `me` request so the loading screen stays up long enough to check.
  await page.route(`${API_URL}/`, async (route) => {
    if (route.request().postData()?.includes('"action":"me"')) await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.addInitScript((t) => sessionStorage.setItem('idToken', t), YUKI);
  await page.goto('/');
  const status = page.getByRole('status').filter({ hasText: 'Getting your lessons ready' });
  await expect(status).toBeVisible();
  await expect(status).toContainText('準備しています');
  await expect(page.getByRole('heading', { name: 'Hi, Yuki' })).toBeVisible();
  await expect(status).toBeHidden();
});
