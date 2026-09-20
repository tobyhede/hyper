import type { z } from 'zod';
import type {
  resourceFrontmatterSchema,
  resourcePlacementSchema,
  resourceDocumentSchema,
  resourceSchema,
  importSpaceFileSchema,
  importSpaceSchema,
  mapPositionSchema,
  mapSchema,
  positionedMapSchema,
  graphEdgeSchema,
  graphSchema,
  spaceFileSchema,
  spaceDocumentSchema,
  spaceSnapshotSchema,
  aggregateFileSchema,
  uuidSchema,
} from './schema';

/** Domain types are derived from the Zod schemas so they can never drift apart. */

export type Resource = z.infer<typeof resourceSchema>;
export type UUID = z.infer<typeof uuidSchema>;
export type ResourceDocument = z.infer<typeof resourceDocumentSchema>;
export type SpaceDocument = z.infer<typeof spaceDocumentSchema>;
export type SpaceSnapshot = z.infer<typeof spaceSnapshotSchema>;
/** `hyper.json` — what a canonical aggregate directory declares about itself. */
export type AggregateFile = z.infer<typeof aggregateFileSchema>;
export type ImportResource = z.infer<typeof importSpaceSchema>['resources'][number];
export type ImportSpaceFile = z.infer<typeof importSpaceFileSchema>;
export type ImportSpace = z.infer<typeof importSpaceSchema>;

/**
 * The kind-specific fields stored before a resource file's closing frontmatter
 * fence (ADR 0020). A markdown `Resource` adds its body; a reference resource `Resource` is already
 * complete because its content resolves through `target` (ADR 0009).
 */
export type ResourceFrontmatter = z.infer<typeof resourceFrontmatterSchema>;
/**
 * One `{ from, to }` connection a graph is made of (ADR 0032). The authored
 * element — distinct from `@project/graph`'s `GraphRenderEdge`, which is this plus the
 * handles it attaches to, and from `LayoutStrategyEdge`, which is that without the
 * Graph it is tagged with. None of the three carries geometry: a strategy arranges
 * the Resources and answers nothing at all for an Edge (ADR 0086).
 */
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type Graph = z.infer<typeof graphSchema>;
export type MapPosition = z.infer<typeof mapPositionSchema>;
export type ResourcePlacement = z.infer<typeof resourcePlacementSchema>;
export type PositionedMap = z.infer<typeof positionedMapSchema>;

/**
 * A **Map**: the authored resource-to-position map a space carries (ADR 0014).
 * It is data, not behaviour — what arranges Resources is a
 * `LayoutStrategy` in `@project/graph`, and `positionedStrategy` is the one that
 * reads this. Only authored maps exist as values; an automatic strategy has
 * no Map behind it (ADR 0025).
 */
export type Map = z.infer<typeof mapSchema>;

export type ResourceId = Resource['id'];
export type GraphId = Graph['id'];
export type MapId = Map['id'];

/**
 * The on-disk shape of a space — what `loadSpace` reads and what a writer emits
 * (ADR 0010). Distinct from a `Space`, which is the indexed, reference-checked
 * value `loadSpace` produces: serializing goes back to *this*, because the Space
 * is derived and reconstructing a file from it would mean un-deriving.
 */
export type SpaceFile = z.infer<typeof spaceFileSchema>;
