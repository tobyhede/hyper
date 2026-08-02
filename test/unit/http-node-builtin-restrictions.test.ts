import { builtinModules } from 'node:module';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * ADR 0034 keeps `@project/http` on the portable Fetch interface, and the
 * `no-restricted-imports` zone in `eslint.config.js` is what enforces it. The
 * zone derives its list from `module.builtinModules`; nothing checked that the
 * derivation still covers what Node ships, and a hand-written list preceded it
 * for long enough to lose `wasi`, `trace_events` and every `_`-prefixed
 * internal without lint noticing.
 *
 * `module.builtinModules` is the authority on both sides, so this asks it too
 * rather than keeping a second list. What it pins is not the expression — it is
 * that the zone exists, is an error rather than a warning, and leaves no builtin
 * out in any of its three spellings. Resolution goes through ESLint's own
 * `calculateConfigForFile`, so these are the options the rule will actually
 * receive rather than the config module's internals. Linting a synthetic source
 * would be closer to the rule still, but the type-aware parser rejects a path
 * the project service has never seen, so the failure would name the parser
 * rather than the missing builtin.
 *
 * `builtinModules` mixes bare names, `node:`-prefixed entries and subpaths, and
 * the base name is what a restriction is written against.
 */
const builtinBaseNames = [
  ...new Set(builtinModules.map((name) => name.replace(/^node:/, '').replace(/\/.*$/, ''))),
];

interface RestrictedImports {
  readonly paths: readonly { readonly name: string }[];
  readonly patterns: readonly { readonly group: readonly string[] }[];
}

const httpRestrictions = async (): Promise<RestrictedImports> => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const config: unknown = await eslint.calculateConfigForFile('packages/http/src/index.ts');
  if (typeof config !== 'object' || config === null || !('rules' in config)) {
    throw new Error('ESLint resolved no config for @project/http.');
  }
  const { rules } = config as { rules?: Record<string, unknown> };
  const rule = rules?.['no-restricted-imports'];
  if (!Array.isArray(rule)) {
    throw new Error('@project/http declares no no-restricted-imports rule.');
  }
  const [severity, options] = rule as readonly unknown[];
  // 2 is `error`. A zone downgraded to a warning would still be "configured"
  // while `--max-warnings=0` is the only thing left stopping the import.
  expect(severity).toBe(2);
  return options as RestrictedImports;
};

describe('@project/http Node builtin restrictions', () => {
  it('restricts every bare Node builtin specifier', async () => {
    const { paths } = await httpRestrictions();
    const restricted = new Set(paths.map((entry) => entry.name));

    expect(builtinBaseNames.filter((name) => !restricted.has(name))).toEqual([]);
  });

  it('restricts a subpath of every Node builtin', async () => {
    const { patterns } = await httpRestrictions();
    const groups = new Set(patterns.flatMap((entry) => entry.group));

    expect(builtinBaseNames.filter((name) => !groups.has(`${name}/*`))).toEqual([]);
  });

  it('restricts the node: prefix for every builtin, including the prefix-only ones', async () => {
    const { patterns } = await httpRestrictions();
    const groups = new Set(patterns.flatMap((entry) => entry.group));

    expect(groups.has('node:*')).toBe(true);
  });
});
