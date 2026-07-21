import { describe, expect, it } from 'vitest';
import { buildCardHandles, buildLayoutGraph, buildRouteEdges, gridLayout } from '../src/index';
import type { LayoutGraph } from '../src/index';
import type { Manifest } from '@project/core';

const manifest: Manifest = {
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
};

const SIZE = { width: 100, height: 50 };

describe('buildLayoutGraph', () => {
  it('carries each card’s size and its ports, inbound first', () => {
    const graph = buildLayoutGraph(
      ['a', 'b', 'c'],
      buildCardHandles(manifest),
      buildRouteEdges(manifest),
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
      buildCardHandles(manifest),
      buildRouteEdges(manifest),
      SIZE,
    );
    expect(graph.edges.map((e) => e.id)).toEqual(['main::0']);
  });
});

describe('gridLayout', () => {
  const graph: LayoutGraph = buildLayoutGraph(
    ['a', 'b', 'c'],
    buildCardHandles(manifest),
    buildRouteEdges(manifest),
    SIZE,
  );

  it('is synchronous — a layout need not be async', () => {
    const laid = gridLayout()(graph);
    expect(laid).not.toBeInstanceOf(Promise);
  });

  it('places cards in reading order, wrapping at the column count', () => {
    const laid = gridLayout({ columns: 2, gap: 10 })(graph) as LayoutGraph;
    expect(laid.cards.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [110, 0],
      [0, 60],
    ]);
  });

  it('never places ports, leaving the render layer to spread them', () => {
    const laid = gridLayout()(graph) as LayoutGraph;
    for (const card of laid.cards) {
      for (const port of card.ports) {
        expect(port.y).toBeUndefined();
      }
    }
  });

  it('ignores the edges entirely', () => {
    const withoutEdges = gridLayout()({ ...graph, edges: [] }) as LayoutGraph;
    const withEdges = gridLayout()(graph) as LayoutGraph;
    expect(withoutEdges.cards).toEqual(withEdges.cards);
  });

  it('handles an empty graph', () => {
    expect((gridLayout()({ cards: [], edges: [] }) as LayoutGraph).cards).toEqual([]);
  });
});
