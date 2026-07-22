import { describe, expect, it } from 'vitest';
import { buildCardHandles, buildRouteEdges, loadSpace, type Space } from '@project/graph';
import { projectCardNodes, projectRouteEdges, type RouteEmphasis } from '../src/index';

function load(input: unknown): Space {
  const result = loadSpace(input);
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

const space = load({
  version: 1,
  title: 'Test',
  cards: [
    { id: 'a', title: 'Card A', kind: 'markdown', content: 'cards/a.md' },
    { id: 'b', title: 'Card B', kind: 'markdown', content: 'cards/b.md' },
  ],
  routes: [
    { id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }] },
    { id: 'alt', title: 'Alt', steps: [{ target: 'b' }, { target: 'a' }] },
  ],
});

const colors = { main: '#111111', alt: '#222222' };
const handles = buildCardHandles(space);

describe('projectCardNodes', () => {
  it('maps cards to card nodes carrying the title, not the content', () => {
    const nodes = projectCardNodes(space, handles, colors);
    const a = nodes.find((n) => n.id === 'a')!;
    expect(a.type).toBe('card');
    expect(a.data.title).toBe('Card A');
    expect(a.data.active).toBe(false);
    // ADR 0006: content is loaded when a card is opened, not embedded per node.
    expect('markdown' in a.data).toBe(false);
  });

  it('attaches per-route handles colored by route', () => {
    const nodes = projectCardNodes(space, handles, colors);
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
    const nodes = projectCardNodes(space, handles, colors, {
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
    const nodes = projectCardNodes(space, handles, colors, { activeCardId: 'b' });
    expect(nodes.find((n) => n.id === 'b')!.data.active).toBe(true);
    expect(nodes.find((n) => n.id === 'b')!.className).toContain('rf-card-node--active');
  });

  it('marks an alias node with the title of the card it shows', () => {
    const withAlias = load({
      version: 1,
      title: 'Test',
      cards: [
        { id: 'a', title: 'Card A', kind: 'markdown', content: 'cards/a.md' },
        { id: 'a-again', title: 'Card A, again', kind: 'alias', target: 'a' },
      ],
      routes: [{ id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'a-again' }] }],
    });
    const nodes = projectCardNodes(withAlias, buildCardHandles(withAlias), colors);
    // A markdown card is nobody's alias.
    expect(nodes.find((n) => n.id === 'a')!.data.aliasOf).toBeUndefined();
    // The alias carries its target's title, so the node can name what it redraws.
    expect(nodes.find((n) => n.id === 'a-again')!.data.aliasOf).toBe('Card A');
  });
});

describe('projectRouteEdges', () => {
  const routeEdges = buildRouteEdges(space);

  it('maps route edges to colored, port-connected React Flow edges', () => {
    const edges = projectRouteEdges(routeEdges, colors);
    expect(edges).toHaveLength(2);
    const mainEdge = edges.find((e) => e.id === 'main::0')!;
    expect(mainEdge).toMatchObject({
      type: 'routed',
      source: 'a',
      target: 'b',
      sourceHandle: 'main::out',
      targetHandle: 'main::in',
    });
    expect(mainEdge.style?.stroke).toBe('#111111');
  });

  it("carries ELK's routed points when a layout has placed them", () => {
    const edges = projectRouteEdges(routeEdges, colors, {
      layoutGraph: {
        cards: [],
        edges: [
          {
            id: 'main::0',
            source: 'a',
            target: 'b',
            sourceHandle: 'main::out',
            targetHandle: 'main::in',
            sections: [
              {
                startPoint: { x: 0, y: 0 },
                endPoint: { x: 10, y: 4 },
                bendPoints: [{ x: 5, y: 0 }],
              },
            ],
          },
        ],
      },
    });
    // start → bends → end, flattened for the custom edge to draw.
    expect(edges.find((e) => e.id === 'main::0')!.data).toMatchObject({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 4 },
      ],
    });
    // An edge the layout did not route carries no `points` key at all (bezier
    // fallback). The key is omitted, not set to undefined (exactOptionalPropertyTypes).
    expect(edges.find((e) => e.id === 'alt::0')!.data).not.toHaveProperty('points');
  });

  it('draws every route the same when nothing is emphasised', () => {
    const edges = projectRouteEdges(routeEdges, colors, { emphasis: 'equal' });
    expect(edges.every((e) => e.style?.opacity === 1)).toBe(true);
    expect(edges.every((e) => e.animated)).toBe(true);
  });

  it('recedes the other routes, never hiding them', () => {
    const at = (emphasis: RouteEmphasis) => {
      const edges = projectRouteEdges(routeEdges, colors, { emphasis, activeRouteId: 'main' });
      return {
        main: edges.find((e) => e.id === 'main::0')!,
        alt: edges.find((e) => e.id === 'alt::0')!,
        count: edges.length,
      };
    };

    const equal = at('equal');
    const subtle = at('subtle');

    // The emphasised route is untouched at either level.
    expect(equal.main.style?.opacity).toBe(1);
    expect(subtle.main.style?.opacity).toBe(1);
    expect(subtle.main.animated).toBe(true);

    // Others recede but are still drawn, and none are dropped.
    expect(Number(subtle.alt.style?.opacity)).toBeLessThan(Number(equal.alt.style?.opacity));
    expect(Number(subtle.alt.style?.opacity)).toBeGreaterThan(0);
    expect(subtle.count).toBe(equal.count);
  });
});
