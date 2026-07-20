import { describe, expect, it } from 'vitest';
import type { Manifest } from '@project/core';
import {
  buildCardHandles,
  buildRouteEdges,
  filterHandlesByRoute,
  routeCardIds,
} from '../src/index';

// a → b → c  (main),  a → c  (quick): c is shared, a fans out.
const manifest: Manifest = {
  version: 1,
  title: 'Test',
  cards: [
    { id: 'a', title: 'A', content: 'a.md' },
    { id: 'b', title: 'B', content: 'b.md' },
    { id: 'c', title: 'C', content: 'c.md' },
  ],
  edges: [],
  routes: [
    { id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }, { target: 'c' }] },
    { id: 'quick', title: 'Quick', steps: [{ target: 'a' }, { target: 'c' }] },
  ],
};

describe('buildCardHandles', () => {
  const handles = buildCardHandles(manifest);

  it('gives the first card only outbound ports, one per route leaving it', () => {
    const a = handles.get('a')!;
    expect(a.targetHandles).toEqual([]);
    expect(a.sourceHandles.map((h) => h.id)).toEqual(['main::out', 'quick::out']);
  });

  it('gives an interior card both in and out ports for its route', () => {
    const b = handles.get('b')!;
    expect(b.targetHandles.map((h) => h.id)).toEqual(['main::in']);
    expect(b.sourceHandles.map((h) => h.id)).toEqual(['main::out']);
  });

  it('gives a shared terminal card one inbound port per route arriving', () => {
    const c = handles.get('c')!;
    expect(c.sourceHandles).toEqual([]);
    expect(c.targetHandles.map((h) => h.id)).toEqual(['main::in', 'quick::in']);
  });
});

describe('routeCardIds', () => {
  it('lists a route’s distinct cards in first-visit order', () => {
    expect(routeCardIds(manifest, 'main')).toEqual(['a', 'b', 'c']);
    expect(routeCardIds(manifest, 'quick')).toEqual(['a', 'c']);
    expect(routeCardIds(manifest, 'nope')).toEqual([]);
  });
});

describe('filterHandlesByRoute', () => {
  it('keeps only the selected route’s handles', () => {
    const quick = filterHandlesByRoute(buildCardHandles(manifest), 'quick');
    // c is shared, but only its quick inbound port survives the filter.
    expect(quick.get('c')!.targetHandles.map((h) => h.id)).toEqual(['quick::in']);
    expect(quick.get('b')).toBeUndefined(); // b is only on main
  });
});

describe('buildRouteEdges', () => {
  const edges = buildRouteEdges(manifest);

  it('produces one edge per adjacent step, connected via route ports', () => {
    expect(edges).toHaveLength(3);
    expect(edges).toContainEqual({
      id: 'main::0',
      routeId: 'main',
      source: 'a',
      target: 'b',
      sourceHandle: 'main::out',
      targetHandle: 'main::in',
      stepIndex: 0,
    });
    expect(edges).toContainEqual({
      id: 'quick::0',
      routeId: 'quick',
      source: 'a',
      target: 'c',
      sourceHandle: 'quick::out',
      targetHandle: 'quick::in',
      stepIndex: 0,
    });
  });
});
