import { expect, test } from '@playwright/test';
import { chooseTab, openAs, resetData, TEACHER, YUKI } from './helpers';

// Runs only in the "mobile" project (phone viewport, see playwright.config.ts).
test.beforeEach(async ({ page }) => {
  await resetData(page);
});

async function expectNoSideways(page: import('@playwright/test').Page) {
  const { scroll, viewport } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(scroll, 'page should not scroll sideways').toBeLessThanOrEqual(viewport);
}

const views = ['Table', 'Calendar', 'Timeline'];

test('student pages fit a phone screen', async ({ page }) => {
  for (const path of ['/', '/book', '/profile']) {
    await openAs(page, YUKI, path);
    await expectNoSideways(page);
  }
  await openAs(page, YUKI, '/bookings');
  for (const view of views) {
    await chooseTab(page, view);
    await expectNoSideways(page);
  }
});

test('teacher pages fit a phone screen', async ({ page }) => {
  for (const path of ['/availability', '/lessons', '/students', '/profile']) {
    await openAs(page, TEACHER, path);
    await expectNoSideways(page);
  }
  await openAs(page, TEACHER, '/');
  for (const view of views) {
    await chooseTab(page, view);
    await expectNoSideways(page);
  }
});
