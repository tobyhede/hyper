import { describe, expect, it } from 'vitest';
import { lintFixture } from './rule-fixture';

const RULE = 'no-unsafe-dictionary-type';

function lint(source: string) {
  return lintFixture(source, { [RULE]: 'error' });
}

describe('no-unsafe-dictionary-type', () => {
  it('reports a dictionary whose value type is unknown', () => {
    const diagnostics = lint('declare const value: Record<string, unknown>;\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe(RULE);
  });

  it('accepts a dictionary with a concrete value type', () => {
    const diagnostics = lint('declare const value: Record<string, string>;\n');
    expect(diagnostics).toEqual([]);
  });

  it('reports only the outermost unsafe dictionary in a nested pair, not both', () => {
    const diagnostics = lint('declare const value: Record<string, Record<string, unknown>>;\n');
    expect(diagnostics).toHaveLength(1);
  });

  it('reports a bare index signature whose value type is unsafe', () => {
    const diagnostics = lint('interface Bag { [key: string]: unknown }\n');
    expect(diagnostics).toHaveLength(1);
  });

  it('reports each independent unsafe dictionary in a type literal with several properties', () => {
    const diagnostics = lint(
      [
        'interface Bag {',
        '  a: Record<string, unknown>;',
        '  b: Record<string, object>;',
        '  c: Record<string, string>;',
        '}',
      ].join('\n'),
    );
    expect(diagnostics).toHaveLength(2);
  });

  it('resolves an unsafe value type through a chain of type aliases', () => {
    const diagnostics = lint(
      [
        'type Inner = Record<string, unknown>;',
        'type Outer = Record<string, Inner>;',
        'declare const value: Outer;',
      ].join('\n'),
    );
    // `Outer` and the plain-alias-consumer use in `declare const value: Outer`
    // are both flagged; `Inner`'s own declaration is a third.
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((diagnostic) => diagnostic.rule === RULE)).toBe(true);
  });
});
