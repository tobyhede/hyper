import type { Space } from './space';

/**
 * Tableau Classic 20 — twenty curated categorical colours (dark/light pairs).
 *
 * The twenty hex values are Tableau Classic 20. Order here is for the two-column
 * swatch picker — each hue's dark and light slots share a row, and successive rows
 * follow colour-wheel adjacency (blue → cyan → green → … → grey) so related hues
 * sit near each other vertically. `graph-color.test.ts` holds the layout.
 * {@link nextGraphColor} reads the even slots as each hue's dark one, and otherwise
 * chooses by distance, so the order matters to it only for breaking ties.
 *
 * It lives here rather than beside the canvas because every Graph creation
 * gesture stores a colour chosen from it, and two of those gestures —
 * `initializeSpace`'s first Graph and a mapless Space's first-load Graph in
 * `@project/persistence` — sit below the application.
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
const GRAPH_PALETTE_LABELS = {
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

/** A colour as a point in OKLab, where Euclidean distance approximates perceived difference. */
interface OklabPoint {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** One sRGB channel byte, gamma-decoded to linear light. */
const linearChannel = (byte: number): number => {
  const encoded = byte / 255;
  return encoded <= 0.040_45 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
};

/**
 * `#rrggbb` or `#rgb`, in either case, as an OKLab point (Björn Ottosson's
 * sRGB → OKLab matrices); `null` for any other CSS colour spelling, which a
 * stored Graph `color` is free to be.
 */
function oklab(color: string): OklabPoint | null {
  if (!HEX_COLOR.test(color)) return null;
  const digits = color.slice(1);
  const full = digits.length === 3 ? digits.replace(/./g, (digit) => digit + digit) : digits;
  const r = linearChannel(Number.parseInt(full.slice(0, 2), 16));
  const g = linearChannel(Number.parseInt(full.slice(2, 4), 16));
  const b = linearChannel(Number.parseInt(full.slice(4, 6), 16));
  const l = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const m = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const s = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);
  return {
    l: 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    a: 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
    b: 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
  };
}

/**
 * The perceptual distance between two colours — Euclidean in OKLab — or `null`
 * when either is not a hex colour {@link nextGraphColor} can read.
 *
 * Exported for this module's tests, which state the rule in its terms; the
 * package index does not offer it.
 */
export function graphColorDistance(first: string, second: string): number | null {
  const p = oklab(first);
  const q = oklab(second);
  if (p === null || q === null) return null;
  return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
}

/** Each hue's dark slot: the even slots of {@link GRAPH_PALETTE}'s dark-then-light rows. */
const GRAPH_PALETTE_DARK_SLOTS = GRAPH_PALETTE.filter((_, index) => index % 2 === 0);

/**
 * The colour stored on a Graph when it is created: the palette slot whose
 * nearest colour among `existing` — the colours the owning Map's other Graphs
 * carry — is farthest away, by {@link graphColorDistance}.
 *
 * Candidates are the ten dark slots while any of them is not already in
 * `existing`, and all twenty once every one is. Holding the light slots back
 * until the dark ones run out is a decision of
 * `.scratch/graph-colour/issues/01-a-new-graph-takes-the-farthest-colour.md`,
 * not a property this function measures; an author can still choose a light
 * slot from Colour…. Ties break by palette order, so an empty Map's first Graph
 * is the first slot.
 *
 * A colour in `existing` that is not `#rrggbb` or `#rgb` is ignored: it neither
 * pushes candidates away nor marks a slot used. It is the caller's to say what a
 * Graph with no stored colour counts as; Space Authoring passes the colour the
 * Map draws for it (`space-authoring-operations.test.ts`, "counts a Graph with
 * no stored colour as the colour the Map draws for it").
 *
 * Stored rather than resolved. Every creation gesture chooses by this same
 * Map-local rule — including `initializeSpace`'s first Graph and the
 * first-load Graph `@project/persistence` gives a mapless Space — so a Graph does
 * not get different properties according to how it was created.
 *
 * The palette is an authoring constant, not a domain constraint:
 * {@link graphColorsByGraphId} still resolves a fallback for an imported graph that
 * carries no color of its own.
 */
export function nextGraphColor(existing: readonly string[]): string {
  const used = new Set(existing.map((color) => color.toLowerCase()));
  const candidates = GRAPH_PALETTE_DARK_SLOTS.some((slot) => !used.has(slot))
    ? GRAPH_PALETTE_DARK_SLOTS
    : GRAPH_PALETTE;
  let chosen: string = GRAPH_PALETTE[0];
  let chosenDistance = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const color of existing) {
      const distance = graphColorDistance(candidate, color);
      if (distance !== null) nearest = Math.min(nearest, distance);
    }
    if (nearest > chosenDistance) {
      chosen = candidate;
      chosenDistance = nearest;
    }
  }
  return chosen;
}

/** Resolve each graph's color: its space `color`, else a palette slot by order. */
export function graphColorsByGraphId(space: Space): Record<string, string> {
  const map: Record<string, string> = {};
  space.graphs.forEach((graph, index) => {
    map[graph.id] = graph.color ?? GRAPH_PALETTE[index % GRAPH_PALETTE.length] ?? '#8a94a6';
  });
  return map;
}
