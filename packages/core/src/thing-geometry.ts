/** The authored size of every collapsed Thing (ADR 0064). */
export const COLLAPSED_THING_SIZE = { width: 260, height: 146 } as const;

/** The concrete Open Size recorded when a Thing first Opens (ADR 0066). */
export const DEFAULT_OPEN_SIZE = { width: 560, height: 420 } as const;
/** Room for an Open target Thing, its neighbours and the Space Thing's own selectors. */
export const DEFAULT_SPACE_THING_OPEN_SIZE = { width: 960, height: 720 } as const;

/**
 * What an Open Space Thing reserves around the Diagram it embeds (ADR 0068).
 *
 * The embedded Things are sub-flow nodes in the containing React Flow instance,
 * so they are positioned on the canvas rather than inside the Thing's own DOM —
 * the projection clips them and no stylesheet can lay out around them. The room they
 * get is therefore a number both sides read: the projection places a child
 * inside this inset, and `canvas-thing.css` gives the Thing's own passengers a
 * footer of exactly `bottom` so a selector can never grow into the view drawn
 * over it. `packages/ui/test/canvas-thing-embedded-diagram.test.ts` holds the
 * stylesheet and this constant to the same number.
 *
 * Measured from the node's own box, so `left`, `right` and `bottom` each carry
 * the Thing's 4px border. `top` clears the border and the rail; `bottom` clears
 * the footer holding the Title, the Space marker and the two selectors.
 */
export const SPACE_THING_EMBED_INSET = { top: 42, right: 16, bottom: 180, left: 16 } as const;

/** The height of an Open Space Thing's own footer, which `bottom` above clears. */
export const SPACE_THING_FOOTER_HEIGHT = 176;

/**
 * The floor for an ordinary Open Space Thing resize proposal (ADR 0066,
 * ADR 0068).
 *
 * The Close magnet is evaluated before this floor. Every other Open Thing floors at {@link COLLAPSED_THING_SIZE}, because every
 * other Open Thing's content shrinks with it. A Space Thing's does not: the
 * embedded Diagram is painted over the Thing at the sizes the target Space
 * authored, and the Thing's own passengers hold a footer of exactly
 * {@link SPACE_THING_FOOTER_HEIGHT} so the two can never overlap. Both of those
 * are fixed, so a Space Thing taken to the collapsed height would have its
 * selectors clipped by `.canvas-thing`'s own `overflow: hidden` and a view
 * region of negative height above them.
 *
 * Written as the inset plus one collapsed Thing rather than as a pair of
 * literals: the floor is "the smallest Thing that can still show something",
 * and the two numbers it is made of are the ones that decide that. A change to
 * either moves this with it.
 */
export const SPACE_THING_MIN_OPEN_SIZE = {
  width: SPACE_THING_EMBED_INSET.left + COLLAPSED_THING_SIZE.width + SPACE_THING_EMBED_INSET.right,
  height:
    SPACE_THING_EMBED_INSET.top + COLLAPSED_THING_SIZE.height + SPACE_THING_EMBED_INSET.bottom,
} as const;
