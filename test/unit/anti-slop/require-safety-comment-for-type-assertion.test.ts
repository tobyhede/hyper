import { describe, expect, it } from 'vitest';
import { lintFixture } from './rule-fixture';

const RULE = 'require-safety-comment-for-type-assertion';

function lint(source: string) {
  return lintFixture(source, { [RULE]: 'error' });
}

describe('require-safety-comment-for-type-assertion', () => {
  it('reports a bare assertion with no SAFETY comment', () => {
    const diagnostics = lint('declare const value: unknown;\nconst n = value as number;\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe(RULE);
  });

  it('accepts a SAFETY comment that states a checked invariant', () => {
    const diagnostics = lint(
      [
        'declare const value: unknown;',
        'if (typeof value === "number") {',
        '  // SAFETY: the guard above confirmed value is a number.',
        '  const n = value as number;',
        '}',
      ].join('\n'),
    );
    expect(diagnostics).toEqual([]);
  });

  it('does not accept a SAFETY comment that admits the assertion is unverified', () => {
    const diagnostics = lint(
      [
        'declare const value: unknown;',
        '// SAFETY: unverified here, but callers of `n` will fail fast on a mismatch.',
        'const n = value as number;',
      ].join('\n'),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe(RULE);
  });

  it('leaves const assertions alone', () => {
    const diagnostics = lint('const tuple = [1, 2] as const;\n');
    expect(diagnostics).toEqual([]);
  });
});
