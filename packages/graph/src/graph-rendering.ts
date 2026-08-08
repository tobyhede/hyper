import type { CardId, GraphId } from '@project/core';
import type { Space } from './space';

/**
 * Derives the graph's ports and connections from its graphs.
 *
 * The model: a card that a graph leaves gets one outbound port
 * (`<graphId>::out`, on the right), a card a graph arrives at gets one inbound
 * port (`<graphId>::in`, on the left), and each authored `{ from, to }` edge
 * becomes a port-to-port connection belonging to that graph. One port per graph
 * per side, however many edges use it — a fork leaves a card by the same
 * outbound port twice.
 *
 * This is what lets each graph render as its own colored line through the graph
 * and drives the ELK multiple-handles layout. It belongs to the **overview** —
 * the view that draws every graph at once and needs distinct attachment points
 * to stay legible (ADR 0021) — not to the domain.
 */

export interface GraphRenderHandleRef {
  /** Handle id, also used as the ELK port id. */
  id: string;
  graphId: GraphId;
}

export interface CardHandleSet {
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
  source: CardId;
  target: CardId;
  sourceHandle: string;
  targetHandle: string;
}

export const outHandleId = (graphId: GraphId): string => `${graphId}::out`;
export const inHandleId = (graphId: GraphId): string => `${graphId}::in`;

/** Map each card id to the in/out ports contributed by the graphs through it. */
export function buildCardHandles(space: Space): Map<CardId, CardHandleSet> {
  const map = new Map<CardId, CardHandleSet>();
  const ensure = (cardId: CardId): CardHandleSet => {
    let set = map.get(cardId);
    if (!set) {
      set = { sourceHandles: [], targetHandles: [] };
      map.set(cardId, set);
    }
    return set;
  };

  // A card gets an outbound port because an edge leaves it and an inbound one
  // because an edge arrives — read off the edges directly rather than from a
  // card's position in a list, so a fork's several outgoing edges share one
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
 * The distinct cards the given graphs touch — graphs in the order supplied,
 * edges in authored order within each, and each edge's `from` before its `to`.
 *
 * A membership query, not a traversal: it answers *which* Cards, and the order is
 * only a stable one to list them in. A graph is a graph, so there is no single
 * order to visit them in and this does not claim one.
 *
 * A card shared by several graphs appears once. Which graphs a view shows is the
 * view's decision (ADR 0005); this only answers what cards that implies.
 */
export function cardIdsForGraphs(space: Space, graphIds: readonly GraphId[]): CardId[] {
  const seen = new Set<CardId>();
  const ids: CardId[] = [];
  const add = (cardId: CardId): void => {
    if (seen.has(cardId)) return;
    seen.add(cardId);
    ids.push(cardId);
  };

  for (const graphId of graphIds) {
    const graph = space.graphsById.get(graphId);
    if (!graph) continue;
    for (const edge of graph.edges) {
      add(edge.from);
      add(edge.to);
    }
  }

  return ids;
}

/** The distinct cards a single graph touches. See {@link cardIdsForGraphs}. */
export function graphCardIds(space: Space, graphId: GraphId): CardId[] {
  return cardIdsForGraphs(space, [graphId]);
}

/** Keep only the handles belonging to the given graphs. */
export function filterHandlesByGraphs(
  handlesByCard: ReadonlyMap<CardId, CardHandleSet>,
  graphIds: readonly GraphId[],
): Map<CardId, CardHandleSet> {
  const wanted = new Set(graphIds);
  const filtered = new Map<CardId, CardHandleSet>();
  for (const [cardId, set] of handlesByCard) {
    const sourceHandles = set.sourceHandles.filter((h) => wanted.has(h.graphId));
    const targetHandles = set.targetHandles.filter((h) => wanted.has(h.graphId));
    if (sourceHandles.length || targetHandles.length) {
      filtered.set(cardId, { sourceHandles, targetHandles });
    }
  }
  return filtered;
}

/** Keep only the handles belonging to a single graph. */
export function filterHandlesByGraph(
  handlesByCard: ReadonlyMap<CardId, CardHandleSet>,
  graphId: GraphId,
): Map<CardId, CardHandleSet> {
  return filterHandlesByGraphs(handlesByCard, [graphId]);
}

/**
 * Resolve every graph's authored edges onto the ports they attach to.
 *
 * One edge in, one edge out: the graph already *is* its connections, so nothing
 * here derives them from an order. The id is keyed on the edge's position in its
 * graph because that stays unique even if a graph were to carry the same pair
 * twice.
 */
export function buildGraphRenderEdges(space: Space): GraphRenderEdge[] {
  const edges: GraphRenderEdge[] = [];

  for (const graph of space.graphs) {
    graph.edges.forEach((edge, index) => {
      edges.push({
        id: `${graph.id}::${index}`,
        graphId: graph.id,
        source: edge.from,
        target: edge.to,
        sourceHandle: outHandleId(graph.id),
        targetHandle: inHandleId(graph.id),
      });
    });
  }

  return edges;
}
