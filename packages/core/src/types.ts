import type { z } from 'zod';
import type {
  cardSchema,
  layoutPositionSchema,
  layoutSchema,
  positionedLayoutSchema,
  routeSchema,
  routeStepSchema,
} from './schema';

/** Domain types are derived from the Zod schemas so they can never drift apart. */

export type Card = z.infer<typeof cardSchema>;
export type RouteStep = z.infer<typeof routeStepSchema>;
export type Route = z.infer<typeof routeSchema>;
export type LayoutPosition = z.infer<typeof layoutPositionSchema>;
export type PositionedLayout = z.infer<typeof positionedLayoutSchema>;

/**
 * A **Layout**: the authored card-to-position map a space carries (ADR 0014).
 * It is data, not behaviour — the thing that arranges cards is a
 * `LayoutStrategy` in `@project/graph`, and `positionedStrategy` is the one that
 * reads this. Only authored layouts exist as values; an automatic strategy has
 * no Layout behind it (ADR 0013).
 */
export type Layout = z.infer<typeof layoutSchema>;

export type CardId = Card['id'];
export type RouteId = Route['id'];
