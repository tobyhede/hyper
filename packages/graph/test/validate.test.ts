import { describe, expect, it } from 'vitest';
import type { Card, Layout, Route } from '@project/core';
import { isValidGraph, validateReferences } from '../src/index';
import { alias, card } from './card-files';

// A mutable space-file shape: these tests deliberately construct broken graphs
// (which loadSpace would reject) and hand them straight to validateReferences.
function baseSpaceFile(): {
  title: string;
  cards: Card[];
  routes: Route[];
  layouts?: Layout[];
  defaultView?: string;
} {
  return {
    title: 'Test',
    cards: [card('a'), card('b')],
    routes: [{ id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }] }],
  };
}

function layout(id: string, positions: Record<string, { x: number; y: number }>): Layout {
  return { id, title: id, kind: 'positioned', positions };
}

describe('validateReferences', () => {
  it('reports no errors for a consistent space', () => {
    expect(validateReferences(baseSpaceFile())).toEqual([]);
    expect(isValidGraph(baseSpaceFile())).toBe(true);
  });

  it('accepts a valid single-hop alias to a markdown card', () => {
    const m = baseSpaceFile();
    m.cards.push(alias('a-again', 'A, again', 'a'));
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

  it('rejects a route that revisits a card (ADR 0012)', () => {
    const m = baseSpaceFile();
    // A → B → A: a return to A. This must be an alias, not a revisit.
    m.routes[0]!.steps.push({ target: 'a' });
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'route-revisits-card' && e.ref === 'a')).toBe(true);
  });

  it('allows different routes to share a card', () => {
    const m = baseSpaceFile();
    m.routes.push({ id: 'alt', title: 'Alt', steps: [{ target: 'b' }, { target: 'a' }] });
    expect(validateReferences(m)).toEqual([]);
  });

  it('detects duplicate card ids', () => {
    const m = baseSpaceFile();
    m.cards.push(card('a', 'A dup'));
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'duplicate-card-id' && e.ref === 'a')).toBe(true);
  });

  it('reports an alias whose target resolves to no card', () => {
    const m = baseSpaceFile();
    m.cards.push(alias('ghost', 'Ghost', 'nowhere'));
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'unresolved-alias-target' && e.ref === 'nowhere')).toBe(
      true,
    );
  });

  it('reports an alias that points at itself', () => {
    const m = baseSpaceFile();
    m.cards.push(alias('loop', 'Loop', 'loop'));
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'alias-self-reference' && e.ref === 'loop')).toBe(true);
  });

  it('reports an alias whose target is itself an alias (chains are single-hop)', () => {
    const m = baseSpaceFile();
    m.cards.push(alias('first', 'First', 'a'));
    m.cards.push(alias('second', 'Second', 'first'));
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'alias-targets-alias' && e.ref === 'first')).toBe(true);
  });
});

describe('validateReferences: layouts (ADR 0013)', () => {
  it('accepts a space that declares no layouts at all', () => {
    expect(validateReferences(baseSpaceFile())).toEqual([]);
  });

  it('accepts a layout that positions every card', () => {
    const m = baseSpaceFile();
    m.layouts = [layout('working', { a: { x: 0, y: 0 }, b: { x: 320, y: 0 } })];
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a layout that omits cards — positions are sparse by design', () => {
    const m = baseSpaceFile();
    m.layouts = [layout('working', { a: { x: 0, y: 0 } })];
    expect(validateReferences(m)).toEqual([]);
  });

  it('reports a position naming a card that does not exist', () => {
    // The dangling position a deleted card leaves behind. Omitting a card is
    // fine; naming one that is gone is not — the asymmetry is the whole rule.
    const m = baseSpaceFile();
    m.layouts = [layout('working', { a: { x: 0, y: 0 }, ghost: { x: 10, y: 10 } })];
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'layout-position-unknown-card' && e.ref === 'ghost')).toBe(
      true,
    );
  });

  it('reports duplicate layout ids, which an index would silently collapse', () => {
    const m = baseSpaceFile();
    m.layouts = [layout('working', {}), layout('working', { a: { x: 1, y: 1 } })];
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'duplicate-layout-id' && e.ref === 'working')).toBe(true);
  });

  it('accepts a defaultView naming a declared layout', () => {
    const m = baseSpaceFile();
    m.layouts = [layout('working', {})];
    m.defaultView = 'working';
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a defaultView naming a built-in automatic view', () => {
    for (const view of ['graph', 'grid']) {
      const m = baseSpaceFile();
      m.defaultView = view;
      expect(validateReferences(m)).toEqual([]);
    }
  });

  it('reports a defaultView naming neither a layout nor a built-in', () => {
    const m = baseSpaceFile();
    m.layouts = [layout('working', {})];
    m.defaultView = 'elk-tuned';
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'unresolved-default-view' && e.ref === 'elk-tuned')).toBe(
      true,
    );
    expect(isValidGraph(m)).toBe(false);
  });
});
