import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { loadSpace, Placement, positionedStrategy, type ThingFile } from '@project/graph';
import { canvasProjection } from '../src/canvas-projection';
import { resolveDiagram } from '../src/diagram-resolution';
import { thingFile } from './thing-files';

/**
 * That a Diagram's projection resolves its own handles.
 *
 * React Flow warning #008 fires when an Edge names a handle that does not
 * resolve on the node it points at. `projection.property.test.ts` in the adapter
 * pins that for `projectThingNodes` and `projectGraphEdges` given *consistent*
 * inputs; what it cannot see is whether anything feeds them consistently. This
 * module is what does, and it derives handles and Edges from the visible Graphs
 * separately — so a Space of several overlapping Graphs is where the two can
 * disagree and render a canvas with unattached Edges.
 */

const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000ff');

function uuidFrom(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

/** Ids from a shared pool, so generated Graphs overlap on Things. */
const thingIdPool = fc
  .uniqueArray(fc.integer({ min: 0, max: 25 }), { minLength: 2, maxLength: 8 })
  .map((ns) => ns.map(uuidFrom));

/** A Graph running forward through a shuffled subset, so `loadSpace` accepts it. */
const graphArb = (pool: string[]) =>
  fc.shuffledSubarray(pool, { minLength: 2 }).map((things) => ({
    things,
    edges: things.slice(0, -1).map((from, index) => ({ from, to: things[index + 1]! })),
  }));

/**
 * One Diagram owning several overlapping Graphs and positioning every Thing they
 * connect.
 *
 * A Graph is a nested owned value of its Diagram (ADR 0040), so the Things are
 * derived from the Graphs and then written as the Diagram's membership — which is
 * exactly what closes every owned Edge over the Things the Diagram positions.
 */
const diagramSpaceArb = thingIdPool.chain((pool) =>
  fc.array(graphArb(pool), { minLength: 2, maxLength: 4 }).map((graphs) => {
    const things = [...new Set(graphs.flatMap((graph) => graph.things))];
    return {
      file: {
        version: 1,
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Generated',
        diagrams: [
          {
            id: DIAGRAM_ID,
            title: 'Working',
            kind: 'positioned',
            positions: Object.fromEntries(
              things.map((id, index) => [id, { x: index * 400, y: 0, open: false }]),
            ),
            graphs: graphs.map((graph, index) => ({
              id: uuidFrom(index + 100),
              title: `Graph ${index}`,
              edges: graph.edges,
            })),
          },
        ],
      },
      thingFiles: things.map((id) => thingFile(id)),
    };
  }),
);

async function projectThroughDiagram(generated: { file: unknown; thingFiles: ThingFile[] }) {
  const result = loadSpace(generated.file, generated.thingFiles);
  if (!result.ok) throw new Error(`generated space should load: ${JSON.stringify(result.errors)}`);

  const resolved = resolveDiagram(result.space, DIAGRAM_ID);
  const projection = canvasProjection(result.space, resolved);
  const laidOut = await positionedStrategy(Placement.fromDiagram(resolved.diagram))(
    projection.strategyGraph,
  );
  return projection.project(laidOut, {
    activeGraphId: resolved.activeGraph.id,
    activeThingId: null,
    selectedThingId: null,
    presenting: false,
  });
}

describe('canvasProjection handle invariants', () => {
  it('declares the anchors of both roles on every Thing a drawn Edge reaches', async () => {
    await fc.assert(
      fc.asyncProperty(diagramSpaceArb, async (generated) => {
        const { nodes, edges } = await projectThroughDiagram(generated);

        // Not vacuous: the Space holds at least two Graphs, and every Graph has
        // at least one Edge.
        expect(edges.length).toBeGreaterThan(0);

        const declared = new Map(nodes.map((node) => [node.id, node.handles ?? []]));

        // An Edge names no handle since ADR 0087, so React Flow resolves each end
        // to the first declared bound of that kind — and answers null, drawing
        // nothing at all, for a Thing that declares none. What the two
        // derivations have to agree on is therefore which Things are on the
        // canvas, not which handle ids exist.
        for (const edge of edges) {
          for (const [role, thingId] of [
            ['source', edge.source],
            ['target', edge.target],
          ] as const) {
            const handles = declared.get(thingId);
            expect(handles, `edge ${edge.id} has no ${role} node`).toBeDefined();
            expect(
              (handles ?? []).filter((handle) => handle.type === role),
              `edge ${edge.id} ${role} anchors`,
            ).toHaveLength(4);
          }
        }
      }),
    );
  });
});
