import { defineConfig, devices } from '@playwright/test';

/**
 * These specs assert the things jsdom cannot: real style resolution across a shadow boundary,
 * container queries, focus behaviour, and that mounting the card issues no network request.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
  },
  // The exit criterion names Chrome, Safari, Firefox, and mobile Safari;
  // this matrix is what closes it by evidence rather than assumption.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
