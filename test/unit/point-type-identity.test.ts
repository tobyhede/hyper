import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

/** Every TypeScript source under `directory`, at any depth, as absolute paths. */
const typeScriptSourceFiles = (directory: string): readonly string[] =>
  readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'))
    .map((entry) => join(directory, entry));

/**
 * ADR 0038 made `core`'s schema-derived `DiagramPosition` the one representation
 * of an **authored** point, and ADR 0085 split the computed one back out: the
 * geometry a LayoutStrategy returns is `graph`'s own bare `Point`, because no
 * author wrote one and no schema parses one. Those were never one point — a
 * constraint added to `diagramPositionSchema` for the sake of authored placement
 * would otherwise bind engine output it has nothing to say about.
 *
 * So what is read here is not "no point type in `graph`" but the narrower thing
 * ADR 0038 was protecting: `graph` must not re-declare the **authored**
 * position. It carries `core`'s, and the one point it declares itself is the
 * strategy's, in the module that declares the strategy contract.
 *
 * This reads the declarations because **no type-level assertion can check it**.
 * TypeScript is structural, so a re-declared `interface DiagramPoint { x: number;
 * y: number }` *is* `DiagramPosition` as far as the type system is concerned —
 * measured, not assumed: restoring the duplicate and typing `Placement` over it
 * leaves `expectTypeOf<Placement>().toExtend<ReadonlyMap<CardId,
 * Readonly<DiagramPosition>>>()` in `packages/graph/test/identity-types.test.ts`
 * green, along with both typechecks and lint. That assertion pins the shape, and
 * the shape is exactly what the two types agree on. Only the declarations differ,
 * so the declarations are what has to be read.
 *
 * The check is structural rather than a search for a name: it finds a point
 * re-declared under any name, and it stays silent about the many legitimate uses
 * of `x` and `y` next door (`LayoutStrategyCard`, `LayoutStrategyPort`), whose
 * members are optional and not alone. The one declaration the split allows is
 * named and located, so a second one — or the same one moving to a module that
 * is not the strategy contract — is still reported.
 */
describe('a point has one type', () => {
  const graphSourceDir = fileURLToPath(new URL('../../packages/graph/src/', import.meta.url));

  const graphSourceFiles = (): readonly string[] => typeScriptSourceFiles(graphSourceDir);

  const parse = (file: string): ts.SourceFile =>
    ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

  /** Exactly two required members, `x` and `y`, both `number` — that is a point. */
  const isPointStructure = (members: ts.NodeArray<ts.TypeElement>): boolean => {
    const numeric = members.filter(
      (member) =>
        ts.isPropertySignature(member) &&
        member.questionToken === undefined &&
        member.type?.kind === ts.SyntaxKind.NumberKeyword &&
        ts.isIdentifier(member.name) &&
        (member.name.text === 'x' || member.name.text === 'y'),
    );
    return members.length === 2 && numeric.length === 2;
  };

  /** The name of a point declared by this statement, if it declares one. */
  const declaredPoint = (statement: ts.Statement): string | null => {
    if (ts.isInterfaceDeclaration(statement)) {
      return isPointStructure(statement.members) ? statement.name.text : null;
    }
    if (ts.isTypeAliasDeclaration(statement) && ts.isTypeLiteralNode(statement.type)) {
      return isPointStructure(statement.type.members) ? statement.name.text : null;
    }
    return null;
  };

  /**
   * The one point `graph` declares: the geometry a strategy computes, in the
   * module that declares the strategy contract. Written as a location rather
   * than a name so that moving it elsewhere is reported too — the argument for
   * it is that it lives beside `LayoutStrategyEdgeSection`, not that it is
   * spelled `Point`.
   */
  const STRATEGY_POINT = 'Point in packages/graph/src/layout.ts';

  it('declares no point type beyond the strategy geometry ADR 0085 split out', () => {
    const declared = graphSourceFiles().flatMap((file) =>
      parse(file)
        .statements.map(declaredPoint)
        .filter((name) => name !== null)
        .map((name) => `${name} in packages/graph/src/${relative(graphSourceDir, file)}`),
    );

    expect(declared).toEqual([STRATEGY_POINT]);
  });

  /**
   * The declaration inventory above is not the invariant. An exported type is
   * exempt from `noUnusedLocals`, so `Point` can sit declared, exported and
   * unused while the routed geometry goes straight back onto `DiagramPosition`
   * — the split reverted, with every guard here and both typechecks green.
   * Measured, not assumed. So what ADR 0085 actually decided is read where it
   * landed: on the members of the section type.
   */
  it('types the routed geometry on that point rather than the authored position', () => {
    const contract = graphSourceFiles().find((file) => file.endsWith('layout.ts'));
    expect(contract, 'the strategy contract module').toBeDefined();

    const section = parse(contract ?? '').statements.find(
      (statement): statement is ts.InterfaceDeclaration =>
        ts.isInterfaceDeclaration(statement) && statement.name.text === 'LayoutStrategyEdgeSection',
    );
    expect(section, 'LayoutStrategyEdgeSection').toBeDefined();

    // `Point` for the two ends, `Point[]` for the bends — the element type is
    // what matters, so an array unwraps to the name it is an array of.
    const named = (section?.members ?? []).map((member) => {
      if (!ts.isPropertySignature(member) || member.type === undefined) return null;
      const type = ts.isArrayTypeNode(member.type) ? member.type.elementType : member.type;
      return ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)
        ? type.typeName.text
        : null;
    });

    expect(named).toEqual(['Point', 'Point', 'Point']);
  });

  it('takes the authored position from core rather than re-declaring it', () => {
    const importers = graphSourceFiles().filter((file) =>
      parse(file).statements.some(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text === '@project/core' &&
          statement.importClause?.namedBindings !== undefined &&
          ts.isNamedImports(statement.importClause.namedBindings) &&
          statement.importClause.namedBindings.elements.some(
            (element) => element.name.text === 'DiagramPosition',
          ),
      ),
    );

    expect(importers.length).toBeGreaterThan(0);
  });
});

/**
 * The guard above is only as wide as the traversal under it: a point re-declared in a
 * file the traversal skips is a point it never reads, silently. `packages/graph/src`
 * is flat and entirely `.ts` today, so nothing there can prove the traversal reaches
 * further — which is the whole reason to prove it here instead, against a
 * directory shaped like the one a later change would make.
 */
describe('the traversal that guard reads', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
    );
  });

  it('finds TypeScript at any depth, and nothing that is not TypeScript', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hyper-point-type-identity-'));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, 'nested'));
    await writeFile(join(directory, 'top.ts'), '');
    await writeFile(join(directory, 'nested', 'deep.ts'), '');
    await writeFile(join(directory, 'nested', 'view.tsx'), '');
    await writeFile(join(directory, 'nested', 'notes.md'), '');

    expect([...typeScriptSourceFiles(directory)].sort()).toEqual(
      [
        join(directory, 'nested', 'deep.ts'),
        join(directory, 'nested', 'view.tsx'),
        join(directory, 'top.ts'),
      ].sort(),
    );
  });
});
