import type { ThingId, GraphEdge, GraphId } from '@project/core';
import type { Space } from './space';

/**
 * Derives the render surface's ports and connections from the authored Graphs.
 *
 * The model: a thing that a Graph leaves gets one outbound port
 * (`<graphId>::out`, on the right), a thing a Graph arrives at gets one inbound
 * port (`<graphId>::in`, on the left), and each authored `{ from, to }` Edge
 * becomes a port-to-port connection belonging to that Graph. One port per Graph
 * per side, however many Edges use it — a fork leaves a thing by the same
 * outbound port twice.
 *
 * This is what lets each Graph render as its own colored line across the
 * canvas and drives the ELK multiple-handles diagram. It belongs to the
 * **overview** — the view that draws every Graph at once and needs distinct
 * attachment points to stay legible (ADR 0021) — not to the domain.
 */

export interface GraphRenderHandleRef {
  /** Handle id, also used as the ELK port id. */
  id: string;
  graphId: GraphId;
}

export interface ThingHandleSet {
  /** Outbound ports (right / EAST). */
  sourceHandles: GraphRenderHandleRef[];
  /** Inbound ports (left / WEST). */
  targetHandles: GraphRenderHandleRef[];
}

/**
 * A Graph's Edge as the render graph draws it: the authored `{ from, to }`
 * (`@project/core`'s `GraphEdge`) resolved onto the ports it attaches to, and tagged with the Graph
 * it belongs to so the render layer can colour it. `buildLayoutStrategyGraph` narrows
 * this to a `LayoutStrategyEdge`, which is the same thing again once geometry lands on
 * it.
 */
export interface GraphRenderEdge {
  id: string;
  graphId: GraphId;
  source: ThingId;
  target: ThingId;
  sourceHandle: string;
  targetHandle: string;
}

export const outHandleId = (graphId: GraphId): string => `${graphId}::out`;
export const inHandleId = (graphId: GraphId): string => `${graphId}::in`;

/**
 * The render layer's id for one authored edge: the Graph and the two endpoints.
 *
 * Named and offered for the same reason `inHandleId` and `outHandleId` are — it
 * owns the format, and a second producer of it is the defect. A test that
 * stands a projected Edge up by hand mints its id here rather than spelling the
 * separator out, so changing the format moves those fixtures with it instead of
 * leaving them green against a shape nothing mints any more. That is the
 * failure this very format was introduced to end, one layer up.
 */
export const graphRenderEdgeId = (graphId: GraphId, edge: GraphEdge): string =>
  `${graphId}::${edge.from}::${edge.to}`;

/** Map each thing id to the in/out ports contributed by the graphs through it. */
export function buildThingHandles(space: Space): Map<ThingId, ThingHandleSet> {
  const map = new Map<ThingId, ThingHandleSet>();
  const ensure = (thingId: ThingId): ThingHandleSet => {
    let set = map.get(thingId);
    if (!set) {
      set = { sourceHandles: [], targetHandles: [] };
      map.set(thingId, set);
    }
    return set;
  };

  // A thing gets an outbound port because an edge leaves it and an inbound one
  // because an edge arrives — read off the edges directly rather than from a
  // thing's position in a list, so a fork's several outgoing edges share one
  // port and a graph's sinks get no outbound port because nothing leaves them.
  for (const graph of space.graphs) {
    for (const edge of graph.edges) {
      const outId = outHandleId(graph.id);
      const source = ensure(edge.from);
      if (!source.sourceHandles.some((h) => h.id === outId)) {
        source.sourceHandles.push({ id: outId, graphId: graph.id });
      }

      const inId = inHandleId(graph.id);
      const target = ensure(edge.to);
      if (!target.targetHandles.some((h) => h.id === inId)) {
        target.targetHandles.push({ id: inId, graphId: graph.id });
      }
    }
  }

  return map;
}

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

/** Keep only the handles belonging to the given graphs. */
export function filterHandlesByGraphs(
  handlesByThing: ReadonlyMap<ThingId, ThingHandleSet>,
  graphIds: readonly GraphId[],
): Map<ThingId, ThingHandleSet> {
  const wanted = new Set(graphIds);
  const filtered = new Map<ThingId, ThingHandleSet>();
  for (const [thingId, set] of handlesByThing) {
    const sourceHandles = set.sourceHandles.filter((h) => wanted.has(h.graphId));
    const targetHandles = set.targetHandles.filter((h) => wanted.has(h.graphId));
    if (sourceHandles.length || targetHandles.length) {
      filtered.set(thingId, { sourceHandles, targetHandles });
    }
  }
  return filtered;
}

/** Keep only the handles belonging to a single graph. */
export function filterHandlesByGraph(
  handlesByThing: ReadonlyMap<ThingId, ThingHandleSet>,
  graphId: GraphId,
): Map<ThingId, ThingHandleSet> {
  return filterHandlesByGraphs(handlesByThing, [graphId]);
}

/**
 * Resolve every graph's authored edges onto the ports they attach to.
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
 * The id is opaque to every consumer: nothing parses it, and the handle ids
 * (`<graphId>::out`/`::in`) are minted separately and unaffected.
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
        sourceHandle: outHandleId(graph.id),
        targetHandle: inHandleId(graph.id),
      });
    }
  }

  return edges;
}
