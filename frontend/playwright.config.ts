import { defineConfig, devices } from '@playwright/test';

import { API_URL, E2E_WEB_URL } from './e2e/api';

/**
 * End-to-end tests against the real backend, run with the `e2e` profile on its own throwaway PostgreSQL database
 * (../backend/start-e2e.sh), so test data never reaches the development database. Both servers are always started
 * fresh: a backend already on the E2E port, or a web server on the E2E web port (a `npm run web` dev server on 8081 is
 * never tested by mistake), makes the run fail instead of being reused.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: E2E_WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: '../backend/start-e2e.sh',
      url: `${API_URL}/api/products`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      command: 'npm run export:web && npm run serve:web',
      env: { EXPO_PUBLIC_API_URL: API_URL, PORT: new URL(E2E_WEB_URL).port },
      url: E2E_WEB_URL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
