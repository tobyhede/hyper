import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

const identity = z.object({ name: z.literal('infinity-cube'), version: z.string() });

const portable = identity.parse(readJson('plugins/infinity-cube/plugin.json'));

// Each host caches an installed plugin by version, so the three manifests release together.
describe('the infinity-cube plugin manifests', () => {
  it.each([
    'plugins/infinity-cube/.claude-plugin/plugin.json',
    'plugins/infinity-cube/.codex-plugin/plugin.json',
  ])('%s names the same plugin and version as plugin.json', (path) => {
    expect(identity.parse(readJson(path))).toEqual(portable);
  });

  it('points Codex at the skills directory', () => {
    expect(readJson('plugins/infinity-cube/.codex-plugin/plugin.json')).toMatchObject({
      skills: './skills/',
    });
  });
});

describe('the infinity-cube marketplace catalogs', () => {
  it('lists the plugin for Claude Code', () => {
    expect(readJson('.claude-plugin/marketplace.json')).toMatchObject({
      name: 'infinity-cube',
      plugins: [{ name: 'infinity-cube', source: './plugins/infinity-cube' }],
    });
  });

  it('lists the plugin for Codex', () => {
    expect(readJson('.agents/plugins/marketplace.json')).toMatchObject({
      name: 'infinity-cube',
      plugins: [
        { name: 'infinity-cube', source: { source: 'local', path: './plugins/infinity-cube' } },
      ],
    });
  });
});
