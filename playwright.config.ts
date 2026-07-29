import { defineConfig, devices } from '@playwright/test';

/**
 * Three servers, because the scenarios differ by an input to the *server*, not
 * by anything a test can do.
 *
 * `SPACE_DIR` decides which space opens (ADR 0018): supplied, the app opens that
 * directory; absent, it mints a new space. The main project drives the fixture,
 * `new-space` drives a server that explicitly clears `SPACE_DIR`, and
 * `invalid-space` proves an unsupported import is rendered as diagnostics.
 *
 * **The suite owns its servers, on its own ports.** All three start from dedicated
 * `e2e:server*` scripts on 5273/5274/5275 — not the 5173/5174 a human runs
 * `pnpm dev` and `pnpm dev:new` on — and none reuses a server it did not start.
 *
 * It also ensures the tests run against this worktree rather than whichever
 * branch a human-owned development server happens to be serving.
 */

const NEW_SPACE_SPEC = /new-space\.spec\.ts/;
const INVALID_SPACE_SPEC = /invalid-space\.spec\.ts/;

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
      testIgnore: [NEW_SPACE_SPEC, INVALID_SPACE_SPEC],
    },
    {
      name: 'new-space',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5274' },
      testMatch: NEW_SPACE_SPEC,
    },
    {
      name: 'invalid-space',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5275' },
      testMatch: INVALID_SPACE_SPEC,
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
      // Poison the inherited environment deliberately. The command must clear
      // this value so the project proves the same always-new contract as
      // `pnpm dev:new`, even in a shell that already names an import directory.
      env: { SPACE_DIR: 'e2e/invalid-space' },
    },
    {
      command: 'pnpm --filter @project/app e2e:server:invalid',
      url: 'http://localhost:5275',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
