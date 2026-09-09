import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: 'postgres-persistence.spec.ts',
  fullyParallel: false,
  workers: 1,
  // This project runs in CI's `postgres` job, so it owes the same `.only` guard
  // the other two configs carry: a committed `test.only` here would narrow a
  // one-test project to nothing and still report green.
  forbidOnly: !!process.env['CI'],
  // Deliberately not the `retries: 2` of the other two configs. Each attempt
  // mints its own Space and Card ids and deletes them in `finally`, so a retry
  // is safe — but this test exists to answer whether an edit is durable, and a
  // pass on the second attempt does not answer that question the way a pass on
  // a flaky interaction test does.
  retries: 0,
  // The one test starts two Vite hosts in sequence, drives a drag through the
  // browser and round-trips PostgreSQL between them. Playwright's 30s default
  // is a cold-start away from failing on timing rather than on durability.
  timeout: 120_000,
  reporter: 'list',
  // `on-first-retry` is what `playwright.config.ts` uses, and it would never
  // fire here: this project keeps `retries: 0` above, so a failure is the only
  // attempt there is. Without this the CI job that runs one long test reports a
  // timeout and no pending step, which is exactly the run you cannot diagnose.
  projects: [
    { name: 'postgres', use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' } },
  ],
});
