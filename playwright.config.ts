import { defineConfig, devices } from '@playwright/test';

/**
 * Two servers, because there are two things to test and they differ by an input
 * to the *server*, not by anything a test can do.
 *
 * `SPACE_DIR` decides which space opens (ADR 0018): supplied, the app opens that
 * directory; absent, it mints a new space. The main project drives the fixture,
 * and the `new-space` project drives a second server started with no `SPACE_DIR`
 * at all. Keeping them apart is what stops the new-space work retargeting every
 * existing test.
 *
 * **The suite owns its servers, on its own ports.** Both start from dedicated
 * `e2e:server*` scripts on 5273/5274 — not the 5173/5174 a human runs `pnpm dev`
 * and `pnpm dev:new` on — and neither reuses a server it did not start.
 *
 * It also ensures the tests run against this worktree rather than whichever
 * branch a human-owned development server happens to be serving.
 */

const NEW_SPACE_SPEC = /new-space\.spec\.ts/;

export default defineConfig({
  testDir: './packages/app/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5273',
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
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5274' },
      testMatch: NEW_SPACE_SPEC,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @project/app e2e:server',
      url: 'http://localhost:5273',
      // Never reuse: a server this config did not start is one whose env,
      // working tree and space directory are all unknown. See the header.
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @project/app e2e:server:new',
      url: 'http://localhost:5274',
      reuseExistingServer: false,
      timeout: 120_000,
      // Deliberately *not* read-only. This server writes, because proving a
      // minted space survives a reload means letting it be saved. It is safe to
      // let it: `SPACE_DIR` points at a gitignored throwaway directory that
      // `globalSetup` deletes before every run, not at authored content.
    },
  ],
});
