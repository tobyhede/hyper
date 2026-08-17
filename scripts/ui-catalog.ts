import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface UiCatalog {
  readonly exports: readonly string[];
  readonly stories: readonly string[];
}

export class UiCatalogError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`UI catalogue is invalid:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'UiCatalogError';
    this.problems = problems;
  }
}

const filesBelow = (directory: string, suffix: string): readonly string[] => {
  const files: string[] = [];
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(child);
    }
  };
  visit(directory);
  return files.sort();
};

const literalStoryTitle = (path: string): string | null => {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const exported = source.statements.find(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && !statement.isExportEquals,
  );
  if (exported === undefined || !ts.isObjectLiteralExpression(exported.expression)) return null;
  const title = exported.expression.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === 'title') ||
        (ts.isStringLiteral(property.name) && property.name.text === 'title')),
  );
  return title !== undefined && ts.isStringLiteralLike(title.initializer)
    ? title.initializer.text
    : null;
};

export const buildUiCatalog = (repositoryRoot = process.cwd()): UiCatalog => {
  const indexPath = join(repositoryRoot, 'packages/ui/src/index.ts');
  const source = ts.createSourceFile(
    indexPath,
    readFileSync(indexPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const exports: string[] = [];
  const problems: string[] = [];

  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) {
      problems.push('packages/ui/src/index.ts must use explicit named exports');
      continue;
    }
    for (const element of statement.exportClause.elements) {
      if (!element.isTypeOnly) exports.push(element.name.text);
    }
  }

  const storiesRoot = join(repositoryRoot, 'packages/app/stories');
  const prefixes = new Map([
    ['components', 'Components/'],
    ['surfaces', 'Surfaces/'],
    ['review', 'Review/'],
  ]);
  const stories: string[] = [];
  for (const path of filesBelow(storiesRoot, '.stories.tsx')) {
    const storyPath = relative(storiesRoot, path).split(sep).join('/');
    const category = storyPath.split('/')[0] ?? '';
    const prefix = prefixes.get(category);
    const title = literalStoryTitle(path);
    if (prefix === undefined) problems.push(`${storyPath} is outside the catalogue taxonomy`);
    else if (title === null) problems.push(`${storyPath} must declare a literal default title`);
    else if (!title.startsWith(prefix))
      problems.push(`${storyPath} title must start with ${prefix}`);
    else stories.push(title);
  }

  if (problems.length > 0) throw new UiCatalogError(problems);
  return { exports: exports.sort(), stories: stories.sort() };
};

export const formatUiCatalog = (catalog: UiCatalog): string =>
  [
    '@project/ui exports',
    ...catalog.exports.map((name) => `  ${name}`),
    '',
    'Ladle stories',
    ...catalog.stories.map((title) => `  ${title}`),
  ].join('\n');

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  try {
    const catalog = buildUiCatalog();
    console.log(
      process.argv.includes('--check') ? 'UI catalogue is valid.' : formatUiCatalog(catalog),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
