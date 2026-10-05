import { describe, expect, it } from 'vitest';
import { lintFixture } from './rule-fixture';

const RULE = 'no-shape-in-symbol-names';

/** The domain compound `.oxlintrc.json` allows, as it configures the rule. */
const HEAD_SHAPE = ['error', { allowedCompounds: ['head shape'] }] as const;

/** The Resource Shape terms `.oxlintrc.json` allows beside it (ADR 0120). */
const RESOURCE_SHAPE = [
  'error',
  { allowedCompounds: ['head shape', 'resource shape'], allowedNames: ['shape'] },
] as const;

describe('no-shape-in-symbol-names', () => {
  it('flags "shape" in a symbol name when nothing is allowed', () => {
    const diagnostics = lintFixture('const headShape = 1;\nexport { headShape };', {
      [RULE]: 'error',
    });
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(new Set(diagnostics.map((diagnostic) => diagnostic.rule))).toEqual(new Set([RULE]));
  });

  // ADR 0105 names what a Graph's Edges draw at their heads its head shape,
  // and stores it as `headShape`: there the word is the drawn geometry, not
  // a structure standing in for an owner.
  it('allows a configured domain compound in every casing a symbol writes it in', () => {
    const diagnostics = lintFixture(
      [
        'type GraphHeadShape = "arrow";',
        'const GRAPH_HEAD_SHAPES: readonly GraphHeadShape[] = ["arrow"];',
        'const graph = { headShape: GRAPH_HEAD_SHAPES[0] };',
        'export { graph };',
      ].join('\n'),
      { [RULE]: HEAD_SHAPE },
    );
    expect(diagnostics).toEqual([]);
  });

  it('still flags "shape" standing alone or in another compound', () => {
    const diagnostics = lintFixture(
      [
        'const shape = 1;',
        'const payloadShape = 2;',
        'const headshape = 3;',
        'export { shape, payloadShape, headshape };',
      ].join('\n'),
      { [RULE]: HEAD_SHAPE },
    );
    const named = diagnostics.map((diagnostic) => /"([^"]+)"/.exec(diagnostic.message)?.[1]);
    expect(new Set(named)).toEqual(new Set(['shape', 'payloadShape', 'headshape']));
  });

  // The compound is matched word by word, so a word that merely ends in
  // "head" does not carry the "shape" after it.
  it('flags "shape" after a word that only ends in "head"', () => {
    const diagnostics = lintFixture(
      [
        'const overheadShape = 1;',
        'const BULKHEAD_SHAPES = 2;',
        'export { overheadShape, BULKHEAD_SHAPES };',
      ].join('\n'),
      { [RULE]: HEAD_SHAPE },
    );
    const named = diagnostics.map((diagnostic) => /"([^"]+)"/.exec(diagnostic.message)?.[1]);
    expect(new Set(named)).toEqual(new Set(['overheadShape', 'BULKHEAD_SHAPES']));
  });

  it('flags a name that holds the compound and "shape" again beside it', () => {
    const diagnostics = lintFixture('const headShapeShape = 1;\nexport { headShapeShape };', {
      [RULE]: HEAD_SHAPE,
    });
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((diagnostic) => diagnostic.message.includes('"headShapeShape"'))).toBe(
      true,
    );
  });

  // ADR 0120 stores a Map entry's Shape as `shape`: the domain term is the
  // one word, so it is allowed as that field's name — wherever a property is
  // named — and nowhere else.
  it('allows a configured whole name where it names a property', () => {
    const diagnostics = lintFixture(
      [
        'type ResourceShape = "rectangle";',
        'interface Entry { readonly shape: ResourceShape }',
        'const RESOURCE_SHAPES: readonly ResourceShape[] = ["rectangle"];',
        'const entry: Entry = { shape: RESOURCE_SHAPES[0] };',
        'const { shape: resourceShape } = entry;',
        'const drawn = entry.shape;',
        'const props = <div shape={drawn} />;',
        'export { entry, resourceShape, drawn, props };',
      ].join('\n'),
      { [RULE]: RESOURCE_SHAPE },
      'tsx',
    );
    expect(diagnostics).toEqual([]);
  });

  it.each([
    [
      'a destructured local',
      'const entry = { shape: 1 };\nconst { shape } = entry;\nexport { shape };',
    ],
    ['a declared local', 'const shape = 1;\nexport { shape };'],
    ['a parameter', 'export const read = (shape: number) => shape + 1;'],
  ])('flags a configured whole name bound as %s', (_, source) => {
    const diagnostics = lintFixture(source, { [RULE]: RESOURCE_SHAPE });
    const named = diagnostics.map((diagnostic) => /"([^"]+)"/.exec(diagnostic.message)?.[1]);
    expect(named).toContain('shape');
  });

  it('still flags the word in any other name beside an allowed field', () => {
    const diagnostics = lintFixture(
      [
        'const entry = { shape: "rectangle" };',
        'const shapes = [entry.shape];',
        'const shapeOf = () => entry.shape;',
        'const entryShape = entry.shape;',
        'export { shapes, shapeOf, entryShape };',
      ].join('\n'),
      { [RULE]: RESOURCE_SHAPE },
    );
    const named = diagnostics.map((diagnostic) => /"([^"]+)"/.exec(diagnostic.message)?.[1]);
    expect(new Set(named)).toEqual(new Set(['shapes', 'shapeOf', 'entryShape']));
  });
});
