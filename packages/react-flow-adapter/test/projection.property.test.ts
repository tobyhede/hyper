import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildCardHandles, buildRouteEdges, loadSpace, type CardFile } from '@project/graph';
import { projectCardNodes, projectRouteEdges } from '../src/index';
import { cardFile } from './card-files';

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
  .map((ns) => ns.map(uuidFrom));

function uuidFrom(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

/**
 * A space file whose routes each run over distinct cards in some order: a chain
 * through all of them, plus up to three **shortcuts** skipping ahead. Every edge
 * points forward in that order and each exact Edge appears once, so `loadSpace`
 * always accepts what we generate; cards are the union of what the routes
 * touch, so there are no orphans either.
 *
 * The shortcuts are the point. They fork a card and merge into a later one,
 * which is the shape a step list could not express and the one that puts several
 * edges on a single handle.
 */
const routeArb = (pool: string[]) =>
  fc
    .tuple(
      fc.shuffledSubarray(pool, { minLength: 2 }),
      fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 3 }),
    )
    .map(([cards, shortcuts]) => {
      const edges = cards.slice(0, -1).map((from, i) => ({ from, to: cards[i + 1]! }));
      for (const [rawFrom, rawSkip] of shortcuts) {
        const from = rawFrom % cards.length;
        const to = from + 2 + (rawSkip % cards.length);
        const edge = { from: cards[from]!, to: cards[to]! };
        if (
          to < cards.length &&
          !edges.some((candidate) => candidate.from === edge.from && candidate.to === edge.to)
        ) {
          edges.push(edge);
        }
      }
      return { cards, edges };
    });

const spaceFileArb = cardIdPool.chain((pool) =>
  fc.array(routeArb(pool), { minLength: 1, maxLength: 4 }).map((routes) => {
    const visited = [...new Set(routes.flatMap((r) => r.cards))];
    return {
      file: {
        version: 2,
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Generated',
        routes: routes.map((route, index) => ({
          id: uuidFrom(index + 100),
          title: `Route ${index}`,
          edges: route.edges,
        })),
      },
      cardFiles: visited.map((id) => cardFile(id)),
    };
  }),
);

/** Project a generated space to React Flow nodes and edges. Colors are
 *  irrelevant to these invariants, so the fallback is fine. */
function project(generated: { file: unknown; cardFiles: CardFile[] }) {
  const result = loadSpace(generated.file, generated.cardFiles);
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
      fc.property(spaceFileArb, (generated) => {
        const { nodes, edges } = project(generated);

        const handleIds = new Map(
          nodes.map((node) => [
            node.id,
            {
              source: new Set(node.data.sourceHandles.map((handle) => handle.id)),
              target: new Set(node.data.targetHandles.map((handle) => handle.id)),
            },
          ]),
        );

        // Not vacuous: every generated route carries at least one edge.
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
      fc.property(spaceFileArb, (generated) => {
        const { nodes } = project(generated);

        // React Flow can't tell two same-side handles apart otherwise, and picks
        // whichever it finds first. Holds here because a handle id is
        // `<routeId>::out`/`::in` — one per route per side, so a card a route
        // forks at still carries exactly one outbound handle however many edges
        // leave it. The scheme, not a domain rule, is what makes this true.
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
