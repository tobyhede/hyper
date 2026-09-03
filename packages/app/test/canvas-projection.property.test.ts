import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { loadSpace, Placement, positionedStrategy, type CardFile } from '@project/graph';
import { canvasProjection } from '../src/canvas-projection';
import { resolveLayout } from '../src/layout-resolution';
import { cardFile } from './card-files';

/**
 * That a Layout's projection resolves its own handles.
 *
 * React Flow warning #008 fires when an Edge names a handle that does not
 * resolve on the node it points at. `projection.property.test.ts` in the adapter
 * pins that for `projectCardNodes` and `projectGraphEdges` given *consistent*
 * inputs; what it cannot see is whether anything feeds them consistently. This
 * module is what does, and it derives handles and Edges from the visible Graphs
 * separately — so a Space of several overlapping Graphs is where the two can
 * disagree and render a canvas with unattached Edges.
 */

const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000ff');

function uuidFrom(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

/** Ids from a shared pool, so generated Graphs overlap on Cards. */
const cardIdPool = fc
  .uniqueArray(fc.integer({ min: 0, max: 25 }), { minLength: 2, maxLength: 8 })
  .map((ns) => ns.map(uuidFrom));

/** A Graph running forward through a shuffled subset, so `loadSpace` accepts it. */
const graphArb = (pool: string[]) =>
  fc.shuffledSubarray(pool, { minLength: 2 }).map((cards) => ({
    cards,
    edges: cards.slice(0, -1).map((from, index) => ({ from, to: cards[index + 1]! })),
  }));

/**
 * One Layout owning several overlapping Graphs and positioning every Card they
 * connect.
 *
 * A Graph is a nested owned value of its Layout (ADR 0040), so the Cards are
 * derived from the Graphs and then written as the Layout's membership — which is
 * exactly what closes every owned Edge over the Cards the Layout positions.
 */
const layoutSpaceArb = cardIdPool.chain((pool) =>
  fc.array(graphArb(pool), { minLength: 2, maxLength: 4 }).map((graphs) => {
    const cards = [...new Set(graphs.flatMap((graph) => graph.cards))];
    return {
      file: {
        version: 1,
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Generated',
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Working',
            kind: 'positioned',
            positions: Object.fromEntries(
              cards.map((id, index) => [id, { x: index * 400, y: 0, open: false }]),
            ),
            graphs: graphs.map((graph, index) => ({
              id: uuidFrom(index + 100),
              title: `Graph ${index}`,
              edges: graph.edges,
            })),
          },
        ],
      },
      cardFiles: cards.map((id) => cardFile(id)),
    };
  }),
);

async function projectThroughLayout(generated: { file: unknown; cardFiles: CardFile[] }) {
  const result = loadSpace(generated.file, generated.cardFiles);
  if (!result.ok) throw new Error(`generated space should load: ${JSON.stringify(result.errors)}`);

  const resolved = resolveLayout(result.space, LAYOUT_ID);
  const projection = canvasProjection(result.space, resolved);
  const laidOut = await positionedStrategy(Placement.fromLayout(resolved.layout))(
    projection.strategyGraph,
  );
  return projection.project(laidOut, {
    activeGraphId: resolved.activeGraph.id,
    activeCardId: null,
    selectedCardId: null,
    presenting: false,
    moved: false,
  });
}

describe('canvasProjection handle invariants', () => {
  it('every drawn Edge names handles that exist on the Cards it connects', async () => {
    await fc.assert(
      fc.asyncProperty(layoutSpaceArb, async (generated) => {
        const { nodes, edges } = await projectThroughLayout(generated);

        const handleIds = new Map(
          nodes.map((node) => [
            node.id,
            {
              source: new Set(node.data.sourceHandles.map((handle) => handle.id)),
              target: new Set(node.data.targetHandles.map((handle) => handle.id)),
            },
          ]),
        );

        // Not vacuous: the Space holds at least two Graphs, and every Graph has
        // at least one Edge.
        expect(edges.length).toBeGreaterThan(0);

        for (const edge of edges) {
          const from = handleIds.get(edge.source);
          const to = handleIds.get(edge.target);
          expect(from, `edge ${edge.id} has no source node`).toBeDefined();
          expect(to, `edge ${edge.id} has no target node`).toBeDefined();
          expect(from!.source, `edge ${edge.id} source handle`).toContain(edge.sourceHandle);
          expect(to!.target, `edge ${edge.id} target handle`).toContain(edge.targetHandle);
        }
      }),
    );
  });
});
