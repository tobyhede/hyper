import { z } from 'zod';

/**
 * Zod schema for the presentation manifest (`graph.json`).
 *
 * This validates *shape* only. Referential integrity (do edge/step/route ids
 * actually resolve to real cards) is validated separately in `@project/graph`,
 * because it needs the whole manifest in view.
 */

const idSchema = z.string().min(1);

export const cardSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  /** Relative path (from the manifest) to the markdown file with this card's body. */
  content: z.string().min(1),
});

export const edgeKindSchema = z.enum(['sequence', 'reference']);

/** An authored connection between two cards, referenced by card id. */
export const edgeSchema = z.object({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  kind: edgeKindSchema.default('sequence'),
});

/** One position in a route, targeting a single card by id. */
export const routeStepSchema = z.object({
  target: idSchema,
});

export const routeSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  // Optional CSS color for this route's rail; falls back to a palette by order.
  color: z.string().min(1).optional(),
  steps: z.array(routeStepSchema).min(1),
});

export const manifestSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  cards: z.array(cardSchema),
  edges: z.array(edgeSchema),
  routes: z.array(routeSchema).min(1),
});
