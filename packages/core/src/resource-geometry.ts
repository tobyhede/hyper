/**
 * The Closed Size: the size every Resource has until it is resized, and the
 * smallest any Resource may be, Open or Closed.
 */
export const COLLAPSED_RESOURCE_SIZE = { width: 260, height: 146 } as const;

/**
 * Canvas padding measured from a Space Resource's outer border: 4px border + 12px
 * paper on the top and sides. The dock floats over this region.
 *
 * `bottom` is a conservative reserve before the rendered title is measured.
 * `embedded-map.test.ts` asserts SpaceCanvas replaces it with the
 * content-sized footer plus the border.
 */
export const SPACE_RESOURCE_EMBED_INSET = { top: 16, right: 16, bottom: 104, left: 16 } as const;
