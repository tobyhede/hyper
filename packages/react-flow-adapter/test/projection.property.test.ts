import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildCardHandles, buildRouteEdges, loadSpace } from '@project/graph';
import { projectCardNodes, projectRouteEdges } from '../src/index';

/**
 * The projection's handle invariants, as properties rather than examples.
 *
 * React Flow warning #008 — "Couldn't create edge for source/target handle id" —
 * fires when an edge names a handle that doesn't resolve on the node it points
 * at, and that condition is fully determined by what `projectCardNodes` and
 * `projectRouteEdges` produce *together*. Each projection is well covered on its
 * own in `projection.test.ts`; nothing there asserts the relationship, so a
 * change to the handle id scheme on one side only would pass every test and
 * render a graph with no edges.
 *
 * Properties rather than examples because the failure mode is multi-route: a
 * card carries more than one same-side handle only when routes share it. See
 * `.scratch/react-flow-guidance/issues/02-projection-handle-invariants.md`.
 */

/** Ids from a shared pool, so generated routes overlap on cards — the case that
 *  puts several same-side handles on one node. */
const cardIdPool = fc
  .uniqueArray(fc.integer({ min: 0, max: 25 }), { minLength: 2, maxLength: 8 })
  .map((ns) => ns.map((n) => `card-${n}`));

/**
 * A space file whose routes each visit distinct cards in some order. Sampling
 * without replacement is ADR 0012 (a route may not revisit a card) for free, so
 * `loadSpace` always accepts what we generate; cards are the union of what the
 * routes actually visit, so there are no orphans either.
 */
const spaceFileArb = cardIdPool.chain((pool) =>
  fc
    .array(fc.shuffledSubarray(pool, { minLength: 2 }), { minLength: 1, maxLength: 4 })
    .map((routes) => {
      const visited = [...new Set(routes.flat())];
      return {
        version: 1,
        id: 's',
        title: 'Generated',
        cards: visited.map((id) => ({
          id,
          title: id.toUpperCase(),
          kind: 'markdown' as const,
          content: `cards/${id}.md`,
        })),
        routes: routes.map((steps, index) => ({
          id: `route-${index}`,
          title: `Route ${index}`,
          steps: steps.map((target) => ({ target })),
        })),
      };
    }),
);

/** Project a generated space to React Flow nodes and edges. Colors are
 *  irrelevant to these invariants, so the fallback is fine. */
function project(spaceFile: unknown) {
  const result = loadSpace(spaceFile);
  if (!result.ok) throw new Error(`generated space should load: ${JSON.stringify(result.errors)}`);
  const space = result.space;

  return {
    nodes: projectCardNodes(space, buildCardHandles(space), {}),
    edges: projectRouteEdges(buildRouteEdges(space), {}),
  };
}

describe('projection handle invariants', () => {
  it('every edge names handles that exist on the nodes it connects', () => {
    fc.assert(
      fc.property(spaceFileArb, (spaceFile) => {
        const { nodes, edges } = project(spaceFile);

        const handleIds = new Map(
          nodes.map((node) => [
            node.id,
            {
              source: new Set(node.data.sourceHandles.map((handle) => handle.id)),
              target: new Set(node.data.targetHandles.map((handle) => handle.id)),
            },
          ]),
        );

        // Not vacuous: routes of two-plus steps always produce edges.
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

  it('a card never carries two handles of the same kind with the same id', () => {
    fc.assert(
      fc.property(spaceFileArb, (spaceFile) => {
        const { nodes } = project(spaceFile);

        // React Flow can't tell two same-side handles apart otherwise, and picks
        // whichever it finds first. Holds here because a handle id is
        // `<routeId>::out`/`::in` and a route may not revisit a card (ADR 0012) —
        // an invariant that leans on a domain rule, which is why it is pinned.
        for (const node of nodes) {
          const sourceIds = node.data.sourceHandles.map((handle) => handle.id);
          const targetIds = node.data.targetHandles.map((handle) => handle.id);
          expect(new Set(sourceIds).size, `${node.id} source handles`).toBe(sourceIds.length);
          expect(new Set(targetIds).size, `${node.id} target handles`).toBe(targetIds.length);
        }
      }),
    );
  });
});
