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
      version: 2,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Test',
      routes: [
        {
          id: '00000000-0000-4000-8000-000000000004',
          title: 'Main',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000002',
              to: '00000000-0000-4000-8000-000000000003',
            },
            {
              from: '00000000-0000-4000-8000-000000000003',
              to: '00000000-0000-4000-8000-000000000005',
            },
          ],
        },
        {
          id: '00000000-0000-4000-8000-000000000031',
          title: 'Quick',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000002',
              to: '00000000-0000-4000-8000-000000000005',
            },
          ],
        },
      ],
    },
    [
      cardFile('00000000-0000-4000-8000-000000000002'),
      cardFile('00000000-0000-4000-8000-000000000003'),
      cardFile('00000000-0000-4000-8000-000000000005'),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

const space = loadFixture();

describe('buildCardHandles', () => {
  const handles = buildCardHandles(space);

  it('gives a card nothing arrives at only outbound ports, one per route leaving it', () => {
    const a = handles.get('00000000-0000-4000-8000-000000000002')!;
    expect(a.targetHandles).toEqual([]);
    expect(a.sourceHandles.map((h) => h.id)).toEqual([
      '00000000-0000-4000-8000-000000000004::out',
      '00000000-0000-4000-8000-000000000031::out',
    ]);
  });

  it('gives an interior card both in and out ports for its route', () => {
    const b = handles.get('00000000-0000-4000-8000-000000000003')!;
    expect(b.targetHandles.map((h) => h.id)).toEqual(['00000000-0000-4000-8000-000000000004::in']);
    expect(b.sourceHandles.map((h) => h.id)).toEqual(['00000000-0000-4000-8000-000000000004::out']);
  });

  it('gives a shared sink one inbound port per route arriving', () => {
    const c = handles.get('00000000-0000-4000-8000-000000000005')!;
    expect(c.sourceHandles).toEqual([]);
    expect(c.targetHandles.map((h) => h.id)).toEqual([
      '00000000-0000-4000-8000-000000000004::in',
      '00000000-0000-4000-8000-000000000031::in',
    ]);
  });

  it('gives a fork one outbound port, not one per outgoing edge', () => {
    // The handle is per route per side, so several edges leaving a card by the
    // same route share it — which is why the scheme survives branching at all.
    const forked = loadSpace(
      {
        version: 2,
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Fork',
        routes: [
          {
            id: '00000000-0000-4000-8000-000000000004',
            title: 'Main',
            edges: [
              {
                from: '00000000-0000-4000-8000-000000000002',
                to: '00000000-0000-4000-8000-000000000003',
              },
              {
                from: '00000000-0000-4000-8000-000000000002',
                to: '00000000-0000-4000-8000-000000000005',
              },
            ],
          },
        ],
      },
      [
        cardFile('00000000-0000-4000-8000-000000000002'),
        cardFile('00000000-0000-4000-8000-000000000003'),
        cardFile('00000000-0000-4000-8000-000000000005'),
      ],
    );
    if (!forked.ok) throw new Error('fixture should load');
    expect(
      buildCardHandles(forked.space)
        .get('00000000-0000-4000-8000-000000000002')!
        .sourceHandles.map((h) => h.id),
    ).toEqual(['00000000-0000-4000-8000-000000000004::out']);
  });
});

describe('routeCardIds', () => {
  it('lists a route’s distinct cards', () => {
    expect(routeCardIds(space, '00000000-0000-4000-8000-000000000004')).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
    ]);
    expect(routeCardIds(space, '00000000-0000-4000-8000-000000000031')).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000005',
    ]);
    expect(routeCardIds(space, 'nope')).toEqual([]);
  });
});

describe('cardIdsForRoutes', () => {
  it('unions several routes, keeping each card once', () => {
    expect(
      cardIdsForRoutes(space, [
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000031',
      ]),
    ).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
    ]);
  });

  it('orders by the routes given, then by authored edge order within each', () => {
    // quick first, so c is listed before b.
    expect(
      cardIdsForRoutes(space, [
        '00000000-0000-4000-8000-000000000031',
        '00000000-0000-4000-8000-000000000004',
      ]),
    ).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000003',
    ]);
  });

  it('ignores unknown route ids', () => {
    expect(cardIdsForRoutes(space, ['nope'])).toEqual([]);
    expect(cardIdsForRoutes(space, ['00000000-0000-4000-8000-000000000031', 'nope'])).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000005',
    ]);
  });

  it('returns nothing for no routes', () => {
    expect(cardIdsForRoutes(space, [])).toEqual([]);
  });
});

describe('filterHandlesByRoute', () => {
  it('keeps only the selected route’s handles', () => {
    const quick = filterHandlesByRoute(
      buildCardHandles(space),
      '00000000-0000-4000-8000-000000000031',
    );
    // c is shared, but only its quick inbound port survives the filter.
    expect(
      quick.get('00000000-0000-4000-8000-000000000005')!.targetHandles.map((h) => h.id),
    ).toEqual(['00000000-0000-4000-8000-000000000031::in']);
    expect(quick.get('00000000-0000-4000-8000-000000000003')).toBeUndefined(); // b is only on main
  });
});

describe('filterHandlesByRoutes', () => {
  it('keeps a shared card’s handles for every route given', () => {
    const both = filterHandlesByRoutes(buildCardHandles(space), [
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000031',
    ]);
    // The multi-route case: c carries one inbound handle per route arriving.
    expect(
      both.get('00000000-0000-4000-8000-000000000005')!.targetHandles.map((h) => h.id),
    ).toEqual([
      '00000000-0000-4000-8000-000000000004::in',
      '00000000-0000-4000-8000-000000000031::in',
    ]);
    expect(
      both.get('00000000-0000-4000-8000-000000000002')!.sourceHandles.map((h) => h.id),
    ).toEqual([
      '00000000-0000-4000-8000-000000000004::out',
      '00000000-0000-4000-8000-000000000031::out',
    ]);
    expect(
      both.get('00000000-0000-4000-8000-000000000003')!.targetHandles.map((h) => h.id),
    ).toEqual(['00000000-0000-4000-8000-000000000004::in']);
  });

  it('drops cards left with no handles at all', () => {
    const quickOnly = filterHandlesByRoutes(buildCardHandles(space), [
      '00000000-0000-4000-8000-000000000031',
    ]);
    expect(quickOnly.get('00000000-0000-4000-8000-000000000003')).toBeUndefined();
  });
});

describe('buildRouteEdges', () => {
  const edges = buildRouteEdges(space);

  it('produces one edge per authored edge, connected via route ports', () => {
    expect(edges).toHaveLength(3);
    expect(edges).toContainEqual({
      id: '00000000-0000-4000-8000-000000000004::0',
      routeId: '00000000-0000-4000-8000-000000000004',
      source: '00000000-0000-4000-8000-000000000002',
      target: '00000000-0000-4000-8000-000000000003',
      sourceHandle: '00000000-0000-4000-8000-000000000004::out',
      targetHandle: '00000000-0000-4000-8000-000000000004::in',
    });
    expect(edges).toContainEqual({
      id: '00000000-0000-4000-8000-000000000031::0',
      routeId: '00000000-0000-4000-8000-000000000031',
      source: '00000000-0000-4000-8000-000000000002',
      target: '00000000-0000-4000-8000-000000000005',
      sourceHandle: '00000000-0000-4000-8000-000000000031::out',
      targetHandle: '00000000-0000-4000-8000-000000000031::in',
    });
  });

  it('gives each of a fork’s edges its own id, sharing one outbound port', () => {
    const forked = loadSpace(
      {
        version: 2,
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Fork',
        routes: [
          {
            id: '00000000-0000-4000-8000-000000000004',
            title: 'Main',
            edges: [
              {
                from: '00000000-0000-4000-8000-000000000002',
                to: '00000000-0000-4000-8000-000000000003',
              },
              {
                from: '00000000-0000-4000-8000-000000000002',
                to: '00000000-0000-4000-8000-000000000005',
              },
            ],
          },
        ],
      },
      [
        cardFile('00000000-0000-4000-8000-000000000002'),
        cardFile('00000000-0000-4000-8000-000000000003'),
        cardFile('00000000-0000-4000-8000-000000000005'),
      ],
    );
    if (!forked.ok) throw new Error('fixture should load');
    const forkEdges = buildRouteEdges(forked.space);
    expect(forkEdges.map((e) => e.id)).toEqual([
      '00000000-0000-4000-8000-000000000004::0',
      '00000000-0000-4000-8000-000000000004::1',
    ]);
    expect(forkEdges.map((e) => e.sourceHandle)).toEqual([
      '00000000-0000-4000-8000-000000000004::out',
      '00000000-0000-4000-8000-000000000004::out',
    ]);
    expect(forkEdges.map((e) => e.target)).toEqual([
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000005',
    ]);
  });
});
