/** The authored size of every collapsed Card (ADR 0064). */
export const COLLAPSED_CARD_SIZE = { width: 260, height: 146 } as const;

/** The concrete Open Size recorded when a Card first Opens (ADR 0066). */
export const DEFAULT_OPEN_SIZE = { width: 560, height: 420 } as const;
/** Room for an Open target Card, its neighbours and the Space Card's own selectors. */
export const DEFAULT_SPACE_CARD_OPEN_SIZE = { width: 960, height: 720 } as const;

/**
 * What an Open Space Card reserves around the Layout it embeds (ADR 0068).
 *
 * The embedded Cards are sub-flow nodes in the containing React Flow instance,
 * so they are positioned on the canvas rather than inside the Card's own DOM —
 * the projection clips them and no stylesheet can lay out around them. The room they
 * get is therefore a number both sides read: the projection places a child
 * inside this inset, and `canvas-card.css` gives the Card's own passengers a
 * footer of exactly `bottom` so a selector can never grow into the view drawn
 * over it. `packages/ui/test/canvas-card-embedded-layout.test.ts` holds the
 * stylesheet and this constant to the same number.
 *
 * Measured from the node's own box, so `left`, `right` and `bottom` each carry
 * the Card's 4px border. `top` clears the border and the rail; `bottom` clears
 * the footer holding the Title, the Space marker and the two selectors.
 */
export const SPACE_CARD_EMBED_INSET = { top: 42, right: 16, bottom: 180, left: 16 } as const;

/** The height of an Open Space Card's own footer, which `bottom` above clears. */
export const SPACE_CARD_FOOTER_HEIGHT = 176;

/**
 * The floor for an ordinary Open Space Card resize proposal (ADR 0066,
 * ADR 0068).
 *
 * The Close magnet is evaluated before this floor. Every other Open Card floors at {@link COLLAPSED_CARD_SIZE}, because every
 * other Open Card's content shrinks with it. A Space Card's does not: the
 * embedded Layout is painted over the Card at the sizes the target Space
 * authored, and the Card's own passengers hold a footer of exactly
 * {@link SPACE_CARD_FOOTER_HEIGHT} so the two can never overlap. Both of those
 * are fixed, so a Space Card taken to the collapsed height would have its
 * selectors clipped by `.canvas-card`'s own `overflow: hidden` and a view
 * region of negative height above them.
 *
 * Written as the inset plus one collapsed Card rather than as a pair of
 * literals: the floor is "the smallest Card that can still show something",
 * and the two numbers it is made of are the ones that decide that. A change to
 * either moves this with it.
 */
export const SPACE_CARD_MIN_OPEN_SIZE = {
  width: SPACE_CARD_EMBED_INSET.left + COLLAPSED_CARD_SIZE.width + SPACE_CARD_EMBED_INSET.right,
  height: SPACE_CARD_EMBED_INSET.top + COLLAPSED_CARD_SIZE.height + SPACE_CARD_EMBED_INSET.bottom,
} as const;
