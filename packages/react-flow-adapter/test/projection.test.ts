import { describe, expect, it } from 'vitest';
import {
  buildCardHandles,
  buildLayoutStrategyGraph,
  buildGraphRenderEdges,
  loadSpace,
  type Space,
} from '@project/graph';
import { projectCardNodes, projectGraphEdges, type GraphEmphasis } from '../src/index';
import { aliasFile, cardFile } from './card-files';
import { uuid } from './uuid';

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
  graphs: [
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
        graphs: [
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

  it('attaches per-graph handles colored by graph', () => {
    const nodes = projectCardNodes(space, handles, colors);
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    // main leaves card a (out); alt ends at card a (in).
    expect(a.data.sourceHandles).toMatchObject([
      {
        id: '00000000-0000-4000-8000-000000000004::out',
        graphId: '00000000-0000-4000-8000-000000000004',
        color: '#111111',
      },
    ]);
    expect(a.data.targetHandles).toMatchObject([
      {
        id: '00000000-0000-4000-8000-000000000030::in',
        graphId: '00000000-0000-4000-8000-000000000030',
        color: '#222222',
      },
    ]);
    // A vertical offset is always assigned (even spread before ELK runs).
    expect(typeof a.data.sourceHandles[0]!.offsetY).toBe('number');
  });

  it('uses the port offsets and positions a layout put on the cards', () => {
    const nodes = projectCardNodes(space, handles, colors, {
      strategyGraph: {
        cards: [
          {
            id: uuid('00000000-0000-4000-8000-000000000002'),
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

  it('declares an attachment point for every Graph on a card the layout has placed', () => {
    // A third Graph that never touches card A, so "every Graph" is distinguishable
    // from "every Graph this card is already on". A self-edge is authored structure
    // (ADR 0032), which is the cheapest way to keep it away from A.
    const withThirdGraph = load({
      version: 2,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Test',
      graphs: [
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
          id: '00000000-0000-4000-8000-000000000031',
          title: 'Solo',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000003',
              to: '00000000-0000-4000-8000-000000000003',
            },
          ],
        },
      ],
    });
    const palette = {
      '00000000-0000-4000-8000-000000000004': '#111111',
      '00000000-0000-4000-8000-000000000031': '#333333',
    };
    const nodes = projectCardNodes(withThirdGraph, buildCardHandles(withThirdGraph), palette, {
      strategyGraph: {
        cards: [
          {
            id: uuid('00000000-0000-4000-8000-000000000002'),
            x: 500,
            y: 600,
            width: 260,
            height: 300,
            ports: [
              { id: '00000000-0000-4000-8000-000000000004::out', side: 'out', x: 260, y: 42 },
            ],
          },
          {
            id: uuid('00000000-0000-4000-8000-000000000003'),
            x: 900,
            y: 600,
            width: 260,
            height: 300,
            ports: [{ id: '00000000-0000-4000-8000-000000000004::in', side: 'in', x: 0, y: 88 }],
          },
        ],
        edges: [],
      },
    });
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    const declared = new Map((a.handles ?? []).map((handle) => [handle.id, handle]));

    // Card A is only on Main, and only outbound. The rest are declared all the
    // same: React Flow resolves an Edge against the geometry the node carries, so
    // an Edge completed onto a card resolves in the render that first makes it
    // incident — before the projection that draws its anchor has run.
    expect(declared.get('00000000-0000-4000-8000-000000000004::out')?.type).toBe('source');
    expect(declared.get('00000000-0000-4000-8000-000000000004::in')?.type).toBe('target');
    expect(declared.get('00000000-0000-4000-8000-000000000031::out')?.type).toBe('source');
    expect(declared.get('00000000-0000-4000-8000-000000000031::in')?.type).toBe('target');

    // The ones the strategy placed sit at its port offsets, less half the 11px the
    // CSS draws the handle at, because React Flow centres a handle on the border.
    // Outbound on A, inbound on B — the two sides move independently.
    expect(declared.get('00000000-0000-4000-8000-000000000004::out')?.y).toBe(36.5);
    const b = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!;
    expect(
      (b.handles ?? []).find((handle) => handle.id === '00000000-0000-4000-8000-000000000004::in')
        ?.y,
    ).toBe(82.5);
  });

  it('declares every Graph attachment point when the colour map is incomplete', () => {
    const nodes = projectCardNodes(
      space,
      handles,
      {},
      {
        strategyGraph: {
          cards: [
            {
              id: uuid('00000000-0000-4000-8000-000000000002'),
              x: 500,
              y: 600,
              width: 260,
              height: 300,
              ports: [],
            },
          ],
          edges: [],
        },
      },
    );
    const a = nodes.find((node) => node.id === '00000000-0000-4000-8000-000000000002')!;
    const graphHandleIds = (a.handles ?? [])
      .map((handle) => handle.id)
      .filter((id) => id?.includes('::'));

    expect(graphHandleIds).toEqual([
      '00000000-0000-4000-8000-000000000004::in',
      '00000000-0000-4000-8000-000000000030::in',
      '00000000-0000-4000-8000-000000000004::out',
      '00000000-0000-4000-8000-000000000030::out',
    ]);
  });

  it('declares no geometry for a card the layout has not placed, leaving React Flow to measure it', () => {
    const nodes = projectCardNodes(space, handles, colors, {
      strategyGraph: {
        cards: [
          {
            id: uuid('00000000-0000-4000-8000-000000000002'),
            x: 500,
            y: 600,
            width: 260,
            height: 300,
            ports: [],
          },
        ],
        edges: [],
      },
    });
    const b = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!;

    // Both keys are absent together, and that pairing is load-bearing: React Flow
    // reads declared handles only when they are there, and re-measures a node that
    // carries no measured size. Declaring one without the other strands a card on
    // whichever half it kept.
    expect('handles' in b).toBe(false);
    expect('measured' in b).toBe(false);
  });

  it('flags the active card', () => {
    const nodes = projectCardNodes(space, handles, colors, {
      activeCardId: uuid('00000000-0000-4000-8000-000000000003'),
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
        graphs: [
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

describe('projectGraphEdges', () => {
  const graphRenderEdges = buildGraphRenderEdges(space);

  it('maps graph edges to colored, port-connected React Flow edges', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors);
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
    const edges = projectGraphEdges(graphRenderEdges, colors, {
      strategyGraph: {
        cards: [],
        edges: [
          {
            id: '00000000-0000-4000-8000-000000000004::0',
            source: uuid('00000000-0000-4000-8000-000000000002'),
            target: uuid('00000000-0000-4000-8000-000000000003'),
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

  it('draws every graph the same when nothing is emphasised', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors, { emphasis: 'equal' });
    expect(edges.every((e) => e.style?.opacity === 1)).toBe(true);
    expect(edges.every((e) => e.animated)).toBe(true);
  });

  it('recedes the other graphs, never hiding them', () => {
    const at = (emphasis: GraphEmphasis) => {
      const edges = projectGraphEdges(graphRenderEdges, colors, {
        emphasis,
        activeGraphId: uuid('00000000-0000-4000-8000-000000000004'),
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

    // The emphasised graph is untouched at either level.
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

/**
 * A Card declares an anchor for every Graph, including ones it is not on, so an
 * Edge completed onto it resolves in the render that first makes it incident.
 *
 * Those extra anchors have no DOM element, and React Flow picks the *closest*
 * declared handle within its connection radius. If one ever landed on the same
 * point as a visible authoring handle, a release near that point could resolve
 * to an anchor that cannot accept it. The fallback spreads them evenly down the
 * Card, so with an odd number of Graphs the middle one sits at exactly half the
 * height — where the Left and Right authoring handles are.
 */
describe('non-incident graph anchors versus the authoring handles', () => {
  const cardA = '00000000-0000-4000-8000-000000000002';
  const cardB = '00000000-0000-4000-8000-000000000003';

  const singleGraphSpace = load({
    version: 2,
    id: '00000000-0000-4000-8000-000000000001',
    title: 'One graph',
    graphs: [
      {
        id: '00000000-0000-4000-8000-000000000004',
        title: 'Only',
        edges: [{ from: cardA, to: cardA }],
      },
    ],
  });

  it('places a lone non-incident anchor exactly on the authoring handle centre', () => {
    const handlesByCard = buildCardHandles(singleGraphSpace);
    const cardIds = singleGraphSpace.cards.map((card) => card.id);
    const strategyGraph = buildLayoutStrategyGraph(
      cardIds,
      handlesByCard,
      buildGraphRenderEdges(singleGraphSpace),
      { width: 260, height: 146 },
    );
    const colors = { '00000000-0000-4000-8000-000000000004': '#6ea8fe' };
    const nodes = projectCardNodes(singleGraphSpace, handlesByCard, colors, { strategyGraph });
    const cardNode = nodes.find((node) => node.id === cardB);
    if (cardNode === undefined) throw new Error('Card B should be projected');
    const handles = cardNode.handles ?? [];

    const leftAuthoring = handles.find((handle) => handle.id === 'authoring-target-left');
    const graphAnchor = handles.find((handle) => handle.id?.endsWith('::in'));
    if (leftAuthoring === undefined || graphAnchor === undefined) {
      throw new Error('both a graph anchor and a left authoring handle should be declared');
    }

    const centre = (handle: { x?: number; y?: number; width?: number; height?: number }) => ({
      x: (handle.x ?? 0) + (handle.width ?? 0) / 2,
      y: (handle.y ?? 0) + (handle.height ?? 0) / 2,
    });

    expect(centre(graphAnchor)).toEqual(centre(leftAuthoring));
  });

  it('declares the authoring handles before the graph anchors', () => {
    const handlesByCard = buildCardHandles(singleGraphSpace);
    const cardIds = singleGraphSpace.cards.map((card) => card.id);
    const strategyGraph = buildLayoutStrategyGraph(
      cardIds,
      handlesByCard,
      buildGraphRenderEdges(singleGraphSpace),
      { width: 260, height: 146 },
    );
    const colors = { '00000000-0000-4000-8000-000000000004': '#6ea8fe' };
    const nodes = projectCardNodes(singleGraphSpace, handlesByCard, colors, { strategyGraph });
    const cardNode = nodes.find((node) => node.id === cardB);
    if (cardNode === undefined) throw new Error('Card B should be projected');
    const ids = (cardNode.handles ?? []).map((handle) => handle.id ?? '');

    // React Flow resolves an exact distance tie by array order, preferring a
    // handle of the opposite type — and both candidates here are targets. The
    // authoring handle is the one with a DOM element behind it, so it has to come
    // first or the release resolves to an anchor that cannot accept it.
    const authoringIndices = ids.flatMap((id, index) =>
      id.startsWith('authoring-') ? [index] : [],
    );
    const lastAuthoring = Math.max(...authoringIndices);
    const firstAnchor = ids.findIndex((id) => id.endsWith('::in') || id.endsWith('::out'));
    expect(authoringIndices).toHaveLength(8);
    expect(firstAnchor).toBeGreaterThan(lastAuthoring);
  });
});
