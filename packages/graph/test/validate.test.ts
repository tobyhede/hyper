import { describe, expect, it } from 'vitest';
import type { Manifest } from '@project/core';
import { isValidGraph, validateReferences } from '../src/index';

function baseManifest(): Manifest {
  return {
    version: 1,
    title: 'Test',
    cards: [
      { id: 'a', title: 'A', content: 'cards/a.md' },
      { id: 'b', title: 'B', content: 'cards/b.md' },
    ],
    routes: [{ id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }] }],
  };
}

describe('validateReferences', () => {
  it('reports no errors for a consistent manifest', () => {
    expect(validateReferences(baseManifest())).toEqual([]);
    expect(isValidGraph(baseManifest())).toBe(true);
  });

  it('detects an unresolved route step target', () => {
    const m = baseManifest();
    m.routes[0]!.steps[1]!.target = 'nowhere';
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'unresolved-route-step' && e.ref === 'nowhere')).toBe(
      true,
    );
  });

  it('detects duplicate card ids', () => {
    const m = baseManifest();
    m.cards.push({ id: 'a', title: 'A dup', content: 'cards/a2.md' });
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'duplicate-card-id' && e.ref === 'a')).toBe(true);
  });
});
