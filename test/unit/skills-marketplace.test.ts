import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const readJson = <T>(path: string, schema: z.ZodType<T>): T =>
  schema.parse(JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')));

const identity = z.object({ name: z.literal('infinity-cube'), version: z.string() });

const codexManifest = identity.extend({ skills: z.string() });

const catalog = <Source extends z.ZodType>(source: Source) =>
  z.object({
    name: z.string(),
    plugins: z.array(z.object({ name: z.string(), source })),
  });

const portable = readJson('plugins/infinity-cube/plugin.json', identity);

// Each host caches an installed plugin by version, so the three manifests release together.
describe('the infinity-cube plugin manifests', () => {
  it.each([
    'plugins/infinity-cube/.claude-plugin/plugin.json',
    'plugins/infinity-cube/.codex-plugin/plugin.json',
  ])('%s names the same plugin and version as plugin.json', (path) => {
    expect(readJson(path, identity)).toEqual(portable);
  });

  it('points Codex at the skills directory', () => {
    expect(
      readJson('plugins/infinity-cube/.codex-plugin/plugin.json', codexManifest),
    ).toMatchObject({ skills: './skills/' });
  });
});

describe('the infinity-cube marketplace catalogs', () => {
  it('lists the plugin for Claude Code', () => {
    expect(readJson('.claude-plugin/marketplace.json', catalog(z.string()))).toMatchObject({
      name: 'infinity-cube',
      plugins: [{ name: 'infinity-cube', source: './plugins/infinity-cube' }],
    });
  });

  it('lists the plugin for Codex', () => {
    const source = z.object({ source: z.string(), path: z.string() });
    expect(readJson('.agents/plugins/marketplace.json', catalog(source))).toMatchObject({
      name: 'infinity-cube',
      plugins: [
        { name: 'infinity-cube', source: { source: 'local', path: './plugins/infinity-cube' } },
      ],
    });
  });
});
