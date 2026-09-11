import { describe, expect, it } from 'vitest';
import { buildGraphRenderEdges, loadSpace, type Space } from '@project/graph';
import type { SpaceFile } from '@project/core';
import { Position } from '@xyflow/react';
import { AUTHORING_HANDLE_DIAMETER } from '../src/authoring-handle';
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
describe('projectThingNodes', () => {
  it('maps things to thing nodes carrying the title, not the content', () => {
    const nodes = projectThingNodes(space);
    const a = nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000002')!;
    expect(a.type).toBe('thing');
    expect(a.data.title).toBe('Thing A');
    expect(a.data.active).toBe(false);
    // ADR 0006: content is loaded when a thing is opened, not embedded per node.
    expect('markdown' in a.data).toBe(false);
  });

  it('uses the positions a diagram put on the things', () => {
    const nodes = projectThingNodes(space, {
      strategyGraph: {
        things: [
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
    // thing b is absent from the diagram → falls back to the origin (no authored position).
    expect(nodes.find((n) => n.id === '00000000-0000-4000-8000-000000000003')!.position).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("declares four anchors of each role on the rim of the Thing's own box", () => {
    // A Thing's anchors follow the rect it occupies rather than a constant: the
    // strategies arrange every collapsed Thing at `THING_SIZE`, so this differs
    // only for an Open one (ADR 0064) — and it has to, or an Edge attaches
    // partway down a box the Thing no longer fills.
    const nodes = projectThingNodes(space, {
      strategyGraph: {
        things: [
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

  it('declares no geometry for a thing the strategy has not placed, leaving React Flow to measure it', () => {
    const nodes = projectThingNodes(space, {
      strategyGraph: {
        things: [
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
    // carries no measured size. Declaring one without the other strands a thing on
    // whichever half it kept.
    expect('handles' in b).toBe(false);
    expect('measured' in b).toBe(false);
  });

  it('flags the active thing', () => {
    const nodes = projectThingNodes(space, {
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

    const nodes = projectThingNodes(withAlias, {
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

  it('maps graph edges to coloured React Flow edges that name no handle', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors);
    expect(edges).toHaveLength(2);
    const mainEdge = edges.find((e) => e.id === MAIN_EDGE_ID)!;
    expect(mainEdge).toMatchObject({
      type: 'routed',
      source: '00000000-0000-4000-8000-000000000002',
      target: '00000000-0000-4000-8000-000000000003',
    });
    // The side is chosen while the Edge is drawn, from where its two Things are
    // at that moment (ADR 0087), so there is nothing for the projection to name.
    expect(mainEdge.sourceHandle).toBeUndefined();
    expect(mainEdge.targetHandle).toBeUndefined();
    expect(mainEdge.style?.stroke).toBe('#111111');
  });

  it('carries the Graph it belongs to and no geometry of its own', () => {
    const edges = projectGraphEdges(graphRenderEdges, colors);

    // The Edge data is the Graph id and nothing else (ADR 0086). It carried an
    // optional routed polyline until then, for waypoints a routing strategy
    // might have placed; nothing ever placed one, and a Diagram has nowhere to
    // store one, so the bezier the Edge draws between the two anchors it
    // attaches to is the only Edge geometry there has ever been.
    expect(edges.find((e) => e.id === MAIN_EDGE_ID)!.data).toEqual({
      graphId: uuid('00000000-0000-4000-8000-000000000004'),
    });
    expect(edges.find((e) => e.id === ALT_EDGE_ID)!.data).toEqual({
      graphId: uuid('00000000-0000-4000-8000-000000000030'),
    });
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
