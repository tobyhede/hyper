import type { Graph, GraphId, ResourceId } from '@project/core';
import { GRAPH_PALETTE, graphResourceIds, type Space } from '@project/graph';
import type { ResourceEmphasis } from '@project/react-flow-adapter';

const INK: ResourceEmphasis = { borderColor: null, receding: false };

/**
 * How each Resource on a Map is drawn for the Graphs that reach it (ADR 0135).
 *
 * A Resource is in a Graph when it is an endpoint of one of that Graph's Edges.
 * One the Active Graph reaches is drawn in the Active Graph's colour; any other
 * is drawn in the colour of the first of `graphs`, the Map's own in authored
 * order, that it is in, and in ink when it is in none. Every Resource the Active
 * Graph does not reach recedes — unless the Active Graph has no Edges, when
 * nothing does, so an Add Graph does not dim the Map it adds to.
 */
export function resourceGraphEmphasis(
  space: Space,
  graphs: readonly Graph[],
  colors: Readonly<Record<string, string>>,
  activeGraphId: GraphId | null,
): (resourceId: ResourceId) => ResourceEmphasis {
  const colorOf = (graphId: GraphId): string => colors[graphId] ?? GRAPH_PALETTE[0];
  const firstGraph = new Map<ResourceId, GraphId>();
  for (const graph of graphs) {
    for (const resourceId of graphResourceIds(space, graph.id)) {
      if (!firstGraph.has(resourceId)) firstGraph.set(resourceId, graph.id);
    }
  }
  const active =
    activeGraphId === null || !graphs.some((graph) => graph.id === activeGraphId)
      ? new Set<ResourceId>()
      : new Set(graphResourceIds(space, activeGraphId));
  const recedes = active.size > 0;

  return (resourceId) => {
    if (activeGraphId !== null && active.has(resourceId)) {
      return { borderColor: colorOf(activeGraphId), receding: false };
    }
    const graphId = firstGraph.get(resourceId);
    if (graphId === undefined) return recedes ? { ...INK, receding: true } : INK;
    return { borderColor: colorOf(graphId), receding: recedes };
  };
}
