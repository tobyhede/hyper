import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './packages/app/e2e',
  testMatch: 'postgres-persistence.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  projects: [{ name: 'postgres', use: { ...devices['Desktop Chrome'] } }],
});
