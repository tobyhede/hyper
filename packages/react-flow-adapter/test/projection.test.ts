import { describe, expect, it } from 'vitest';
import {
  buildThingHandles,
  buildLayoutStrategyGraph,
  buildGraphRenderEdges,
  loadSpace,
  type Space,
} from '@project/graph';
import type { SpaceFile } from '@project/core';
import { projectThingNodes, projectGraphEdges, type GraphEmphasis } from '../src/index';
import { aliasFile, thingFile } from './thing-files';
import { uuid } from './uuid';

function load(
  input: unknown,
  thingFiles = [
    thingFile('00000000-0000-4000-8000-000000000002', 'Thing A'),
    thingFile('00000000-0000-4000-8000-000000000003', 'Thing B'),
  ],
): Space {
  const result = loadSpace(input, thingFiles);
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

/**
 * A version 1 space document over the given graphs.
 *
 * A graph is an owned value of the diagram that holds it now (ADR 0040), and
 * every edge endpoint must be a thing of *that* diagram, so the one diagram below
 * takes membership of every thing the graphs touch. The positions are arbitrary
 * — nothing in this file reads them — and what they express here is membership,
 * which is what a diagram's position keys are.
 *
 * Returned as `SpaceFile` rather than as `unknown`, although `loadSpace` takes
 * `unknown` and would accept either. The literal is the whole point: typed, the
 * next change to the aggregate fails here at `tsc`; untyped, it checks against
 * nothing and fails at runtime instead — which is exactly how these fixtures
 * came to be a version behind.
 */
function spaceFile(
  graphs: readonly { id: string; title: string; edges: readonly { from: string; to: string }[] }[],
): SpaceFile {
  const members = [...new Set(graphs.flatMap(({ edges }) => edges.flatMap((e) => [e.from, e.to])))];
  return {
    version: 1,
    id: uuid('00000000-0000-4000-8000-000000000001'),
    title: 'Test',
    diagrams: [
      {
        id: uuid('00000000-0000-4000-8000-000000000050'),
        title: 'Only diagram',
        kind: 'positioned',
        positions: Object.fromEntries(
          members.map((id, index) => [uuid(id), { x: index * 300, y: 0, open: false }]),
        ),
        graphs: graphs.map(({ id, title, edges }) => ({
          id: uuid(id),
          title,
          edges: edges.map(({ from, to }) => ({ from: uuid(from), to: uuid(to) })),
        })),
      },
    ],
  };
}

const space = load(
  spaceFile([
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
  ]),
);

const colors = {
  '00000000-0000-4000-8000-000000000004': '#111111',
  '00000000-0000-4000-8000-000000000030': '#222222',
};
const handles = buildThingHandles(space);

describe('projectThingNodes', () => {
  it('maps things to thing nodes carrying the title, not the content', () => {
    const nodes = projectThingNodes(space, handles, colors);
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    expect(a.type).toBe('thing');
    expect(a.data.title).toBe('Thing A');
    expect(a.data.active).toBe(false);
    // ADR 0006: content is loaded when a thing is opened, not embedded per node.
    expect('markdown' in a.data).toBe(false);
  });

  it('attaches per-graph handles colored by graph', () => {
    const nodes = projectThingNodes(space, handles, colors);
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    // main leaves thing a (out); alt ends at thing a (in).
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

  it('uses the port offsets and positions a diagram put on the things', () => {
    const nodes = projectThingNodes(space, handles, colors, {
      strategyGraph: {
        things: [
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
    // thing b is absent from the diagram → falls back to the origin (no authored position).
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.position).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("spreads a placed thing's anchors down the thing's own box, not the collapsed constant", () => {
    // The strategies arrange every collapsed Thing at `THING_SIZE`, so this only
    // ever differs for an Expanded one (ADR 0064) — and it has to differ, or an
    // Edge attaches partway down a box the Thing no longer occupies. `ports` is
    // left empty because `positionedStrategy` places none: this is the fallback
    // spread, which is what an authored Diagram actually draws.
    const expanded = projectThingNodes(space, handles, colors, {
      nodeHeight: 146,
      strategyGraph: {
        things: [
          {
            id: uuid('00000000-0000-4000-8000-000000000002'),
            x: 0,
            y: 0,
            width: 560,
            height: 420,
            ports: [],
          },
        ],
        edges: [],
      },
    });
    const a = expanded.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    // One anchor of each role, so each sits at half the Thing's own height.
    expect(a.data.sourceHandles[0]!.offsetY).toBe(210);
    expect(a.data.targetHandles[0]!.offsetY).toBe(210);

    // The constant still answers for a thing no strategy has placed yet.
    const unplaced = projectThingNodes(space, handles, colors, { nodeHeight: 146 });
    expect(
      unplaced.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!.data.sourceHandles[0]!
        .offsetY,
    ).toBe(73);
  });

  it('declares an attachment point for every Graph on a thing the strategy has placed', () => {
    // A third Graph that never touches thing A, so "every Graph" is distinguishable
    // from "every Graph this thing is already on". A self-edge is authored structure
    // (ADR 0032), which is the cheapest way to keep it away from A.
    const withThirdGraph = load(
      spaceFile([
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
      ]),
    );
    const palette = {
      '00000000-0000-4000-8000-000000000004': '#111111',
      '00000000-0000-4000-8000-000000000031': '#333333',
    };
    const nodes = projectThingNodes(withThirdGraph, buildThingHandles(withThirdGraph), palette, {
      strategyGraph: {
        things: [
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

    // Thing A is only on Main, and only outbound. The rest are declared all the
    // same: React Flow resolves an Edge against the geometry the node carries, so
    // an Edge completed onto a thing resolves in the render that first makes it
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
    const nodes = projectThingNodes(
      space,
      handles,
      {},
      {
        strategyGraph: {
          things: [
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

  it('declares no geometry for a thing the strategy has not placed, leaving React Flow to measure it', () => {
    const nodes = projectThingNodes(space, handles, colors, {
      strategyGraph: {
        things: [
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
    // carries no measured size. Declaring one without the other strands a thing on
    // whichever half it kept.
    expect('handles' in b).toBe(false);
    expect('measured' in b).toBe(false);
  });

  it('flags the active thing', () => {
    const nodes = projectThingNodes(space, handles, colors, {
      activeThingId: uuid('00000000-0000-4000-8000-000000000003'),
    });
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.data.active).toBe(
      true,
    );
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.className).toContain(
      'rf-thing-node--active',
    );
  });

  it("resolves an Open Alias's Target Markdown under the Alias identity", () => {
    const aliasId = uuid('00000000-0000-4000-8000-000000000007');
    const withAlias = load(
      spaceFile([
        {
          id: '00000000-0000-4000-8000-000000000004',
          title: 'Main',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000002',
              to: aliasId,
            },
          ],
        },
      ]),
      [
        thingFile('00000000-0000-4000-8000-000000000002', 'Opening', '## Authored once'),
        aliasFile(aliasId, 'Return', '00000000-0000-4000-8000-000000000002'),
      ],
    );

    const nodes = projectThingNodes(withAlias, buildThingHandles(withAlias), colors, {
      openThingIds: new Set([aliasId]),
    });
    expect(nodes.find((node) => node.id === aliasId)?.data).toMatchObject({
      title: 'Return',
      kind: 'alias',
      expanded: true,
      body: '## Authored once',
    });
  });
});

describe('projectGraphEdges', () => {
  const graphRenderEdges = buildGraphRenderEdges(space);
  // Each Graph's one Edge, named by the id `buildGraphRenderEdges` minted for
  // it rather than by a restated shape: that id is the Graph and the Edge's two
  // endpoints, and this file is about the projection rather than about how an
  // Edge is identified — `packages/graph/test/graph-rendering.test.ts` owns
  // that. Both fixture Graphs hold exactly one Edge.
  const edgeIdOf = (graphId: string): string =>
    graphRenderEdges.find((edge) => edge.graphId === uuid(graphId))!.id;
  const MAIN_EDGE_ID = edgeIdOf('00000000-0000-4000-8000-000000000004');
  const ALT_EDGE_ID = edgeIdOf('00000000-0000-4000-8000-000000000030');

  it('maps graph edges to colored, port-connected React Flow edges', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors);
    expect(edges).toHaveLength(2);
    const mainEdge = edges.find((e) => e.id === MAIN_EDGE_ID)!;
    expect(mainEdge).toMatchObject({
      type: 'routed',
      source: '00000000-0000-4000-8000-000000000002',
      target: '00000000-0000-4000-8000-000000000003',
      sourceHandle: '00000000-0000-4000-8000-000000000004::out',
      targetHandle: '00000000-0000-4000-8000-000000000004::in',
    });
    expect(mainEdge.style?.stroke).toBe('#111111');
  });

  it("carries ELK's routed points when a strategy has placed them", () => {
    const edges = projectGraphEdges(graphRenderEdges, colors, {
      strategyGraph: {
        things: [],
        edges: [
          {
            id: MAIN_EDGE_ID,
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
    expect(edges.find((e) => e.id === MAIN_EDGE_ID)!.data).toMatchObject({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 4 },
      ],
    });
    // An edge the diagram did not route carries no `points` key at all (bezier
    // fallback). The key is omitted, not set to undefined (exactOptionalPropertyTypes).
    expect(edges.find((e) => e.id === ALT_EDGE_ID)!.data).not.toHaveProperty('points');
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
        '00000000-0000-4000-8000-000000000004': edges.find((e) => e.id === MAIN_EDGE_ID)!,
        '00000000-0000-4000-8000-000000000030': edges.find((e) => e.id === ALT_EDGE_ID)!,
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
 * A Thing declares an anchor for every Graph, including ones it is not on, so an
 * Edge completed onto it resolves in the render that first makes it incident.
 *
 * Those extra anchors have no DOM element, and React Flow picks the *closest*
 * declared handle within its connection radius. If one ever landed on the same
 * point as a visible authoring handle, a release near that point could resolve
 * to an anchor that cannot accept it. The fallback spreads them evenly down the
 * Thing, so with an odd number of Graphs the middle one sits at exactly half the
 * height — where the Left and Right authoring handles are.
 */
describe('non-incident graph anchors versus the authoring handles', () => {
  const thingA = '00000000-0000-4000-8000-000000000002';
  const thingB = '00000000-0000-4000-8000-000000000003';

  const singleGraphSpace = load(
    spaceFile([
      {
        id: '00000000-0000-4000-8000-000000000004',
        title: 'Only',
        edges: [{ from: thingA, to: thingA }],
      },
    ]),
  );

  it('places a lone non-incident anchor exactly on the authoring handle centre', () => {
    const handlesByThing = buildThingHandles(singleGraphSpace);
    const thingIds = singleGraphSpace.things.map((thing) => thing.id);
    const strategyGraph = buildLayoutStrategyGraph(
      thingIds,
      handlesByThing,
      buildGraphRenderEdges(singleGraphSpace),
      () => ({ width: 260, height: 146 }),
    );
    const colors = { '00000000-0000-4000-8000-000000000004': '#6ea8fe' };
    const nodes = projectThingNodes(singleGraphSpace, handlesByThing, colors, { strategyGraph });
    const thingNode = nodes.find((node) => node.id === thingB);
    if (thingNode === undefined) throw new Error('Thing B should be projected');
    const handles = thingNode.handles ?? [];

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
    const handlesByThing = buildThingHandles(singleGraphSpace);
    const thingIds = singleGraphSpace.things.map((thing) => thing.id);
    const strategyGraph = buildLayoutStrategyGraph(
      thingIds,
      handlesByThing,
      buildGraphRenderEdges(singleGraphSpace),
      () => ({ width: 260, height: 146 }),
    );
    const colors = { '00000000-0000-4000-8000-000000000004': '#6ea8fe' };
    const nodes = projectThingNodes(singleGraphSpace, handlesByThing, colors, { strategyGraph });
    const thingNode = nodes.find((node) => node.id === thingB);
    if (thingNode === undefined) throw new Error('Thing B should be projected');
    const ids = (thingNode.handles ?? []).map((handle) => handle.id ?? '');

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
