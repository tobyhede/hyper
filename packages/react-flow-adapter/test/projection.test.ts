import { describe, expect, it } from 'vitest';
import type { Manifest } from '@project/core';
import { buildCardHandles, buildRouteEdges } from '@project/graph';
import { projectCardNodes, projectRouteEdges, type RouteEmphasis } from '../src/index';

const manifest: Manifest = {
  version: 1,
  title: 'Test',
  cards: [
    { id: 'a', title: 'Card A', content: 'cards/a.md' },
    { id: 'b', title: 'Card B', content: 'cards/b.md' },
  ],
  routes: [
    { id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }] },
    { id: 'alt', title: 'Alt', steps: [{ target: 'b' }, { target: 'a' }] },
  ],
};

const markdown = { a: '# A body', b: '# B body' };
const colors = { main: '#111111', alt: '#222222' };
const handles = buildCardHandles(manifest);

describe('projectCardNodes', () => {
  it('maps cards to card nodes with resolved markdown and title', () => {
    const nodes = projectCardNodes(manifest, markdown, handles, colors);
    const a = nodes.find((n) => n.id === 'a')!;
    expect(a.type).toBe('card');
    expect(a.data.title).toBe('Card A');
    expect(a.data.markdown).toBe('# A body');
    expect(a.data.active).toBe(false);
  });

  it('attaches per-route handles colored by route', () => {
    const nodes = projectCardNodes(manifest, markdown, handles, colors);
    const a = nodes.find((n) => n.id === 'a')!;
    // main leaves card a (out); alt ends at card a (in).
    expect(a.data.sourceHandles).toMatchObject([
      { id: 'main::out', routeId: 'main', color: '#111111' },
    ]);
    expect(a.data.targetHandles).toMatchObject([
      { id: 'alt::in', routeId: 'alt', color: '#222222' },
    ]);
    // A vertical offset is always assigned (even spread before ELK runs).
    expect(typeof a.data.sourceHandles[0]!.offsetY).toBe('number');
  });

  it('uses the port offsets and positions a layout put on the cards', () => {
    const nodes = projectCardNodes(manifest, markdown, handles, colors, {
      layoutGraph: {
        cards: [
          {
            id: 'a',
            x: 500,
            y: 600,
            width: 260,
            height: 300,
            ports: [{ id: 'main::out', side: 'out', x: 260, y: 42 }],
          },
        ],
        edges: [],
      },
    });
    const a = nodes.find((n) => n.id === 'a')!;
    expect(a.position).toEqual({ x: 500, y: 600 });
    expect(a.data.sourceHandles[0]!.offsetY).toBe(42);
    // card b is absent from the layout → falls back to the origin (no authored position).
    expect(nodes.find((n) => n.id === 'b')!.position).toEqual({ x: 0, y: 0 });
  });

  it('flags the active card', () => {
    const nodes = projectCardNodes(manifest, markdown, handles, colors, { activeCardId: 'b' });
    expect(nodes.find((n) => n.id === 'b')!.data.active).toBe(true);
    expect(nodes.find((n) => n.id === 'b')!.className).toContain('rf-card-node--active');
  });
});

describe('projectRouteEdges', () => {
  const routeEdges = buildRouteEdges(manifest);

  it('maps route edges to colored, port-connected React Flow edges', () => {
    const edges = projectRouteEdges(routeEdges, colors);
    expect(edges).toHaveLength(2);
    const mainEdge = edges.find((e) => e.id === 'main::0')!;
    expect(mainEdge).toMatchObject({
      source: 'a',
      target: 'b',
      sourceHandle: 'main::out',
      targetHandle: 'main::in',
    });
    expect(mainEdge.style?.stroke).toBe('#111111');
  });

  it('draws every route the same when nothing is emphasised', () => {
    const edges = projectRouteEdges(routeEdges, colors, { emphasis: 'equal' });
    expect(edges.every((e) => e.style?.opacity === 1)).toBe(true);
    expect(edges.every((e) => e.animated)).toBe(true);
  });

  it('recedes the other routes by the level asked for, never hiding them', () => {
    const at = (emphasis: RouteEmphasis) => {
      const edges = projectRouteEdges(routeEdges, colors, { emphasis, activeRouteId: 'main' });
      return {
        main: edges.find((e) => e.id === 'main::0')!,
        alt: edges.find((e) => e.id === 'alt::0')!,
        count: edges.length,
      };
    };

    const subtle = at('subtle');
    const strong = at('strong');

    // The emphasised route is untouched at either level.
    expect(subtle.main.style?.opacity).toBe(1);
    expect(strong.main.style?.opacity).toBe(1);
    expect(subtle.main.animated).toBe(true);

    // Others recede, further while presenting — but are still drawn.
    expect(Number(subtle.alt.style?.opacity)).toBeLessThan(1);
    expect(Number(strong.alt.style?.opacity)).toBeLessThan(Number(subtle.alt.style?.opacity));
    expect(Number(strong.alt.style?.opacity)).toBeGreaterThan(0);
    expect(subtle.count).toBe(strong.count);
  });
});
