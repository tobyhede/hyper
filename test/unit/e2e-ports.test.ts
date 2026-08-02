import { describe, expect, it } from 'vitest';
import { E2E_PORT_BASE, POSTGRES_E2E_PORT } from '../../packages/app/e2e/projects';

/**
 * Both suites bind under `strictPort`, so an overlap is a hard host failure that
 * blames startup rather than the collision. The default suite's range is
 * open-ended — `E2E_PORT_BASE + workerIndex` for whatever worker count
 * Playwright picks, which `--workers` can raise at will — so the only durable
 * separation is for the PostgreSQL port to sit below the base where no
 * non-negative index can reach it.
 */
describe('E2E host ports', () => {
  it('puts the PostgreSQL host out of every worker index reach', () => {
    expect(POSTGRES_E2E_PORT).toBeLessThan(E2E_PORT_BASE);
  });

  it('keeps both suites clear of the ports a developer runs by hand', () => {
    // `pnpm dev` and `pnpm dev:new`, which are the human's and must never be
    // taken by a test host.
    for (const reserved of [5173, 5174]) {
      expect(POSTGRES_E2E_PORT).not.toBe(reserved);
      expect(E2E_PORT_BASE).toBeGreaterThan(reserved);
    }
  });
});
