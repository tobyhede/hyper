import { graphHeadShape, type Graph, type GraphHeadShape } from '@project/core';

export const FALLBACK_GRAPH_COLOR = '#8a94a6';

/**
 * Resolve a Graph's displayed colour from projection, authorship, then fallback.
 *
 * Its own shared module because **two production surfaces resolve it and must
 * not disagree**: the Command Dock's Graph cluster — its glyph, its colour
 * submenu and the Present control that carries the Active Graph's identity —
 * and the canvas's own Edges both draw the same Graph at the same time, and a
 * second resolution rule would let one of them say a colour the other does not.
 */
export function graphColor(graph: Graph, colorByGraphId: Readonly<Record<string, string>>): string {
  return colorByGraphId[graph.id] ?? graph.color ?? FALLBACK_GRAPH_COLOR;
}

/** How a Graph's Edges are drawn: the two channels an Edge is told apart by. */
export interface GraphAppearance {
  readonly color: string;
  readonly headShape: GraphHeadShape;
}

/**
 * A Graph's resolved colour and head shape, through `graphColor` and core's
 * `graphHeadShape` — the pair every list naming a Graph marks its row in.
 */
export function graphAppearance(
  graph: Graph,
  colorByGraphId: Readonly<Record<string, string>>,
): GraphAppearance {
  return { color: graphColor(graph, colorByGraphId), headShape: graphHeadShape(graph) };
}
