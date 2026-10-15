import { expect, type Page } from '@playwright/test';
import { API_URL } from '../playwright.config';

export { API_URL };

/** Mock tokens are `email|Display Name` (see scripts/mock-backend). */
export const TEACHER = 'teacher@example.com|Ms. Ana Reyes';
export const YUKI = 'yuki@example.com|Yuki Tanaka';
export const MINH = 'minh@example.com|Minh Nguyen';

/** Wipes and re-seeds the mock backend so every test starts from the same data. */
export async function resetData(page: Page): Promise<void> {
  const res = await page.request.post(`${API_URL}/__mock/reset`);
  expect(res.ok()).toBeTruthy();
}

/** Opens the app already signed in as `token`, at `path` (a hash route such as `/book`). */
export async function openAs(page: Page, token: string, path = '/'): Promise<void> {
  await page.addInitScript((t) => sessionStorage.setItem('idToken', t), token);
  await page.goto(`/#${path}`);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

/** Switches the booking view (Table / Calendar / Timeline) or filter tab. */
export async function chooseTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
}

/** The dialog that is currently open. */
export const dialog = (page: Page) => page.locator('dialog[open]');

/** Calls the mock API directly, e.g. to check what the server enforces. */
export async function api(page: Page, token: string, action: string, payload: object = {}) {
  const res = await page.request.post(`${API_URL}/`, {
    data: JSON.stringify({ action, idToken: token, payload }),
    headers: { 'Content-Type': 'text/plain' },
  });
  return (await res.json()) as { ok: boolean; data?: unknown; error?: string };
}
