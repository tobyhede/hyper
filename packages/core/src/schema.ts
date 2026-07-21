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

/** A card written directly by the author; its content is a markdown file path. */
export const markdownCardSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  kind: z.literal('markdown'),
  /** Relative path (from the space file) to the file holding this card's content. */
  content: z.string().min(1),
});

/** A card that shows another card's content at a second position (ADR 0009). */
export const aliasCardSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
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
  routes: z.array(routeSchema).min(1),
});
