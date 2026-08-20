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

function isRestrictedImports(value: unknown): value is RestrictedImports {
  if (typeof value !== 'object' || value === null) return false;
  if (!('paths' in value) || !('patterns' in value)) return false;
  const { paths, patterns } = value;
  // `Array.isArray` narrows to `any[]` in its lib types, not `unknown[]` — the
  // explicit annotations below re-assert the honest element type it erases.
  if (!Array.isArray(paths) || !Array.isArray(patterns)) return false;
  const pathEntries: readonly unknown[] = paths;
  const patternEntries: readonly unknown[] = patterns;

  return (
    pathEntries.every((entry) => {
      if (typeof entry !== 'object' || entry === null || !('name' in entry)) return false;
      const { name } = entry;
      return typeof name === 'string';
    }) &&
    patternEntries.every((entry) => {
      if (typeof entry !== 'object' || entry === null || !('group' in entry)) return false;
      const { group } = entry;
      if (!Array.isArray(group)) return false;
      const groupEntries: readonly unknown[] = group;
      return groupEntries.every((member) => typeof member === 'string');
    })
  );
}

const httpRestrictions = async (): Promise<RestrictedImports> => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const config: unknown = await eslint.calculateConfigForFile('packages/http/src/index.ts');
  if (typeof config !== 'object' || config === null || !('rules' in config)) {
    throw new Error('ESLint resolved no config for @project/http.');
  }
  // SAFETY: the guard above already confirmed `'rules' in config`, so `config`
  // genuinely carries a `rules` property here — its value type stays loose
  // because ESLint's own resolved-config shape isn't declared anywhere.
  const { rules } = config as { rules?: Record<string, unknown> };
  const rule = rules?.['no-restricted-imports'];
  if (!Array.isArray(rule)) {
    throw new Error('@project/http declares no no-restricted-imports rule.');
  }
  // SAFETY: `Array.isArray(rule)` above confirmed `rule` is an array; ESLint's
  // own rule-entry shape (`[severity, ...options]`) isn't typed, so the tuple
  // destructure still needs a cast.
  const [severity, options] = rule as readonly unknown[];
  // 2 is `error`. A zone downgraded to a warning would still be "configured"
  // while `--max-warnings=0` is the only thing left stopping the import.
  expect(severity).toBe(2);
  if (!isRestrictedImports(options)) {
    throw new Error("@project/http's no-restricted-imports options have an unexpected shape.");
  }
  return options;
};

describe('isRestrictedImports', () => {
  const validRestrictedImports = { paths: [{ name: 'fs' }], patterns: [{ group: ['fs/*'] }] };

  it('accepts the options the rule actually has', () => {
    expect(isRestrictedImports(validRestrictedImports)).toBe(true);
  });

  it.each([
    ['not an object', 'a string'],
    ['null', null],
    ['missing paths', { patterns: [] }],
    ['missing patterns', { paths: [] }],
    ['a path entry with no name', { paths: [{}], patterns: [] }],
    ['a path entry with a non-string name', { paths: [{ name: 1 }], patterns: [] }],
    ['a pattern entry with no group', { paths: [], patterns: [{}] }],
    ['a pattern entry whose group holds a non-string', { paths: [], patterns: [{ group: [1] }] }],
  ])('rejects %s', (_description, candidate) => {
    expect(isRestrictedImports(candidate)).toBe(false);
  });
});

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
