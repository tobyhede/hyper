import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface UiCatalog {
  readonly primitives: readonly string[];
  readonly hyper: readonly string[];
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

const normalise = (path: string): string => resolve(path).split(sep).join('/');

const readTsConfig = (configPath: string): ts.ParsedCommandLine => {
  const config = ts.readConfigFile(configPath, (path) => readFileSync(path, 'utf8'));
  if (config.error !== undefined) {
    throw new UiCatalogError([ts.flattenDiagnosticMessageText(config.error.messageText, '\n')]);
  }
  return ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configPath),
    undefined,
    configPath,
  );
};

const publicExports = (
  source: ts.SourceFile,
): {
  readonly primitives: readonly string[];
  readonly hyper: readonly string[];
  readonly problems: readonly string[];
} => {
  const primitives: string[] = [];
  const hyper: string[] = [];
  const seen = new Map<string, string>();
  const problems: string[] = [];

  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) {
      problems.push(
        'packages/ui/src/index.ts must use named exports so catalogue ownership is explicit',
      );
      continue;
    }

    const moduleName =
      statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : '(local)';
    const destination = moduleName.startsWith('./components/') ? primitives : hyper;

    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue;
      const name = element.name.text;
      const previous = seen.get(name);
      if (previous !== undefined) {
        problems.push(`duplicate public export ${name} from ${previous} and ${moduleName}`);
        continue;
      }
      seen.set(name, moduleName);
      destination.push(name);
    }
  }

  return { primitives, hyper, problems };
};

const storyFiles = (directory: string): readonly string[] => {
  const files: string[] = [];
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith('.stories.tsx')) files.push(child);
    }
  };
  visit(directory);
  return files.sort();
};

const unwrap = (expression: ts.Expression): ts.Expression => {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return unwrap(expression.expression);
  }
  return expression;
};

const storyTitle = (path: string): string | null => {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const assignment = source.statements.find(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && !statement.isExportEquals,
  );
  if (assignment === undefined) return null;
  const expression = unwrap(assignment.expression);
  if (!ts.isObjectLiteralExpression(expression)) return null;
  const title = expression.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === 'title') ||
        (ts.isStringLiteral(property.name) && property.name.text === 'title')),
  );
  if (title === undefined || !ts.isStringLiteralLike(title.initializer)) return null;
  return title.initializer.text;
};

const diagnosticText = (diagnostic: ts.Diagnostic): string => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (diagnostic.file === undefined || diagnostic.start === undefined) return message;
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${line + 1}:${character + 1} ${message}`;
};

export const buildUiCatalog = (repositoryRoot = process.cwd()): UiCatalog => {
  const uiRoot = join(repositoryRoot, 'packages/ui');
  const indexPath = join(uiRoot, 'src/index.ts');
  const config = readTsConfig(join(uiRoot, 'tsconfig.json'));
  const declarations = config.fileNames.filter((path) => path.endsWith('.d.ts'));
  const program = ts.createProgram({
    rootNames: [indexPath, ...declarations],
    options: config.options,
  });
  const problems = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(diagnosticText);

  const source = program.getSourceFile(indexPath);
  if (source === undefined) {
    throw new UiCatalogError([...problems, 'could not resolve packages/ui/src/index.ts']);
  }

  const exports = publicExports(source);
  problems.push(...exports.problems);

  const reachable = new Set(
    program
      .getSourceFiles()
      .filter((candidate) => !candidate.isDeclarationFile)
      .map((candidate) => normalise(candidate.fileName)),
  );
  const componentsDirectory = join(uiRoot, 'src/components');
  for (const entry of readdirSync(componentsDirectory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.tsx')) {
      const component = normalise(join(componentsDirectory, entry.name));
      if (!reachable.has(component)) {
        problems.push(
          `${relative(repositoryRoot, component)} is not reachable from packages/ui/src/index.ts`,
        );
      }
    }
  }

  const storiesDirectory = join(repositoryRoot, 'packages/app/stories');
  const stories: string[] = [];
  const categories = new Map([
    ['components', 'Components/'],
    ['surfaces', 'Surfaces/'],
    ['review', 'Review/'],
  ]);
  for (const path of storyFiles(storiesDirectory)) {
    const storyPath = relative(storiesDirectory, path).split(sep).join('/');
    const category = storyPath.split('/')[0] ?? '';
    const requiredPrefix = categories.get(category);
    if (requiredPrefix === undefined) {
      problems.push(`${storyPath} is outside components, surfaces, or review`);
      continue;
    }
    const title = storyTitle(path);
    if (title === null) {
      problems.push(`${storyPath} must declare a literal default-export title`);
      continue;
    }
    if (!title.startsWith(requiredPrefix)) {
      problems.push(`${storyPath} title must start with ${requiredPrefix}`);
    }
    stories.push(title);
  }

  if (problems.length > 0) throw new UiCatalogError(problems);
  return { primitives: exports.primitives, hyper: exports.hyper, stories: stories.sort() };
};

export const formatUiCatalog = (catalog: UiCatalog): string => {
  const section = (title: string, values: readonly string[]): string =>
    `${title}\n${values.map((value) => `  ${value}`).join('\n')}`;
  return [
    '@project/ui',
    '',
    section('shadcn/Base primitives', catalog.primitives),
    '',
    section('Hyper components/facades', catalog.hyper),
    '',
    section('Ladle stories', catalog.stories),
  ].join('\n');
};

const main = (): void => {
  try {
    const catalog = buildUiCatalog();
    if (process.argv.includes('--check')) console.log('UI catalogue is valid.');
    else console.log(formatUiCatalog(catalog));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
};

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href) main();
