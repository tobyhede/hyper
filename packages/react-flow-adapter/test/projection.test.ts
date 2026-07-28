import { describe, expect, it } from 'vitest';
import { buildCardHandles, buildRouteEdges, loadSpace, type Space } from '@project/graph';
import { projectCardNodes, projectRouteEdges, type RouteEmphasis } from '../src/index';
import { aliasFile, cardFile } from './card-files';

function load(
  input: unknown,
  cardFiles = [
    cardFile('00000000-0000-4000-8000-000000000002', 'Card A'),
    cardFile('00000000-0000-4000-8000-000000000003', 'Card B'),
  ],
): Space {
  const result = loadSpace(input, cardFiles);
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

const space = load({
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
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000030',
      title: 'Alt',
      edges: [
        {
          from: '00000000-0000-4000-8000-000000000003',
          to: '00000000-0000-4000-8000-000000000002',
        },
      ],
    },
  ],
});

const colors = {
  '00000000-0000-4000-8000-000000000004': '#111111',
  '00000000-0000-4000-8000-000000000030': '#222222',
};
const handles = buildCardHandles(space);

describe('projectCardNodes', () => {
  it('maps cards to card nodes carrying the title, not the content', () => {
    const nodes = projectCardNodes(space, handles, colors);
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    expect(a.type).toBe('card');
    expect(a.data.title).toBe('Card A');
    expect(a.data.active).toBe(false);
    // ADR 0006: content is loaded when a card is opened, not embedded per node.
    expect('markdown' in a.data).toBe(false);
  });

  it("carries a card's description when it has one, and omits it otherwise", () => {
    const described = load(
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
            ],
          },
        ],
      },
      [
        {
          path: 'cards/a.md',
          text: '---\nid: 00000000-0000-4000-8000-000000000002\ntitle: Card A\ndescription: What A is\n---\n',
        },
        cardFile('00000000-0000-4000-8000-000000000003', 'Card B'),
      ],
    );
    const nodes = projectCardNodes(described, buildCardHandles(described), colors);
    expect(
      nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!.data.description,
    ).toBe('What A is');
    // Absent, not undefined — a card with no description carries no key.
    expect(
      'description' in nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.data,
    ).toBe(false);
  });

  it('attaches per-route handles colored by route', () => {
    const nodes = projectCardNodes(space, handles, colors);
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    // main leaves card a (out); alt ends at card a (in).
    expect(a.data.sourceHandles).toMatchObject([
      {
        id: '00000000-0000-4000-8000-000000000004::out',
        routeId: '00000000-0000-4000-8000-000000000004',
        color: '#111111',
      },
    ]);
    expect(a.data.targetHandles).toMatchObject([
      {
        id: '00000000-0000-4000-8000-000000000030::in',
        routeId: '00000000-0000-4000-8000-000000000030',
        color: '#222222',
      },
    ]);
    // A vertical offset is always assigned (even spread before ELK runs).
    expect(typeof a.data.sourceHandles[0]!.offsetY).toBe('number');
  });

  it('uses the port offsets and positions a layout put on the cards', () => {
    const nodes = projectCardNodes(space, handles, colors, {
      layoutGraph: {
        cards: [
          {
            id: '00000000-0000-4000-8000-000000000002',
            x: 500,
            y: 600,
            width: 260,
            height: 300,
            ports: [
              { id: '00000000-0000-4000-8000-000000000004::out', side: 'out', x: 260, y: 42 },
            ],
          },
        ],
        edges: [],
      },
    });
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    expect(a.position).toEqual({ x: 500, y: 600 });
    expect(a.data.sourceHandles[0]!.offsetY).toBe(42);
    // card b is absent from the layout → falls back to the origin (no authored position).
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.position).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('flags the active card', () => {
    const nodes = projectCardNodes(space, handles, colors, {
      activeCardId: '00000000-0000-4000-8000-000000000003',
    });
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.data.active).toBe(
      true,
    );
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.className).toContain(
      'rf-card-node--active',
    );
  });

  it('marks an alias node with the title of the card it shows', () => {
    const withAlias = load(
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
                to: '00000000-0000-4000-8000-000000000007',
              },
            ],
          },
        ],
      },
      [
        cardFile('00000000-0000-4000-8000-000000000002', 'Card A'),
        aliasFile(
          '00000000-0000-4000-8000-000000000007',
          'Card A, again',
          '00000000-0000-4000-8000-000000000002',
        ),
      ],
    );
    const nodes = projectCardNodes(withAlias, buildCardHandles(withAlias), colors);
    // A markdown card is nobody's alias.
    expect(
      nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!.data.aliasOf,
    ).toBeUndefined();
    // The alias carries its target's title, so the node can name what it redraws.
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000007')!.data.aliasOf).toBe(
      'Card A',
    );
  });
});

describe('projectRouteEdges', () => {
  const routeEdges = buildRouteEdges(space);

  it('maps route edges to colored, port-connected React Flow edges', () => {
    const edges = projectRouteEdges(routeEdges, colors);
    expect(edges).toHaveLength(2);
    const mainEdge = edges.find((e) => e.id === '00000000-0000-4000-8000-000000000004::0')!;
    expect(mainEdge).toMatchObject({
      type: 'routed',
      source: '00000000-0000-4000-8000-000000000002',
      target: '00000000-0000-4000-8000-000000000003',
      sourceHandle: '00000000-0000-4000-8000-000000000004::out',
      targetHandle: '00000000-0000-4000-8000-000000000004::in',
    });
    expect(mainEdge.style?.stroke).toBe('#111111');
  });

  it("carries ELK's routed points when a layout has placed them", () => {
    const edges = projectRouteEdges(routeEdges, colors, {
      layoutGraph: {
        cards: [],
        edges: [
          {
            id: '00000000-0000-4000-8000-000000000004::0',
            source: '00000000-0000-4000-8000-000000000002',
            target: '00000000-0000-4000-8000-000000000003',
            sourceHandle: '00000000-0000-4000-8000-000000000004::out',
            targetHandle: '00000000-0000-4000-8000-000000000004::in',
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
    expect(
      edges.find((e) => e.id === '00000000-0000-4000-8000-000000000004::0')!.data,
    ).toMatchObject({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 4 },
      ],
    });
    // An edge the layout did not route carries no `points` key at all (bezier
    // fallback). The key is omitted, not set to undefined (exactOptionalPropertyTypes).
    expect(
      edges.find((e) => e.id === '00000000-0000-4000-8000-000000000030::0')!.data,
    ).not.toHaveProperty('points');
  });

  it('draws every route the same when nothing is emphasised', () => {
    const edges = projectRouteEdges(routeEdges, colors, { emphasis: 'equal' });
    expect(edges.every((e) => e.style?.opacity === 1)).toBe(true);
    expect(edges.every((e) => e.animated)).toBe(true);
  });

  it('recedes the other routes, never hiding them', () => {
    const at = (emphasis: RouteEmphasis) => {
      const edges = projectRouteEdges(routeEdges, colors, {
        emphasis,
        activeRouteId: '00000000-0000-4000-8000-000000000004',
      });
      return {
        '00000000-0000-4000-8000-000000000004': edges.find(
          (e) => e.id === '00000000-0000-4000-8000-000000000004::0',
        )!,
        '00000000-0000-4000-8000-000000000030': edges.find(
          (e) => e.id === '00000000-0000-4000-8000-000000000030::0',
        )!,
        count: edges.length,
      };
    };

    const equal = at('equal');
    const subtle = at('subtle');

    // The emphasised route is untouched at either level.
    expect(equal['00000000-0000-4000-8000-000000000004'].style?.opacity).toBe(1);
    expect(subtle['00000000-0000-4000-8000-000000000004'].style?.opacity).toBe(1);
    expect(subtle['00000000-0000-4000-8000-000000000004'].animated).toBe(true);

    // Others recede but are still drawn, and none are dropped.
    expect(Number(subtle['00000000-0000-4000-8000-000000000030'].style?.opacity)).toBeLessThan(
      Number(equal['00000000-0000-4000-8000-000000000030'].style?.opacity),
    );
    expect(Number(subtle['00000000-0000-4000-8000-000000000030'].style?.opacity)).toBeGreaterThan(
      0,
    );
    expect(subtle.count).toBe(equal.count);
  });
});
