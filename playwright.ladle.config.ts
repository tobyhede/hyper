import { defineConfig, devices } from '@playwright/test';

const PORT = 61_100;

export default defineConfig({
  testDir: './packages/app/ladle-e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  // One flake policy for both suites, matching `playwright.config.ts`: an
  // infrastructure blip retries instead of reddening the build, and a real
  // flake still fails the run with its retries recorded in the report.
  failOnFlakyTests: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm --filter @project/app exec ladle serve --port ${PORT} --noWatch`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
