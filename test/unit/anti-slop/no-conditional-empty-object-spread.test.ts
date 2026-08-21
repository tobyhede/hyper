import { describe, expect, it } from 'vitest';
import { lintFixture } from './rule-fixture';

const RULE = 'no-conditional-empty-object-spread';

function lint(source: string, extension: 'ts' | 'tsx' = 'ts') {
  return lintFixture(source, { [RULE]: 'error' }, extension);
}

describe('no-conditional-empty-object-spread', () => {
  it('flags an omission hidden behind an empty object in an object literal', () => {
    const diagnostics = lint(
      [
        'declare const size: number | undefined;',
        'const props = { name: "a", ...(size === undefined ? {} : { size }) };',
      ].join('\n'),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe(RULE);
  });

  // The JSX half of the rule. A spread attribute is a `JSXSpreadAttribute`,
  // not a `SpreadElement` inside an `ObjectExpression`, so the object-literal
  // visitor never sees it — this is the case that reached props unflagged
  // until the rule grew its second visitor.
  it('flags the same idiom spread into JSX props', () => {
    const diagnostics = lint(
      [
        'declare const Glyph: (props: { size?: number }) => null;',
        'declare const size: number | undefined;',
        'const element = <Glyph {...(size === undefined ? {} : { size })} />;',
      ].join('\n'),
      'tsx',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe(RULE);
  });

  it('does not flag a JSX spread of a plain object', () => {
    const diagnostics = lint(
      [
        'declare const Glyph: (props: { size?: number }) => null;',
        'declare const glyphProps: { size?: number };',
        'const element = <Glyph {...glyphProps} />;',
      ].join('\n'),
      'tsx',
    );
    expect(diagnostics).toEqual([]);
  });
});
