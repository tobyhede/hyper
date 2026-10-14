/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import type { UUID } from '../types';
import { uuidSchema } from '../uuid';
import { defineKind, type SpaceView } from './kind-module';
import type { ResourceDocument } from './registry';

/**
 * A Resource that shows one selected view of another independently stored Space
 * (ADR 0068).
 *
 * **The selection is part of the Resource, not an option on it (ADR 0079).** A
 * Space Resource names a Map of its target and a Graph that Map owns, and
 * it names them from the moment it exists: the lifecycle that creates one
 * initializes a mapless target before completing and stores what
 * initialization minted, so there is no valid Space Resource with nothing selected
 * and no surface that has to draw one. Both ids are resolved against the target
 * by aggregate intake rather than here — this file knows the shape and
 * `@project/graph` knows the Spaces.
 *
 * Do not fall back to the target's `defaultMap` when the field is missing: one
 * Resource's selection would then follow another Space's opening choice.
 * Requiring the field keeps two Space Resources on one target differing by what
 * they store and by nothing else.
 *
 * Framing is the Map-coordinate centre and scale saved for this particular
 * window onto the target. It is absent until the view has been framed, in which
 * case the renderer fits the selected Map. It belongs here rather than on
 * the Map because two Space Resources may show the same Map differently.
 */
export const spaceResourceFramingSchema = z
  .object({
    centreX: z.number().finite(),
    centreY: z.number().finite(),
    zoom: z.number().positive().finite(),
  })
  .strict();

export const spaceResourceContentSchema = z
  .object({
    spaceId: uuidSchema,
    map: uuidSchema,
    graph: uuidSchema,
    framing: spaceResourceFramingSchema.optional(),
  })
  .strict();
type SpaceResourceContent = z.infer<typeof spaceResourceContentSchema>;

/** The Space kind's id, declared before its module because the content it resolves to names it. */
const SPACE_KIND_ID = 'space';

/** What a Space Resource's content resolves to: the view of its target it shows. */
export interface SpaceContent {
  readonly kind: typeof SPACE_KIND_ID;
  readonly view: SpaceView;
}

/** What a Space Resource's selection is checked against: the Space kind's own check's reading of its target Space. */
export interface SpaceSelectionTarget {
  /** The ids of the Graphs a Map of the target owns, or `undefined` when it has no such Map. */
  readonly mapGraphIds: (mapId: UUID) => readonly UUID[] | undefined;
  /** Whether the target has a Graph with this id. */
  readonly hasGraph: (graphId: UUID) => boolean;
}

/** Why a Space Resource's selection does not resolve in its target Space. */
export type SpaceSelectionProblem =
  | { readonly kind: 'space-resource-map-missing'; readonly mapId: UUID }
  | { readonly kind: 'space-resource-graph-missing'; readonly graphId: UUID }
  | {
      readonly kind: 'space-resource-graph-outside-map';
      readonly mapId: UUID;
      readonly graphId: UUID;
    };

/**
 * The Space kind's own check: its Map and Graph resolve in its
 * target Space, and the Graph is the Map's. The Resource's own stored Map,
 * with no fallback to the target's `defaultMap` (ADR 0079): a Space Resource
 * selects a Map from the moment it exists, so a `map` that resolves to nothing
 * is a dangling reference to a deleted Map rather than an unmade choice.
 */
const selectionProblem = (
  content: SpaceResourceContent,
  target: SpaceSelectionTarget,
): SpaceSelectionProblem | undefined => {
  const graphIds = target.mapGraphIds(content.map);
  if (graphIds === undefined) return { kind: 'space-resource-map-missing', mapId: content.map };
  if (!target.hasGraph(content.graph)) {
    return { kind: 'space-resource-graph-missing', graphId: content.graph };
  }
  if (!graphIds.includes(content.graph)) {
    return {
      kind: 'space-resource-graph-outside-map',
      mapId: content.map,
      graphId: content.graph,
    };
  }
  return undefined;
};

/** The view of its target a Space Resource's content shows. */
const viewOf = (content: SpaceResourceContent): SpaceView => ({
  spaceId: content.spaceId,
  map: content.map,
  graph: content.graph,
  framing: content.framing,
});

/**
 * The Space kind (ADR 0068): a Resource that embeds a selected view of
 * another Space. Its one Space reference is its target, whose lifetime it
 * holds (ADR 0074); the core enforces cycles, lifetime and rooting from that
 * declaration, and the module checks only its own selection.
 */
export const spaceKind = defineKind({
  id: SPACE_KIND_ID,
  contentSchema: spaceResourceContentSchema,
  flags: {
    takesResourceShape: false,
    canOpen: true,
    mayBeTarget: true,
    ownsReferencedSpaces: true,
  },
  facts: { authored: true, embedsMap: true, drawsContentArea: false },
  resolveContent: (content): SpaceContent => ({
    kind: SPACE_KIND_ID,
    view: viewOf(content),
  }),
  spaceReferences: (content) => [content.spaceId],
  selection: {
    of: viewOf,
    select: (content, choice): SpaceResourceContent => {
      const { framing, ...selected } = content;
      const chosen = { ...selected, map: choice.map, graph: choice.graph };
      return framing === undefined || choice.map !== content.map ? chosen : { ...chosen, framing };
    },
    frame: (content, framing): SpaceResourceContent => ({ ...content, framing }),
    problem: selectionProblem,
  },
});

/** The Space kind's id. */
export type SpaceKindId = typeof spaceKind.id;

/** A stored Space Resource document: a Resource document of the Space kind. */
export type SpaceResourceDocument = Extract<ResourceDocument, { kind: SpaceKindId }>;
