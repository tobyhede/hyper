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
    // Make saves a no-op. A save now writes the authored space in place — there
    // is no `space.local.json` left to absorb it — so without this every drag in
    // the suite would edit the fixture the suite is asserting against, and
    // parallel drag tests would race on it.
    env: { SPACE_READ_ONLY: '1' },
  },
});
