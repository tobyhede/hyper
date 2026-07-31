import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: 'postgres-persistence.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // The one test starts two Vite hosts in sequence, drives a drag through the
  // browser and round-trips PostgreSQL between them. Playwright's 30s default
  // is a cold-start away from failing on timing rather than on durability.
  timeout: 120_000,
  reporter: 'list',
  projects: [{ name: 'postgres', use: { ...devices['Desktop Chrome'] } }],
});
