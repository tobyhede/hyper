import { defineConfig, devices } from '@playwright/test';
import { NEW_SPACE_PROJECT } from './packages/app/e2e/projects';

/** Every test fixture starts its own ephemeral Vite host and HTTP repository. */

// The PostgreSQL spec needs no ignore entry: it lives in `test/e2e/`, outside
// this config's `testDir`, and runs from `playwright.postgres.config.ts`.
const NEW_SPACE_SPEC = /new-space\.spec\.ts/;

export default defineConfig({
  testDir: './packages/app/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  failOnFlakyTests: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['list'], ['./scripts/parity-reporter.ts', { suite: 'application' }]],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [NEW_SPACE_SPEC],
    },
    {
      name: NEW_SPACE_PROJECT,
      use: { ...devices['Desktop Chrome'] },
      testMatch: NEW_SPACE_SPEC,
    },
  ],
});
