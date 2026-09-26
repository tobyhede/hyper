import type { Graph, GraphHeadShape, GraphId } from '@project/core';
import { GRAPH_PALETTE } from '@project/graph';

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
 * How a connection preview is drawn: in the colour of the Graph the new Edge
 * will join, ending in the head shape that Graph stores. `headShape` is the
 * stored value, absent where the Graph stores none or none is joined yet;
 * the preview resolves it through `graphHeadShape` like every other Edge.
 */
export interface ConnectionAppearance {
  readonly color: string;
  readonly headShape: GraphHeadShape | undefined;
}

/** The appearance of a connection that joins `graphId`, one of `graphs`, or none yet. */
export function connectionAppearance(
  graphs: readonly Graph[],
  colorByGraphId: Record<string, string>,
  graphId: GraphId | null,
): ConnectionAppearance {
  const graph = graphs.find((each) => each.id === graphId);
  return { color: activeGraphColor(colorByGraphId, graphId), headShape: graph?.headShape };
}
