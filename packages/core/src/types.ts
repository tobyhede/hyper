import type { z } from 'zod';
import type {
  cardSchema,
  edgeKindSchema,
  edgeSchema,
  manifestSchema,
  nodeSchema,
  pathSchema,
  pathStepSchema,
  positionSchema,
} from './schema';

/** Domain types are derived from the Zod schemas so they can never drift apart. */

export type Position = z.infer<typeof positionSchema>;
export type Card = z.infer<typeof cardSchema>;
export type GraphNode = z.infer<typeof nodeSchema>;
export type EdgeKind = z.infer<typeof edgeKindSchema>;
export type GraphEdge = z.infer<typeof edgeSchema>;
export type PathStep = z.infer<typeof pathStepSchema>;
export type PresentationPath = z.infer<typeof pathSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

export type CardId = Card['id'];
export type NodeId = GraphNode['id'];
export type EdgeId = GraphEdge['id'];
export type PathId = PresentationPath['id'];
