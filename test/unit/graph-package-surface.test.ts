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
}

const readIndexExports = (): IndexExports => {
  const file = fileURLToPath(new URL('../../packages/graph/src/index.ts', import.meta.url));
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  const values: string[] = [];
  const types: string[] = [];
  const wholeModules: string[] = [];

  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const specifier =
      statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : '';
    const clause = statement.exportClause;
    if (clause === undefined) {
      wholeModules.push(specifier);
      continue;
    }
    if (!ts.isNamedExports(clause)) continue;
    for (const element of clause.elements) {
      // `export type { A }` types the whole clause; `export { type A }` types
      // one element. Either way the name arrives without a value.
      const target = statement.isTypeOnly || element.isTypeOnly ? types : values;
      target.push(element.name.text);
    }
  }

  return { values, types, wholeModules };
};

describe('the graph package offers a curated surface', () => {
  it('names what it exports rather than re-exporting whole modules', () => {
    expect(readIndexExports().wholeModules).toEqual([]);
  });

  it('offers exactly the names its consumers need to write down', () => {
    const { values, types } = readIndexExports();

    expect([...values, ...types].sort()).toEqual([...OFFERED_VALUES, ...OFFERED_TYPES].sort());
  });

  it('resolves every offered value at runtime', () => {
    // The parse reads declarations; this reads the module those declarations
    // produce. Together they catch a type re-exported as a value, a value lost
    // to `export type`, and a name that resolves to nothing at all.
    expect(Object.keys(graphPackage).sort()).toEqual([...OFFERED_VALUES].sort());
  });
});
