import type { Space } from '@project/graph';

/** Distinct, reasonably accessible edge colors, assigned to graphs by order. */
export const GRAPH_PALETTE = [
  '#6ea8fe', // blue
  '#f59e0b', // amber
  '#34d399', // green
  '#f472b6', // pink
  '#c084fc', // purple
  '#f87171', // red
] as const;

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

/** Resolve each graph's color: its space `color`, else a palette slot by order. */
export function graphColorMap(space: Space): Record<string, string> {
  const map: Record<string, string> = {};
  space.graphs.forEach((graph, index) => {
    map[graph.id] = graph.color ?? GRAPH_PALETTE[index % GRAPH_PALETTE.length] ?? '#8a94a6';
  });
  return map;
}
