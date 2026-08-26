import { describe, expect, it } from 'vitest';
import {
  buildCardHandles,
  buildGraphRenderEdges,
  filterHandlesByGraphs,
  loadSpace,
  graphCardIds,
  type Space,
} from '../src/index';
// Internal to the package, so not reachable through what it offers.
import { cardIdsForGraphs, filterHandlesByGraph } from '../src/graph-rendering';
import { cardFile, uuid } from './card-files';

// a → b → c  (main),  a → c  (quick): c is shared, a fans out.
function loadFixture(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Test',
      layouts: [
        {
          id: uuid('00000000-0000-4000-8000-000000000022'),
          title: 'Working',
          positions: {
            [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 0, open: false },
            [uuid('00000000-0000-4000-8000-000000000003')]: { x: 320, y: 0, open: false },
            [uuid('00000000-0000-4000-8000-000000000005')]: { x: 640, y: 0, open: false },
          },
          graphs: [
            {
              id: uuid('00000000-0000-4000-8000-000000000004'),
              title: 'Main',
              edges: [
                {
                  from: uuid('00000000-0000-4000-8000-000000000002'),
                  to: uuid('00000000-0000-4000-8000-000000000003'),
                },
                {
                  from: uuid('00000000-0000-4000-8000-000000000003'),
                  to: uuid('00000000-0000-4000-8000-000000000005'),
                },
              ],
            },
            {
              id: uuid('00000000-0000-4000-8000-000000000031'),
              title: 'Quick',
              edges: [
                {
                  from: uuid('00000000-0000-4000-8000-000000000002'),
                  to: uuid('00000000-0000-4000-8000-000000000005'),
                },
              ],
            },
          ],
        },
      ],
    },
    [
      cardFile(uuid('00000000-0000-4000-8000-000000000002')),
      cardFile(uuid('00000000-0000-4000-8000-000000000003')),
      cardFile(uuid('00000000-0000-4000-8000-000000000005')),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

const space = loadFixture();

describe('buildCardHandles', () => {
  const handles = buildCardHandles(space);

  it('gives a card nothing arrives at only outbound ports, one per graph leaving it', () => {
    const a = handles.get(uuid('00000000-0000-4000-8000-000000000002'))!;
    expect(a.targetHandles).toEqual([]);
    expect(a.sourceHandles.map((h) => h.id)).toEqual([
      '00000000-0000-4000-8000-000000000004::out',
      '00000000-0000-4000-8000-000000000031::out',
    ]);
  });

  it('gives an interior card both in and out ports for its graph', () => {
    const b = handles.get(uuid('00000000-0000-4000-8000-000000000003'))!;
    expect(b.targetHandles.map((h) => h.id)).toEqual(['00000000-0000-4000-8000-000000000004::in']);
    expect(b.sourceHandles.map((h) => h.id)).toEqual(['00000000-0000-4000-8000-000000000004::out']);
  });

  it('gives a shared sink one inbound port per graph arriving', () => {
    const c = handles.get(uuid('00000000-0000-4000-8000-000000000005'))!;
    expect(c.sourceHandles).toEqual([]);
    expect(c.targetHandles.map((h) => h.id)).toEqual([
      '00000000-0000-4000-8000-000000000004::in',
      '00000000-0000-4000-8000-000000000031::in',
    ]);
  });

  it('gives a fork one outbound port, not one per outgoing edge', () => {
    // The handle is per graph per side, so several edges leaving a card by the
    // same Graph share it — which is why the scheme survives branching at all.
    const forked = loadSpace(
      {
        version: 1,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'Fork',
        layouts: [
          {
            id: uuid('00000000-0000-4000-8000-000000000022'),
            title: 'Working',
            positions: {
              [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 0, open: false },
              [uuid('00000000-0000-4000-8000-000000000003')]: { x: 320, y: 0, open: false },
              [uuid('00000000-0000-4000-8000-000000000005')]: { x: 320, y: 200, open: false },
            },
            graphs: [
              {
                id: uuid('00000000-0000-4000-8000-000000000004'),
                title: 'Main',
                edges: [
                  {
                    from: uuid('00000000-0000-4000-8000-000000000002'),
                    to: uuid('00000000-0000-4000-8000-000000000003'),
                  },
                  {
                    from: uuid('00000000-0000-4000-8000-000000000002'),
                    to: uuid('00000000-0000-4000-8000-000000000005'),
                  },
                ],
              },
            ],
          },
        ],
      },
      [
        cardFile(uuid('00000000-0000-4000-8000-000000000002')),
        cardFile(uuid('00000000-0000-4000-8000-000000000003')),
        cardFile(uuid('00000000-0000-4000-8000-000000000005')),
      ],
    );
    if (!forked.ok) throw new Error('fixture should load');
    expect(
      buildCardHandles(forked.space)
        .get(uuid('00000000-0000-4000-8000-000000000002'))!
        .sourceHandles.map((h) => h.id),
    ).toEqual(['00000000-0000-4000-8000-000000000004::out']);
  });
});

describe('graphCardIds', () => {
  it('lists a graph’s distinct cards', () => {
    expect(graphCardIds(space, uuid('00000000-0000-4000-8000-000000000004'))).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000003'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
    expect(graphCardIds(space, uuid('00000000-0000-4000-8000-000000000031'))).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
    expect(graphCardIds(space, uuid('00000000-0000-4000-8000-000000000099'))).toEqual([]);
  });
});

describe('cardIdsForGraphs', () => {
  it('unions several graphs, keeping each card once', () => {
    expect(
      cardIdsForGraphs(space, [
        uuid('00000000-0000-4000-8000-000000000004'),
        uuid('00000000-0000-4000-8000-000000000031'),
      ]),
    ).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000003'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
  });

  it('orders by the graphs given, then by authored edge order within each', () => {
    // quick first, so c is listed before b.
    expect(
      cardIdsForGraphs(space, [
        uuid('00000000-0000-4000-8000-000000000031'),
        uuid('00000000-0000-4000-8000-000000000004'),
      ]),
    ).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000005'),
      uuid('00000000-0000-4000-8000-000000000003'),
    ]);
  });

  it('ignores unknown graph ids', () => {
    const missing = uuid('00000000-0000-4000-8000-000000000099');
    expect(cardIdsForGraphs(space, [missing])).toEqual([]);
    expect(
      cardIdsForGraphs(space, [uuid('00000000-0000-4000-8000-000000000031'), missing]),
    ).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
  });

  it('returns nothing for no graphs', () => {
    expect(cardIdsForGraphs(space, [])).toEqual([]);
  });
});

describe('filterHandlesByGraph', () => {
  it('keeps only the selected graph’s handles', () => {
    const quick = filterHandlesByGraph(
      buildCardHandles(space),
      uuid('00000000-0000-4000-8000-000000000031'),
    );
    // c is shared, but only its quick inbound port survives the filter.
    expect(
      quick.get(uuid('00000000-0000-4000-8000-000000000005'))!.targetHandles.map((h) => h.id),
    ).toEqual(['00000000-0000-4000-8000-000000000031::in']);
    expect(quick.get(uuid('00000000-0000-4000-8000-000000000003'))).toBeUndefined(); // b is only on main
  });
});

describe('filterHandlesByGraphs', () => {
  it('keeps a shared card’s handles for every graph given', () => {
    const both = filterHandlesByGraphs(buildCardHandles(space), [
      uuid('00000000-0000-4000-8000-000000000004'),
      uuid('00000000-0000-4000-8000-000000000031'),
    ]);
    // The multi-graph case: c carries one inbound handle per graph arriving.
    expect(
      both.get(uuid('00000000-0000-4000-8000-000000000005'))!.targetHandles.map((h) => h.id),
    ).toEqual([
      '00000000-0000-4000-8000-000000000004::in',
      '00000000-0000-4000-8000-000000000031::in',
    ]);
    expect(
      both.get(uuid('00000000-0000-4000-8000-000000000002'))!.sourceHandles.map((h) => h.id),
    ).toEqual([
      '00000000-0000-4000-8000-000000000004::out',
      '00000000-0000-4000-8000-000000000031::out',
    ]);
    expect(
      both.get(uuid('00000000-0000-4000-8000-000000000003'))!.targetHandles.map((h) => h.id),
    ).toEqual(['00000000-0000-4000-8000-000000000004::in']);
  });

  it('drops cards left with no handles at all', () => {
    const quickOnly = filterHandlesByGraphs(buildCardHandles(space), [
      uuid('00000000-0000-4000-8000-000000000031'),
    ]);
    expect(quickOnly.get(uuid('00000000-0000-4000-8000-000000000003'))).toBeUndefined();
  });
});

describe('buildGraphRenderEdges', () => {
  const edges = buildGraphRenderEdges(space);

  it('produces one edge per authored edge, connected via graph ports', () => {
    expect(edges).toHaveLength(3);
    expect(edges).toContainEqual({
      id: '00000000-0000-4000-8000-000000000004::0',
      graphId: uuid('00000000-0000-4000-8000-000000000004'),
      source: uuid('00000000-0000-4000-8000-000000000002'),
      target: uuid('00000000-0000-4000-8000-000000000003'),
      sourceHandle: '00000000-0000-4000-8000-000000000004::out',
      targetHandle: '00000000-0000-4000-8000-000000000004::in',
    });
    expect(edges).toContainEqual({
      id: '00000000-0000-4000-8000-000000000031::0',
      graphId: uuid('00000000-0000-4000-8000-000000000031'),
      source: uuid('00000000-0000-4000-8000-000000000002'),
      target: uuid('00000000-0000-4000-8000-000000000005'),
      sourceHandle: '00000000-0000-4000-8000-000000000031::out',
      targetHandle: '00000000-0000-4000-8000-000000000031::in',
    });
  });

  it('gives each of a fork’s edges its own id, sharing one outbound port', () => {
    const forked = loadSpace(
      {
        version: 1,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'Fork',
        layouts: [
          {
            id: uuid('00000000-0000-4000-8000-000000000022'),
            title: 'Working',
            positions: {
              [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 0, open: false },
              [uuid('00000000-0000-4000-8000-000000000003')]: { x: 320, y: 0, open: false },
              [uuid('00000000-0000-4000-8000-000000000005')]: { x: 320, y: 200, open: false },
            },
            graphs: [
              {
                id: uuid('00000000-0000-4000-8000-000000000004'),
                title: 'Main',
                edges: [
                  {
                    from: uuid('00000000-0000-4000-8000-000000000002'),
                    to: uuid('00000000-0000-4000-8000-000000000003'),
                  },
                  {
                    from: uuid('00000000-0000-4000-8000-000000000002'),
                    to: uuid('00000000-0000-4000-8000-000000000005'),
                  },
                ],
              },
            ],
          },
        ],
      },
      [
        cardFile(uuid('00000000-0000-4000-8000-000000000002')),
        cardFile(uuid('00000000-0000-4000-8000-000000000003')),
        cardFile(uuid('00000000-0000-4000-8000-000000000005')),
      ],
    );
    if (!forked.ok) throw new Error('fixture should load');
    const forkEdges = buildGraphRenderEdges(forked.space);
    expect(forkEdges.map((e) => e.id)).toEqual([
      '00000000-0000-4000-8000-000000000004::0',
      '00000000-0000-4000-8000-000000000004::1',
    ]);
    expect(forkEdges.map((e) => e.sourceHandle)).toEqual([
      '00000000-0000-4000-8000-000000000004::out',
      '00000000-0000-4000-8000-000000000004::out',
    ]);
    expect(forkEdges.map((e) => e.target)).toEqual([
      uuid('00000000-0000-4000-8000-000000000003'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
  });
});
