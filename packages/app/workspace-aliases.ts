import { fileURLToPath } from 'node:url';

/**
 * The server module runner's package boundary, shared by the dev/browser config
 * and the Node artifact build so the two cannot drift apart.
 *
 * Browser imports resolve through the app's own dependencies, but the SSR
 * runtime starts above this workspace in `src/`/`test/`, where pnpm
 * intentionally exposes no `@project` symlinks. These mappings are what let
 * either bundler reach the browser-safe workspace packages from there.
 *
 * Paths anchor on this module, not the working directory: `resolve()` would
 * anchor on cwd, which is the app package only for the one filtered script that
 * loads the build config.
 */
export const workspaceAliases = (): Record<string, string> => {
  const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  return {
    '@project/core': here('../core/src/index.ts'),
    '@project/graph': here('../graph/src/index.ts'),
    '@project/http': here('../http/src/index.ts'),
    '@project/persistence': here('../persistence/src/index.ts'),
  };
};

/** The same packages, for the SSR build's `noExternal`. */
export const workspacePackages = Object.keys(workspaceAliases());
