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
  // The list reporter and nothing else. The parity-claim invariant — every
  // claim in `packages/app/stories/parity-claims.ts` tagged by exactly one test
  // in this suite, with a claim declaring `applicationEvidence` exempt from
  // that here and never in Ladle — belongs to `pnpm ui:catalog:check`, which
  // reads the same claims and the same `@parity:` tags out of the sources, runs
  // in `verify` in under a second and needs no browser. Stating it there rather
  // than in a reporter is what lets this suite be sharded or filtered: a
  // reporter attached to a partial run sees a partial collection and calls
  // every claim outside its slice missing.
  //
  // Nor does anything here re-assert that a tagged test *passed*. That is what
  // `failOnFlakyTests` above already means, for every test rather than only the
  // tagged ones, and Playwright prints `@parity:<claim-id>` beside a failing
  // test's title and again in its summary, so the claim is still named at the
  // failure. Do not add a parity reporter back.
  reporter: [['list']],
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
