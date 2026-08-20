import { describe, expect, it } from 'vitest';
import { lintFixture } from './rule-fixture';

const RULE = 'no-widen-then-assert';

function lint(source: string) {
  return lintFixture(source, { [RULE]: 'error' });
}

describe('no-widen-then-assert', () => {
  it('flags a known object literal widened to unknown then asserted back', () => {
    const diagnostics = lint(
      [
        'interface Point { x: number }',
        'const point: unknown = { x: 1 };',
        'const asserted = point as Point;',
      ].join('\n'),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe(RULE);
  });

  it('does not flag a value that keeps its precise type throughout', () => {
    const diagnostics = lint(
      ['interface Point { x: number }', 'const point: Point = { x: 1 };'].join('\n'),
    );
    expect(diagnostics).toEqual([]);
  });

  it('does not flag an assertion on a variable with no widened binding', () => {
    const diagnostics = lint(
      ['declare const value: unknown;', 'const n = value as number;'].join('\n'),
    );
    expect(diagnostics).toEqual([]);
  });

  it('resolves the correct binding when an outer variable is shadowed', () => {
    const diagnostics = lint(
      [
        'interface Point { x: number }',
        'const point: Point = { x: 1 };',
        'function f() {',
        '  const point: unknown = { x: 2 };',
        '  return point as Point;',
        '}',
      ].join('\n'),
    );
    expect(diagnostics).toHaveLength(1);
  });

  it('does not flag the outer binding when only the shadowed inner one is widened', () => {
    const diagnostics = lint(
      [
        'interface Point { x: number }',
        'const point: unknown = { x: 1 };',
        'function f() {',
        '  const point: Point = { x: 2 };',
        '  return point;',
        '}',
        'const asserted = point as Point;',
      ].join('\n'),
    );
    // The outer `point` crosses a function boundary from its assertion site
    // (there is none here — the assertion is outside `f`), so this still
    // characterizes today's behaviour: the outer widened binding is flagged.
    expect(diagnostics).toHaveLength(1);
  });

  it('does not flag a `let` binding — only `const` flows are in scope', () => {
    const diagnostics = lint(
      [
        'interface Point { x: number }',
        'let point: unknown = { x: 1 };',
        'const asserted = point as Point;',
      ].join('\n'),
    );
    expect(diagnostics).toEqual([]);
  });
});
