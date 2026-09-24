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
