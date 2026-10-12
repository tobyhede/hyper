import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { trackedFiles } from '../support/structural-scan';

/**
 * Outside a `kinds/` directory nothing imports what one kind's module exports,
 * except a file listed in `eslint.config.js`'s `KIND_FEATURE_FILES` for a
 * feature that exists for that kind alone (ADR 0128). The rule is
 * `@typescript-eslint/no-restricted-imports`, and what this pins is what the
 * rule cannot say about itself: that it refuses every name each kind module
 * exports, read here by the compiler rather than by the config's own reading
 * of the source, and no name a kind-neutral module exports; and that its
 * exemptions only shrink — each one is a tracked file that still imports a
 * name the rule refuses.
 *
 * The rule is observed by linting probe source as a ruled file, so what is
 * pinned is what the rule does rather than how the config spells it.
 */
const RULE = '@typescript-eslint/no-restricted-imports';

/** The modules under a `kinds/` directory that name no kind: the interface and the registry. */
const KIND_NEUTRAL_MODULES = new Set(['registry', 'kind-module', 'kind-view']);

const moduleNameOf = (file: string): string =>
  file.slice(file.lastIndexOf('/') + 1).replace(/\.tsx?$/u, '');

const kindsDirectoryFiles = (pkg: string): readonly string[] =>
  trackedFiles().filter(
    (file) => file.startsWith(`packages/${pkg}/src/kinds/`) && /\.tsx?$/u.test(file),
  );

/** One package's kind modules: each module under its `kinds/` but the neutral ones. */
const kindModuleFiles = (pkg: string): readonly string[] =>
  kindsDirectoryFiles(pkg).filter((file) => !KIND_NEUTRAL_MODULES.has(moduleNameOf(file)));

/** One package's kind-neutral modules under `kinds/`. */
const neutralModuleFiles = (pkg: string): readonly string[] =>
  kindsDirectoryFiles(pkg).filter((file) => KIND_NEUTRAL_MODULES.has(moduleNameOf(file)));

const parsed = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

const isExported = (statement: ts.Statement): boolean =>
  ts.canHaveModifiers(statement) &&
  (ts.getModifiers(statement) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );

/** Each name a module exports, values and types alike, as the compiler parses it. */
const exportedNames = (file: string): readonly string[] =>
  parsed(file).statements.flatMap((statement): readonly string[] => {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      return clause !== undefined && ts.isNamedExports(clause)
        ? clause.elements.map((element) => element.name.text)
        : [];
    }
    if (!isExported(statement)) return [];
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) =>
        ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
      );
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      return [statement.name.text];
    }
    return [];
  });

const namesExportedBy = (files: readonly string[]): readonly string[] => [
  ...new Set(files.flatMap(exportedNames)),
];

/** The names the rule refuses, by package specifier, as the compiler reads the kind modules. */
const BANNED_FROM: ReadonlyMap<string, readonly string[]> = new Map([
  ['@project/core', namesExportedBy(kindModuleFiles('core'))],
  ['@project/ui', namesExportedBy(kindModuleFiles('ui'))],
]);

/** Every kind module's name, in any package, so a relative import of one is recognised. */
const KIND_MODULE_NAMES = new Set(['core', 'ui', 'app'].flatMap(kindModuleFiles).map(moduleNameOf));

/** Whether a specifier reaches a kind module by relative path. */
const reachesKindModule = (specifier: string): boolean => {
  const name = /(?:^|\/)kinds\/([^/]+)$/u.exec(specifier)?.[1];
  return name !== undefined && KIND_MODULE_NAMES.has(name);
};

/** Whether a file imports, or re-exports, a name the rule refuses. */
const importsKindModuleName = (file: string): boolean =>
  parsed(file).statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return false;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier)) return false;
    if (reachesKindModule(specifier.text)) return true;
    const names = BANNED_FROM.get(specifier.text);
    if (names === undefined) return false;
    const bindings = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : statement.exportClause;
    if (bindings === undefined) return ts.isExportDeclaration(statement);
    if (ts.isNamespaceImport(bindings) || ts.isNamespaceExport(bindings)) return true;
    return bindings.elements.some((element) =>
      names.includes((element.propertyName ?? element.name).text),
    );
  });

/** The files `eslint.config.js` lists in `KIND_FEATURE_FILES`, read from its source. */
const listedExemptions = (): readonly string[] => {
  const source = readFileSync('eslint.config.js', 'utf8');
  const start = source.indexOf('const KIND_FEATURE_FILES = [');
  const end = source.indexOf('\n];', start);
  if (start === -1 || end === -1)
    throw new Error('eslint.config.js declares no KIND_FEATURE_FILES.');
  return [...source.slice(start, end).matchAll(/^\s*'([^']+)',$/gmu)].map(
    (match) => match[1] ?? '',
  );
};

/** A file the rule applies to and no exemption covers, which the probes are linted as. */
const RULED_FILE = 'packages/app/src/compose-app.ts';

const eslint = new ESLint({ cwd: process.cwd() });

/** The 1-based lines of `imports` the rule refuses, as an error, when linted as `file`. */
const refusedLines = async (imports: readonly string[], file: string): Promise<Set<number>> => {
  const [result] = await eslint.lintText(`${imports.join('\n')}\n`, { filePath: file });
  return new Set(
    (result?.messages ?? [])
      .filter((message) => message.ruleId === RULE && message.severity === 2)
      .map((message) => message.line),
  );
};

/** One import the rule must refuse, or let through. */
interface Probe {
  readonly line: string;
  readonly refused: boolean;
}

const namedProbes = (specifier: string, names: readonly string[], refused: boolean): Probe[] =>
  names.map((name) => ({ line: `import { ${name} } from '${specifier}';`, refused }));

/** Each probe the rule answers otherwise than it should, when linted as the ruled file. */
const misjudged = async (probes: readonly Probe[]): Promise<readonly string[]> => {
  const refused = await refusedLines(
    probes.map(({ line }) => line),
    RULED_FILE,
  );
  return probes
    .filter((probe, index) => refused.has(index + 1) !== probe.refused)
    .map(({ line, refused: expected }) => `${expected ? 'let through' : 'refused'}: ${line}`);
};

describe('a kind module is imported only under kinds/ or by a feature of its kind', () => {
  it('refuses every name a kind module exports, and no name a kind-neutral module does', async () => {
    expect(
      await misjudged([
        ...namedProbes('@project/core', namesExportedBy(kindModuleFiles('core')), true),
        ...namedProbes('@project/core', namesExportedBy(neutralModuleFiles('core')), false),
        ...namedProbes('@project/ui', namesExportedBy(kindModuleFiles('ui')), true),
        ...namedProbes('@project/ui', namesExportedBy(neutralModuleFiles('ui')), false),
      ]),
    ).toEqual([]);
  });

  it('refuses a kind module by relative path, and no kind-neutral module or stylesheet', async () => {
    expect(
      await misjudged([
        ...[...KIND_MODULE_NAMES].map((name) => ({
          line: `import { probe } from './kinds/${name}';`,
          refused: true,
        })),
        ...[...KIND_NEUTRAL_MODULES].map((name) => ({
          line: `import { probe } from '../kinds/${name}';`,
          refused: false,
        })),
        { line: "import './kinds/space-canvas.css';", refused: false },
      ]),
    ).toEqual([]);
  });

  it('refuses a namespace import of either package', async () => {
    expect(
      await misjudged([
        { line: "import * as core from '@project/core';", refused: true },
        { line: "import * as ui from '@project/ui';", refused: true },
      ]),
    ).toEqual([]);
  });

  it('lets a listed file import a kind module’s export', async () => {
    const refused = await refusedLines(
      ["import { spaceKind } from '@project/core';"],
      'packages/app/src/dock-chrome.ts',
    );
    expect([...refused]).toEqual([]);
  });

  it('lists only tracked files outside kinds/', () => {
    const tracked = new Set(trackedFiles());
    expect(
      listedExemptions().filter((file) => !tracked.has(file) || file.includes('/kinds/')),
    ).toEqual([]);
  });

  it('lists only files that still import a name the rule refuses', () => {
    expect(listedExemptions().filter((file) => !importsKindModuleName(file))).toEqual([]);
  });

  it('reads a named import, and an `export *` of a kind module, as importing a refused name', () => {
    expect(importsKindModuleName(RULED_FILE)).toBe(false);
    expect(importsKindModuleName('packages/app/src/dock-chrome.ts')).toBe(true);
    expect(importsKindModuleName('packages/core/src/index.ts')).toBe(true);
  });
});
