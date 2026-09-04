import type { z } from 'zod';
import type {
  cardFrontmatterSchema,
  cardPlacementSchema,
  cardDocumentSchema,
  cardSchema,
  importSpaceFileSchema,
  importSpaceSchema,
  layoutPositionSchema,
  layoutSchema,
  positionedLayoutSchema,
  graphEdgeSchema,
  graphSchema,
  spaceFileSchema,
  spaceDocumentSchema,
  spaceSnapshotSchema,
  uuidSchema,
} from './schema';

/** Domain types are derived from the Zod schemas so they can never drift apart. */

export type Card = z.infer<typeof cardSchema>;
export type UUID = z.infer<typeof uuidSchema>;
export type CardDocument = z.infer<typeof cardDocumentSchema>;
export type SpaceDocument = z.infer<typeof spaceDocumentSchema>;
export type SpaceSnapshot = z.infer<typeof spaceSnapshotSchema>;
export type ImportCard = z.infer<typeof importSpaceSchema>['cards'][number];
export type ImportSpaceFile = z.infer<typeof importSpaceFileSchema>;
export type ImportSpace = z.infer<typeof importSpaceSchema>;

/**
 * The kind-specific fields stored before a card file's closing frontmatter
 * fence (ADR 0020). A markdown `Card` adds its body; an alias `Card` is already
 * complete because its content resolves through `target` (ADR 0009).
 */
export type CardFrontmatter = z.infer<typeof cardFrontmatterSchema>;
/**
 * One `{ from, to }` connection a graph is made of (ADR 0032). The authored
 * element — distinct from `@project/graph`'s `GraphRenderEdge`, which is this plus the
 * handles it attaches to, and from `LayoutStrategyEdge`, which is that plus geometry.
 */
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type Graph = z.infer<typeof graphSchema>;
export type LayoutPosition = z.infer<typeof layoutPositionSchema>;
export type CardPlacement = z.infer<typeof cardPlacementSchema>;
export type PositionedLayout = z.infer<typeof positionedLayoutSchema>;

/**
 * A **Layout**: the authored card-to-position map a space carries (ADR 0014).
 * It is data, not behaviour — the thing that arranges cards is a
 * `LayoutStrategy` in `@project/graph`, and `positionedStrategy` is the one that
 * reads this. Only authored layouts exist as values; an automatic strategy has
 * no Layout behind it (ADR 0025).
 */
export type Layout = z.infer<typeof layoutSchema>;

export type CardId = Card['id'];
export type GraphId = Graph['id'];
export type LayoutId = Layout['id'];

/**
 * The on-disk shape of a space — what `loadSpace` reads and what a writer emits
 * (ADR 0010). Distinct from a `Space`, which is the indexed, reference-checked
 * value `loadSpace` produces: serializing goes back to *this*, because the Space
 * is derived and reconstructing a file from it would mean un-deriving.
 */
export type SpaceFile = z.infer<typeof spaceFileSchema>;
