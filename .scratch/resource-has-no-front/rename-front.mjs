#!/usr/bin/env node
/**
 * ADR 0125: the Resource has no front.
 *
 * Usage:
 *   node .scratch/resource-has-no-front/rename-front.mjs [--dry]
 *   pnpm exec prettier --write <the files it reports>
 *
 * **This sweep renames symbols, not spellings.** The earlier sweeps
 * (`.scratch/thing-and-diagram/rename-layout-to-diagram.mjs` and its
 * successors) mask, rewrite and unmask substrings across the tree, because
 * their words were domain nouns written into prose, ids and identifiers
 * alike. "Front" is different in two ways. It is ordinary English ("in front
 * of", "up front", "frontend"), and it is the stem of `frontmatter`, which
 * thirty-odd files read and which must not change. And its prose uses do not
 * map onto one replacement: "the Closed front draws its glyph" wants "a
 * Closed Resource", "the front reads Open from the display" wants
 * "`CanvasResource`". So prose is rewritten by hand in the commit after this
 * one, and this script touches nothing a comment says.
 *
 * Identifiers are renamed through the TypeScript language service's own
 * rename, so a local is renamed with its references and nothing else of the
 * same spelling is: `front` the `CanvasResource` prop and `front` a
 * Playwright locator in an e2e spec are different symbols and get different
 * names. The program is the root `tsconfig.json`'s plus the Ladle stories,
 * which only `packages/app/tsconfig.json` covers. The `typescript` package is
 * the TypeScript 6 compatibility API (ADR 0061); it is used here only for its
 * language service, never as a type-checking truth.
 *
 * Strings are not symbols: the Ladle story id, the story export name the
 * parity inventory reads, and the two parity claim ids are rewritten by
 * `STRING_REWRITES`, each an exact, whole spelling.
 *
 * Not produced here:
 *   - prose in comments, test titles, story titles and notes, and parity
 *     claim sentences (the hand-written commit after this one);
 *   - the vocabulary guard block in `test/unit/current-domain-vocabulary.test.ts`;
 *   - `CONTEXT.md` and ADR 0125 (the commit before this one).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();
const dryRun = process.argv.includes('--dry');

/** A symbol's new name, by its spelling. Every spelling here is ours. */
const SYMBOL_RENAMES = new Map([
  ['CanvasResourceFront', 'KindOperations'],
  ['MarkdownFront', 'MarkdownOperations'],
  ['ReferenceFront', 'ReferenceOperations'],
  ['SpaceFront', 'SpaceOperations'],
  ['ImageFront', 'ImageOperations'],
  ['UrFront', 'UrOperations'],
  ['MutableFront', 'MutableKindOperations'],
  ['frontOf', 'kindOperationsOf'],
  ['kindFrontOf', 'operationsOfKind'],
  ['openableFront', 'openableOperations'],
  ['contentFront', 'contentOperations'],
  ['spaceFront', 'spaceOperations'],
  ['fronts', 'cases'],
  ['FRONTS', 'CLOSED_KINDS'],
  ['Front', 'Closed'],
]);

/**
 * `front` is several symbols. One that is or holds a Resource kind's
 * operations becomes `kindOperations`; a specimen descriptor from the Closed
 * kinds list, which carries a `label`, becomes `entry`; an e2e locator for the drawn Resource becomes
 * `article`, which is what it locates.
 */
const frontRename = (file, typeText) => {
  if (/\blabel: /.test(typeText)) return 'entry';
  if (/KindOperations|CanvasResourceFront|kind: "(?:markdown|image|ur|reference|space|preview)"/.test(typeText))
    return 'kindOperations';
  if (file.startsWith('packages/app/e2e/')) return 'article';
  return 'kindOperations';
};

const STRING_REWRITES = [
  ['components--resource--front', 'components--resource--closed'],
  ["storyExport: 'Front'", "storyExport: 'Closed'"],
  ["storyName = 'Front'", "storyName = 'Closed'"],
  ['canvas-resource-front-draws-only-its-title-lines', 'closed-resource-draws-only-its-title-lines'],
  ['image-resource-closed-front-draws-title-and-kind', 'closed-image-resource-draws-title-and-kind'],
];

const configPath = join(repoRoot, 'tsconfig.json');
const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
    throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  },
});
const storyFiles = ts.sys.readDirectory(join(repoRoot, 'packages/app/stories'), ['.ts', '.tsx']);
const fileNames = [...new Set([...parsed.fileNames, ...storyFiles])].filter(
  (file) => !file.includes('/node_modules/'),
);

const host = {
  getScriptFileNames: () => fileNames,
  getScriptVersion: () => '0',
  getScriptSnapshot: (file) =>
    ts.sys.fileExists(file) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(file) ?? '') : undefined,
  getCurrentDirectory: () => repoRoot,
  getCompilationSettings: () => ({ ...parsed.options, jsx: ts.JsxEmit.ReactJSX }),
  getDefaultLibFileName: ts.getDefaultLibFilePath,
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());
const program = service.getProgram();
const checker = program.getTypeChecker();

/** file -> start -> { length, text } */
const edits = new Map();
const addEdit = (file, start, length, text) => {
  const byStart = edits.get(file) ?? new Map();
  const existing = byStart.get(start);
  if (existing !== undefined && existing.text !== text) {
    throw new Error(`${relative(repoRoot, file)}@${start}: ${existing.text} vs ${text}`);
  }
  byStart.set(start, { length, text });
  edits.set(file, byStart);
};

const nameFor = (file, node) => {
  const text = node.text;
  if (text === 'front') {
    const type = checker.typeToString(checker.getTypeAtLocation(node), undefined, ts.TypeFormatFlags.NoTruncation);
    return frontRename(relative(repoRoot, file), type);
  }
  return SYMBOL_RENAMES.get(text);
};

const seen = new Set();
for (const sourceFile of program.getSourceFiles()) {
  const file = sourceFile.fileName;
  if (!fileNames.includes(file)) continue;
  const visit = (node) => {
    if (ts.isIdentifier(node) && (node.text === 'front' || SYMBOL_RENAMES.has(node.text))) {
      const key = `${file}:${node.getStart()}`;
      if (!seen.has(key)) {
        const newName = nameFor(file, node);
        const locations =
          service.findRenameLocations(file, node.getStart(), false, false, {
            providePrefixAndSuffixTextForRename: false,
          }) ?? [];
        for (const location of locations) {
          seen.add(`${location.fileName}:${location.textSpan.start}`);
          addEdit(location.fileName, location.textSpan.start, location.textSpan.length, newName);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

const changed = new Set();
for (const [file, byStart] of edits) {
  if (!fileNames.includes(file)) throw new Error(`rename reached outside the program: ${file}`);
  let source = readFileSync(file, 'utf8');
  for (const [start, { length, text }] of [...byStart].sort((a, b) => b[0] - a[0])) {
    source = source.slice(0, start) + text + source.slice(start + length);
  }
  if (!dryRun) writeFileSync(file, source);
  changed.add(relative(repoRoot, file));
}

for (const file of fileNames) {
  const name = relative(repoRoot, file);
  let source = readFileSync(file, 'utf8');
  const before = source;
  for (const [from, to] of STRING_REWRITES) source = source.split(from).join(to);
  if (source !== before) {
    if (!dryRun) writeFileSync(file, source);
    changed.add(name);
  }
}

for (const file of [...changed].sort()) console.log(file);
