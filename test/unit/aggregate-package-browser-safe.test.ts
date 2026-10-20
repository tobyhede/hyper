import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR 0130: `@project/aggregate` is what a mounted page reaches, so nothing in
 * it may import a Node builtin. The package typecheck already fails a bare
 * builtin, because `tsconfig.base.json` loads no `@types/node`, and the lint
 * zone refuses one, but neither of those sees a module that only the root
 * program compiles. This reads the source itself, as
 * `codemirror-encapsulation.test.ts` does for the editor's import boundary.
 */
const PACKAGE_SOURCE = 'packages/aggregate/src';

const builtinBaseNames = new Set(
  builtinModules.map((name) => name.replace(/^node:/, '').replace(/\/.*$/, '')),
);

const STATIC_SPECIFIER = /^[ \t]*(?:import|export)\b[^'"]*?['"]([^'"]+)['"]/gm;
const DYNAMIC_SPECIFIER = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Every module specifier a source names, statically or by dynamic import. */
const specifiersIn = (source: string): readonly string[] => [
  ...[...source.matchAll(STATIC_SPECIFIER)].map((match) => match[1] ?? ''),
  ...[...source.matchAll(DYNAMIC_SPECIFIER)].map((match) => match[1] ?? ''),
];

const isNodeBuiltin = (specifier: string): boolean =>
  specifier.startsWith('node:') || builtinBaseNames.has(specifier.replace(/\/.*$/, ''));

const sourcesUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return entry.isFile() && /\.tsx?$/u.test(entry.name) ? [path] : [];
  });

describe('@project/aggregate is browser-safe', () => {
  it('recognises a builtin in each spelling an import can take', () => {
    expect(specifiersIn("import { join } from 'node:path';").filter(isNodeBuiltin)).toEqual([
      'node:path',
    ]);
    expect(specifiersIn("import { readFile } from 'fs/promises';").filter(isNodeBuiltin)).toEqual([
      'fs/promises',
    ]);
    expect(specifiersIn("export { isDeepStrictEqual } from 'util';").filter(isNodeBuiltin)).toEqual(
      ['util'],
    );
    expect(specifiersIn("const os = await import('node:os');").filter(isNodeBuiltin)).toEqual([
      'node:os',
    ]);
    expect(
      specifiersIn("import type { Dirent } from 'node:fs';\nimport { x } from './y';").filter(
        isNodeBuiltin,
      ),
    ).toEqual(['node:fs']);
    expect(
      specifiersIn("import { loadSpace } from '@project/graph';").filter(isNodeBuiltin),
    ).toEqual([]);
  });

  it('imports no Node builtin from any source module', () => {
    const root = join(import.meta.dirname, '../..');
    const sources = sourcesUnder(join(root, PACKAGE_SOURCE));
    expect(sources.length).toBeGreaterThan(0);

    const reaching = sources.flatMap((path) =>
      specifiersIn(readFileSync(path, 'utf8'))
        .filter(isNodeBuiltin)
        .map((specifier) => `${relative(root, path)}: ${specifier}`),
    );

    expect(reaching).toEqual([]);
  });
});
