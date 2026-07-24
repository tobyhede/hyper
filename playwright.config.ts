import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './packages/app/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @project/app dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    // Pin the dev server to the authored base fixture and make saves a no-op, so
    // the suite tests a known graph regardless of any `space.local.json` a human
    // left from manual play — and so parallel drag tests never race on that file
    // (ticket 06).
    env: { SPACE_BASE_ONLY: '1' },
  },
});
