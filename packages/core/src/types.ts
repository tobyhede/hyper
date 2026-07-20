import type { z } from 'zod';
import type { cardSchema, manifestSchema, routeSchema, routeStepSchema } from './schema';

/** Domain types are derived from the Zod schemas so they can never drift apart. */

export type Card = z.infer<typeof cardSchema>;
export type RouteStep = z.infer<typeof routeStepSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

export type CardId = Card['id'];
export type RouteId = Route['id'];
