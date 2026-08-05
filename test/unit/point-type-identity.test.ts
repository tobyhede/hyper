import { readFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * ADR 0038: `core`'s schema-derived `LayoutPosition` is the one representation of
 * a point, and `graph` carries it instead of declaring its own.
 *
 * This reads the declarations because **no type-level assertion can check it**.
 * TypeScript is structural, so a re-declared `interface LayoutPoint { x: number;
 * y: number }` *is* `LayoutPosition` as far as the type system is concerned —
 * measured, not assumed: restoring the duplicate and typing `Placement` over it
 * leaves `expectTypeOf<Placement>().toExtend<ReadonlyMap<CardId,
 * Readonly<LayoutPosition>>>()` in `packages/graph/test/identity-types.test.ts`
 * green, along with both typechecks and lint. That assertion pins the shape, and
 * the shape is exactly what the two types agree on. Only the declarations differ,
 * so the declarations are what has to be read.
 *
 * The check is structural rather than a search for the name `LayoutPoint`: it
 * finds a point re-declared under any name, and it stays silent about the many
 * legitimate uses of `x` and `y` next door (`LayoutCard`, `LayoutPort`), whose
 * members are optional and not alone.
 */
describe('a point has one type', () => {
  const graphSourceDir = fileURLToPath(new URL('../../packages/graph/src/', import.meta.url));

  const graphSourceFiles = (): readonly string[] =>
    readdirSync(graphSourceDir)
      .filter((entry) => entry.endsWith('.ts'))
      .map((entry) => `${graphSourceDir}${entry}`);

  const parse = (file: string): ts.SourceFile =>
    ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

  /** Exactly two required members, `x` and `y`, both `number` — that is a point. */
  const isPointShape = (members: ts.NodeArray<ts.TypeElement>): boolean => {
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
      return isPointShape(statement.members) ? statement.name.text : null;
    }
    if (ts.isTypeAliasDeclaration(statement) && ts.isTypeLiteralNode(statement.type)) {
      return isPointShape(statement.type.members) ? statement.name.text : null;
    }
    return null;
  };

  it('declares no point type of its own in the graph package', () => {
    const declared = graphSourceFiles().flatMap((file) =>
      parse(file)
        .statements.map(declaredPoint)
        .filter((name) => name !== null)
        .map((name) => `${name} in packages/graph/src/${basename(file)}`),
    );

    expect(declared).toEqual([]);
  });

  it('takes its point type from core', () => {
    const importers = graphSourceFiles().filter((file) =>
      parse(file).statements.some(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text === '@project/core' &&
          statement.importClause?.namedBindings !== undefined &&
          ts.isNamedImports(statement.importClause.namedBindings) &&
          statement.importClause.namedBindings.elements.some(
            (element) => element.name.text === 'LayoutPosition',
          ),
      ),
    );

    expect(importers.length).toBeGreaterThan(0);
  });
});
