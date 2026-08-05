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

  const graphSourceFiles = (): readonly string[] => typeScriptSourceFiles(graphSourceDir);

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
        .map((name) => `${name} in packages/graph/src/${relative(graphSourceDir, file)}`),
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

/**
 * The guard above is only as wide as the walk under it: a point re-declared in a
 * file the walk skips is a point it never reads, silently. `packages/graph/src`
 * is flat and entirely `.ts` today, so nothing there can prove the walk reaches
 * further — which is the whole reason to prove it here instead, against a
 * directory shaped like the one a later change would make.
 */
describe('the walk that guard reads', () => {
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
