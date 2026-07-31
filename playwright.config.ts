import { defineConfig, devices } from '@playwright/test';
import { NEW_SPACE_PROJECT } from './packages/app/e2e/projects';

/** Every test fixture starts its own ephemeral Vite host and HTTP repository. */

const NEW_SPACE_SPEC = /new-space\.spec\.ts/;
const POSTGRES_SPACE_SPEC = /postgres-persistence\.spec\.ts/;

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
      testIgnore: [NEW_SPACE_SPEC, POSTGRES_SPACE_SPEC],
    },
    {
      name: NEW_SPACE_PROJECT,
      use: { ...devices['Desktop Chrome'] },
      testMatch: NEW_SPACE_SPEC,
    },
  ],
});
