import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as graphPackage from '@project/graph';

/**
 * The names `@project/graph` offers. Everything else in the package is internal.
 *
 * The rule behind the list: the index names every function and value a consumer
 * calls, plus the types those signatures make a consumer write down — a
 * parameter, a return shape, or a member of one that is narrowed by name. A name
 * reachable only from inside a result union nobody narrows does not qualify, and
 * neither does a helper whose only caller is the module that declares it.
 *
 * Two whole modules are absent by that rule. `frontmatter` is how `card-file`
 * reads a fence, and `parseCardFile` is the intake it exists to serve.
 * `validate` runs inside `loadSpace`, which ADR 0010 makes the one intake — a
 * caller never checks references itself, so it never names the check, its input
 * or its errors.
 *
 * Adding a name here is the deliberate act this guard exists to require. It is
 * not a restatement of the index: these are the names, the index is where they
 * come from, and the assertions below hold the two together.
 */
const OFFERED_VALUES = [
  'Placement',
  'buildCardHandles',
  'buildLayoutGraph',
  'buildRouteEdges',
  'filterHandlesByRoutes',
  'getCard',
  'getLayout',
  'getRoute',
  'gridStrategy',
  'loadSpace',
  'loadSpaceSnapshot',
  'newSpace',
  'outgoingEdges',
  'parseCardFile',
  'parseImportCardFile',
  'positionedStrategy',
  'resolveContentCard',
  'routeCardIds',
  'routeStartCard',
  'serializeCardFile',
] as const;

const OFFERED_TYPES = [
  'CardFile',
  'CardFileError',
  'CardFileErrorKind',
  'CardHandleSet',
  'GraphEdge',
  'GridStrategyOptions',
  'LayoutCard',
  'LayoutEdge',
  'LayoutEdgeSection',
  'LayoutGraph',
  'LayoutPort',
  'LayoutStrategy',
  'LoadSpaceResult',
  'LoadSpaceSnapshotResult',
  'NewSpace',
  'ParseCardFileResult',
  'ParseImportCardFileResult',
  'ResolvedContentCard',
  'RouteHandleRef',
  'Space',
  'SpaceError',
] as const;

/** What the index declares, split the way the index declares it. */
interface IndexExports {
  /** Names re-exported so they carry their value, whatever else they carry. */
  readonly values: readonly string[];
  /** Names re-exported through `export type`, so they carry only a type. */
  readonly types: readonly string[];
  /** `export * from …` specifiers, which name nothing and offer everything. */
  readonly wholeModules: readonly string[];
  /**
   * Names offered by a statement that lists nothing: a declaration written in
   * the index itself, a namespace re-export, a default. Each is a way of
   * widening the surface without touching a clause, and the type-only form of
   * each carries no runtime key, so the `Object.keys` check below cannot see
   * them either. This bucket is the only thing that can.
   */
  readonly unlisted: readonly string[];
}

/**
 * Whether a statement the index declares is exported from it. `export default x`
 * is the one form carrying no export modifier — there the export is the
 * statement, not a word written on one.
 */
const isExported = (statement: ts.Statement): boolean =>
  ts.isExportAssignment(statement) ||
  (ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ));

/**
 * The names an exported statement offers. A declaration offers what it declares
 * — each binding of a variable statement, however it destructures — and the
 * only statements that export without declaring an identifier are defaults,
 * which offer `default`.
 */
const exportedNames = (statement: ts.Statement, source: ts.SourceFile): readonly string[] => {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((declaration) =>
      declaration.name.getText(source),
    );
  }
  if (
    ts.isClassDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isFunctionDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isModuleDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  ) {
    const { name } = statement;
    if (name !== undefined) return [name.getText(source)];
  }
  return ['default'];
};

/**
 * Read a source text's exports into the four buckets.
 *
 * Pure over text rather than over the one path below, so a regression can drive
 * it with a source shaped like the mistake it guards against.
 */
const readExports = (fileName: string, text: string): IndexExports => {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);

  const values: string[] = [];
  const types: string[] = [];
  const wholeModules: string[] = [];
  const unlisted: string[] = [];

  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement)) {
      // A declaration the index writes itself rather than re-exports. It
      // reaches a consumer without ever passing through a clause, so the loop
      // below would never meet the name.
      if (isExported(statement)) unlisted.push(...exportedNames(statement, source));
      continue;
    }
    const clause = statement.exportClause;
    if (clause === undefined) {
      // `export * from './m'`, whose specifier the grammar always supplies as a
      // string literal. Anything else arriving here offers a module under no
      // name we can read, which is what `unlisted` is for.
      if (
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        wholeModules.push(statement.moduleSpecifier.text);
      } else {
        unlisted.push(statement.getText(source));
      }
      continue;
    }
    if (!ts.isNamedExports(clause)) {
      // A namespace export — `export * as ns from './m'` and its `export type *`
      // form — binds a whole module to one name and lists none of what it holds.
      unlisted.push(clause.name.text);
      continue;
    }
    for (const element of clause.elements) {
      // `export type { A }` types the whole clause; `export { type A }` types
      // one element. Either way the name arrives without a value.
      const target = statement.isTypeOnly || element.isTypeOnly ? types : values;
      target.push(element.name.text);
    }
  }

  return { values, types, wholeModules, unlisted };
};

const readIndexExports = (): IndexExports => {
  const file = fileURLToPath(new URL('../../packages/graph/src/index.ts', import.meta.url));
  return readExports(file, readFileSync(file, 'utf8'));
};

/** The real index, parsed once — every assertion about it reads this. */
const indexExports = readIndexExports();

describe('the graph package offers a curated surface', () => {
  it('names what it exports rather than re-exporting whole modules', () => {
    expect(indexExports.wholeModules).toEqual([]);
  });

  it('offers nothing it has not listed', () => {
    // The list above is the deliberate act, so every name has to pass through a
    // clause to reach a consumer. A declaration written here, or a whole module
    // bound to one name, skips the list entirely — and does it invisibly when
    // it is type-only, since nothing of it survives to the runtime check.
    expect(indexExports.unlisted).toEqual([]);
  });

  it('offers exactly the names its consumers need to write down', () => {
    // Held apart rather than merged, because a name that moved between the
    // value clause and the type clause would still satisfy one sorted union of
    // the two — while changing what a consumer can do with it.
    expect([...indexExports.values].sort()).toEqual([...OFFERED_VALUES].sort());
    expect([...indexExports.types].sort()).toEqual([...OFFERED_TYPES].sort());
  });

  it('resolves every offered value at runtime', () => {
    // The parse reads declarations; this reads the module those declarations
    // produce. Together they catch a type re-exported as a value, a value lost
    // to `export type`, and a name that resolves to nothing at all.
    expect(Object.keys(graphPackage).sort()).toEqual([...OFFERED_VALUES].sort());
  });
});

/**
 * The guard is only as good as what its parse can see, and what it cannot see
 * it reports as an empty surface — a pass. Each case below is a way of widening
 * the package that reached the index without failing anything.
 */
describe('reading a surface sees every way a name is offered', () => {
  const read = (text: string): IndexExports => readExports('index.ts', text);

  it('sees a type the index declares itself', () => {
    expect(read('export type X = string;\n').unlisted).toEqual(['X']);
  });

  it('sees an interface the index declares itself', () => {
    expect(read('export interface X {\n  a: string;\n}\n').unlisted).toEqual(['X']);
  });

  it('sees a value the index declares itself', () => {
    expect(read('export const x = 1;\n').unlisted).toEqual(['x']);
  });

  it('sees a whole module bound to one type-only name', () => {
    expect(read("export type * as ns from './frontmatter';\n").unlisted).toEqual(['ns']);
  });

  it('sees a whole module bound to one name', () => {
    expect(read("export * as ns from './frontmatter';\n").unlisted).toEqual(['ns']);
  });

  it('sees a default export, which lists no name at all', () => {
    expect(read('const x = 1;\nexport default x;\n').unlisted).toEqual(['default']);
  });

  it('still reads a bare star as a whole module rather than an unlisted name', () => {
    const exports = read("export * from './frontmatter';\n");

    expect(exports.wholeModules).toEqual(['./frontmatter']);
    expect(exports.unlisted).toEqual([]);
  });

  it('splits a clause by what each name carries', () => {
    expect(read("export { a } from './m';\n").values).toEqual(['a']);
    expect(read("export type { A } from './m';\n").types).toEqual(['A']);

    // A mixed clause types one element and not the other, which is the branch
    // that reads `element.isTypeOnly` rather than the clause's own flag.
    const mixed = read("export { type A, b } from './m';\n");

    expect(mixed.types).toEqual(['A']);
    expect(mixed.values).toEqual(['b']);
  });

  it('offers nothing for a declaration that is not exported', () => {
    expect(read('type Y = string;\nconst y = 1;\n')).toEqual({
      values: [],
      types: [],
      wholeModules: [],
      unlisted: [],
    });
  });
});
