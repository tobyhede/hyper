import { describe, expect, it } from 'vitest';
import { lintFixture } from './rule-fixture';

/**
 * `no-object-parameters` and `no-unknown-parameters` both walk every
 * function-like AST node kind and both resolve a parameter's declared
 * annotation the same way (through `TSParameterProperty`, `RestElement` and
 * `AssignmentPattern`). These fixtures exercise that shared surface once per
 * rule, so a change to the shared module can't silently narrow one rule's
 * coverage without the other's.
 */

const FUNCTION_LIKE_FIXTURES: readonly (readonly [string, string])[] = [
  ['arrow function expression', 'const f = (x: TARGET) => x;\n'],
  ['function declaration', 'function f(x: TARGET) { return x; }\n'],
  ['function expression', 'const f = function (x: TARGET) { return x; };\n'],
  ['call signature', 'interface F { (x: TARGET): void }\n'],
  ['construct signature', 'interface F { new (x: TARGET): object }\n'],
  ['constructor type', 'type F = new (x: TARGET) => object;\n'],
  ['declared function', 'declare function f(x: TARGET): void;\n'],
  ['method signature', 'interface F { method(x: TARGET): void }\n'],
  ['function type', 'type F = (x: TARGET) => void;\n'],
  ['ambient class method with no body', 'declare class C { method(x: TARGET): void }\n'],
];

function ruleFixtures(target: string): readonly (readonly [string, string])[] {
  return FUNCTION_LIKE_FIXTURES.map(([label, template]) => [
    label,
    template.replace('TARGET', target),
  ]);
}

describe.each([
  ['no-object-parameters', 'object'],
  ['no-unknown-parameters', 'unknown'],
] as const)('%s reaches every function-like node kind', (rule, target) => {
  it.each(ruleFixtures(target))('flags %s', (_label, source) => {
    const diagnostics = lintFixture(source, { [rule]: 'error' });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.rule).toBe(rule);
  });
});

describe.each(['no-object-parameters', 'no-unknown-parameters'] as const)(
  '%s resolves an annotation through parameter wrappers',
  (rule) => {
    const target = rule === 'no-object-parameters' ? 'object' : 'unknown';

    it('through a parameter property', () => {
      const diagnostics = lintFixture(`class C { constructor(public x: ${target}) {} }\n`, {
        [rule]: 'error',
      });
      expect(diagnostics).toHaveLength(1);
    });

    it('through a rest element', () => {
      const diagnostics = lintFixture(`function f(...rest: ${target}[]) { return rest; }\n`, {
        [rule]: 'error',
      });
      expect(diagnostics).toEqual([]);
    });

    it('through a default-valued parameter', () => {
      const fallback = target === 'object' ? '{}' : 'undefined';
      const diagnostics = lintFixture(`function f(x: ${target} = ${fallback}) { return x; }\n`, {
        [rule]: 'error',
      });
      expect(diagnostics).toHaveLength(1);
    });
  },
);
