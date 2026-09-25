import type { ResourceId, GraphEdge, GraphId } from '@project/core';
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
 * It names no anchor for an Edge. An Edge attaches to whichever of a Resource's
 * four side anchors faces its neighbour, chosen while it is drawn from where the
 * two Resources are at that moment, which is not something this derivation can
 * answer.
 */

/**
 * A Graph's Edge as the render graph draws it: the authored `{ from, to }`
 * (`@project/core`'s `GraphEdge`), tagged with the Graph it belongs to so the
 * render layer can colour it. `buildLayoutStrategyGraph` narrows this to a
 * `LayoutStrategyEdge`, which is the same Edge without the Graph it is tagged
 * with — a strategy arranges the Resources and answers no geometry for an Edge at
 * all (ADR 0086), and where an Edge attaches is decided while it is drawn
 * (ADR 0087).
 */
export interface GraphRenderEdge {
  id: string;
  graphId: GraphId;
  source: ResourceId;
  target: ResourceId;
  /** As the Graph stores them. Content, not identity: never part of `id`. */
  title?: string;
  titleHidden?: true;
}

/**
 * The render layer's id for one authored edge: the Graph and the two endpoints.
 *
 * Named and offered because it owns the format, and a second producer of it is
 * the defect. A test that
 * stands a projected Edge up by hand mints its id here rather than spelling the
 * separator out, so changing the format moves those fixtures with it instead of
 * leaving them green against a shape nothing mints any more.
 */
export const graphRenderEdgeId = (graphId: GraphId, edge: GraphEdge): string =>
  `${graphId}::${edge.from}::${edge.to}`;

/**
 * The distinct resources the given graphs touch — graphs in the order supplied,
 * edges in authored order within each, and each edge's `from` before its `to`.
 *
 * A membership query, not a traversal: it answers *which* Resources, and the order is
 * only a stable one to list them in. A graph is a graph, so there is no single
 * order to visit them in and this does not claim one.
 *
 * A resource shared by several graphs appears once. Which graphs a view shows is the
 * view's decision (ADR 0005); this only answers what resources that implies.
 */
export function resourceIdsForGraphs(space: Space, graphIds: readonly GraphId[]): ResourceId[] {
  const seen = new Set<ResourceId>();
  const ids: ResourceId[] = [];
  const add = (resourceId: ResourceId): void => {
    if (seen.has(resourceId)) return;
    seen.add(resourceId);
    ids.push(resourceId);
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

/** The distinct resources a single graph touches. See {@link resourceIdsForGraphs}. */
export function graphResourceIds(space: Space, graphId: GraphId): ResourceId[] {
  return resourceIdsForGraphs(space, [graphId]);
}

/**
 * Every Graph's authored edges, as the render layer draws them.
 *
 * One edge in, one edge out: the graph already *is* its connections, so nothing
 * here derives them from an order.
 *
 * **The id names the same triple the render layer identifies an Edge by** — the
 * graph and the two endpoints — and a graph cannot hold the same pair twice
 * (ADR 0032), so it names exactly one edge. Do not key it on the edge's
 * position in its graph: removing an edge would shift every later id, and the
 * element React Flow drew for a departed edge would answer for its successor.
 *
 * The id is opaque to every consumer: nothing parses it.
 *
 * **What holds the uniqueness up is `duplicate-graph-edge`**, not this function:
 * a graph carrying the same pair twice would mint the same id twice, a React
 * key collision. `validateReferences` refuses such a document and
 * `edge-already-exists` refuses the connect that would author one; that is the
 * invariant to protect if either rule is ever relaxed.
 */
export function buildGraphRenderEdges(space: Space): GraphRenderEdge[] {
  const edges: GraphRenderEdge[] = [];

  for (const graph of space.graphs) {
    for (const edge of graph.edges) {
      const rendered: GraphRenderEdge = {
        id: graphRenderEdgeId(graph.id, edge),
        graphId: graph.id,
        source: edge.from,
        target: edge.to,
      };
      if (edge.title !== undefined) rendered.title = edge.title;
      if (edge.titleHidden === true) rendered.titleHidden = true;
      edges.push(rendered);
    }
  }

  return edges;
}
