import { defineConfig, devices } from '@playwright/test';

/**
 * Two servers, because there are two things to test and they differ by an input
 * to the *server*, not by anything a test can do.
 *
 * `SPACE_DIR` decides which space opens (ADR 0018): supplied, the app opens that
 * directory; absent, it mints a new space. The main project drives the fixture
 * on 5173 exactly as it always has — `pnpm --filter @project/app dev` sets
 * `SPACE_DIR=fixture` — and the `new-space` project drives a second server on
 * 5174 started with no `SPACE_DIR` at all. Keeping them apart is what stops the
 * new-space work retargeting every existing test.
 */

const READ_ONLY = {
  // Make saves a no-op. A save writes the authored space in place — there is no
  // `space.local.json` left to absorb it — so without this every drag in the
  // suite would edit the fixture the suite is asserting against, and parallel
  // drag tests would race on it.
  SPACE_READ_ONLY: '1',
};

const NEW_SPACE_SPEC = /new-space\.spec\.ts/;

export default defineConfig({
  testDir: './packages/app/e2e',
  globalSetup: './packages/app/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
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
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
      testMatch: NEW_SPACE_SPEC,
      // Serial: these tests share one space directory and write to it. The
      // point of the project is the round trip, and a round trip cannot be
      // parallelised against itself.
      fullyParallel: false,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @project/app dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: READ_ONLY,
    },
    {
      command: 'pnpm --filter @project/app dev:new',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      // Deliberately *not* read-only. This server writes, because proving a
      // minted space survives a reload means letting it be saved. It is safe to
      // let it: `SPACE_DIR` points at a gitignored throwaway directory that
      // `globalSetup` deletes before every run, not at authored content.
    },
  ],
});
