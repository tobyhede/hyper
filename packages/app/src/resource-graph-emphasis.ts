import type { Graph, GraphId, ResourceId } from '@project/core';
import { graphResourceIds, type Space } from '@project/graph';
import { UNEMPHASISED, type ResourceEmphasis } from '@project/react-flow-adapter';
import { FALLBACK_GRAPH_COLOR } from '@project/ui';

const INK_RECEDING: ResourceEmphasis = { ...UNEMPHASISED, receding: true };

/**
 * How each Resource on a Map is drawn for the Graphs that reach it (ADR 0135),
 * answered for the Active Graph it is given.
 *
 * A Resource is in a Graph when it is an endpoint of one of that Graph's Edges.
 * One the Active Graph reaches is drawn in the Active Graph's colour; any other
 * is drawn in the colour of the first of `graphs`, the Map's own in authored
 * order, that it is in, and in ink when it is in none. Every Resource the Active
 * Graph does not reach recedes — unless the Active Graph has no Edges, when
 * nothing does, so an Add Graph does not dim the Map it adds to.
 *
 * Which Graphs reach which Resources depends only on the Map, so it is read once
 * here and not on each projection.
 */
export function resourceGraphEmphasis(
  space: Space,
  graphs: readonly Graph[],
  colors: Readonly<Record<string, string>>,
): (activeGraphId: GraphId | null) => (resourceId: ResourceId) => ResourceEmphasis {
  // The lookup `projectGraphEdges` colours each Edge by, so a border matches its line.
  const colorOf = (graphId: GraphId): string => colors[graphId] ?? FALLBACK_GRAPH_COLOR;
  const members = new Map<GraphId, ReadonlySet<ResourceId>>(
    graphs.map((graph) => [graph.id, new Set(graphResourceIds(space, graph.id))]),
  );
  const firstGraph = new Map<ResourceId, GraphId>();
  for (const [graphId, resourceIds] of members) {
    for (const resourceId of resourceIds) {
      if (!firstGraph.has(resourceId)) firstGraph.set(resourceId, graphId);
    }
  }

  return (activeGraphId) => {
    const active =
      activeGraphId === null
        ? undefined
        : { color: colorOf(activeGraphId), reaches: members.get(activeGraphId) ?? new Set() };
    const recedes = (active?.reaches.size ?? 0) > 0;
    return (resourceId) => {
      if (active?.reaches.has(resourceId) === true) {
        return { borderColor: active.color, receding: false };
      }
      const graphId = firstGraph.get(resourceId);
      if (graphId === undefined) return recedes ? INK_RECEDING : UNEMPHASISED;
      return { borderColor: colorOf(graphId), receding: recedes };
    };
  };
}
