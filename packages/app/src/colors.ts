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

/**
 * The color authoring stores on a graph it creates, rotating through the
 * palette by the Graph's appended position in its owning Layout.
 *
 * Stored rather than resolved. Every creation gesture rotates by this same
 * Layout-local rule, so a Graph does not get different properties according to
 * whether it was added through Graph management or minted by the first
 * connection drawn in a Layout.
 *
 * The palette is an authoring constant, not a domain constraint:
 * {@link graphColorMap} still resolves a fallback for an imported graph that
 * carries no color of its own.
 */
export const nextGraphColor = (owningLayoutGraphCount: number): string =>
  GRAPH_PALETTE[owningLayoutGraphCount % GRAPH_PALETTE.length] ?? GRAPH_PALETTE[0];

/** Resolve each graph's color: its space `color`, else a palette slot by order. */
export function graphColorMap(space: Space): Record<string, string> {
  const map: Record<string, string> = {};
  space.graphs.forEach((graph, index) => {
    map[graph.id] = graph.color ?? GRAPH_PALETTE[index % GRAPH_PALETTE.length] ?? '#8a94a6';
  });
  return map;
}
