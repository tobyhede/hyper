import { describe, expect, it } from 'vitest';
import type { Card, Route } from '@project/core';
import { isValidGraph, validateReferences } from '../src/index';

// A mutable space-file shape: these tests deliberately construct broken graphs
// (which loadSpace would reject) and hand them straight to validateReferences.
function baseSpaceFile(): { title: string; cards: Card[]; routes: Route[] } {
  return {
    title: 'Test',
    cards: [
      { id: 'a', title: 'A', kind: 'markdown', content: 'cards/a.md' },
      { id: 'b', title: 'B', kind: 'markdown', content: 'cards/b.md' },
    ],
    routes: [{ id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }] }],
  };
}

describe('validateReferences', () => {
  it('reports no errors for a consistent space', () => {
    expect(validateReferences(baseSpaceFile())).toEqual([]);
    expect(isValidGraph(baseSpaceFile())).toBe(true);
  });

  it('accepts a valid single-hop alias to a markdown card', () => {
    const m = baseSpaceFile();
    m.cards.push({ id: 'a-again', title: 'A, again', kind: 'alias', target: 'a' });
    expect(validateReferences(m)).toEqual([]);
  });

  it('detects an unresolved route step target', () => {
    const m = baseSpaceFile();
    m.routes[0]!.steps[1]!.target = 'nowhere';
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'unresolved-route-step' && e.ref === 'nowhere')).toBe(
      true,
    );
  });

  it('detects duplicate card ids', () => {
    const m = baseSpaceFile();
    m.cards.push({ id: 'a', title: 'A dup', kind: 'markdown', content: 'cards/a2.md' });
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'duplicate-card-id' && e.ref === 'a')).toBe(true);
  });

  it('reports an alias whose target resolves to no card', () => {
    const m = baseSpaceFile();
    m.cards.push({ id: 'ghost', title: 'Ghost', kind: 'alias', target: 'nowhere' });
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'unresolved-alias-target' && e.ref === 'nowhere')).toBe(
      true,
    );
  });

  it('reports an alias that points at itself', () => {
    const m = baseSpaceFile();
    m.cards.push({ id: 'loop', title: 'Loop', kind: 'alias', target: 'loop' });
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'alias-self-reference' && e.ref === 'loop')).toBe(true);
  });

  it('reports an alias whose target is itself an alias (chains are single-hop)', () => {
    const m = baseSpaceFile();
    m.cards.push({ id: 'first', title: 'First', kind: 'alias', target: 'a' });
    m.cards.push({ id: 'second', title: 'Second', kind: 'alias', target: 'first' });
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'alias-targets-alias' && e.ref === 'first')).toBe(true);
  });
});
