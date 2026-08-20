import { describe, expect, it, vi } from 'vitest';
import type { InlineConfig, ViteDevServer } from 'vite';
import { createE2eViteServer } from '../../packages/app/e2e/vite-server';

describe('E2E Vite host startup', () => {
  it('hands concurrent workers different dependency optimizer caches', async () => {
    const configurations: InlineConfig[] = [];
    const factory = vi.fn((config: InlineConfig) => {
      configurations.push(config);
      // SAFETY: this test only inspects the `config` each call was given
      // (pushed above) — the resolved server itself is never read, so an
      // empty stub is enough to satisfy the factory's declared return type.
      return Promise.resolve({} as ViteDevServer);
    });

    await Promise.all([
      createE2eViteServer('chromium', 0, factory),
      createE2eViteServer('chromium', 1, factory),
    ]);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(configurations[0]?.cacheDir).toBeTypeOf('string');
    expect(configurations[1]?.cacheDir).toBeTypeOf('string');
    expect(configurations[0]?.cacheDir).not.toBe(configurations[1]?.cacheDir);
  });
});
