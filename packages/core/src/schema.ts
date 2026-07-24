import { z } from 'zod';

/**
 * Zod schemas for the space file (`space.json`).
 *
 * These validate *shape* only. Referential integrity (do step/route ids
 * actually resolve to real cards) is checked separately in `@project/graph`,
 * because it needs the whole space in view. A value that passes here is not yet
 * a Space — `loadSpace` adds the reference check and the index (ADR 0010).
 */

const idSchema = z.string().min(1);

/**
 * Upper bound on a card's description. A description is a caption — what a card
 * *is* when the title is too terse (ADR 0006) — not a second body, so it is
 * capped and single-line. Past this, the content belongs in the card, opened.
 */
export const CARD_DESCRIPTION_MAX_LENGTH = 120;

/**
 * An optional one-line description, drawn under the title in the graph node
 * (ADR 0006). Bounded and newline-free so it cannot drift into a body — the card
 * is fixed-size, so an unbounded description would just clip silently.
 */
const descriptionSchema = z
  .string()
  .min(1)
  .max(CARD_DESCRIPTION_MAX_LENGTH)
  .refine((value) => !value.includes('\n'), { message: 'description must be a single line' })
  .optional();

/** A card written directly by the author; its content is a markdown file path. */
export const markdownCardSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  description: descriptionSchema,
  kind: z.literal('markdown'),
  /** Relative path (from the space file) to the file holding this card's content. */
  content: z.string().min(1),
});

/** A card that shows another card's content at a second position (ADR 0009). */
export const aliasCardSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  description: descriptionSchema,
  kind: z.literal('alias'),
  /** The id of the card this alias shows. Referential checks live in `@project/graph`. */
  target: idSchema,
});

/**
 * A card is one of several kinds, discriminated by `kind`. `kind` defaults to
 * `'markdown'` when absent, so space files authored before the kind existed
 * still parse unchanged.
 */
export const cardSchema = z.preprocess(
  (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value) && !('kind' in value)
      ? { ...value, kind: 'markdown' }
      : value,
  z.discriminatedUnion('kind', [markdownCardSchema, aliasCardSchema]),
);

/** Where a positioned layout puts a card, in the layout's own coordinate space. */
export const layoutPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * A layout the author wrote: a card-to-position map (ADR 0013).
 *
 * Positions are deliberately **sparse** — a layout may omit cards, and whoever
 * renders it places those itself — but a position may not name a card that does
 * not exist; that is a reference error, checked in `@project/graph` where the
 * whole space is in view.
 */
export const positionedLayoutSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  kind: z.literal('positioned'),
  positions: z.record(idSchema, layoutPositionSchema),
});

/**
 * A layout carried by the space file, discriminated by `kind`. Every Layout is
 * authored: an automatic strategy computes placement from the cards and routes
 * alone, so it has nothing to write down and appears here nowhere (ADR 0013).
 * There is one kind today; the union is what makes a second one cost no
 * migration.
 *
 * `kind` defaults to `'positioned'` when absent, the same shape `cardSchema`
 * uses — here it is for hand-authoring rather than back-compat, so a layout can
 * be written as just an id, a title, and its positions.
 */
export const layoutSchema = z.preprocess(
  (value) =>
    typeof value === 'object' && value !== null && !Array.isArray(value) && !('kind' in value)
      ? { ...value, kind: 'positioned' }
      : value,
  z.discriminatedUnion('kind', [positionedLayoutSchema]),
);

/**
 * The views a space can name without declaring anything: the route-driven graph
 * and a plain grid. Both are automatic, so they are named, never configured —
 * `defaultView` records intent ("open me like this") and carries no parameters,
 * because parameters would put computed geometry back into authored content
 * (ADR 0013). A `defaultView` naming none of these and no declared layout is a
 * reference error.
 */
export const BUILT_IN_VIEW_IDS = ['graph', 'grid'] as const;

export type BuiltInViewId = (typeof BUILT_IN_VIEW_IDS)[number];

export function isBuiltInViewId(id: string): id is BuiltInViewId {
  return (BUILT_IN_VIEW_IDS as readonly string[]).includes(id);
}

/** One position in a route, targeting a single card by id. */
export const routeStepSchema = z.object({
  target: idSchema,
});

export const routeSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  // Optional CSS color for this route's edges; falls back to a palette by order.
  color: z.string().min(1).optional(),
  steps: z.array(routeStepSchema).min(1),
});

/**
 * The on-disk shape of a space — the serialized form `loadSpace` reads (ADR
 * 0010). This validates *shape* only; a value that passes it is not yet a Space
 * (references unchecked, no index). "manifest" is retired: this is the space
 * file, not a manifest.
 */
export const spaceFileSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  cards: z.array(cardSchema),
  /**
   * May be empty: a space with no routes has no structure yet, which is what a
   * new space *is*. It renders and it cannot be presented (ADR 0015).
   */
  routes: z.array(routeSchema),
  /** Optional: a space can be hand-authored with no coordinates at all. */
  layouts: z.array(layoutSchema).optional(),
  /** A declared layout's id, or a built-in view's. See {@link BUILT_IN_VIEW_IDS}. */
  defaultView: z.string().min(1).optional(),
});
