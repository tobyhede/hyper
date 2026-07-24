import { describe, expect, it } from 'vitest';
import {
  buildCardHandles,
  buildRouteEdges,
  cardIdsForRoutes,
  filterHandlesByRoute,
  filterHandlesByRoutes,
  lastCardId,
  loadSpace,
  routeCardIds,
  type Space,
} from '../src/index';
import { cardFile } from './card-files';

// a → b → c  (main),  a → c  (quick): c is shared, a fans out.
function loadFixture(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: 's',
      title: 'Test',
      routes: [
        { id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }, { target: 'c' }] },
        { id: 'quick', title: 'Quick', steps: [{ target: 'a' }, { target: 'c' }] },
      ],
    },
    [cardFile('a'), cardFile('b'), cardFile('c')],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

const space = loadFixture();

describe('buildCardHandles', () => {
  const handles = buildCardHandles(space);

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
    expect(routeCardIds(space, 'main')).toEqual(['a', 'b', 'c']);
    expect(routeCardIds(space, 'quick')).toEqual(['a', 'c']);
    expect(routeCardIds(space, 'nope')).toEqual([]);
  });
});

describe('cardIdsForRoutes', () => {
  it('unions several routes, keeping each card once', () => {
    expect(cardIdsForRoutes(space, ['main', 'quick'])).toEqual(['a', 'b', 'c']);
  });

  it('orders by the routes given, then by step order within each', () => {
    // quick first, so c is reached before b.
    expect(cardIdsForRoutes(space, ['quick', 'main'])).toEqual(['a', 'c', 'b']);
  });

  it('ignores unknown route ids', () => {
    expect(cardIdsForRoutes(space, ['nope'])).toEqual([]);
    expect(cardIdsForRoutes(space, ['quick', 'nope'])).toEqual(['a', 'c']);
  });

  it('returns nothing for no routes', () => {
    expect(cardIdsForRoutes(space, [])).toEqual([]);
  });
});

describe('filterHandlesByRoute', () => {
  it('keeps only the selected route’s handles', () => {
    const quick = filterHandlesByRoute(buildCardHandles(space), 'quick');
    // c is shared, but only its quick inbound port survives the filter.
    expect(quick.get('c')!.targetHandles.map((h) => h.id)).toEqual(['quick::in']);
    expect(quick.get('b')).toBeUndefined(); // b is only on main
  });
});

describe('filterHandlesByRoutes', () => {
  it('keeps a shared card’s handles for every route given', () => {
    const both = filterHandlesByRoutes(buildCardHandles(space), ['main', 'quick']);
    // The multi-route case: c carries one inbound handle per route arriving.
    expect(both.get('c')!.targetHandles.map((h) => h.id)).toEqual(['main::in', 'quick::in']);
    expect(both.get('a')!.sourceHandles.map((h) => h.id)).toEqual(['main::out', 'quick::out']);
    expect(both.get('b')!.targetHandles.map((h) => h.id)).toEqual(['main::in']);
  });

  it('drops cards left with no handles at all', () => {
    const quickOnly = filterHandlesByRoutes(buildCardHandles(space), ['quick']);
    expect(quickOnly.get('b')).toBeUndefined();
  });
});

describe('buildRouteEdges', () => {
  const edges = buildRouteEdges(space);

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

describe('lastCardId', () => {
  // Regression: a route step is a `{ target }` object, not a bare id. Reading the
  // last step without `.target` (e.g. keying a map on the step) silently yields
  // the wrong card — the bug this guards. main visits a→b→c, quick a→c.
  it('returns the id of the last card a route visits', () => {
    expect(lastCardId(space, 'main')).toBe('c');
    expect(lastCardId(space, 'quick')).toBe('c');
  });

  it('returns null for an unknown route', () => {
    expect(lastCardId(space, 'nope')).toBeNull();
  });
});
