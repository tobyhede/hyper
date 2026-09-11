import { describe, expect, it } from 'vitest';
import {
  buildLayoutStrategyGraph,
  buildGraphRenderEdges,
  gridStrategy,
  loadSpace,
} from '../src/index';
import type { LayoutStrategyGraph, Space } from '../src/index';
import { thingFile, uuid } from './thing-files';

function loadFixture(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'T',
      diagrams: [
        {
          id: '00000000-0000-4000-8000-000000000022',
          title: 'Working',
          positions: {
            '00000000-0000-4000-8000-000000000002': { x: 0, y: 0, open: false },
            '00000000-0000-4000-8000-000000000003': { x: 320, y: 0, open: false },
            '00000000-0000-4000-8000-000000000005': { x: 640, y: 0, open: false },
          },
          graphs: [
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
          ],
        },
      ],
    },
    [
      thingFile('00000000-0000-4000-8000-000000000002'),
      thingFile('00000000-0000-4000-8000-000000000003'),
      thingFile('00000000-0000-4000-8000-000000000005'),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

const space = loadFixture();

const SIZE = { width: 100, height: 50 };

describe('buildLayoutStrategyGraph', () => {
  it('carries each thing’s size and nothing positioned', () => {
    const graph = buildLayoutStrategyGraph(
      [
        uuid('00000000-0000-4000-8000-000000000002'),
        uuid('00000000-0000-4000-8000-000000000003'),
        uuid('00000000-0000-4000-8000-000000000005'),
      ],
      buildGraphRenderEdges(space),
      () => SIZE,
    );

    const b = graph.things.find((t) => t.id === '00000000-0000-4000-8000-000000000003')!;
    expect(b).toMatchObject({ width: 100, height: 50 });
    // Nothing is positioned yet — that is the diagram's job. And a Thing carries
    // its rect and nothing else: the contract answers positions only (ADR 0086),
    // so the per-Graph anchors it used to carry are the render layer's alone.
    expect(Object.keys(b).sort()).toEqual(['height', 'id', 'width']);
    expect(b.x).toBeUndefined();
  });

  it('drops edges whose endpoints the view is not showing', () => {
    const graph = buildLayoutStrategyGraph(
      [uuid('00000000-0000-4000-8000-000000000002'), uuid('00000000-0000-4000-8000-000000000003')],
      buildGraphRenderEdges(space),
      () => SIZE,
    );
    expect(graph.edges.map((e) => e.id)).toEqual([
      '00000000-0000-4000-8000-000000000004::00000000-0000-4000-8000-000000000002::00000000-0000-4000-8000-000000000003',
    ]);
  });
});

describe('gridStrategy', () => {
  const graph: LayoutStrategyGraph = buildLayoutStrategyGraph(
    [
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000003'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ],
    buildGraphRenderEdges(space),
    () => SIZE,
  );

  it('satisfies the uniformly-async LayoutStrategy contract', () => {
    expect(gridStrategy()(graph)).toBeInstanceOf(Promise);
  });

  it('places things in reading order, wrapping at the column count', async () => {
    const laid = await gridStrategy({ columns: 2, gap: 10 })(graph);
    expect(laid.things.map((t) => [t.x, t.y])).toEqual([
      [0, 0],
      [110, 0],
      [0, 60],
    ]);
  });

  it('ignores the edges entirely', async () => {
    const withoutEdges = await gridStrategy()({ ...graph, edges: [] });
    const withEdges = await gridStrategy()(graph);
    expect(withoutEdges.things).toEqual(withEdges.things);
  });

  it('handles an empty graph', async () => {
    expect((await gridStrategy()({ things: [], edges: [] })).things).toEqual([]);
  });
});
