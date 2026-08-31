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
 * The editor's one dynamic-import boundary. `MarkdownCardBody` lives in `ui`,
 * so `ui` owns the lazy module and names the editor by relative path. A static
 * import from anywhere in that tree would put the CodeMirror stack in the
 * barrel, and from the barrel into the adapter and every other consumer.
 */
const SPECIALIST_IMPORTS = [
  {
    tree: 'packages/ui/src',
    lazyModule: 'packages/ui/src/markdown-source-editor-lazy.ts',
  },
] as const;

const MARKDOWN_SOURCE_EDITOR_SPECIFIER = /(?:^|\/)MarkdownSourceEditor$/;
const STATIC_IMPORT =
  /^[ \t]*import(?:[ \t\r\n]+([^;'"\n]*(?:\n[^;'"\n]*)*?)[ \t\r\n]+from)?[ \t\r\n]*['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Whether an import's bindings survive compilation — the only kind that can pull the
 * stack back into the bundle.
 *
 * Both spellings are erased, so both are allowed: `import type { X } from` and
 * `import { type X } from`. Reading only the leading keyword classified the inline
 * form as a value import and failed the split test over an import that costs nothing.
 */
const isValueImport = (bindings: string): boolean => {
  const clause = bindings.trim();
  if (clause.startsWith('type ') || clause === 'type') return false;
  const braced = /^\{([^}]*)\}$/.exec(clause);
  if (braced === null) return true;
  const named = braced[1]!.split(',').filter((entry) => entry.trim() !== '');
  return named.length === 0 || !named.every((entry) => entry.trim().startsWith('type '));
};

const hasStaticEditorValueImport = (source: string): boolean =>
  [...source.matchAll(STATIC_IMPORT)].some(
    (match) =>
      MARKDOWN_SOURCE_EDITOR_SPECIFIER.test(match[2] ?? '') && isValueImport(match[1] ?? ''),
  );

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
  it('recognises side-effect and nested relative editor imports as value imports', () => {
    expect(hasStaticEditorValueImport("import '../MarkdownSourceEditor';")).toBe(true);
    expect(
      hasStaticEditorValueImport("import { MarkdownSourceEditor } from '../MarkdownSourceEditor';"),
    ).toBe(true);
    expect(
      hasStaticEditorValueImport(
        "import { type MarkdownSourceEditorHandle } from '../MarkdownSourceEditor';",
      ),
    ).toBe(false);
    expect(
      hasStaticEditorValueImport(
        "import {\n  MarkdownSourceEditor,\n} from '../MarkdownSourceEditor';",
      ),
    ).toBe(true);
    expect(
      hasStaticEditorValueImport(
        "import {\n  type MarkdownSourceEditorHandle,\n} from '../MarkdownSourceEditor';",
      ),
    ).toBe(false);
  });

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
   * A type-only import is erased and costs nothing, so a consumer may keep one
   * for the handle. A value import is what would pull the stack back in.
   */
  it.each(SPECIALIST_IMPORTS)(
    'is reached from $tree by dynamic import only',
    ({ tree, lazyModule }) => {
      const root = join(import.meta.dirname, '../..');
      const sources = sourcesUnder(join(root, tree));
      expect(sources.length).toBeGreaterThan(0);

      const valueImports = sources.filter((path) => {
        return hasStaticEditorValueImport(readFileSync(path, 'utf8'));
      });
      const dynamicImports = sources.filter((path) => {
        const imports = readFileSync(path, 'utf8').matchAll(DYNAMIC_IMPORT);
        return [...imports].some((match) => MARKDOWN_SOURCE_EDITOR_SPECIFIER.test(match[1] ?? ''));
      });

      expect(valueImports.map((path) => relative(root, path))).toEqual([]);
      expect(dynamicImports.map((path) => relative(root, path))).toEqual([lazyModule]);
    },
  );
});
