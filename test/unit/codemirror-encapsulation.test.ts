import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR 0063: `MarkdownSourceEditor` exposes Hyper's contract, not CodeMirror's, and
 * application callers cannot configure CodeMirror directly. A stylesheet that names a
 * `.cm-*` class is exactly that configuration reached round the back — it survives no
 * upgrade that renames the class, and it fails silently, because the rule simply stops
 * matching and the wrapper's own default takes over.
 *
 * CodeMirror appearance belongs in `markdownSourceTheme`, parameterised by custom
 * properties where a caller needs a say. Custom properties inherit, so a caller sets
 * one on the wrapper without naming anything inside it.
 */
const CODEMIRROR_SELECTOR = /^[^@/*]*\.cm-[\w-]+/m;

/**
 * How the editor is named from each tree that reaches it, and the one module in
 * that tree allowed to name it.
 *
 * Two, because the split point moved. `app` reached the editor through the
 * package subpath, which is the single negated entry in an ESLint zone that
 * otherwise bars `@project/ui/*`. `MarkdownCardBody` is the second consumer and
 * it lives in `ui`, so `ui` owns a lazy module of its own and names the editor
 * by relative path — and a static import from *there* would put the whole
 * CodeMirror stack in the barrel, and from the barrel into the adapter and every
 * other consumer, with nothing in `app` left to catch it.
 */
const SPECIALIST_IMPORTS = [
  {
    tree: 'packages/app/src',
    specifier: '@project/ui/MarkdownSourceEditor',
    lazyModule: 'packages/app/src/components/markdown-source-editor-lazy.ts',
  },
  {
    tree: 'packages/ui/src',
    specifier: './MarkdownSourceEditor',
    lazyModule: 'packages/ui/src/markdown-source-editor-lazy.ts',
  },
] as const;

/**
 * A static `import ... from '<specifier>'`, capturing the `type` keyword when it is
 * there. Bounded by `[^;]` so the match cannot start at an earlier import statement and
 * run through to this specifier's `from` — leftmost-match would otherwise report the
 * bindings of a different, unrelated import.
 */
const staticImport = (specifier: string) =>
  new RegExp(
    String.raw`^[ \t]*import[ \t]+(type[ \t]+)?[^;]*?from[ \t]*['"]` + specifier + String.raw`['"]`,
    'gm',
  );
const dynamicImport = (specifier: string) =>
  new RegExp(String.raw`import\(\s*['"]` + specifier + String.raw`['"]\s*\)`);

const sourcesUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourcesUnder(path);
    const source = entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'));
    return source ? [path] : [];
  });

const stylesheetsUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : stylesheetsUnder(path);
    return entry.isFile() && entry.name.endsWith('.css') ? [path] : [];
  });

describe('CodeMirror stays behind its wrapper', () => {
  it('is styled by no stylesheet in the repository', () => {
    const root = join(import.meta.dirname, '../..');
    const stylesheets = stylesheetsUnder(join(root, 'packages'));
    expect(stylesheets.length).toBeGreaterThan(0);

    const reaching = stylesheets
      .filter((sheet) => CODEMIRROR_SELECTOR.test(readFileSync(sheet, 'utf8')))
      .map((sheet) => relative(root, sheet));

    expect(reaching).toEqual([]);
  });

  /**
   * ADR 0063's stated payoff — and the whole justification for the single
   * `@project/ui/*` ESLint exception — is that CodeMirror's stack stays out of the
   * initial bundle. The browser test that watches for the request proves the *dev*
   * module graph only: a built chunk is content-hashed, so the name it matches on is
   * gone. What actually decides the split is the import, so that is what this holds.
   *
   * A type-only import is erased and costs nothing, which is why `OpenCard` may keep
   * one for the handle. A value import is what would pull the stack back in.
   */
  it.each(SPECIALIST_IMPORTS)(
    'is reached from $tree by dynamic import only',
    ({ tree, specifier, lazyModule }) => {
      const root = join(import.meta.dirname, '../..');
      const sources = sourcesUnder(join(root, tree));
      expect(sources.length).toBeGreaterThan(0);

      const STATIC_IMPORT = staticImport(specifier);
      const DYNAMIC_IMPORT = dynamicImport(specifier);
      const valueImports = sources.filter((path) =>
        [...readFileSync(path, 'utf8').matchAll(STATIC_IMPORT)].some(
          (match) => match[1] === undefined,
        ),
      );
      const dynamicImports = sources.filter((path) =>
        DYNAMIC_IMPORT.test(readFileSync(path, 'utf8')),
      );

      expect(valueImports.map((path) => relative(root, path))).toEqual([]);
      expect(dynamicImports.map((path) => relative(root, path))).toEqual([lazyModule]);
    },
  );
});
