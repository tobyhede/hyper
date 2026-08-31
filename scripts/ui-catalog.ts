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

/**
 * The `export const <name> = [...] as const` an inventory module is required to
 * declare. The `export` matters: without it a same-named local declaration
 * higher in the file is what the checker reads, while the module's real export
 * says something else entirely.
 */
const literalArrayNamed = (
  source: ts.SourceFile,
  name: string,
): ts.ArrayLiteralExpression | null => {
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .filter((statement) =>
      ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    )
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => ts.isIdentifier(item.name) && item.name.text === name);
  const initializer = declaration?.initializer;
  const array =
    initializer !== undefined && ts.isAsExpression(initializer)
      ? initializer.expression
      : initializer;
  return array !== undefined && ts.isArrayLiteralExpression(array) ? array : null;
};

/** The module declaring the two gaps, and the stylesheet one of them is about. */
const INVENTORY_MODULE = 'packages/app/stories/design-system-inventory.ts';
const HAND_ROLLED_STYLESHEET = 'packages/app/src/styles.css';
/** The theme layer, whose classes are Tailwind's to emit rather than a module's to name. */
const THEME_STYLESHEET = 'packages/app/src/tailwind.css';

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
 *
 * The module is parsed once by the caller and read once per list: reading it
 * per declaration said "is missing" once for each list it was meant to declare.
 */
const declaredInventory = (
  source: ts.SourceFile,
  declaration: string,
  subjectKey: string,
  problems: string[],
): readonly InventoryEntry[] => {
  const array = literalArrayNamed(source, declaration);
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
 * What a package file has to hold for its subpath patterns to be readable: an
 * `imports` whose every entry names a string target. Stated to the leaf rather
 * than as an ownerless `object`, so `Object.entries` below yields
 * `[string, string]` and nothing in this file ever holds an `any`.
 */
interface SubpathImportsField {
  readonly imports: Record<string, string>;
}

const isSubpathTarget = (value: unknown): value is string => typeof value === 'string';

const hasSubpathImports = (value: unknown): value is SubpathImportsField =>
  typeof value === 'object' &&
  value !== null &&
  'imports' in value &&
  typeof value.imports === 'object' &&
  value.imports !== null &&
  Object.values(value.imports).every(isSubpathTarget);

/**
 * The package a file belongs to, which is the package whose `imports` map its
 * `#` specifiers resolve through. `packages/ui` declares its own `#components/*`
 * and `sidebar.tsx` uses it, so resolving every `#` specifier under
 * `packages/app` loses those and the modules they reach look uncatalogued.
 */
const owningPackage = (file: string, repositoryRoot: string): string | null => {
  const [packages, name] = repositoryPath(repositoryRoot, file).split('/');
  return packages === 'packages' && name !== undefined
    ? join(repositoryRoot, 'packages', name)
    : null;
};

/** One read per package, since the walk revisits the same packages constantly. */
const subpathImports = (() => {
  const byPackage = new Map<string, ReadonlyMap<string, string>>();
  return (packageDirectory: string): ReadonlyMap<string, string> => {
    const cached = byPackage.get(packageDirectory);
    if (cached !== undefined) return cached;
    const packageFile = join(packageDirectory, 'package.json');
    const parsed: unknown = existsSync(packageFile)
      ? JSON.parse(readFileSync(packageFile, 'utf8'))
      : null;
    const patterns = hasSubpathImports(parsed)
      ? new Map(Object.entries(parsed.imports))
      : new Map<string, string>();
    byPackage.set(packageDirectory, patterns);
    return patterns;
  };
})();

const asFile = (path: string): string | null =>
  existsSync(path) && statSync(path).isFile() ? path : null;

const resolvedExtension = (base: string): string | null =>
  asFile(base) ??
  asFile(`${base}.tsx`) ??
  asFile(`${base}.ts`) ??
  asFile(join(base, 'index.tsx')) ??
  asFile(join(base, 'index.ts'));

const PROJECT_SCOPE = '@project/';

const resolveModule = (specifier: string, from: string, repositoryRoot: string): string | null => {
  if (specifier.startsWith('.')) return resolvedExtension(resolve(dirname(from), specifier));
  if (specifier.startsWith('#')) {
    const packageDirectory = owningPackage(from, repositoryRoot);
    if (packageDirectory === null) return null;
    for (const [pattern, target] of subpathImports(packageDirectory)) {
      // An entry without a `*` is an exact alias — `"#env": "./src/env.ts"` —
      // and matches only itself. A miss falls through to the entries after it:
      // ending the search there let an exact alias listed first hide the
      // wildcard pattern that does match.
      const [prefix, suffix] = pattern.split('*');
      if (suffix === undefined) {
        if (specifier !== pattern) continue;
        return resolvedExtension(join(packageDirectory, target));
      }
      if (prefix === undefined || !specifier.startsWith(prefix)) continue;
      const [targetPrefix, targetSuffix] = target.split('*');
      if (targetPrefix === undefined || targetSuffix === undefined) continue;
      const name = specifier.slice(prefix.length, specifier.length - suffix.length);
      return asFile(join(packageDirectory, targetPrefix + name + targetSuffix));
    }
    return null;
  }
  if (!specifier.startsWith(PROJECT_SCOPE)) return null;
  const [packageName, ...publicPath] = specifier.slice(PROJECT_SCOPE.length).split('/');
  if (packageName === undefined) return null;
  return resolvedExtension(
    join(
      repositoryRoot,
      'packages',
      packageName,
      'src',
      ...(publicPath.length === 0 ? ['index'] : publicPath),
    ),
  );
};

interface ModuleReference {
  readonly specifier: string;
  /**
   * The names taken through this reference. `null` means "not a named list" —
   * a bare side-effect import, or a whole-namespace import whose used names
   * cannot be read off the syntax.
   */
  readonly names: readonly string[] | null;
  /** Whether `null` names came from `import * as x` rather than a bare import. */
  readonly namespace: boolean;
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
      // An import specifier's `propertyName` is the *exported* name and its
      // `name` the local one; an export specifier is the other way round, and
      // `name` is what a consumer writes. `packages/ui/src/index.ts` carries both
      // `CardContent` and `CardContent as CardSection` from different modules,
      // so reading the wrong side made importing one of them reach both.
      const named =
        bindings === undefined
          ? null
          : ts.isNamedImports(bindings)
            ? bindings.elements
                .filter((element) => !element.isTypeOnly)
                .map((element) => (element.propertyName ?? element.name).text)
            : ts.isNamedExports(bindings)
              ? bindings.elements
                  .filter((element) => !element.isTypeOnly)
                  .map((element) => element.name.text)
              : null;
      // Every named binding type-only is the same erasure as `import type`,
      // spelled per specifier — unless a value default import sits beside them.
      const hasDefault =
        ts.isImportDeclaration(node) && node.importClause?.name !== undefined && !typeOnly;
      const erased = typeOnly || (named !== null && named.length === 0 && !hasDefault);
      if (!erased)
        references.push({
          specifier: node.moduleSpecifier.text,
          names: named,
          namespace: bindings !== undefined && named === null,
        });
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      references.push({ specifier: node.arguments[0].text, names: null, namespace: false });
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
 *
 * A whole-namespace import names nothing the syntax can read, so it reaches
 * nothing through the barrel. That is deliberately the conservative direction:
 * a module only reachable that way is reported as uncatalogued rather than
 * quietly catalogued, which is the guarantee this function exists to keep.
 */
const barrelOwners = (
  reference: ModuleReference,
  index: string,
  repositoryRoot: string,
): readonly string[] => {
  if (reference.namespace) return [];
  const wanted = reference.names === null ? null : new Set(reference.names);
  return moduleReferences(sourceFile(index))
    .filter((entry) => wanted === null || entry.names?.some((name) => wanted.has(name)))
    .map((entry) => resolveModule(entry.specifier, index, repositoryRoot))
    .filter((path): path is string => path !== null);
};

const isPackageIndex = (path: string, repositoryRoot: string): boolean =>
  /^packages\/[^/]+\/src\/index\.tsx?$/u.test(repositoryPath(repositoryRoot, path));

/** Only a TypeScript module can carry further references; a stylesheet cannot. */
const isTypeScript = (path: string): boolean => path.endsWith('.ts') || path.endsWith('.tsx');

const modulesRenderedBy = (
  entryPoints: readonly string[],
  repositoryRoot: string,
): ReadonlySet<string> => {
  const rendered = new Set<string>();
  const walk = (path: string): void => {
    if (rendered.has(path)) return;
    rendered.add(path);
    if (!isTypeScript(path)) return;
    for (const reference of moduleReferences(sourceFile(path))) {
      const target = resolveModule(reference.specifier, path, repositoryRoot);
      if (target === null) continue;
      if (isPackageIndex(target, repositoryRoot)) {
        rendered.add(target);
        for (const owner of barrelOwners(reference, target, repositoryRoot)) walk(owner);
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
 * The selector text of every rule in a stylesheet: whatever precedes each `{`,
 * once comments are gone — `styles.css` names retired selectors in its own
 * prose. Taking the text *before* a brace rather than deleting brace-delimited
 * bodies is what makes a rule nested in `@media` or `@container` visible: the
 * old fixpoint strip removed the inner body first and then swallowed the
 * at-rule's own braces along with the selector inside them. It also means an
 * `@import url('./reset.css');` prelude, which has no brace, contributes
 * nothing — it used to mint a phantom `.css` class.
 */
const ruleSelectors = (css: string): readonly string[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/([^{}]*)\{/gu)]
    .map(([, selector]) => (selector ?? '').trim())
    .filter((selector) => selector !== '' && !selector.startsWith('@'));

const classesIn = (selector: string): readonly string[] =>
  [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/gu)].map(([, name]) => name ?? '');

/** Class names a stylesheet declares. */
const declaredClasses = (css: string): ReadonlySet<string> =>
  new Set(ruleSelectors(css).flatMap(classesIn));

/**
 * A rule that names no class at all still styles something, and the inventory
 * could not see it: `styles.css` carries `[data-card-search-combobox] { … }`
 * rule sets that no block covered. Such a rule is keyed by its leading
 * attribute or id instead, so one entry covers the family.
 */
const NON_CLASS_SUBJECT = /(?:\[([\w-]+)|#(-?[_a-zA-Z][\w-]*))/u;

/**
 * And a selector naming only elements — `*`, `html, body`, `main > div` — is
 * keyed by its leading element name, or it would owe no reason at all: an
 * attribute-or-id-only key let the reset rules at the top of `styles.css`
 * through, which is the one way a rule could be added to that file for free.
 * The attribute or id wins where a selector has both, so `html, body, #root`
 * stays recorded as `root`. A pseudo-class-only rule (`:root { … }`) still
 * yields no subject; nothing in the tree writes one.
 */
const LEADING_ELEMENT = /^(\*|[a-zA-Z][\w-]*)/u;

const nonClassSubject = (selector: string): string => {
  const attributeOrId = NON_CLASS_SUBJECT.exec(selector);
  return attributeOrId !== null
    ? (attributeOrId[1] ?? attributeOrId[2] ?? '')
    : (LEADING_ELEMENT.exec(selector)?.[1] ?? '');
};

const declaredNonClassSubjects = (css: string): ReadonlySet<string> =>
  new Set(
    ruleSelectors(css)
      .filter((selector) => classesIn(selector).length === 0)
      .map(nonClassSubject)
      .filter((subject) => subject !== ''),
  );

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
 * A class built from two interpolations leaves a lone `-` as its middle
 * fragment, and a stem of `-` would call every class named.
 */
const CLASS_STEM = /^[a-zA-Z][\w-]*$/u;

/**
 * Where a class name is actually written: a `className`/`class` JSX attribute,
 * a `className` property (React Flow node objects carry one), or a `cn`/`clsx`
 * call. Reading *every* string literal instead made domain values look like
 * class names — `.card` was held live by `{ kind: 'card' }` in `render-adapter`
 * and `type: 'card'` in `projection`, none of which is a class, so deleting the
 * real `className="card"` would have left the rule reported as named.
 */
const CLASS_BUILDERS = new Set(['cn', 'clsx', 'classNames', 'twMerge']);

/**
 * A component that draws several elements publishes several class props, and
 * each of them names classes exactly as `className` does — React Flow's
 * `NodeResizer` takes `lineClassName` and `handleClassName`, which is the only
 * way to style what it renders. Read on the suffix rather than by listing the
 * names, because the list is a third-party API's to grow and a missing entry
 * fails as a false "no production module names this", which reads as a dead
 * rule to delete.
 */
const namesClassProp = (name: string): boolean =>
  name === 'className' || name === 'class' || name.endsWith('ClassName');

const namesClasses = (node: ts.Node): boolean => {
  if (ts.isJsxAttribute(node)) return namesClassProp(node.name.getText());
  if (ts.isPropertyAssignment(node))
    return (
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      namesClassProp(node.name.text)
    );
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    CLASS_BUILDERS.has(node.expression.text)
  );
};

const namedClasses = (sources: readonly ts.SourceFile[]): NamedClasses => {
  const whole = new Set<string>();
  const partial = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node))
      for (const token of node.text.split(/\s+/u)) if (token !== '') whole.add(token);
    if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
      for (const token of node.text.split(/\s+/u).slice(0, -1)) if (token !== '') whole.add(token);
      const stem = lastFragment(node.text);
      if (CLASS_STEM.test(stem)) partial.add(stem);
    }
    ts.forEachChild(node, collect);
  };
  const visit = (node: ts.Node): void => {
    if (namesClasses(node)) collect(node);
    else ts.forEachChild(node, visit);
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
  const categories = new Map([
    ['components', { prefixes: ['Components/'], stable: true }],
    ['surfaces', { prefixes: ['Surfaces/'], stable: true }],
    ['space', { prefixes: ['Space/'], stable: true }],
    // Review remains an evidence boundary, not a navigation bucket. A staged
    // production surface may sit beside the stable stories it will eventually
    // join without becoming parity evidence before the application reaches it.
    ['review', { prefixes: ['Review/', 'Space/'], stable: false }],
  ]);
  const stories: string[] = [];
  const stableExports = new Set<string>();
  const stableStoryFiles: string[] = [];
  for (const path of filesBelow(storiesRoot, '.stories.tsx')) {
    const storyPath = relative(storiesRoot, path).split(sep).join('/');
    const category = storyPath.split('/')[0] ?? '';
    const taxonomy = categories.get(category);
    const storySource = sourceFile(path);
    const title = literalStoryTitle(storySource);
    if (taxonomy === undefined) problems.push(`${storyPath} is outside the catalogue taxonomy`);
    else if (title === null) problems.push(`${storyPath} must declare a literal default title`);
    else if (!taxonomy.prefixes.some((prefix) => title.startsWith(prefix)))
      problems.push(`${storyPath} title must start with ${taxonomy.prefixes.join(' or ')}`);
    else {
      stories.push(title);
      if (taxonomy.stable) {
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
  const supportRoot = join(storiesRoot, 'support');
  for (const root of [
    ...PRODUCTION_UI_ROOTS,
    'packages/app/stories',
    'packages/app/stories/support',
  ])
    if (!existsSync(join(repositoryRoot, root)))
      problems.push(`${root} is missing — its half of the catalogue check would cover nothing`);

  const inventoryPath = join(repositoryRoot, INVENTORY_MODULE);
  const inventorySource = existsSync(inventoryPath) ? sourceFile(inventoryPath) : null;
  if (inventorySource === null) problems.push(`${INVENTORY_MODULE} is missing`);
  const recorded = (declaration: string, subjectKey: string): ReadonlyMap<string, string> => {
    const entries =
      inventorySource === null
        ? []
        : declaredInventory(inventorySource, declaration, subjectKey, problems);
    const bySubject = new Map<string, string>();
    for (const entry of entries) {
      if (bySubject.has(entry.subject))
        problems.push(`${entry.subject} is recorded twice in ${declaration} — keep one reason`);
      bySubject.set(entry.subject, entry.reason);
    }
    return bySubject;
  };

  const rendered = modulesRenderedBy(stableStoryFiles, repositoryRoot);
  const recordedGaps = recorded('uncataloguedComponents', 'module');
  // One scan, read by both halves: what the coverage check holds to a story, and
  // what a recorded entry has to be one of.
  const components = productionComponents(repositoryRoot);
  for (const path of components) {
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
  const scanned = new Set(components.map((path) => repositoryPath(repositoryRoot, path)));
  for (const module of recordedGaps.keys()) {
    if (!existsSync(join(repositoryRoot, module)))
      problems.push(`uncatalogued component ${module} does not exist — drop its entry`);
    else if (!scanned.has(module))
      problems.push(
        `${module} is not a production component this check scans — its entry can never come true or false, so drop it`,
      );
  }

  const stylesheet = join(repositoryRoot, HAND_ROLLED_STYLESHEET);
  if (!existsSync(stylesheet))
    problems.push(
      `${HAND_ROLLED_STYLESHEET} is missing — the hand-rolled style scan would cover nothing`,
    );
  const stylesheetSource = existsSync(stylesheet) ? readFileSync(stylesheet, 'utf8') : '';
  const applicationClasses = declaredClasses(stylesheetSource);
  const recordedBlocks = recorded('handRolledStyles', 'block');
  const production = namedClasses(
    PRODUCTION_UI_ROOTS.flatMap((root) => [
      ...filesBelow(join(repositoryRoot, root), '.ts'),
      ...filesBelow(join(repositoryRoot, root), '.tsx'),
    ])
      .filter((path) => !path.includes(`${sep}test${sep}`) && !path.includes('.test.'))
      .map(sourceFile),
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
  // A rule naming no class is styling something too, and needs its own reason.
  // The dead-rule half does not apply: an attribute, an id or an element name is
  // not a class name, so no module will ever "name" one the way `className`
  // names a class.
  for (const subject of [...declaredNonClassSubjects(stylesheetSource)].sort()) {
    declaredBlocks.add(subject);
    if (!recordedBlocks.has(subject))
      problems.push(
        `${HAND_ROLLED_STYLESHEET} declares a rule for ${subject}, which is not recorded — build it from @project/ui, or record why in ${INVENTORY_MODULE}`,
      );
  }
  for (const block of recordedBlocks.keys()) {
    if (!declaredBlocks.has(block))
      problems.push(
        `hand-rolled style block ${block} is recorded but ${HAND_ROLLED_STYLESHEET} declares no rule for it`,
      );
  }

  /**
   * The dead-rule half of the ratchet, over the stylesheets that live beside their
   * component rather than in `styles.css` — `canvas-card.css` beside `CanvasCard`,
   * `card-search-combobox.css` beside `CardSearchCombobox`,
   * `markdown-source-editor.css` beside `MarkdownSourceEditor`.
   *
   * Only that half. Colocation is the *approved* home for product appearance, so these
   * owe no inventory entry — recording them would turn the inventory into a list of
   * things that are fine. But a rule no production module names is dead wherever it
   * lives, and without this, moving a block out of `styles.css` and beside its component
   * is a way to stop the ratchet reading it at all.
   *
   * `tailwind.css` is excluded with `styles.css`: it is the theme layer, and the classes
   * in it are Tailwind's to emit rather than any module's to name.
   */
  for (const root of PRODUCTION_UI_ROOTS) {
    for (const path of filesBelow(join(repositoryRoot, root), '.css')) {
      const sheet = repositoryPath(repositoryRoot, path);
      if (sheet === HAND_ROLLED_STYLESHEET || sheet === THEME_STYLESHEET) continue;
      for (const className of [...declaredClasses(readFileSync(path, 'utf8'))].sort()) {
        if (!className.startsWith(FRAMEWORK_OWNED) && !isNamed(className, production))
          problems.push(`${sheet} declares .${className}, which no production module names`);
      }
    }
  }

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
      if (isNamed(className, support))
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
