import { describe, expect, it } from 'vitest';
import appManifest from '../../packages/app/package.json';
import { E2E_PORT_BASE, POSTGRES_E2E_PORT } from '../../packages/app/e2e/projects';

/**
 * Both suites bind under `strictPort`, so an overlap is a hard host failure that
 * blames startup rather than the collision. The default suite's range is
 * open-ended — `E2E_PORT_BASE + workerIndex` for whatever worker count
 * Playwright picks, which `--workers` can raise at will — so the only durable
 * separation is for the PostgreSQL port to sit below the base where no
 * non-negative index can reach it.
 */

/**
 * `pnpm dev` names no port: `packages/app/vite.config.ts` sets 5173 as the
 * server default and binds it under `strictPort` all the same. It is the one
 * reserved port no script can be read for.
 */
const VITE_CONFIG_DEFAULT_PORT = 5173;

/**
 * The ports a developer's own runs hold, read out of the `dev:*` scripts rather
 * than restated beside them. A hand-kept list goes stale in the direction that
 * matters: the script adding `--port 5301` would still pass a test naming only
 * the ports someone remembered, and the collision would surface as a `strictPort`
 * startup failure in the human's terminal instead. Deriving it means adding that
 * script fails here first.
 */
function developerPorts(): number[] {
  const ports = new Set([VITE_CONFIG_DEFAULT_PORT]);
  for (const [name, command] of Object.entries(appManifest.scripts)) {
    if (!name.startsWith('dev')) continue;
    const flag = /--port[= ]\s*(\d+)/.exec(command);
    if (flag?.[1] !== undefined) ports.add(Number(flag[1]));
  }
  return [...ports].sort((left, right) => left - right);
}

describe('E2E host ports', () => {
  it('puts the PostgreSQL host out of every worker index reach', () => {
    expect(POSTGRES_E2E_PORT).toBeLessThan(E2E_PORT_BASE);
  });

  it('keeps both suites clear of the ports a developer runs by hand', () => {
    const reserved = developerPorts();

    // A derivation that quietly matched nothing would assert about the config
    // default alone and pass forever, which is the failure mode of reading the
    // scripts rather than listing them. The app declares ported `dev:*` scripts
    // today, so the reserved set is never just that one port.
    expect(reserved.length).toBeGreaterThan(1);

    for (const port of reserved) {
      expect(POSTGRES_E2E_PORT, `PostgreSQL host clear of ${port}`).not.toBe(port);
      expect(E2E_PORT_BASE, `default suite above ${port}`).toBeGreaterThan(port);
    }
  });
});
