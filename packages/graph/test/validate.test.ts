import { describe, expect, it } from 'vitest';
import type { Card, Layout, Route } from '@project/core';
import { isValidGraph, validateReferences, type ReferenceError } from '../src/index';
import { alias, card } from './card-files';

const errorKinds = (errors: readonly ReferenceError[]): string[] => errors.map((e) => e.kind);

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
    routes: [{ id: 'main', title: 'Main', edges: [{ from: 'a', to: 'b' }] }],
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

  it('detects an unresolved edge endpoint, naming which end it was', () => {
    const m = baseSpaceFile();
    m.routes[0]!.edges[0]!.to = 'nowhere';
    const errors = validateReferences(m);
    const error = errors.find((e) => e.kind === 'unresolved-route-edge');
    expect(error?.ref).toBe('nowhere');
    expect(error?.message).toContain('as its to');
  });

  it('rejects a route that closes a cycle, and names the loop (ADR 0023)', () => {
    const m = baseSpaceFile();
    // A → B → A: a return to A. This must be an alias, not a loop.
    m.routes[0]!.edges.push({ from: 'b', to: 'a' });
    const errors = validateReferences(m);
    const error = errors.find((e) => e.kind === 'route-has-cycle');
    expect(error?.ref).toBe('a');
    expect(error?.message).toContain('a → b → a');
  });

  it('rejects a self-loop', () => {
    const m = baseSpaceFile();
    m.routes[0]!.edges.push({ from: 'b', to: 'b' });
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'route-has-cycle' && e.ref === 'b')).toBe(true);
  });

  it('rejects a cycle that no card outside it reaches', () => {
    // The loop is a disconnected component, so a search rooted only at the
    // route's first card would never enter it. A route need not be connected
    // (ADR 0023), so every card has to be a candidate root.
    const m = baseSpaceFile();
    m.cards.push(card('c'), card('d'));
    m.routes[0]!.edges.push({ from: 'c', to: 'd' }, { from: 'd', to: 'c' });
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'route-has-cycle')).toBe(true);
  });

  it('accepts a fork and a merge — only cycles are forbidden (ADR 0023)', () => {
    const m = baseSpaceFile();
    m.cards.push(card('c'), card('d'));
    // a forks to b and c, which merge back into d. Acyclic, and `d` is reachable
    // two ways, which is exactly what a merge is.
    m.routes[0]!.edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ];
    expect(validateReferences(m)).toEqual([]);
  });

  it('allows different routes to share a card', () => {
    const m = baseSpaceFile();
    m.routes.push({ id: 'alt', title: 'Alt', edges: [{ from: 'b', to: 'a' }] });
    expect(validateReferences(m)).toEqual([]);
  });

  it('checks each route on its own: two routes may disagree about order', () => {
    // main goes a → b and alt goes b → a. Their union has a cycle; neither route
    // does, and a route is what acyclicity is a property of (ADR 0003 permits
    // routes to disagree).
    const m = baseSpaceFile();
    m.routes.push({ id: 'alt', title: 'Alt', edges: [{ from: 'b', to: 'a' }] });
    expect(errorKinds(validateReferences(m))).not.toContain('route-has-cycle');
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

describe('validateReferences: the routes a Layout names (ADR 0026)', () => {
  /** Two routes, so a filter has something to leave out. */
  function twoRoutes() {
    const m = baseSpaceFile();
    m.routes.push({ id: 'aside', title: 'Aside', edges: [{ from: 'b', to: 'a' }] });
    return m;
  }

  it('accepts a layout that names neither — every route shown, the first active', () => {
    const m = twoRoutes();
    m.layouts = [layout('working', {})];
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts a filter and an active route inside it', () => {
    const m = twoRoutes();
    m.layouts = [{ ...layout('working', {}), routes: ['main'], activeRoute: 'main' }];
    expect(validateReferences(m)).toEqual([]);
  });

  it('accepts an active route with no filter — every route is visible', () => {
    const m = twoRoutes();
    m.layouts = [{ ...layout('working', {}), activeRoute: 'aside' }];
    expect(validateReferences(m)).toEqual([]);
  });

  it('reports a filter naming a route the space does not have', () => {
    const m = twoRoutes();
    m.layouts = [{ ...layout('working', {}), routes: ['main', 'ghost'] }];
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'layout-unknown-route' && e.ref === 'ghost')).toBe(true);
    expect(isValidGraph(m)).toBe(false);
  });

  it('reports an activeRoute the space does not have', () => {
    const m = twoRoutes();
    m.layouts = [{ ...layout('working', {}), activeRoute: 'ghost' }];
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'layout-unknown-route' && e.ref === 'ghost')).toBe(true);
  });

  it('reports an activeRoute the layout filters out, though both ids resolve', () => {
    // The one check that relates the two fields rather than resolving either
    // against the space. Activating moves emphasis within the visible set, so a
    // layout opening active on a route it hides has asked for an unreachable
    // state — and it is an error even though "aside" is a perfectly real route.
    const m = twoRoutes();
    m.layouts = [{ ...layout('working', {}), routes: ['main'], activeRoute: 'aside' }];
    const errors = validateReferences(m);
    expect(
      errors.some((e) => e.kind === 'layout-active-route-not-shown' && e.ref === 'aside'),
    ).toBe(true);
    // Not also reported as unknown: it resolves, it is just not shown.
    expect(errorKinds(errors)).not.toContain('layout-unknown-route');
  });

  it('reports an empty filter with an active route, rather than treating it as absent', () => {
    // A layout showing no routes is legal shape; naming an active one is not,
    // because the visible set it must belong to is empty. Absent means all —
    // empty means none, and the two must not collapse.
    const m = twoRoutes();
    m.layouts = [{ ...layout('working', {}), routes: [], activeRoute: 'main' }];
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'layout-active-route-not-shown' && e.ref === 'main')).toBe(
      true,
    );
  });

  it('names the layout in the message, since the id alone does not say where', () => {
    const m = twoRoutes();
    m.layouts = [{ ...layout('working', {}), routes: ['ghost'] }];
    const [error] = validateReferences(m);
    expect(error?.message).toContain('"working"');
  });
});
