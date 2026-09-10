import type { Graph } from '@project/core';

export const FALLBACK_GRAPH_COLOR = '#8a94a6';

/**
 * Resolve a Graph's displayed colour from projection, authorship, then fallback.
 *
 * Its own shared module because **two production surfaces resolve it and must
 * not disagree**: the Command Dock's Graph cluster — its glyph, its colour
 * submenu and the Present control that carries the Active Graph's identity —
 * and the canvas's own Edges both draw the same Graph at the same time, and a
 * second resolution rule would let one of them say a colour the other does not.
 * The two surfaces have changed since (the Sidebar's Graphs group was the first
 * of them); the reason for one module has not. It outlived the `GraphLegend`
 * component it used to sit beside for exactly that reason — the markup had one
 * caller and was folded into it, while this has two.
 */
export function graphColor(graph: Graph, colorByGraphId: Readonly<Record<string, string>>): string {
  return colorByGraphId[graph.id] ?? graph.color ?? FALLBACK_GRAPH_COLOR;
}
