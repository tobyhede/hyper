import type { z } from 'zod';
import type {
  cardFrontmatterSchema,
  cardSchema,
  layoutPositionSchema,
  layoutSchema,
  positionedLayoutSchema,
  routeEdgeSchema,
  routeSchema,
  spaceFileSchema,
} from './schema';

/** Domain types are derived from the Zod schemas so they can never drift apart. */

export type Card = z.infer<typeof cardSchema>;

/**
 * A card file's frontmatter: everything a card is except its body (ADR 0020).
 * Distinct from `Card` while the space file still carries a `cards` array —
 * the two converge when intake moves to the files.
 */
export type CardFrontmatter = z.infer<typeof cardFrontmatterSchema>;
/**
 * One `{ from, to }` connection a route is made of (ADR 0023). The authored
 * element — distinct from `@project/graph`'s `GraphEdge`, which is this plus the
 * handles it attaches to, and from `LayoutEdge`, which is that plus geometry.
 */
export type RouteEdge = z.infer<typeof routeEdgeSchema>;
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

/**
 * The on-disk shape of a space — what `loadSpace` reads and what a writer emits
 * (ADR 0010). Distinct from a `Space`, which is the indexed, reference-checked
 * value `loadSpace` produces: serializing goes back to *this*, because the Space
 * is derived and reconstructing a file from it would mean un-deriving.
 */
export type SpaceFile = z.infer<typeof spaceFileSchema>;
