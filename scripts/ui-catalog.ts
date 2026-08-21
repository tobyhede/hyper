import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { PARITY_TAG_PREFIX } from './parity-tag';

export interface UiCatalog {
  readonly exports: readonly string[];
  readonly stories: readonly string[];
  readonly claims: readonly ResolvedParityClaim[];
  readonly uncataloguedComponents: readonly UncataloguedComponent[];
  readonly handRolledStyles: readonly HandRolledStyle[];
}

/** A production `.tsx` module no stable story renders, and the reason it has none. */
export interface UncataloguedComponent {
  readonly module: string;
  readonly reason: string;
}

/**
 * A class block `packages/app/src/styles.css` still declares, and the React Flow
 * or integration requirement that keeps it out of `@project/ui`. The block is the
 * BEM root — `rf-card-node` covers `rf-card-node__port` and `rf-card-node--active`.
 */
export interface HandRolledStyle {
  readonly block: string;
  readonly reason: string;
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
  if (existsSync(directory)) visit(directory);
  return files.sort();
};

const repositoryPath = (repositoryRoot: string, path: string): string =>
  relative(repositoryRoot, path).split(sep).join('/');

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

/** The `const <name> = [...] as const` a manifest module is required to declare. */
const literalArrayNamed = (
  source: ts.SourceFile,
  name: string,
): ts.ArrayLiteralExpression | null => {
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => ts.isIdentifier(item.name) && item.name.text === name);
  const initializer = declaration?.initializer;
  const array =
    initializer !== undefined && ts.isAsExpression(initializer)
      ? initializer.expression
      : initializer;
  return array !== undefined && ts.isArrayLiteralExpression(array) ? array : null;
};

/** The manifest declaring the two gaps, and the stylesheet one of them is about. */
const INVENTORY_MODULE = 'packages/app/stories/design-system-inventory.ts';
const HAND_ROLLED_STYLESHEET = 'packages/app/src/styles.css';

interface InventoryEntry {
  readonly subject: string;
  readonly reason: string;
}

/**
 * One of the two literal lists in `design-system-inventory.ts`, read the same
 * way `parityClaims` is: what the stable catalogue does not cover, and what the
 * application still styles by hand. Every entry carries its own reason, so a new
 * gap costs a written justification rather than passing unnoticed — and an entry
 * that stops being true fails the check.
 */
const declaredInventory = (
  path: string,
  declaration: string,
  subjectKey: string,
  problems: string[],
): readonly InventoryEntry[] => {
  if (!existsSync(path)) {
    problems.push(`${INVENTORY_MODULE} is missing`);
    return [];
  }
  const array = literalArrayNamed(sourceFile(path), declaration);
  if (array === null) {
    problems.push(`${INVENTORY_MODULE} must declare a literal ${declaration} array`);
    return [];
  }
  const entries: InventoryEntry[] = [];
  for (const element of array.elements) {
    const subject = ts.isObjectLiteralExpression(element)
      ? literalStringProperty(element, subjectKey)
      : null;
    const reason = ts.isObjectLiteralExpression(element)
      ? literalStringProperty(element, 'reason')
      : null;
    if (subject === null || reason === null || reason.trim() === '') {
      problems.push(
        `${declaration} entries require a literal ${subjectKey} and a non-empty reason`,
      );
      continue;
    }
    entries.push({ subject, reason });
  }
  return entries;
};

const declaredParityClaims = (path: string, problems: string[]): readonly DeclaredParityClaim[] => {
  const array = literalArrayNamed(sourceFile(path), 'parityClaims');
  if (array === null) {
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

/**
 * What the manifest has to hold for the patterns to be readable: an `imports`
 * whose every entry names a string target. Stated to the leaf rather than as an
 * ownerless `object`, so `Object.entries` below yields `[string, string]` and
 * nothing in this file ever holds an `any`.
 */
interface SubpathManifest {
  readonly imports: Record<string, string>;
}

const isSubpathTarget = (value: unknown): value is string => typeof value === 'string';

const isSubpathManifest = (value: unknown): value is SubpathManifest =>
  typeof value === 'object' &&
  value !== null &&
  'imports' in value &&
  typeof value.imports === 'object' &&
  value.imports !== null &&
  Object.values(value.imports).every(isSubpathTarget);

/**
 * `packages/app/package.json`'s own `imports` map, so `#components/CardPane`
 * resolves by the rule Node and Vite already resolve it by rather than by a
 * second copy of the mapping kept here.
 */
const subpathImports = (repositoryRoot: string): ReadonlyMap<string, string> => {
  const manifest = join(repositoryRoot, 'packages/app/package.json');
  if (!existsSync(manifest)) return new Map();
  const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  return isSubpathManifest(parsed) ? new Map(Object.entries(parsed.imports)) : new Map();
};

const asFile = (path: string): string | null =>
  existsSync(path) && statSync(path).isFile() ? path : null;

const resolvedExtension = (base: string): string | null =>
  asFile(base) ??
  asFile(`${base}.tsx`) ??
  asFile(`${base}.ts`) ??
  asFile(join(base, 'index.tsx')) ??
  asFile(join(base, 'index.ts'));

const PROJECT_SCOPE = '@project/';

const resolveModule = (
  specifier: string,
  from: string,
  repositoryRoot: string,
  subpaths: ReadonlyMap<string, string>,
): string | null => {
  if (specifier.startsWith('.')) return resolvedExtension(resolve(dirname(from), specifier));
  if (specifier.startsWith('#')) {
    for (const [pattern, target] of subpaths) {
      const [prefix, suffix] = pattern.split('*');
      if (suffix === undefined || prefix === undefined || !specifier.startsWith(prefix)) continue;
      const [targetPrefix, targetSuffix] = target.split('*');
      if (targetPrefix === undefined || targetSuffix === undefined) continue;
      const name = specifier.slice(prefix.length, specifier.length - suffix.length);
      return asFile(join(repositoryRoot, 'packages/app', targetPrefix + name + targetSuffix));
    }
    return null;
  }
  if (!specifier.startsWith(PROJECT_SCOPE)) return null;
  const packageName = specifier.slice(PROJECT_SCOPE.length);
  return asFile(join(repositoryRoot, 'packages', packageName, 'src/index.ts'));
};

interface ModuleReference {
  readonly specifier: string;
  /** The named bindings taken, or `null` for a namespace, default or bare import. */
  readonly names: readonly string[] | null;
}

const moduleReferences = (source: ts.SourceFile): readonly ModuleReference[] => {
  const references: ModuleReference[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      // A type-only import is erased before anything runs, so it cannot render
      // what it names. Both spellings are skipped — the whole declaration
      // (`import type { X } from …`) and the individual specifier
      // (`import { type X }`) — or a story could catalogue a component by
      // mentioning its props type. An import clause says which through
      // `phaseModifier`, whose other value is `defer` and is not this.
      const typeOnly = ts.isImportDeclaration(node)
        ? node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword
        : node.isTypeOnly;
      const bindings = ts.isImportDeclaration(node)
        ? node.importClause?.namedBindings
        : node.exportClause;
      const named =
        bindings === undefined
          ? null
          : ts.isNamedImports(bindings) || ts.isNamedExports(bindings)
            ? bindings.elements
                .filter((element) => !element.isTypeOnly)
                .map((element) => (element.propertyName ?? element.name).text)
            : null;
      // Every named binding type-only is the same erasure as `import type`,
      // spelled per specifier.
      const erased = typeOnly || (named !== null && named.length === 0);
      if (!erased) references.push({ specifier: node.moduleSpecifier.text, names: named });
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      references.push({ specifier: node.arguments[0].text, names: null });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
};

/**
 * A package index re-exports rather than renders, so following it whole would
 * mark every module in that package rendered by whichever story imports one
 * name from it. The names a story actually takes are resolved back to the
 * modules that own them instead.
 */
const barrelOwners = (
  index: string,
  names: readonly string[] | null,
  repositoryRoot: string,
  subpaths: ReadonlyMap<string, string>,
): readonly string[] => {
  const wanted = names === null ? null : new Set(names);
  return moduleReferences(sourceFile(index))
    .filter((reference) => wanted === null || reference.names?.some((name) => wanted.has(name)))
    .map((reference) => resolveModule(reference.specifier, index, repositoryRoot, subpaths))
    .filter((path): path is string => path !== null);
};

const isPackageIndex = (path: string, repositoryRoot: string): boolean =>
  /^packages\/[^/]+\/src\/index\.ts$/u.test(repositoryPath(repositoryRoot, path));

const modulesRenderedBy = (
  entryPoints: readonly string[],
  repositoryRoot: string,
): ReadonlySet<string> => {
  const subpaths = subpathImports(repositoryRoot);
  const rendered = new Set<string>();
  const walk = (path: string): void => {
    if (rendered.has(path)) return;
    rendered.add(path);
    for (const reference of moduleReferences(sourceFile(path))) {
      const target = resolveModule(reference.specifier, path, repositoryRoot, subpaths);
      if (target === null) continue;
      if (isPackageIndex(target, repositoryRoot)) {
        rendered.add(target);
        for (const owner of barrelOwners(target, reference.names, repositoryRoot, subpaths))
          walk(owner);
      } else walk(target);
    }
  };
  for (const entry of entryPoints) walk(entry);
  return rendered;
};

const PRODUCTION_UI_ROOTS = [
  'packages/ui/src',
  'packages/app/src',
  'packages/react-flow-adapter/src',
];

const productionComponents = (repositoryRoot: string): readonly string[] =>
  PRODUCTION_UI_ROOTS.flatMap((root) => filesBelow(join(repositoryRoot, root), '.tsx')).filter(
    (path) => !path.includes(`${sep}test${sep}`) && !path.includes('.test.'),
  );

/**
 * Class names a stylesheet declares. Comments go first — `styles.css` names
 * retired selectors in its own prose — and rule bodies after, so a length like
 * `0.75rem` is never read as a class.
 */
const declaredClasses = (css: string): ReadonlySet<string> => {
  let selectors = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  let previous = '';
  while (previous !== selectors) {
    previous = selectors;
    selectors = selectors.replace(/\{[^{}]*\}/gu, '');
  }
  return new Set([...selectors.matchAll(/\.(-?[_a-zA-Z][\w-]*)/gu)].map(([, name]) => name ?? ''));
};

/** The BEM root: `rf-card-node` owns `rf-card-node__port` and `--active` alike. */
const blockOf = (className: string): string => className.split(/__|--/u)[0] ?? className;

/**
 * The class names a module could be writing.
 *
 * `whole` is what a plain string literal says outright. `partial` is what a
 * template literal says up to its first interpolation — `CardNode` builds
 * ``rf-card-node__authoring-handle--${role}``, so the class exists in the source
 * only as the stem before the substitution, and a whole-token comparison would
 * report the rule that styles it as dead.
 */
interface NamedClasses {
  readonly whole: ReadonlySet<string>;
  readonly partial: ReadonlySet<string>;
}

const lastFragment = (text: string): string => text.split(/\s+/u).at(-1) ?? '';

/**
 * A template stem only counts as the start of a class name if it reads like one.
 * The tree's stems include a lone `-` (from `translate(${x}, ${y})`) and several
 * ending in `:` or `=`, and a stem of `-` would call every class named.
 */
const CLASS_STEM = /^[a-zA-Z][\w-]*$/u;

const namedClasses = (sources: readonly ts.SourceFile[]): NamedClasses => {
  const whole = new Set<string>();
  const partial = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node))
      for (const token of node.text.split(/\s+/u)) if (token !== '') whole.add(token);
    if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
      for (const token of node.text.split(/\s+/u).slice(0, -1)) if (token !== '') whole.add(token);
      const stem = lastFragment(node.text);
      if (CLASS_STEM.test(stem)) partial.add(stem);
    }
    ts.forEachChild(node, visit);
  };
  for (const source of sources) visit(source);
  return { whole, partial };
};

const isNamed = (className: string, named: NamedClasses): boolean =>
  named.whole.has(className) ||
  [...named.partial].some((stem) => className.startsWith(stem) && className !== stem);

/**
 * React Flow emits its own `react-flow__*` classes, so no module here will ever
 * name one. A rule targeting them is integration styling by definition — which
 * is what the recorded `react-flow` block says — and asking production to
 * mention the class would only invite a reference written to satisfy the check.
 */
const FRAMEWORK_OWNED = 'react-flow__';

const SUPPORT_FURNITURE = /^inv(?:-|$)/u;

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
  const stableStoryFiles: string[] = [];
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
        stableStoryFiles.push(path);
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

  // Nothing here may go quiet by going missing: an empty directory scan and an
  // absent stylesheet both look exactly like a clean tree, so a renamed root or
  // a moved stylesheet would leave the guardrail passing with nothing checked.
  for (const root of PRODUCTION_UI_ROOTS) {
    if (!existsSync(join(repositoryRoot, root)))
      problems.push(`${root} is missing — the production component scan would cover nothing`);
  }

  const inventoryPath = join(repositoryRoot, INVENTORY_MODULE);
  const recorded = (declaration: string, subjectKey: string): ReadonlyMap<string, string> =>
    new Map(
      declaredInventory(inventoryPath, declaration, subjectKey, problems).map((entry) => [
        entry.subject,
        entry.reason,
      ]),
    );

  const rendered = modulesRenderedBy(stableStoryFiles, repositoryRoot);
  const recordedGaps = recorded('uncataloguedComponents', 'module');
  for (const path of productionComponents(repositoryRoot)) {
    const module = repositoryPath(repositoryRoot, path);
    if (rendered.has(path) && recordedGaps.has(module))
      problems.push(
        `${module} is rendered by a stable story — drop its uncataloguedComponents entry`,
      );
    if (!rendered.has(path) && !recordedGaps.has(module))
      problems.push(
        `${module} is rendered by no stable story — add one, or record why in ${INVENTORY_MODULE}`,
      );
  }
  for (const module of recordedGaps.keys()) {
    if (!existsSync(join(repositoryRoot, module)))
      problems.push(`uncatalogued component ${module} does not exist — drop its entry`);
  }

  const stylesheet = join(repositoryRoot, HAND_ROLLED_STYLESHEET);
  if (!existsSync(stylesheet))
    problems.push(
      `${HAND_ROLLED_STYLESHEET} is missing — the hand-rolled style scan would cover nothing`,
    );
  const applicationClasses = existsSync(stylesheet)
    ? declaredClasses(readFileSync(stylesheet, 'utf8'))
    : new Set<string>();
  const recordedBlocks = recorded('handRolledStyles', 'block');
  const production = namedClasses(
    PRODUCTION_UI_ROOTS.flatMap((root) => [
      ...filesBelow(join(repositoryRoot, root), '.ts'),
      ...filesBelow(join(repositoryRoot, root), '.tsx'),
    ]).map(sourceFile),
  );
  const declaredBlocks = new Set<string>();
  for (const className of [...applicationClasses].sort()) {
    declaredBlocks.add(blockOf(className));
    if (!recordedBlocks.has(blockOf(className)))
      problems.push(
        `${HAND_ROLLED_STYLESHEET} declares .${className}, whose block ${blockOf(className)} is not recorded — build it from @project/ui, or record why in ${INVENTORY_MODULE}`,
      );
    if (!className.startsWith(FRAMEWORK_OWNED) && !isNamed(className, production))
      problems.push(
        `${HAND_ROLLED_STYLESHEET} declares .${className}, which no production module names`,
      );
  }
  for (const block of recordedBlocks.keys()) {
    if (!declaredBlocks.has(block))
      problems.push(
        `hand-rolled style block ${block} is recorded but ${HAND_ROLLED_STYLESHEET} declares no rule for it`,
      );
  }

  const supportRoot = join(storiesRoot, 'support');
  for (const path of filesBelow(supportRoot, '.css')) {
    for (const className of declaredClasses(readFileSync(path, 'utf8'))) {
      if (!SUPPORT_FURNITURE.test(className))
        problems.push(
          `${repositoryPath(repositoryRoot, path)} declares .${className}, which is not catalogue furniture — a support stylesheet may only style inv- catalogue chrome (ADR 0052)`,
        );
    }
  }
  for (const path of filesBelow(supportRoot, '.tsx')) {
    const support = namedClasses([sourceFile(path)]);
    for (const className of applicationClasses) {
      if (support.whole.has(className))
        problems.push(
          `${repositoryPath(repositoryRoot, path)} names the production class ${className} — render the production component instead of reproducing it (ADR 0052)`,
        );
    }
  }

  if (problems.length > 0) throw new UiCatalogError(problems);
  return {
    exports: exports.sort(),
    stories: stories.sort(),
    claims,
    uncataloguedComponents: [...recordedGaps]
      .map(([module, reason]) => ({ module, reason }))
      .sort((left, right) => left.module.localeCompare(right.module)),
    handRolledStyles: [...recordedBlocks]
      .map(([block, reason]) => ({ block, reason }))
      .sort((left, right) => left.block.localeCompare(right.block)),
  };
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
    '',
    'Production modules no stable story renders',
    ...catalog.uncataloguedComponents.flatMap((item) => [`  ${item.module}`, `    ${item.reason}`]),
    '',
    'Hand-rolled application styles',
    ...catalog.handRolledStyles.flatMap((item) => [`  .${item.block}`, `    ${item.reason}`]),
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
