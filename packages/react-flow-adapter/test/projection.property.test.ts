import fc from 'fast-check';
import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  buildGraphRenderEdges,
  loadSpace,
  type LayoutStrategyGraph,
  type ThingFile,
} from '@project/graph';
import { projectThingNodes, projectGraphEdges } from '../src/index';
import { thingFile } from './thing-files';

/**
 * The projection's handle invariants, as properties rather than examples.
 *
 * React Flow warning #008 — "Couldn't create edge for source/target handle id" —
 * fires when an Edge names a handle that does not resolve on the node it points
 * at, and warning or not, `getEdgePosition` then answers null and the Edge is
 * not drawn at all. That condition is fully determined by what
 * `projectThingNodes` and `projectGraphEdges` produce *together*. Each
 * projection is well covered on its own in `projection.test.ts`; nothing there
 * asserts the relationship, so a change to one side only would pass every test
 * and render a Graph with no Edges.
 *
 * Since ADR 0087 an Edge names no handle and attaches to one of four anchors
 * chosen while it is drawn, so what has to hold is that **every** Thing an Edge
 * reaches carries those anchors — not that some named handle happens to exist.
 * React Flow resolves an unnamed handle to the first of the node's bounds of
 * that kind, so a Thing missing either kind is an Edge that silently vanishes.
 *
 * Properties rather than examples because the failure mode is multi-graph: the
 * generated Spaces overlap on Things, which is the shape that once put several
 * same-side handles on one node. See
 * `.scratch/react-flow-guidance/issues/02-projection-handle-invariants.md`.
 */

/** Ids from a shared pool, so generated graphs overlap on things — the case that
 *  puts several same-side handles on one node. */
const thingIdPool = fc
  .uniqueArray(fc.integer({ min: 0, max: 25 }), { minLength: 2, maxLength: 8 })
  .map((ns) => ns.map(uuidFrom));

function uuidFrom(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

/**
 * A space file whose graphs each run over distinct things in some order: a chain
 * through all of them, plus up to three **shortcuts** skipping ahead. Every edge
 * points forward in that order and each exact Edge appears once, so `loadSpace`
 * always accepts what we generate; things are the union of what the graphs
 * touch, so there are no orphans either.
 *
 * The shortcuts are the point. They fork a thing and merge into a later one,
 * which is the shape a step list could not express and the one that puts several
 * edges on a single handle.
 */
const graphArb = (pool: string[]) =>
  fc
    .tuple(
      fc.shuffledSubarray(pool, { minLength: 2 }),
      fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 3 }),
    )
    .map(([things, shortcuts]) => {
      const edges = things.slice(0, -1).map((from, i) => ({ from, to: things[i + 1]! }));
      for (const [rawFrom, rawSkip] of shortcuts) {
        const from = rawFrom % things.length;
        const to = from + 2 + (rawSkip % things.length);
        const edge = { from: things[from]!, to: things[to]! };
        if (
          to < things.length &&
          !edges.some((candidate) => candidate.from === edge.from && candidate.to === edge.to)
        ) {
          edges.push(edge);
        }
      }
      return { things, edges };
    });

const spaceFileArb = thingIdPool.chain((pool) =>
  fc.array(graphArb(pool), { minLength: 1, maxLength: 4 }).map((graphs) => {
    const visited = [...new Set(graphs.flatMap((r) => r.things))];
    return {
      // One diagram owning every generated graph, taking membership of every thing
      // they touch: a graph is an owned value of its diagram (ADR 0040) and its
      // edges are closed over that diagram's members.
      file: {
        version: 1,
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Generated',
        diagrams: [
          {
            id: '00000000-0000-4000-8000-000000000050',
            title: 'Only diagram',
            kind: 'positioned',
            positions: Object.fromEntries(
              visited.map((id, index) => [id, { x: index * 300, y: 0, open: false }]),
            ),
            graphs: graphs.map((graph, index) => ({
              id: uuidFrom(index + 100),
              title: `Graph ${index}`,
              edges: graph.edges,
            })),
          },
        ],
      },
      thingFiles: visited.map((id) => thingFile(id)),
    };
  }),
);

/**
 * Project a generated Space to React Flow nodes and Edges. Colors are irrelevant
 * to these invariants, so the fallback is fine.
 *
 * A strategy graph is supplied because a Thing declares its anchors only once
 * something has placed it — before that React Flow measures the DOM instead,
 * which is not what these properties are about.
 */
function project(generated: { file: unknown; thingFiles: ThingFile[] }) {
  const result = loadSpace(generated.file, generated.thingFiles);
  if (!result.ok) throw new Error(`generated space should load: ${JSON.stringify(result.errors)}`);
  const space = result.space;
  const strategyGraph: LayoutStrategyGraph = {
    things: space.things.map((thing, index) => ({
      id: thing.id,
      width: 260,
      height: 146,
      x: index * 400,
      y: 0,
    })),
    edges: [],
  };

  return {
    nodes: projectThingNodes(space, { strategyGraph }),
    edges: projectGraphEdges(buildGraphRenderEdges(space), {}),
  };
}

describe('projection handle invariants', () => {
  const SIDES = new Set([Position.Top, Position.Right, Position.Bottom, Position.Left]);

  it('declares the four anchors of each role on every Thing an Edge reaches', () => {
    fc.assert(
      fc.property(spaceFileArb, (generated) => {
        const { nodes, edges } = project(generated);

        // Not vacuous: every generated Graph carries at least one Edge.
        expect(edges.length).toBeGreaterThan(0);

        const declared = new Map(nodes.map((node) => [node.id, node.handles ?? []]));

        for (const edge of edges) {
          for (const [role, thingId] of [
            ['source', edge.source],
            ['target', edge.target],
          ] as const) {
            const handles = declared.get(thingId);
            expect(handles, `edge ${edge.id} has no ${role} node`).toBeDefined();
            const sides = (handles ?? [])
              .filter((handle) => handle.type === role)
              .map((handle) => handle.position);
            expect(new Set(sides), `edge ${edge.id} ${role} anchors`).toEqual(SIDES);
          }
        }
      }),
    );
  });

  it('leaves an Edge naming no handle at all', () => {
    fc.assert(
      fc.property(spaceFileArb, (generated) => {
        const { edges } = project(generated);

        // The projection does not run again during a drag, so a side chosen here
        // would be right only once the gesture settled (ADR 0087). Leaving both
        // unnamed is what hands the choice to the Edge, which is the one thing
        // that can follow the drag.
        for (const edge of edges) {
          expect(edge.sourceHandle, `edge ${edge.id} source handle`).toBeUndefined();
          expect(edge.targetHandle, `edge ${edge.id} target handle`).toBeUndefined();
        }
      }),
    );
  });

  it('gives a Thing no two handles of one kind on one side', () => {
    fc.assert(
      fc.property(spaceFileArb, (generated) => {
        const { nodes } = project(generated);

        // React Flow cannot tell two same-kind handles apart otherwise, and picks
        // whichever it finds first. Four anchors named for their sides satisfy
        // that by construction — which is the ground ADR 0045 gave the per-Graph
        // ids, and the reason four anchors could take their place.
        for (const node of nodes) {
          const seen = (node.handles ?? []).map((handle) => `${handle.type}-${handle.position}`);
          expect(new Set(seen).size, `${node.id} handles`).toBe(seen.length);
        }
      }),
    );
  });
});
