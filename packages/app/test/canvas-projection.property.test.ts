import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { loadSpace, Placement, positionedStrategy, type ResourceFile } from '@project/graph';
import { canvasProjection } from '../src/canvas-projection';
import { resolveMap } from '../src/map-resolution';
import { resourceFile } from './resource-files';

/**
 * That a Map's projection resolves its own handles.
 *
 * React Flow warning #008 fires when an Edge names a handle that does not
 * resolve on the node it points at. `projection.property.test.ts` in the adapter
 * pins that for `projectResourceNodes` and `projectGraphEdges` given *consistent*
 * inputs; what it cannot see is whether anything feeds them consistently. This
 * module is what does, and it derives handles and Edges from the visible Graphs
 * separately — so a Space of several overlapping Graphs is where the two can
 * disagree and render a canvas with unattached Edges.
 */

const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000ff');

function uuidFrom(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

/** Ids from a shared pool, so generated Graphs overlap on Resources. */
const resourceIdPool = fc
  .uniqueArray(fc.integer({ min: 0, max: 25 }), { minLength: 2, maxLength: 8 })
  .map((ns) => ns.map(uuidFrom));

/** A Graph running forward through a shuffled subset, so `loadSpace` accepts it. */
const graphArb = (pool: string[]) =>
  fc.shuffledSubarray(pool, { minLength: 2 }).map((resources) => ({
    resources,
    edges: resources.slice(0, -1).map((from, index) => ({ from, to: resources[index + 1]! })),
  }));

/**
 * One Map owning several overlapping Graphs and positioning every Resource they
 * connect.
 *
 * A Graph is a nested owned value of its Map (ADR 0040), so the Resources are
 * derived from the Graphs and then written as the Map's membership — which is
 * exactly what closes every owned Edge over the Resources the Map positions.
 */
const mapSpaceArb = resourceIdPool.chain((pool) =>
  fc.array(graphArb(pool), { minLength: 2, maxLength: 4 }).map((graphs) => {
    const resources = [...new Set(graphs.flatMap((graph) => graph.resources))];
    return {
      file: {
        version: 1,
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Generated',
        maps: [
          {
            id: MAP_ID,
            title: 'Working',
            kind: 'positioned',
            positions: Object.fromEntries(
              resources.map((id, index) => [id, { x: index * 400, y: 0, open: false }]),
            ),
            graphs: graphs.map((graph, index) => ({
              id: uuidFrom(index + 100),
              title: `Graph ${index}`,
              edges: graph.edges,
            })),
          },
        ],
      },
      resourceFiles: resources.map((id) => resourceFile(id)),
    };
  }),
);

async function projectThroughMap(generated: { file: unknown; resourceFiles: ResourceFile[] }) {
  const result = loadSpace(generated.file, generated.resourceFiles);
  if (!result.ok) throw new Error(`generated space should load: ${JSON.stringify(result.errors)}`);

  const resolved = resolveMap(result.space, MAP_ID);
  const projection = canvasProjection(result.space, resolved);
  const laidOut = await positionedStrategy(Placement.fromMap(resolved.map))(
    projection.strategyGraph,
  );
  return projection.project(laidOut, {
    activeGraphId: resolved.activeGraph.id,
    activeResourceId: null,
    selectedResourceId: null,
    presenting: false,
  });
}

describe('canvasProjection handle invariants', () => {
  it('declares the anchors of both roles on every Resource a drawn Edge reaches', async () => {
    await fc.assert(
      fc.asyncProperty(mapSpaceArb, async (generated) => {
        const { nodes, edges } = await projectThroughMap(generated);

        // Not vacuous: the Space holds at least two Graphs, and every Graph has
        // at least one Edge.
        expect(edges.length).toBeGreaterThan(0);

        const declared = new Map(nodes.map((node) => [node.id, node.handles ?? []]));

        // An Edge names no handle (ADR 0087), so React Flow resolves each end
        // to the first declared bound of that kind — and answers null, drawing
        // nothing at all, for a Resource that declares none. What the two
        // derivations have to agree on is therefore which Resources are on the
        // canvas, not which handle ids exist.
        for (const edge of edges) {
          for (const [role, resourceId] of [
            ['source', edge.source],
            ['target', edge.target],
          ] as const) {
            const handles = declared.get(resourceId);
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
