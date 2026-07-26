import { describe, expect, it } from 'vitest';
import {
  buildCardHandles,
  buildRouteEdges,
  cardIdsForRoutes,
  filterHandlesByRoute,
  filterHandlesByRoutes,
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
        {
          id: 'main',
          title: 'Main',
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' },
          ],
        },
        { id: 'quick', title: 'Quick', edges: [{ from: 'a', to: 'c' }] },
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

  it('gives a card nothing arrives at only outbound ports, one per route leaving it', () => {
    const a = handles.get('a')!;
    expect(a.targetHandles).toEqual([]);
    expect(a.sourceHandles.map((h) => h.id)).toEqual(['main::out', 'quick::out']);
  });

  it('gives an interior card both in and out ports for its route', () => {
    const b = handles.get('b')!;
    expect(b.targetHandles.map((h) => h.id)).toEqual(['main::in']);
    expect(b.sourceHandles.map((h) => h.id)).toEqual(['main::out']);
  });

  it('gives a shared sink one inbound port per route arriving', () => {
    const c = handles.get('c')!;
    expect(c.sourceHandles).toEqual([]);
    expect(c.targetHandles.map((h) => h.id)).toEqual(['main::in', 'quick::in']);
  });

  it('gives a fork one outbound port, not one per outgoing edge', () => {
    // The handle is per route per side, so several edges leaving a card by the
    // same route share it — which is why the scheme survives branching at all.
    const forked = loadSpace(
      {
        version: 1,
        id: 's',
        title: 'Fork',
        routes: [
          {
            id: 'main',
            title: 'Main',
            edges: [
              { from: 'a', to: 'b' },
              { from: 'a', to: 'c' },
            ],
          },
        ],
      },
      [cardFile('a'), cardFile('b'), cardFile('c')],
    );
    if (!forked.ok) throw new Error('fixture should load');
    expect(
      buildCardHandles(forked.space)
        .get('a')!
        .sourceHandles.map((h) => h.id),
    ).toEqual(['main::out']);
  });
});

describe('routeCardIds', () => {
  it('lists a route’s distinct cards', () => {
    expect(routeCardIds(space, 'main')).toEqual(['a', 'b', 'c']);
    expect(routeCardIds(space, 'quick')).toEqual(['a', 'c']);
    expect(routeCardIds(space, 'nope')).toEqual([]);
  });
});

describe('cardIdsForRoutes', () => {
  it('unions several routes, keeping each card once', () => {
    expect(cardIdsForRoutes(space, ['main', 'quick'])).toEqual(['a', 'b', 'c']);
  });

  it('orders by the routes given, then by authored edge order within each', () => {
    // quick first, so c is listed before b.
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

  it('produces one edge per authored edge, connected via route ports', () => {
    expect(edges).toHaveLength(3);
    expect(edges).toContainEqual({
      id: 'main::0',
      routeId: 'main',
      source: 'a',
      target: 'b',
      sourceHandle: 'main::out',
      targetHandle: 'main::in',
    });
    expect(edges).toContainEqual({
      id: 'quick::0',
      routeId: 'quick',
      source: 'a',
      target: 'c',
      sourceHandle: 'quick::out',
      targetHandle: 'quick::in',
    });
  });

  it('gives each of a fork’s edges its own id, sharing one outbound port', () => {
    const forked = loadSpace(
      {
        version: 1,
        id: 's',
        title: 'Fork',
        routes: [
          {
            id: 'main',
            title: 'Main',
            edges: [
              { from: 'a', to: 'b' },
              { from: 'a', to: 'c' },
            ],
          },
        ],
      },
      [cardFile('a'), cardFile('b'), cardFile('c')],
    );
    if (!forked.ok) throw new Error('fixture should load');
    const forkEdges = buildRouteEdges(forked.space);
    expect(forkEdges.map((e) => e.id)).toEqual(['main::0', 'main::1']);
    expect(forkEdges.map((e) => e.sourceHandle)).toEqual(['main::out', 'main::out']);
    expect(forkEdges.map((e) => e.target)).toEqual(['b', 'c']);
  });
});
