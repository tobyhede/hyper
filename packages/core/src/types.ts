import type { z } from 'zod';
import type {
  cardSchema,
  edgeKindSchema,
  edgeSchema,
  manifestSchema,
  routeSchema,
  routeStepSchema,
} from './schema';

/** Domain types are derived from the Zod schemas so they can never drift apart. */

export type Card = z.infer<typeof cardSchema>;
export type EdgeKind = z.infer<typeof edgeKindSchema>;
export type GraphEdge = z.infer<typeof edgeSchema>;
export type RouteStep = z.infer<typeof routeStepSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

export type CardId = Card['id'];
export type EdgeId = GraphEdge['id'];
export type RouteId = Route['id'];
