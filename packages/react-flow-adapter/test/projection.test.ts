import { describe, expect, it } from 'vitest';
import { buildGraphRenderEdges, loadSpace, type Space } from '@project/graph';
import type { SpaceFile } from '@project/core';
import { Position } from '@xyflow/react';
import { AUTHORING_HANDLE_DIAMETER } from '../src/authoring-handle';
import {
  projectResourceNodes,
  projectGraphEdges,
  OTHER_GRAPH_OPACITY,
  ROUTED_EDGE_TYPE,
} from '../src/index';
import { referenceFile, resourceFile } from './resource-files';
import { DETACHED_END_TRIM, GRAPH_LANE_SPACING } from '../src/edge-lanes';
import { uuid } from './uuid';

function load(
  input: unknown,
  resourceFiles = [
    resourceFile('00000000-0000-4000-8000-000000000002', 'Resource A'),
    resourceFile('00000000-0000-4000-8000-000000000003', 'Resource B'),
  ],
): Space {
  const result = loadSpace(input, resourceFiles);
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

/**
 * A version 1 space document over the given graphs.
 *
 * A graph is an owned value of the map that holds it now (ADR 0040), and
 * every edge endpoint must be a resource of *that* map, so the one map below
 * takes membership of every resource the graphs touch. The positions are arbitrary
 * — nothing in this file reads them — and what they express here is membership,
 * which is what a map's position keys are.
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
    maps: [
      {
        id: uuid('00000000-0000-4000-8000-000000000050'),
        title: 'Only map',
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
describe('projectResourceNodes', () => {
  it('maps resources to resource nodes carrying the title, not the content', () => {
    const nodes = projectResourceNodes(space);
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    expect(a.type).toBe('resource');
    expect(a.data.title).toBe('Resource A');
    expect(a.data.active).toBe(false);
    // ADR 0006: content is loaded when a resource is opened, not embedded per node.
    expect('markdown' in a.data).toBe(false);
  });

  it('uses the positions a map put on the resources', () => {
    const nodes = projectResourceNodes(space, {
      strategyGraph: {
        resources: [
          {
            id: uuid('00000000-0000-4000-8000-000000000002'),
            x: 500,
            y: 600,
            width: 260,
            height: 300,
          },
        ],
        edges: [],
      },
    });
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    expect(a.position).toEqual({ x: 500, y: 600 });
    // A position is all a strategy answers (ADR 0086), and the rect it placed is
    // what the node declares — width and height together with the handles, since
    // React Flow re-measures a node that carries no measured size.
    expect(a.width).toBe(260);
    expect(a.height).toBe(300);
    // resource b is absent from the map → falls back to the origin (no authored position).
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.position).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("declares four anchors of each role on the rim of the Resource's own box", () => {
    // A Resource's anchors follow the rect it occupies rather than a constant: the
    // strategies arrange every collapsed Resource at `RESOURCE_SIZE`, so this differs
    // only for an Open one (ADR 0064) — and it has to, or an Edge attaches
    // partway down a box the Resource no longer fills.
    const nodes = projectResourceNodes(space, {
      strategyGraph: {
        resources: [
          {
            id: uuid('00000000-0000-4000-8000-000000000002'),
            x: 0,
            y: 0,
            width: 560,
            height: 420,
          },
        ],
        edges: [],
      },
    });
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    const radius = AUTHORING_HANDLE_DIAMETER / 2;
    const declared = (a.handles ?? []).map((handle) => ({
      id: handle.id,
      type: handle.type,
      position: handle.position,
      x: handle.x,
      y: handle.y,
    }));

    expect(declared).toHaveLength(8);
    for (const role of ['source', 'target'] as const) {
      expect(declared.filter((handle) => handle.type === role)).toEqual([
        {
          id: `authoring-${role}-top`,
          type: role,
          position: Position.Top,
          x: 280 - radius,
          y: -radius,
        },
        {
          id: `authoring-${role}-right`,
          type: role,
          position: Position.Right,
          x: 560 - radius,
          y: 210 - radius,
        },
        {
          id: `authoring-${role}-bottom`,
          type: role,
          position: Position.Bottom,
          x: 280 - radius,
          y: 420 - radius,
        },
        {
          id: `authoring-${role}-left`,
          type: role,
          position: Position.Left,
          x: -radius,
          y: 210 - radius,
        },
      ]);
    }
  });

  it('declares no geometry for a resource the strategy has not placed, leaving React Flow to measure it', () => {
    const nodes = projectResourceNodes(space, {
      strategyGraph: {
        resources: [
          {
            id: uuid('00000000-0000-4000-8000-000000000002'),
            x: 500,
            y: 600,
            width: 260,
            height: 300,
          },
        ],
        edges: [],
      },
    });
    const b = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!;

    // Both keys are absent together, and that pairing is load-bearing: React Flow
    // reads declared handles only when they are there, and re-measures a node that
    // carries no measured size. Declaring one without the other strands a resource on
    // whichever half it kept.
    expect('handles' in b).toBe(false);
    expect('measured' in b).toBe(false);
  });

  it('flags the active resource', () => {
    const nodes = projectResourceNodes(space, {
      activeResourceId: uuid('00000000-0000-4000-8000-000000000003'),
    });
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.data.active).toBe(
      true,
    );
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.className).toContain(
      'rf-resource-node--active',
    );
  });

  it("resolves an Open Reference Resource's Target Markdown under the Reference Resource identity", () => {
    const referenceId = uuid('00000000-0000-4000-8000-000000000007');
    const withReference = load(
      spaceFile([
        {
          id: '00000000-0000-4000-8000-000000000004',
          title: 'Main',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000002',
              to: referenceId,
            },
          ],
        },
      ]),
      [
        resourceFile('00000000-0000-4000-8000-000000000002', 'Opening', '## Authored once'),
        referenceFile(referenceId, 'Return', '00000000-0000-4000-8000-000000000002'),
      ],
    );

    const nodes = projectResourceNodes(withReference, {
      openResourceIds: new Set([referenceId]),
    });
    expect(nodes.find((node) => node.id === referenceId)?.data).toMatchObject({
      title: 'Return',
      kind: 'reference',
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

  it('maps graph edges to coloured React Flow edges that name no handle', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors);
    expect(edges).toHaveLength(2);
    const mainEdge = edges.find((e) => e.id === MAIN_EDGE_ID)!;
    expect(mainEdge).toMatchObject({
      type: ROUTED_EDGE_TYPE,
      source: '00000000-0000-4000-8000-000000000002',
      target: '00000000-0000-4000-8000-000000000003',
    });
    // The side is chosen while the Edge is drawn, from where its two Resources are
    // at that moment (ADR 0087), so there is nothing for the projection to name.
    expect(mainEdge.sourceHandle).toBeUndefined();
    expect(mainEdge.targetHandle).toBeUndefined();
    expect(mainEdge.style?.stroke).toBe('#111111');
  });

  it('carries the Graph it belongs to and no geometry of its own', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors);

    // The Edge data is the Graph id, its lane, how far out its pair's lanes
    // reach, and its end trim, and no geometry
    // (ADR 0086). Both fixture Graphs join the same two Resources, Alt in the other
    // direction: with nothing active the first keeps the centre and Alt takes
    // the lane below it. Nothing is active, so both connect. It carried an
    // optional routed polyline until then, for waypoints a routing strategy
    // might have placed; nothing ever placed one, and a Map has nowhere to
    // store one, so the bezier the Edge draws between the two anchors it
    // attaches to is the only Edge geometry there has ever been.
    expect(edges.find((e) => e.id === MAIN_EDGE_ID)!.data).toEqual({
      graphId: uuid('00000000-0000-4000-8000-000000000004'),
      laneOffset: 0,
      laneReach: GRAPH_LANE_SPACING,
      endTrim: 0,
    });
    expect(edges.find((e) => e.id === ALT_EDGE_ID)!.data).toEqual({
      graphId: uuid('00000000-0000-4000-8000-000000000030'),
      laneOffset: GRAPH_LANE_SPACING,
      laneReach: GRAPH_LANE_SPACING,
      endTrim: 0,
    });
  });

  it('carries an Edge Title and its hiding into the data the Edge draws from', () => {
    const [main, alt] = graphRenderEdges;
    const edges = projectGraphEdges(
      [
        { ...main!, title: 'depends on' },
        { ...alt!, title: 'then', titleHidden: true },
      ],
      colors,
    );

    expect(edges.find((e) => e.id === main!.id)!.data).toMatchObject({ title: 'depends on' });
    expect(edges.find((e) => e.id === main!.id)!.data).not.toHaveProperty('titleHidden');
    expect(edges.find((e) => e.id === alt!.id)!.data).toMatchObject({
      title: 'then',
      titleHidden: true,
    });
  });

  it('draws every graph the same when nothing is emphasised', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors, {});
    expect(edges.every((e) => e.style?.opacity === 1)).toBe(true);
    expect(edges.some((e) => e.animated)).toBe(false);
  });

  it('recedes the other graphs while one is active, never hiding them', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors, {
      activeGraphId: uuid('00000000-0000-4000-8000-000000000004'),
    });
    const main = edges.find((e) => e.id === MAIN_EDGE_ID)!;
    const alt = edges.find((e) => e.id === ALT_EDGE_ID)!;

    // The Active Graph is untouched.
    expect(main.style?.opacity).toBe(1);
    // Emphasis is never motion: the Active Graph's line is still.
    expect(main.animated).toBe(false);
    // Drawn wider; `EDGE_TITLE_BOX_CHROME` in `@project/ui` reckons with this
    // 3, since a Title's border is its Edge's stroke.
    expect(main.style?.strokeWidth).toBe(3);
    expect(alt.style?.strokeWidth).toBe(2);

    // The others recede but are still drawn, and none are dropped.
    expect(alt.style?.opacity).toBe(OTHER_GRAPH_OPACITY);
    expect(OTHER_GRAPH_OPACITY).toBeGreaterThan(0);
    expect(alt.animated).toBe(false);
    expect(edges).toHaveLength(graphRenderEdges.length);
  });

  describe('Graphs joining the same two Resources', () => {
    const [A, B, C] = ['a', 'b', 'c'].map((id) => uuid(`00000000-0000-4000-8000-00000000010${id}`));
    const [RED, BLUE, GREEN] = ['1', '2', '3'].map((id) =>
      uuid(`00000000-0000-4000-8000-00000000020${id}`),
    );
    const edge = (graphId: string, source: string, target: string) => ({
      id: `${graphId}::${source}::${target}`,
      graphId: uuid(graphId),
      source: uuid(source),
      target: uuid(target),
    });
    const shared = [edge(RED!, A!, B!), edge(BLUE!, A!, B!), edge(GREEN!, B!, C!)];
    const laneOf = (edges: ReturnType<typeof projectGraphEdges>, graphId: string) =>
      edges.find((e) => e.id.startsWith(graphId))!.data!.laneOffset;

    const dataOf = (edges: ReturnType<typeof projectGraphEdges>, graphId: string) =>
      edges.find((e) => e.id.startsWith(graphId))!.data!;

    it('puts the Active Graph on the centre, connecting, with the others below it', () => {
      const edges = projectGraphEdges(shared, colors, {
        activeGraphId: uuid(BLUE!),
      });

      expect(dataOf(edges, BLUE!)).toMatchObject({ laneOffset: 0, endTrim: 0 });
      expect(dataOf(edges, RED!)).toMatchObject({
        laneOffset: GRAPH_LANE_SPACING,
        endTrim: DETACHED_END_TRIM,
      });
      // Green joins a different pair, so it is alone in its lane — and still
      // stops short, being another Graph's.
      expect(dataOf(edges, GREEN!)).toMatchObject({ laneOffset: 0, endTrim: DETACHED_END_TRIM });
    });

    it('splits the centre between both directions of a pair the Active Graph holds', () => {
      const edges = projectGraphEdges(
        [edge(RED!, A!, B!), edge(BLUE!, A!, B!), edge(BLUE!, B!, A!)],
        colors,
        { activeGraphId: uuid(BLUE!) },
      );
      const byId = (source: string, target: string, graphId: string) =>
        edges.find((e) => e.id === `${graphId}::${source}::${target}`)!;
      const forward = byId(A!, B!, BLUE!);
      const back = byId(B!, A!, BLUE!);

      // A sorts before B, so A → B takes the negative side.
      expect(forward.data).toMatchObject({ laneOffset: -GRAPH_LANE_SPACING / 2, endTrim: 0 });
      expect(back.data).toMatchObject({ laneOffset: GRAPH_LANE_SPACING / 2, endTrim: 0 });
      expect(forward.markerEnd).toMatchObject({ type: 'arrowclosed' });
      expect(back.markerEnd).toMatchObject({ type: 'arrowclosed' });
      expect(byId(A!, B!, RED!).data).toMatchObject({
        laneOffset: (3 * GRAPH_LANE_SPACING) / 2,
        endTrim: DETACHED_END_TRIM,
      });
      expect(byId(A!, B!, RED!).markerEnd).toBeUndefined();
    });

    it('draws an arrowhead on the connecting Edge alone', () => {
      const edges = projectGraphEdges(shared, colors, {
        activeGraphId: uuid(BLUE!),
      });
      const markerOf = (graphId: string) => edges.find((e) => e.id.startsWith(graphId))!.markerEnd;

      expect(markerOf(BLUE!)).toMatchObject({ type: 'arrowclosed' });
      expect(markerOf(RED!)).toBeUndefined();
      expect(markerOf(GREEN!)).toBeUndefined();
    });

    it('moves the centre to whichever Graph becomes active', () => {
      const centred = (activeGraphId: string) => {
        const edges = projectGraphEdges(shared, colors, {
          activeGraphId: uuid(activeGraphId),
        });
        return [RED!, BLUE!].filter((graphId) => laneOf(edges, graphId) === 0);
      };

      expect(centred(RED!)).toEqual([RED]);
      expect(centred(BLUE!)).toEqual([BLUE]);
    });

    it('connects every Edge while no Graph is active', () => {
      const edges = projectGraphEdges(shared, colors, {});
      expect(edges.map((e) => e.data!.endTrim)).toEqual([0, 0, 0]);
    });

    it('draws the Active Graph last, over the lanes it converges with', () => {
      const edges = projectGraphEdges(shared, colors, {
        activeGraphId: uuid(RED!),
      });

      expect(edges.map((e) => e.data!.graphId)).toEqual([BLUE, GREEN, RED]);
    });
  });
});
