import type { ThingId, GraphEdge, GraphId } from '@project/core';
import type { Space } from './space';

/**
 * Derives the render surface's connections from the authored Graphs.
 *
 * Each authored `{ from, to }` Edge becomes one connection belonging to its
 * Graph, tagged so the render layer can colour it. This is what lets each Graph
 * draw as its own coloured line across the canvas. It belongs to the
 * **overview** — the view that draws every Graph at once (ADR 0021) — not to
 * the domain.
 *
 * It named the two ports each Edge attached to until ADR 0087. A Thing carried
 * an invisible `<graphId>::in` on its left and `<graphId>::out` on its right,
 * one pair per Graph, because elkjs needed ports to route through; ADR 0045
 * justified the *ids* separately, on React Flow's rule that same-kind handles be
 * distinguishable. Four anchors named for their sides satisfy that just as well,
 * and an Edge now attaches to whichever of them faces its neighbour — chosen
 * while it is drawn, from where the two Things are at that moment, which is not
 * something this derivation could answer.
 */

/**
 * A Graph's Edge as the render graph draws it: the authored `{ from, to }`
 * (`@project/core`'s `GraphEdge`), tagged with the Graph it belongs to so the
 * render layer can colour it. `buildLayoutStrategyGraph` narrows this to a
 * `LayoutStrategyEdge`, which is the same Edge without the Graph it is tagged
 * with — a strategy arranges the Things and answers no geometry for an Edge at
 * all (ADR 0086), and where an Edge attaches is decided while it is drawn
 * (ADR 0087).
 */
export interface GraphRenderEdge {
  id: string;
  graphId: GraphId;
  source: ThingId;
  target: ThingId;
}

/**
 * The render layer's id for one authored edge: the Graph and the two endpoints.
 *
 * Named and offered because it owns the format, and a second producer of it is
 * the defect. A test that
 * stands a projected Edge up by hand mints its id here rather than spelling the
 * separator out, so changing the format moves those fixtures with it instead of
 * leaving them green against a shape nothing mints any more. That is the
 * failure this very format was introduced to end, one layer up.
 */
export const graphRenderEdgeId = (graphId: GraphId, edge: GraphEdge): string =>
  `${graphId}::${edge.from}::${edge.to}`;

/**
 * The distinct things the given graphs touch — graphs in the order supplied,
 * edges in authored order within each, and each edge's `from` before its `to`.
 *
 * A membership query, not a traversal: it answers *which* Things, and the order is
 * only a stable one to list them in. A graph is a graph, so there is no single
 * order to visit them in and this does not claim one.
 *
 * A thing shared by several graphs appears once. Which graphs a view shows is the
 * view's decision (ADR 0005); this only answers what things that implies.
 */
export function thingIdsForGraphs(space: Space, graphIds: readonly GraphId[]): ThingId[] {
  const seen = new Set<ThingId>();
  const ids: ThingId[] = [];
  const add = (thingId: ThingId): void => {
    if (seen.has(thingId)) return;
    seen.add(thingId);
    ids.push(thingId);
  };

  for (const graphId of graphIds) {
    const owned = space.lookup.graph(graphId);
    if (!owned) continue;
    for (const edge of owned.graph.edges) {
      add(edge.from);
      add(edge.to);
    }
  }

  return ids;
}

/** The distinct things a single graph touches. See {@link thingIdsForGraphs}. */
export function graphThingIds(space: Space, graphId: GraphId): ThingId[] {
  return thingIdsForGraphs(space, [graphId]);
}

/**
 * Every Graph's authored edges, as the render layer draws them.
 *
 * One edge in, one edge out: the graph already *is* its connections, so nothing
 * here derives them from an order.
 *
 * **The id names the same triple the render layer identifies an Edge by** — the
 * graph and the two endpoints — and a graph cannot hold the same pair twice
 * (ADR 0032), so it names exactly one edge. That agreement is the point: the
 * render layer's Edge subject is `{ graphId, edge }` compared by those three
 * fields (`sameEdgeSubject`), and while the id was keyed on the edge's
 * *position* in its graph the two disagreed about what an Edge is. A removed or
 * replaced edge slid every later id down one, so a surviving edge inherited an
 * id that had named its neighbour, and the element React Flow had already drawn
 * for the departed edge answered a query for whichever edge took its slot —
 * which is how a completed reconnection ended up focused on a stale element
 * that put the replaced Edge back on the selection.
 *
 * The id is opaque to every consumer: nothing parses it.
 *
 * **What holds the uniqueness up is `duplicate-graph-edge`**, not this function.
 * The position-keyed id was collision-proof by construction; this one leans on
 * the intake rule, so a graph that carried the same pair twice would mint the
 * same id twice — a React key collision, and one Edge's selection changes
 * resolving to the other. `validateReferences` refuses such a document and
 * `edge-already-exists` refuses the connect and the reconnect that would author
 * one, so nothing reaches here holding two; that is the invariant to protect if
 * either rule is ever relaxed.
 */
export function buildGraphRenderEdges(space: Space): GraphRenderEdge[] {
  const edges: GraphRenderEdge[] = [];

  for (const graph of space.graphs) {
    for (const edge of graph.edges) {
      edges.push({
        id: graphRenderEdgeId(graph.id, edge),
        graphId: graph.id,
        source: edge.from,
        target: edge.to,
      });
    }
  }

  return edges;
}
