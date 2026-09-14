/** The authored size of every collapsed Thing (ADR 0064). */
export const COLLAPSED_THING_SIZE = { width: 260, height: 146 } as const;

/** The concrete Open Size recorded when a Thing first Opens (ADR 0066). */
export const DEFAULT_OPEN_SIZE = { width: 560, height: 420 } as const;
/** Room for an Open target Thing, its neighbours and the Space Thing's own Title. */
export const DEFAULT_SPACE_THING_OPEN_SIZE = { width: 960, height: 720 } as const;

/**
 * Canvas padding measured from a Space Thing's outer border: 4px border + 12px
 * paper on the top and sides. The dock floats over this region.
 *
 * `bottom` is a conservative reserve before the rendered title is measured.
 * SpaceCanvas replaces it with the content-sized footer plus the border; the
 * reserve also keeps the resize floor large enough for the full Title ladder.
 */
export const SPACE_THING_EMBED_INSET = { top: 16, right: 16, bottom: 104, left: 16 } as const;

/** Keep one closed Thing and a full Title ladder at the ordinary resize floor.
 * The Close magnet is evaluated before this floor (ADR 0066).
 */
export const SPACE_THING_MIN_OPEN_SIZE = {
  width: SPACE_THING_EMBED_INSET.left + COLLAPSED_THING_SIZE.width + SPACE_THING_EMBED_INSET.right,
  height:
    SPACE_THING_EMBED_INSET.top + COLLAPSED_THING_SIZE.height + SPACE_THING_EMBED_INSET.bottom,
} as const;
