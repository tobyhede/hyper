import { describe, expect, it } from 'vitest';
import {
  buildCardHandles,
  buildLayoutStrategyGraph,
  buildGraphRenderEdges,
  gridStrategy,
  loadSpace,
} from '../src/index';
import type { LayoutStrategyGraph, Space } from '../src/index';
import { cardFile, uuid } from './card-files';

function loadFixture(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'T',
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000022',
          title: 'Working',
          positions: {
            '00000000-0000-4000-8000-000000000002': { x: 0, y: 0 },
            '00000000-0000-4000-8000-000000000003': { x: 320, y: 0 },
            '00000000-0000-4000-8000-000000000005': { x: 640, y: 0 },
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
      cardFile('00000000-0000-4000-8000-000000000002'),
      cardFile('00000000-0000-4000-8000-000000000003'),
      cardFile('00000000-0000-4000-8000-000000000005'),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

const space = loadFixture();

const SIZE = { width: 100, height: 50 };

describe('buildLayoutStrategyGraph', () => {
  it('carries each card’s size and its ports, inbound first', () => {
    const graph = buildLayoutStrategyGraph(
      [
        uuid('00000000-0000-4000-8000-000000000002'),
        uuid('00000000-0000-4000-8000-000000000003'),
        uuid('00000000-0000-4000-8000-000000000005'),
      ],
      buildCardHandles(space),
      buildGraphRenderEdges(space),
      () => SIZE,
    );

    const b = graph.cards.find((c) => c.id === '00000000-0000-4000-8000-000000000003')!;
    expect(b).toMatchObject({ width: 100, height: 50 });
    expect(b.ports).toEqual([
      { id: '00000000-0000-4000-8000-000000000004::in', side: 'in' },
      { id: '00000000-0000-4000-8000-000000000004::out', side: 'out' },
    ]);
    // Nothing is positioned yet — that is the layout's job.
    expect(b.x).toBeUndefined();
  });

  it('drops edges whose endpoints the view is not showing', () => {
    const graph = buildLayoutStrategyGraph(
      [uuid('00000000-0000-4000-8000-000000000002'), uuid('00000000-0000-4000-8000-000000000003')],
      buildCardHandles(space),
      buildGraphRenderEdges(space),
      () => SIZE,
    );
    expect(graph.edges.map((e) => e.id)).toEqual(['00000000-0000-4000-8000-000000000004::0']);
  });
});

describe('gridStrategy', () => {
  const graph: LayoutStrategyGraph = buildLayoutStrategyGraph(
    [
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000003'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ],
    buildCardHandles(space),
    buildGraphRenderEdges(space),
    () => SIZE,
  );

  it('satisfies the uniformly-async LayoutStrategy contract', () => {
    expect(gridStrategy()(graph)).toBeInstanceOf(Promise);
  });

  it('places cards in reading order, wrapping at the column count', async () => {
    const laid = await gridStrategy({ columns: 2, gap: 10 })(graph);
    expect(laid.cards.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [110, 0],
      [0, 60],
    ]);
  });

  it('never places ports, leaving the render layer to spread them', async () => {
    const laid = await gridStrategy()(graph);
    for (const card of laid.cards) {
      for (const port of card.ports) {
        expect(port.y).toBeUndefined();
      }
    }
  });

  it('ignores the edges entirely', async () => {
    const withoutEdges = await gridStrategy()({ ...graph, edges: [] });
    const withEdges = await gridStrategy()(graph);
    expect(withoutEdges.cards).toEqual(withEdges.cards);
  });

  it('handles an empty graph', async () => {
    expect((await gridStrategy()({ cards: [], edges: [] })).cards).toEqual([]);
  });
});
