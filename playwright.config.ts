import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run the real SPA against the mock backend (scripts/mock-backend),
// on their own ports so they don't clash with `npm run dev` or `npm run dev:mock`.
const API_PORT = 8790;
const WEB_PORT = 5180;
export const API_URL = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: 'e2e',
  // One shared mock backend: tests reset it, so they must not run in parallel.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'npm run build:backend && node scripts/mock-backend/server.mjs',
      url: API_URL,
      env: { MOCK_API_PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npx vite --mode mock --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      // Real environment variables override .env.mock, so the SPA talks to the e2e mock port.
      env: { VITE_API_URL: API_URL },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
