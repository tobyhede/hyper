import { defineConfig, devices } from '@playwright/test';
import { MOUNT_DEFAULT_SOURCE, MOUNT_E2E_PORT } from './packages/app/e2e/projects';

/**
 * The static build for Mounting (ADR 0130), end to end: `pnpm build:mount`
 * writes the build, a static server with single-page fallback serves it with
 * the build's own `_headers` (`packages/app/e2e/static-server.ts`), and each
 * test answers GitHub from `packages/app/fixture` by route interception.
 *
 * The build goes to a directory of its own rather than `dist-mount`, so a run
 * never overwrites a build a developer made.
 *
 * Its spec lives in `packages/app/e2e`, where `pnpm ui:catalog:check` looks
 * for application evidence, and `playwright.config.ts` ignores it, because
 * that suite's hosts are Vite servers and this one is a built page.
 */
const OUT_DIR = 'node_modules/.mount-e2e';

export default defineConfig({
  testDir: './packages/app/e2e',
  testMatch: 'mount.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  // The flake policy of `playwright.config.ts`, for the reasons it gives.
  failOnFlakyTests: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${MOUNT_E2E_PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm build:mount --outDir ${OUT_DIR} && pnpm exec tsx packages/app/e2e/static-server.ts packages/app/${OUT_DIR} ${MOUNT_E2E_PORT}`,
    url: `http://127.0.0.1:${MOUNT_E2E_PORT}`,
    env: { VITE_HYPER_DEFAULT_SOURCE: MOUNT_DEFAULT_SOURCE },
    reuseExistingServer: false,
    timeout: 180_000,
    // The build reports its failures on stdout, as `playwright.ladle.config.ts` explains.
    stdout: 'pipe',
  },
});
