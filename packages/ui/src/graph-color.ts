import type { Graph } from '@project/core';

export const FALLBACK_GRAPH_COLOR = '#8a94a6';

/**
 * Resolve a Graph's displayed colour from projection, authorship, then fallback.
 *
 * Its own shared module because **two production surfaces resolve it and must
 * not disagree**: the Space Sidebar's Graphs group and the canvas HUD's
 * Graph key both draw the same Graph, often at the same time, and a second
 * resolution rule would let one of them say a colour the other does not. It
 * outlived the `GraphLegend` component it used to sit beside for exactly that
 * reason — the markup had one caller and was folded into it, while this has two.
 */
export function graphColor(graph: Graph, colorByGraphId: Readonly<Record<string, string>>): string {
  return colorByGraphId[graph.id] ?? graph.color ?? FALLBACK_GRAPH_COLOR;
}
