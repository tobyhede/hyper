import { describe, expect, it } from 'vitest';
import { lintFixture } from './rule-fixture';

const RULE = 'no-known-value-widening';

function lint(source: string) {
  return lintFixture(source, { [RULE]: 'error' });
}

describe('no-known-value-widening', () => {
  it('flags a known object literal flowing into an explicit unknown binding', () => {
    const diagnostics = lint('const value: unknown = { x: 1 };\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe(RULE);
  });

  it('flags a known object literal flowing into an explicit object binding', () => {
    const diagnostics = lint('const value: object = { x: 1 };\n');
    expect(diagnostics).toHaveLength(1);
  });

  it('does not flag a value with no broad target annotation', () => {
    const diagnostics = lint('const value = { x: 1 };\n');
    expect(diagnostics).toEqual([]);
  });

  it('resolves the correct binding when an outer variable is shadowed', () => {
    const diagnostics = lint(
      ['const value = { x: 1 };', 'function f() {', '  const value: unknown = { x: 2 };', '}'].join(
        '\n',
      ),
    );
    expect(diagnostics).toHaveLength(1);
  });

  it('does not flag an empty object flowing into an open dictionary target', () => {
    const diagnostics = lint('const value: Record<string, unknown> = {};\n');
    expect(diagnostics).toEqual([]);
  });

  it('flags a known object literal flowing into an explicit any binding, same as unknown', () => {
    // `any` erases type evidence at least as thoroughly as `unknown` — the
    // sibling rule `no-widen-then-assert`'s `broadTypeKind` already treats
    // the two as equally broad ("top"); this rule should not disagree.
    const diagnostics = lint('const value: any = { x: 1 };\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe(RULE);
  });
});
