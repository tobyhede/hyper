import { fileURLToPath } from 'node:url';
import { createServer, type InlineConfig, type ViteDevServer } from 'vite';
import { E2E_PORT_BASE, NEW_SPACE_PROJECT, workerScopedViteCacheDir } from './projects';

const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
const appRoot = fileURLToPath(new URL('..', import.meta.url));

type ViteServerFactory = (config: InlineConfig) => Promise<ViteDevServer>;

/**
 * Start one test's Vite host with mutable optimizer state scoped to its worker.
 * The factory parameter is the Node boundary: tests capture the exact options
 * handed to Vite without booting a socket or replacing Vite globally.
 */
export function createE2eViteServer(
  projectName: string,
  workerIndex: number,
  factory: ViteServerFactory = createServer,
): Promise<ViteDevServer> {
  return factory({
    root: appRoot,
    cacheDir: workerScopedViteCacheDir(appRoot, workerIndex),
    configFile,
    mode: projectName === NEW_SPACE_PROJECT ? 'e2e-empty' : 'e2e-fixture',
    // Away from the ports the `dev:*` scripts hold (5173–5175), and above
    // `POSTGRES_E2E_PORT` so no worker index can reach the opt-in suite's fixed
    // host. `strictPort` makes an overlap a startup failure that names the cause.
    server: {
      host: '127.0.0.1',
      port: E2E_PORT_BASE + workerIndex,
      strictPort: true,
    },
  });
}
