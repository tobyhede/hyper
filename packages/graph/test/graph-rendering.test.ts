import { describe, expect, it } from 'vitest';
import { buildGraphRenderEdges, loadSpace, graphResourceIds, type Space } from '../src/index';
// Internal to the package, so not reachable through what it offers.
import { resourceIdsForGraphs } from '../src/graph-rendering';
import { resourceFile, uuid } from './resource-files';

// a → b → c  (main),  a → c  (quick): c is shared, a fans out.
function loadFixture(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Test',
      maps: [
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
      resourceFile(uuid('00000000-0000-4000-8000-000000000002')),
      resourceFile(uuid('00000000-0000-4000-8000-000000000003')),
      resourceFile(uuid('00000000-0000-4000-8000-000000000005')),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

const space = loadFixture();

describe('graphResourceIds', () => {
  it('lists a graph’s distinct resources', () => {
    expect(graphResourceIds(space, uuid('00000000-0000-4000-8000-000000000004'))).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000003'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
    expect(graphResourceIds(space, uuid('00000000-0000-4000-8000-000000000031'))).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
    expect(graphResourceIds(space, uuid('00000000-0000-4000-8000-000000000099'))).toEqual([]);
  });
});

describe('resourceIdsForGraphs', () => {
  it('unions several graphs, keeping each resource once', () => {
    expect(
      resourceIdsForGraphs(space, [
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
      resourceIdsForGraphs(space, [
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
    expect(resourceIdsForGraphs(space, [missing])).toEqual([]);
    expect(
      resourceIdsForGraphs(space, [uuid('00000000-0000-4000-8000-000000000031'), missing]),
    ).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
  });

  it('returns nothing for no graphs', () => {
    expect(resourceIdsForGraphs(space, [])).toEqual([]);
  });
});

describe('buildGraphRenderEdges', () => {
  const edges = buildGraphRenderEdges(space);

  /**
   * **The invariant the id format now leans on, asserted rather than assumed.**
   *
   * The position-keyed id it replaced was collision-proof by construction; this
   * one is unique only because a Graph cannot hold the same pair twice (ADR
   * 0032). What holds that up is intake's `duplicate-graph-edge` and Space
   * Authoring's `edge-already-exists`, neither of which lives here — so relaxing
   * either would mint the same id twice with nothing in this package noticing.
   * A duplicate id is a duplicate React key, and one Edge's selection change
   * resolving to the other in the render adapter's `changeEdges` fold.
   *
   * Two Graphs sharing a pair is the case worth pinning, because it is legal:
   * `Main` and `Quick` both run between the same Resources here, and only the Graph
   * prefix separates them.
   */
  it('mints one distinct id per authored edge across every graph', () => {
    const ids = edges.map((edge) => edge.id);
    expect(new Set(ids).size).toBe(ids.length);

    const shared = loadSpace(
      {
        version: 1,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'Test',
        maps: [
          {
            id: uuid('00000000-0000-4000-8000-000000000022'),
            title: 'Working',
            positions: {
              [uuid('00000000-0000-4000-8000-000000000002')]: { x: 0, y: 0, open: false },
              [uuid('00000000-0000-4000-8000-000000000003')]: { x: 320, y: 0, open: false },
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
                ],
              },
              {
                id: uuid('00000000-0000-4000-8000-000000000031'),
                title: 'Quick',
                edges: [
                  {
                    from: uuid('00000000-0000-4000-8000-000000000002'),
                    to: uuid('00000000-0000-4000-8000-000000000003'),
                  },
                ],
              },
            ],
          },
        ],
      },
      [
        resourceFile(uuid('00000000-0000-4000-8000-000000000002')),
        resourceFile(uuid('00000000-0000-4000-8000-000000000003')),
      ],
    );
    expect(shared.ok).toBe(true);
    if (!shared.ok) return;

    const sharedIds = buildGraphRenderEdges(shared.space).map((edge) => edge.id);
    expect(sharedIds).toHaveLength(2);
    expect(new Set(sharedIds).size).toBe(2);
  });

  it('produces one edge per authored edge, naming the two Resources it joins', () => {
    expect(edges).toHaveLength(3);
    expect(edges).toContainEqual({
      id: '00000000-0000-4000-8000-000000000004::00000000-0000-4000-8000-000000000002::00000000-0000-4000-8000-000000000003',
      graphId: uuid('00000000-0000-4000-8000-000000000004'),
      source: uuid('00000000-0000-4000-8000-000000000002'),
      target: uuid('00000000-0000-4000-8000-000000000003'),
    });
    expect(edges).toContainEqual({
      id: '00000000-0000-4000-8000-000000000031::00000000-0000-4000-8000-000000000002::00000000-0000-4000-8000-000000000005',
      graphId: uuid('00000000-0000-4000-8000-000000000031'),
      source: uuid('00000000-0000-4000-8000-000000000002'),
      target: uuid('00000000-0000-4000-8000-000000000005'),
    });
  });

  /**
   * **The id names the Edge, so removing another Edge does not rename it.**
   *
   * A Graph cannot hold the same pair twice (ADR 0032), so the Graph and the two
   * endpoints identify the Edge — which is exactly the triple the render layer
   * compares an Edge selection by (`sameEdgeSubject`). Keyed on the Edge's
   * position instead, every id after a removed or replaced Edge slid down one,
   * and the surviving Edges silently inherited ids that had named their
   * neighbours: the element React Flow had already drawn for the departed Edge
   * answered a query for whichever Edge took its slot.
   */
  it('leaves a surviving edge’s id unchanged when an earlier edge is removed', () => {
    const before = buildGraphRenderEdges(space).map((edge) => edge.id);
    const shortened = loadSpace(
      {
        version: 1,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'Test',
        maps: [
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
                // `Main`'s first Edge, a→b, is gone; b→c is all that is left.
                edges: [
                  {
                    from: uuid('00000000-0000-4000-8000-000000000003'),
                    to: uuid('00000000-0000-4000-8000-000000000005'),
                  },
                ],
              },
            ],
          },
        ],
      },
      [
        resourceFile(uuid('00000000-0000-4000-8000-000000000002')),
        resourceFile(uuid('00000000-0000-4000-8000-000000000003')),
        resourceFile(uuid('00000000-0000-4000-8000-000000000005')),
      ],
    );
    if (!shortened.ok) throw new Error('fixture should load');

    const survivor = buildGraphRenderEdges(shortened.space).map((edge) => edge.id);

    expect(survivor).toEqual([
      '00000000-0000-4000-8000-000000000004::00000000-0000-4000-8000-000000000003::00000000-0000-4000-8000-000000000005',
    ]);
    expect(before).toContain(survivor[0]);
  });

  it('gives each of a fork’s edges its own id', () => {
    const forked = loadSpace(
      {
        version: 1,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'Fork',
        maps: [
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
        resourceFile(uuid('00000000-0000-4000-8000-000000000002')),
        resourceFile(uuid('00000000-0000-4000-8000-000000000003')),
        resourceFile(uuid('00000000-0000-4000-8000-000000000005')),
      ],
    );
    if (!forked.ok) throw new Error('fixture should load');
    const forkEdges = buildGraphRenderEdges(forked.space);
    expect(forkEdges.map((e) => e.id)).toEqual([
      '00000000-0000-4000-8000-000000000004::00000000-0000-4000-8000-000000000002::00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004::00000000-0000-4000-8000-000000000002::00000000-0000-4000-8000-000000000005',
    ]);
    expect(forkEdges.map((e) => e.source)).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000002'),
    ]);
    expect(forkEdges.map((e) => e.target)).toEqual([
      uuid('00000000-0000-4000-8000-000000000003'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
  });
});
