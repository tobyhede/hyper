import type { Space } from '@project/graph';

/**
 * Tableau Classic 20 — twenty curated categorical colours (dark/light pairs).
 *
 * The twenty hex values are Tableau Classic 20. Order here is for the two-column
 * swatch picker — each hue's dark and light slots share a row, and successive rows
 * follow colour-wheel adjacency (blue → cyan → green → … → grey) so related hues
 * sit near each other vertically. `colors.test.ts` holds the layout; {@link nextGraphColor}
 * rotates through it rather than Tableau's categorical assignment order.
 */
export const GRAPH_PALETTE = [
  '#1f77b4', // blue
  '#aec7e8', // blue light
  '#17becf', // cyan
  '#9edae5', // cyan light
  '#2ca02c', // green
  '#98df8a', // green light
  '#bcbd22', // olive
  '#dbdb8d', // olive light
  '#ff7f0e', // orange
  '#ffbb78', // orange light
  '#d62728', // red
  '#ff9896', // red light
  '#e377c2', // pink
  '#f7b6d2', // pink light
  '#9467bd', // purple
  '#c5b0d5', // purple light
  '#8c564b', // brown
  '#c49c94', // brown light
  '#7f7f7f', // grey
  '#c7c7c7', // grey light
] as const;

/** Short hue names for every {@link GRAPH_PALETTE} slot — keyed by colour hex. */
export const GRAPH_PALETTE_LABELS = {
  '#1f77b4': 'Blue',
  '#aec7e8': 'Blue light',
  '#ff7f0e': 'Orange',
  '#ffbb78': 'Orange light',
  '#2ca02c': 'Green',
  '#98df8a': 'Green light',
  '#d62728': 'Red',
  '#ff9896': 'Red light',
  '#9467bd': 'Purple',
  '#c5b0d5': 'Purple light',
  '#8c564b': 'Brown',
  '#c49c94': 'Brown light',
  '#e377c2': 'Pink',
  '#f7b6d2': 'Pink light',
  '#7f7f7f': 'Grey',
  '#c7c7c7': 'Grey light',
  '#bcbd22': 'Olive',
  '#dbdb8d': 'Olive light',
  '#17becf': 'Cyan',
  '#9edae5': 'Cyan light',
} as const satisfies Record<(typeof GRAPH_PALETTE)[number], string>;

/** Label and hex pairs derived from the palette — callers do not zip by index. */
export const GRAPH_PALETTE_ENTRIES = GRAPH_PALETTE.map(
  (color): { readonly color: (typeof GRAPH_PALETTE)[number]; readonly label: string } => ({
    color,
    label: GRAPH_PALETTE_LABELS[color],
  }),
);

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
 * palette by the Graph's appended position in its owning Diagram.
 *
 * Stored rather than resolved. Every creation gesture rotates by this same
 * Diagram-local rule, so a Graph does not get different properties according to
 * whether it was added through Graph management or minted by the first
 * connection drawn in a Diagram.
 *
 * The palette is an authoring constant, not a domain constraint:
 * {@link graphColorMap} still resolves a fallback for an imported graph that
 * carries no color of its own.
 */
export const nextGraphColor = (owningDiagramGraphCount: number): string =>
  GRAPH_PALETTE[owningDiagramGraphCount % GRAPH_PALETTE.length] ?? GRAPH_PALETTE[0];

/** Resolve each graph's color: its space `color`, else a palette slot by order. */
export function graphColorMap(space: Space): Record<string, string> {
  const map: Record<string, string> = {};
  space.graphs.forEach((graph, index) => {
    map[graph.id] = graph.color ?? GRAPH_PALETTE[index % GRAPH_PALETTE.length] ?? '#8a94a6';
  });
  return map;
}

/**
 * The palette a Graph's colour is chosen from, named.
 *
 * `GRAPH_PALETTE` is the application's own — the same six values authoring
 * rotates through when it mints a Graph — so the menu cannot offer a colour the
 * canvas would not draw. The names belong with the palette, because a swatch with no
 * word beside it is a colour a reader cannot ask anyone else for.
 *
 * **Keyed by the colour and not by its position.** A parallel list zipped by
 * index agrees with the palette exactly as long as nobody reorders it, and
 * reordering a palette is a colour decision taken in `colors.ts` with no reason
 * to look at this menu — after which every swatch is mislabelled, the reader
 * picks Blue and gets amber, and typecheck, lint and every suite stay green
 * because nothing asserted the pairing. Keyed, a reorder cannot say anything
 * and a *new* colour is a compile error here rather than a hex code drawn as
 * its own name, which is what the `??` fallback beside the zip did.
 */
const GRAPH_COLOR_NAMES = {
  '#6ea8fe': 'Blue',
  '#f59e0b': 'Amber',
  '#34d399': 'Green',
  '#f472b6': 'Pink',
  '#c084fc': 'Purple',
  '#f87171': 'Red',
} as const satisfies Record<(typeof GRAPH_PALETTE)[number], string>;

export const GRAPH_COLORS: readonly (readonly [string, string])[] = GRAPH_PALETTE.map(
  (color): readonly [string, string] => [GRAPH_COLOR_NAMES[color], color],
);
