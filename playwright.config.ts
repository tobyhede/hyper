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
 * That separation is not tidiness. `reuseExistingServer` applies `env` only to a
 * server Playwright launches itself, so aiming the suite at the port a human's
 * dev server already occupies failed twice over: the read-only guarantee below
 * silently did not apply, so every drag in `editing.spec.ts` rewrote the
 * committed fixture the suite asserts against; and the tests ran against
 * whatever working tree *that* server was serving, which in a git worktree is
 * another branch's code reported as this one's result.
 */

const READ_ONLY = {
  // Make saves a no-op. A save writes the authored space in place — there is no
  // `space.local.json` left to absorb it — so without this every drag in the
  // suite would edit the fixture the suite is asserting against, and parallel
  // drag tests would race on it.
  //
  // Belt and braces: `e2e:server` sets `SPACE_READ_ONLY` itself, so the
  // guarantee is a property of the server rather than of this field. A field
  // here is skipped for a server this config did not start; a script cannot be.
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
      // Serial: these tests share one space directory and write to it. The
      // point of the project is the round trip, and a round trip cannot be
      // parallelised against itself.
      fullyParallel: false,
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
      env: READ_ONLY,
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
