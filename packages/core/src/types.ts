import type { z } from 'zod';
import type {
  thingFrontmatterSchema,
  thingPlacementSchema,
  thingDocumentSchema,
  thingSchema,
  importSpaceFileSchema,
  importSpaceSchema,
  diagramPositionSchema,
  diagramSchema,
  positionedDiagramSchema,
  graphEdgeSchema,
  graphSchema,
  spaceFileSchema,
  spaceDocumentSchema,
  spaceSnapshotSchema,
  uuidSchema,
} from './schema';

/** Domain types are derived from the Zod schemas so they can never drift apart. */

export type Thing = z.infer<typeof thingSchema>;
export type UUID = z.infer<typeof uuidSchema>;
export type ThingDocument = z.infer<typeof thingDocumentSchema>;
export type SpaceDocument = z.infer<typeof spaceDocumentSchema>;
export type SpaceSnapshot = z.infer<typeof spaceSnapshotSchema>;
export type ImportThing = z.infer<typeof importSpaceSchema>['things'][number];
export type ImportSpaceFile = z.infer<typeof importSpaceFileSchema>;
export type ImportSpace = z.infer<typeof importSpaceSchema>;

/**
 * The kind-specific fields stored before a thing file's closing frontmatter
 * fence (ADR 0020). A markdown `Thing` adds its body; an alias `Thing` is already
 * complete because its content resolves through `target` (ADR 0009).
 */
export type ThingFrontmatter = z.infer<typeof thingFrontmatterSchema>;
/**
 * One `{ from, to }` connection a graph is made of (ADR 0032). The authored
 * element — distinct from `@project/graph`'s `GraphRenderEdge`, which is this plus the
 * handles it attaches to, and from `LayoutStrategyEdge`, which is that without the
 * Graph it is tagged with. None of the three carries geometry: a strategy arranges
 * the Things and answers nothing at all for an Edge (ADR 0086).
 */
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type Graph = z.infer<typeof graphSchema>;
export type DiagramPosition = z.infer<typeof diagramPositionSchema>;
export type ThingPlacement = z.infer<typeof thingPlacementSchema>;
export type PositionedDiagram = z.infer<typeof positionedDiagramSchema>;

/**
 * A **Diagram**: the authored thing-to-position map a space carries (ADR 0014).
 * It is data, not behaviour — what arranges Things is a
 * `LayoutStrategy` in `@project/graph`, and `positionedStrategy` is the one that
 * reads this. Only authored diagrams exist as values; an automatic strategy has
 * no Diagram behind it (ADR 0025).
 */
export type Diagram = z.infer<typeof diagramSchema>;

export type ThingId = Thing['id'];
export type GraphId = Graph['id'];
export type DiagramId = Diagram['id'];

/**
 * The on-disk shape of a space — what `loadSpace` reads and what a writer emits
 * (ADR 0010). Distinct from a `Space`, which is the indexed, reference-checked
 * value `loadSpace` produces: serializing goes back to *this*, because the Space
 * is derived and reconstructing a file from it would mean un-deriving.
 */
export type SpaceFile = z.infer<typeof spaceFileSchema>;
