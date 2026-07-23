import { describe, expect, it } from 'vitest';
import {
  buildCardHandles,
  buildLayoutGraph,
  buildRouteEdges,
  gridStrategy,
  loadSpace,
} from '../src/index';
import type { LayoutGraph, Space } from '../src/index';

function loadFixture(): Space {
  const result = loadSpace({
    version: 1,
    title: 'T',
    cards: [
      { id: 'a', title: 'A', kind: 'markdown', content: 'a.md' },
      { id: 'b', title: 'B', kind: 'markdown', content: 'b.md' },
      { id: 'c', title: 'C', kind: 'markdown', content: 'c.md' },
    ],
    routes: [
      { id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }, { target: 'c' }] },
    ],
  });
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

const space = loadFixture();

const SIZE = { width: 100, height: 50 };

describe('buildLayoutGraph', () => {
  it('carries each card’s size and its ports, inbound first', () => {
    const graph = buildLayoutGraph(
      ['a', 'b', 'c'],
      buildCardHandles(space),
      buildRouteEdges(space),
      SIZE,
    );

    const b = graph.cards.find((c) => c.id === 'b')!;
    expect(b).toMatchObject({ width: 100, height: 50 });
    expect(b.ports).toEqual([
      { id: 'main::in', side: 'in' },
      { id: 'main::out', side: 'out' },
    ]);
    // Nothing is positioned yet — that is the layout's job.
    expect(b.x).toBeUndefined();
  });

  it('drops edges whose endpoints the view is not showing', () => {
    const graph = buildLayoutGraph(
      ['a', 'b'],
      buildCardHandles(space),
      buildRouteEdges(space),
      SIZE,
    );
    expect(graph.edges.map((e) => e.id)).toEqual(['main::0']);
  });
});

describe('gridStrategy', () => {
  const graph: LayoutGraph = buildLayoutGraph(
    ['a', 'b', 'c'],
    buildCardHandles(space),
    buildRouteEdges(space),
    SIZE,
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
