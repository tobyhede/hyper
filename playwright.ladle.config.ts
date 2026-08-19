import { defineConfig, devices } from '@playwright/test';

const PORT = 61_100;

export default defineConfig({
  testDir: './packages/app/ladle-e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  // One flake policy for both suites, matching `playwright.config.ts`. The
  // retries do not buy blip tolerance and are not here for it: with
  // `failOnFlakyTests` set, a test that fails once and passes on retry is
  // flaky, and a flaky run still exits non-zero. What they buy is the
  // diagnosis. `trace: 'on-first-retry'` below captures nothing at all under
  // `retries: 0`, so a red CI run would arrive with no artifact to open; and a
  // failure that reproduces three times reads differently from one that does
  // not, which is the distinction worth having before deciding whether the
  // suite or the runner is at fault.
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
    // This is the only CI command that spawns a server and waits on a port —
    // the app E2E fixtures start their Vite hosts in-process. Playwright
    // forwards a spawned server's stdout only when this is `'pipe'`
    // (`playwright/lib/runner/index.js:871`), and Vite logs its startup and
    // most of its failures there, so without it a container-side problem —
    // the port, `localhost` resolving to `::1` while Vite bound `127.0.0.1`,
    // a plugin throwing — reaches the log as a bare 120s timeout with nothing
    // under it to read.
    stdout: 'pipe',
  },
});
