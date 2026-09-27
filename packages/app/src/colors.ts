import { graphHeadShape, type Graph, type GraphId } from '@project/core';
import { GRAPH_PALETTE } from '@project/graph';
import type { GraphAppearance } from '@project/ui';

/**
 * The active graph's color, which authoring draws in as well as the overview.
 * A Space with no active Graph still needs a stroke — a first connection is
 * drawn before the Graph it mints exists — so the first palette slot stands in.
 */
export function activeGraphColor(
  colorByGraphId: Record<string, string>,
  activeGraphId: string | null,
): string {
  if (activeGraphId === null) return GRAPH_PALETTE[0];
  return colorByGraphId[activeGraphId] ?? GRAPH_PALETTE[0];
}

/**
 * The appearance of a connection that joins `graphId`, one of `graphs`, or none
 * yet: the colour of the Graph the new Edge will join and the head shape it
 * draws, resolved through `graphHeadShape` like every other Edge's, so a Graph
 * that stores none — or none joined yet — previews as the default.
 */
export function connectionAppearance(
  graphs: readonly Graph[],
  colorByGraphId: Record<string, string>,
  graphId: GraphId | null,
): GraphAppearance {
  const graph = graphs.find((each) => each.id === graphId);
  return {
    color: activeGraphColor(colorByGraphId, graphId),
    headShape: graphHeadShape(graph ?? {}),
  };
}
