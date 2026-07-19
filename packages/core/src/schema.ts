import { z } from 'zod';

/**
 * Zod schema for the presentation manifest (`graph.json`).
 *
 * This validates *shape* only. Referential integrity (do node/card/path ids
 * actually resolve to each other) is validated separately in `@project/graph`,
 * because it needs the whole manifest in view.
 */

const idSchema = z.string().min(1);

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const cardSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  /** Relative path (from the manifest) to the markdown file with this card's body. */
  content: z.string().min(1),
});

export const nodeSchema = z.object({
  id: idSchema,
  cardId: idSchema,
  // Optional: the graph is laid out by ELK. A position, when present, is used as
  // a fallback until the layout resolves.
  position: positionSchema.optional(),
});

export const edgeKindSchema = z.enum(['sequence', 'reference']);

export const edgeSchema = z.object({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  kind: edgeKindSchema.default('sequence'),
});

export const pathStepSchema = z.object({
  target: idSchema,
});

export const pathSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  // Optional CSS color for this path's rail; falls back to a palette by order.
  color: z.string().min(1).optional(),
  steps: z.array(pathStepSchema).min(1),
});

export const manifestSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  cards: z.array(cardSchema),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  paths: z.array(pathSchema).min(1),
});
