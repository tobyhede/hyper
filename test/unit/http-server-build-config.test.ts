import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../../packages/app/http-server-build.config';

/**
 * The config is loaded by `pnpm --filter @project/app http-server:build`, whose
 * working directory happens to be the app package — so cwd-relative paths in it
 * resolve correctly through that one entry point and nowhere else. These tests
 * run from the repo root, which is exactly the discrepancy worth catching.
 */
describe('http server build config', () => {
  const resolved = config as {
    resolve?: { alias?: Record<string, string> };
    build?: { ssr?: string; outDir?: string };
  };

  it('resolves every workspace alias to a real file regardless of cwd', () => {
    const alias = resolved.resolve?.alias ?? {};
    expect(Object.keys(alias)).toHaveLength(4);
    for (const [name, target] of Object.entries(alias)) {
      expect(isAbsolute(target), `${name} is absolute`).toBe(true);
      expect(existsSync(target), `${name} -> ${target}`).toBe(true);
    }
  });

  it('points its SSR entry at a real module regardless of cwd', () => {
    const entry = resolved.build?.ssr;
    expect(typeof entry).toBe('string');
    expect(existsSync(entry!), `ssr entry -> ${String(entry)}`).toBe(true);
  });

  it('writes its artifact into the app package regardless of cwd', () => {
    // A cwd-relative outDir writes `dist-http/` wherever the build was started
    // from — the repo root for every entry point but the one filtered script.
    const outDir = resolved.build?.outDir;
    expect(typeof outDir).toBe('string');
    expect(isAbsolute(outDir!), `outDir is absolute -> ${String(outDir)}`).toBe(true);
    expect(outDir).toBe(fileURLToPath(new URL('../../packages/app/dist-http', import.meta.url)));
  });
});
