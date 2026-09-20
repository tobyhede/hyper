/** The authored size of every collapsed Resource (ADR 0064). */
export const COLLAPSED_RESOURCE_SIZE = { width: 260, height: 146 } as const;

/** The concrete Open Size recorded when a Resource first Opens (ADR 0066). */
export const DEFAULT_OPEN_SIZE = { width: 560, height: 420 } as const;
/** Room for an Open target Resource, its neighbours and the Space Resource's own Title. */
export const DEFAULT_SPACE_RESOURCE_OPEN_SIZE = { width: 960, height: 720 } as const;

/**
 * Canvas padding measured from a Space Resource's outer border: 4px border + 12px
 * paper on the top and sides. The dock floats over this region.
 *
 * `bottom` is a conservative reserve before the rendered title is measured.
 * `embedded-map.test.ts` asserts SpaceCanvas replaces it with the
 * content-sized footer plus the border; the reserve also keeps the resize floor
 * large enough for the full Title ladder.
 */
export const SPACE_RESOURCE_EMBED_INSET = { top: 16, right: 16, bottom: 104, left: 16 } as const;

/** Keep one closed Resource and a full Title ladder at the ordinary resize floor.
 * The Close magnet is evaluated before this floor (ADR 0066).
 */
export const SPACE_RESOURCE_MIN_OPEN_SIZE = {
  width:
    SPACE_RESOURCE_EMBED_INSET.left +
    COLLAPSED_RESOURCE_SIZE.width +
    SPACE_RESOURCE_EMBED_INSET.right,
  height:
    SPACE_RESOURCE_EMBED_INSET.top +
    COLLAPSED_RESOURCE_SIZE.height +
    SPACE_RESOURCE_EMBED_INSET.bottom,
} as const;
