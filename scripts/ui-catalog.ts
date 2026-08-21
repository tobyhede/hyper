import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { PARITY_TAG_PREFIX } from './parity-tag';

export interface UiCatalog {
  readonly exports: readonly string[];
  readonly stories: readonly string[];
  readonly claims: readonly ResolvedParityClaim[];
}

export interface ParityEvidence {
  readonly file: string;
  readonly test: string;
}

export interface ResolvedParityClaim {
  readonly id: string;
  readonly storyFile: string;
  readonly storyExport: string;
  readonly claim: string;
  readonly ladle: ParityEvidence;
  readonly application: ParityEvidence;
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

const literalStoryTitle = (source: ts.SourceFile): string | null => {
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

const sourceFile = (path: string): ts.SourceFile =>
  ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);

const propertyNamed = (
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined =>
  object.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === name) ||
        (ts.isStringLiteral(property.name) && property.name.text === name)),
  );

const literalStringProperty = (object: ts.ObjectLiteralExpression, name: string): string | null => {
  const property = propertyNamed(object, name);
  return property !== undefined && ts.isStringLiteralLike(property.initializer)
    ? property.initializer.text
    : null;
};

interface DeclaredParityClaim {
  readonly id: string;
  readonly storyFile: string;
  readonly storyExport: string;
  readonly claim: string;
  /**
   * A documented exemption from the one-application-test requirement, carrying
   * the reason in place of the test. Absent for every claim with a real
   * `packages/app/e2e` test to find.
   */
  readonly applicationEvidence: string | null;
}

const declaredParityClaims = (path: string, problems: string[]): readonly DeclaredParityClaim[] => {
  const source = sourceFile(path);
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => ts.isIdentifier(item.name) && item.name.text === 'parityClaims');
  const initializer = declaration?.initializer;
  const array =
    initializer !== undefined && ts.isAsExpression(initializer)
      ? initializer.expression
      : initializer;
  if (array === undefined || !ts.isArrayLiteralExpression(array)) {
    problems.push(
      'packages/app/stories/parity-claims.ts must declare a literal parityClaims array',
    );
    return [];
  }

  const claims: DeclaredParityClaim[] = [];
  for (const element of array.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      problems.push('parityClaims entries must be object literals');
      continue;
    }
    const id = literalStringProperty(element, 'id');
    const storyFile = literalStringProperty(element, 'storyFile');
    const storyExport = literalStringProperty(element, 'storyExport');
    const claim = literalStringProperty(element, 'claim');
    if (id === null || storyFile === null || storyExport === null || claim === null) {
      problems.push(
        'parityClaims entries require literal id, storyFile, storyExport and claim fields',
      );
      continue;
    }
    const applicationEvidenceProperty = propertyNamed(element, 'applicationEvidence');
    const applicationEvidence =
      applicationEvidenceProperty === undefined
        ? null
        : ts.isStringLiteralLike(applicationEvidenceProperty.initializer)
          ? applicationEvidenceProperty.initializer.text
          : null;
    if (
      applicationEvidenceProperty !== undefined &&
      (applicationEvidence === null || applicationEvidence.trim() === '')
    ) {
      problems.push(`parity claim ${id} applicationEvidence must be a non-empty string literal`);
      continue;
    }
    claims.push({ id, storyFile, storyExport, claim, applicationEvidence });
  }
  return claims;
};

const namedStoryExports = (source: ts.SourceFile): readonly string[] => {
  const names: string[] = [];
  for (const statement of source.statements) {
    const exported = (
      ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined
    )?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      names.push(statement.name.text);
    }
  }
  return names;
};

interface TaggedTest extends ParityEvidence {
  readonly claimId: string;
  readonly excluded: boolean;
}

const directTestKind = (call: ts.CallExpression): 'included' | 'excluded' | null => {
  if (ts.isIdentifier(call.expression) && call.expression.text === 'test') return 'included';
  if (
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === 'test'
  ) {
    if (call.expression.name.text === 'only') return 'included';
    if (call.expression.name.text === 'skip' || call.expression.name.text === 'fixme')
      return 'excluded';
  }
  return null;
};

const isExcludedDescribe = (node: ts.Node): boolean =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  (node.expression.name.text === 'skip' || node.expression.name.text === 'fixme') &&
  ts.isPropertyAccessExpression(node.expression.expression) &&
  ts.isIdentifier(node.expression.expression.expression) &&
  node.expression.expression.expression.text === 'test' &&
  node.expression.expression.name.text === 'describe';

const parityTagsIn = (root: string, repositoryRoot: string): readonly TaggedTest[] => {
  const evidence: TaggedTest[] = [];
  for (const path of filesBelow(root, '.spec.ts')) {
    const visit = (node: ts.Node, excludedByParent: boolean): void => {
      const title = ts.isCallExpression(node) ? node.arguments[0] : undefined;
      const options = ts.isCallExpression(node) ? node.arguments[1] : undefined;
      const kind = ts.isCallExpression(node) ? directTestKind(node) : null;
      if (
        ts.isCallExpression(node) &&
        kind !== null &&
        title !== undefined &&
        options !== undefined &&
        ts.isStringLiteralLike(title) &&
        ts.isObjectLiteralExpression(options)
      ) {
        const tag = propertyNamed(options, 'tag');
        const tags =
          tag === undefined
            ? []
            : ts.isStringLiteralLike(tag.initializer)
              ? [tag.initializer.text]
              : ts.isArrayLiteralExpression(tag.initializer)
                ? tag.initializer.elements.filter(ts.isStringLiteralLike).map((item) => item.text)
                : [];
        for (const value of tags) {
          if (!value.startsWith(PARITY_TAG_PREFIX)) continue;
          evidence.push({
            claimId: value.slice(PARITY_TAG_PREFIX.length),
            file: relative(repositoryRoot, path).split(sep).join('/'),
            test: title.text,
            excluded: excludedByParent || kind === 'excluded',
          });
        }
      }
      const descendantsExcluded = excludedByParent || isExcludedDescribe(node);
      ts.forEachChild(node, (child) => visit(child, descendantsExcluded));
    };
    visit(sourceFile(path), false);
  }
  return evidence;
};

export const buildUiCatalog = (repositoryRoot = process.cwd()): UiCatalog => {
  const indexPath = join(repositoryRoot, 'packages/ui/src/index.ts');
  const source = sourceFile(indexPath);
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
  const stableExports = new Set<string>();
  for (const path of filesBelow(storiesRoot, '.stories.tsx')) {
    const storyPath = relative(storiesRoot, path).split(sep).join('/');
    const category = storyPath.split('/')[0] ?? '';
    const prefix = prefixes.get(category);
    const storySource = sourceFile(path);
    const title = literalStoryTitle(storySource);
    if (prefix === undefined) problems.push(`${storyPath} is outside the catalogue taxonomy`);
    else if (title === null) problems.push(`${storyPath} must declare a literal default title`);
    else if (!title.startsWith(prefix))
      problems.push(`${storyPath} title must start with ${prefix}`);
    else {
      stories.push(title);
      if (category === 'components' || category === 'surfaces') {
        for (const name of namedStoryExports(storySource))
          stableExports.add(`${storyPath}#${name}`);
      }
    }
  }

  const declared = declaredParityClaims(join(storiesRoot, 'parity-claims.ts'), problems);
  const ids = new Set<string>();
  const claimedExports = new Set<string>();
  for (const item of declared) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id))
      problems.push(`parity claim ${item.id} must use semantic kebab-case`);
    if (ids.has(item.id)) problems.push(`duplicate parity claim id ${item.id}`);
    ids.add(item.id);
    const story = `${item.storyFile}#${item.storyExport}`;
    if (!stableExports.has(story))
      problems.push(`parity claim ${item.id} names unknown stable story ${story}`);
    claimedExports.add(story);
  }
  for (const story of stableExports) {
    if (!claimedExports.has(story)) problems.push(`stable story ${story} has no parity claim`);
  }

  const ladleEvidence = parityTagsIn(
    join(repositoryRoot, 'packages/app/ladle-e2e'),
    repositoryRoot,
  );
  const applicationEvidence = parityTagsIn(
    join(repositoryRoot, 'packages/app/e2e'),
    repositoryRoot,
  );
  const evidenceFor = (all: readonly TaggedTest[], id: string, suite: string): ParityEvidence => {
    const matches = all.filter((item) => item.claimId === id);
    if (matches.length !== 1)
      problems.push(
        `parity claim ${id} requires exactly one ${suite} test; found ${matches.length}`,
      );
    const match = matches[0];
    return match === undefined
      ? { file: '(missing)', test: '(missing)' }
      : { file: match.file, test: match.test };
  };
  for (const item of [...ladleEvidence, ...applicationEvidence]) {
    if (!ids.has(item.claimId))
      problems.push(`unknown parity tag ${PARITY_TAG_PREFIX}${item.claimId} in ${item.file}`);
    if (item.excluded)
      problems.push(`parity tag ${PARITY_TAG_PREFIX}${item.claimId} is excluded in ${item.file}`);
  }
  const exemptedIds = new Set(
    declared.filter((item) => item.applicationEvidence !== null).map((item) => item.id),
  );
  for (const item of applicationEvidence) {
    if (exemptedIds.has(item.claimId)) {
      problems.push(
        `parity claim ${item.claimId} declares applicationEvidence but ${item.file} also tags it — drop the exemption or the tag`,
      );
    }
  }
  const claims = declared.map(({ applicationEvidence: exemptionReason, ...item }) => ({
    ...item,
    ladle: evidenceFor(ladleEvidence, item.id, 'Ladle'),
    application:
      exemptionReason !== null
        ? { file: '(exempt)', test: exemptionReason }
        : evidenceFor(applicationEvidence, item.id, 'application'),
  }));

  if (problems.length > 0) throw new UiCatalogError(problems);
  return { exports: exports.sort(), stories: stories.sort(), claims };
};

export const formatUiCatalog = (catalog: UiCatalog): string =>
  [
    '@project/ui exports',
    ...catalog.exports.map((name) => `  ${name}`),
    '',
    'Ladle stories',
    ...catalog.stories.map((title) => `  ${title}`),
    '',
    'Parity evidence',
    ...catalog.claims.flatMap((item) => [
      `  ${item.id} — ${item.claim}`,
      `    story ${item.storyFile}#${item.storyExport}`,
      `    ladle ${item.ladle.file} — ${item.ladle.test}`,
      `    application ${item.application.file} — ${item.application.test}`,
    ]),
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
