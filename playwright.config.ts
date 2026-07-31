import { defineConfig, devices } from '@playwright/test';

/** Every test fixture starts its own ephemeral Vite host and HTTP repository. */

const NEW_SPACE_SPEC = /new-space\.spec\.ts/;

export default defineConfig({
  testDir: './packages/app/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: NEW_SPACE_SPEC,
    },
    {
      name: 'new-space',
      use: { ...devices['Desktop Chrome'] },
      testMatch: NEW_SPACE_SPEC,
    },
  ],
});
