import {
  titleName,
  resourceOpen,
  resourceShape,
  resourceSize,
  takesOpen,
  takesResourceShape,
  type Graph,
  type Map,
  type MapPosition,
  type ResourcePlacement,
  type ResourceShape,
  type SpaceSnapshot,
  type ResourceDocument,
  type UUID,
} from '@project/core';
import { Placement } from './placement';

/**
 * The Resource membership rules that turn a Space snapshot into the next one when
 * a Resource joins, Opens, Closes, is resized, changes Shape or leaves a Map —
 * Add, Open, Close, Resize, change Shape, Remove from Map, Delete from Space.
 *
 * `SnapshotEdit` operates on `SpaceSnapshot` — the one representation both
 * Space Authoring and the session registry already hold — rather than the
 * loaded `Space` (the registry would have to parse every snapshot to edit it)
 * or a bare `Placement` (a caller would keep assembling snapshots around it,
 * and every such assembly is a second copy of these rules free to diverge —
 * not stepping off an occupied point on a create, say).
 *
 * Every operation answers `completed(snapshot) | unchanged | refused(code)`,
 * never a throw for a domain rule (ADR 0057). This module declares its own
 * small refusal union carrying codes and typed context only — wording stays in
 * `app`, which maps a code into `AuthoringRefusal` or `SpaceResourceRefusal`.
 *
 * Operations arrive with their first real caller rather than ahead of one.
 * Both callers create and delete through `createInMap` and `deleteFromSpace`;
 * `open`, `close`, `resize`, `changeResourceShape`, `addToMap` and
 * `removeFromMap` are Space Authoring's alone.
 */

/** Why a `SnapshotEdit` operation refused, with the typed context a sentence needs. */
export type SnapshotEditRefusal =
  | { readonly code: 'resource-not-found' }
  | { readonly code: 'map-not-found' }
  | { readonly code: 'resource-not-in-map' }
  | { readonly code: 'resource-already-in-map' }
  /** A Reference Resource created with a Target the Space does not hold. */
  | { readonly code: 'reference-target-not-found'; readonly targetId: UUID }
  /** A Reference Resource created with a Target that is itself a Reference Resource. */
  | { readonly code: 'reference-target-must-own-content'; readonly targetId: UUID }
  /** An Open of a Resource with no content to show: an Ur Resource is always Closed. */
  | { readonly code: 'open-requires-content' }
  /** A Shape Edit on a Resource that is not an Ur Resource: every other kind is the rectangle. */
  | { readonly code: 'shape-requires-ur-resource' }
  | {
      readonly code: 'resource-has-references';
      /** The Reference Resources by **name**, which is what a sentence listing Resources says (ADR 0083). */
      readonly referenceTitles: readonly string[];
    };

/**
 * Where a placed Resource lands against the point it was given: `exact` keeps
 * the aimed point, and `avoidingOverlap` steps off one another Resource in the
 * Map already occupies exactly ({@link freeAnchor}).
 */
export type PlacementMode = 'exact' | 'avoidingOverlap';

/** What a `SnapshotEdit` operation answers. */
export type SnapshotEditOutcome =
  | { readonly kind: 'completed'; readonly snapshot: SpaceSnapshot }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: SnapshotEditRefusal };

/**
 * How far a Resource creation steps when the point it was given is already taken,
 * and in which direction.
 *
 * Shared by Space Authoring and the session registry, because the registry has
 * to place a menu-created Space Resource exactly as a menu-created Markdown
 * Resource lands (ADR 0089), and a rule with two owners has none: a registry
 * that wrote the anchor it was given exactly would stack repeated centre-adds
 * on top of each other.
 *
 * A visible stack rather than collision avoidance: existing Resources never move,
 * and partial overlap of Resources is deliberate. Only an *exact* anchor
 * collision steps, which is what a repeated centre-add produces and a pointer
 * drop essentially never does.
 */
const STACK_STEP = 24;

const freeAnchor = (placement: Placement, anchor: MapPosition): MapPosition => {
  const taken = new Set([...placement.values()].map(({ x, y }) => `${x},${y}`));
  let at = anchor;
  // Terminates: each step is a distinct point on one diagonal, and the taken
  // set is finite, so at most one step per placed Resource can be occupied.
  for (let step = 1; taken.has(`${at.x},${at.y}`); step += 1) {
    at = { x: anchor.x + STACK_STEP * step, y: anchor.y + STACK_STEP * step };
  }
  return at;
};

/**
 * Add a new Resource to a Space, positioned closed in one named Map.
 *
 * The caller mints the Resource's id and document — this only places it. Refuses
 * `map-not-found` for a Map this snapshot does not name, changing
 * nothing: a coordinated create or link needs that refusal to answer a
 * containing Map gone by the time the Edit lands, rather than adding the
 * Resource to the Space with no position at all. A freshly minted id is
 * otherwise never already a member of anything, so a found Map always
 * completes.
 *
 * `avoidingOverlap` steps diagonally off a point another Resource in the named
 * Map already occupies exactly, exactly as a menu-created Markdown Resource
 * lands (ADR 0089, {@link freeAnchor}). `exact` keeps the aimed point, for a
 * caller with one to aim — create-and-connect's drop point.
 *
 * A Reference Resource is refused `reference-target-not-found` for a Target
 * the snapshot does not hold, and `reference-target-must-own-content` for a
 * Target that is itself a Reference Resource: resolution ends after one hop
 * (ADR 0070). The same rule intake enforces, asked here so an author choosing
 * the wrong Target meets a refusal rather than an unloadable Space, and the
 * creation half of the rule {@link deleteFromSpace}'s `resource-has-references`
 * enforces from the other side.
 */
function createInMap(
  snapshot: SpaceSnapshot,
  mapId: UUID,
  resourceId: UUID,
  document: ResourceDocument,
  position: MapPosition,
  mode: PlacementMode,
): SnapshotEditOutcome {
  const maps = snapshot.document.maps ?? [];
  const target = maps.find((m) => m.id === mapId);
  if (target === undefined) {
    return { kind: 'refused', refusal: { code: 'map-not-found' } };
  }
  if (document.kind === 'reference') {
    const targetId = document.target;
    const resolved = snapshot.resources.find((resource) => resource.id === targetId);
    if (resolved === undefined) return refused({ code: 'reference-target-not-found', targetId });
    if (resolved.document.kind === 'reference') {
      return refused({ code: 'reference-target-must-own-content', targetId });
    }
  }
  const placement = Placement.fromMap(target);
  const at = mode === 'avoidingOverlap' ? freeAnchor(placement, position) : position;
  return withPlacement(
    { ...snapshot, resources: [...snapshot.resources, { id: resourceId, document }] },
    mapId,
    Placement.place(placement, resourceId, { x: at.x, y: at.y, open: false }),
  );
}

/**
 * The Graphs a Resource has left, with every Edge incident to it gone.
 *
 * A Resource that is not a member of a Map cannot be an endpoint of a Graph
 * that Map owns (ADR 0040), so this is what both removals owe: Remove from Map
 * applies it to the one Map, and Delete from Space to every Map. The Graphs
 * themselves stay, empty ones included: deleting a Graph is its own action.
 */
const withoutIncidentEdges = (graphs: readonly Graph[], resourceId: UUID): Graph[] =>
  graphs.map((graph) => ({
    ...graph,
    edges: graph.edges.filter((edge) => edge.from !== resourceId && edge.to !== resourceId),
  }));

/**
 * Remove a Resource from a Space entirely: its own entry, its position and every
 * Edge incident to it in **every** Map. No other Resource moves: removal changes
 * no size, so it displaces nobody.
 *
 * Kind-agnostic — deleting a Space Resource this way is exactly this, and the
 * cross-Space cascade that follows (deleting a target Space nothing
 * references any more) is the registry's own next step, not this operation's.
 * `defaultMap`, `activeGraph` and every title are untouched.
 *
 * Refuses `resource-not-found` for an id the Space does not hold, and
 * `resource-has-references` — naming every Reference Resource by title — for a Resource a Reference Resource in
 * this Space still targets: a Reference Resource whose Target vanished is not a Resource
 * intake accepts (ADR 0070), so the Space must not lose one out from under its
 * Reference Resources.
 */
function deleteFromSpace(snapshot: SpaceSnapshot, resourceId: UUID): SnapshotEditOutcome {
  if (!snapshot.resources.some((resource) => resource.id === resourceId)) {
    return { kind: 'refused', refusal: { code: 'resource-not-found' } };
  }
  const incoming = snapshot.resources.filter(
    (resource) => resource.document.kind === 'reference' && resource.document.target === resourceId,
  );
  if (incoming.length > 0) {
    return {
      kind: 'refused',
      refusal: {
        code: 'resource-has-references',
        referenceTitles: incoming.map((reference) => titleName(reference.document.title)),
      },
    };
  }
  const maps = snapshot.document.maps ?? [];
  return {
    kind: 'completed',
    snapshot: {
      ...snapshot,
      resources: snapshot.resources.filter((resource) => resource.id !== resourceId),
      document: {
        ...snapshot.document,
        maps: maps.map((m) => ({
          ...m,
          positions: Placement.toPositions(Placement.remove(Placement.fromMap(m), resourceId)),
          graphs: withoutIncidentEdges(m.graphs, resourceId),
        })),
      },
    },
  };
}

/** What Delete from Space reaches besides the Resource itself: the Maps and Graphs it changes. */
export interface DeletionReach {
  /** The Maps that place the Resource, in declared order: each loses its position. */
  readonly maps: readonly Map[];
  /**
   * The Graphs holding an Edge connected to the Resource, each with the Map that
   * owns it, in declared order: each loses those Edges. A Graph's name is unique
   * only within its Map, so the Map travels with it.
   */
  readonly graphs: readonly { readonly map: Map; readonly graph: Graph }[];
}

/**
 * What {@link deleteFromSpace} would change for `resourceId`, read before it
 * runs so the question that asks for it can say so. Every Map it names loses
 * the Resource's position, every Graph it names loses at least one Edge, and
 * nothing else is touched; `snapshot-edits.property.test.ts`'s
 * `deletionReach properties` holds the two together.
 */
export function deletionReach(maps: readonly Map[], resourceId: UUID): DeletionReach {
  return {
    maps: maps.filter((m) => Object.hasOwn(m.positions, resourceId)),
    graphs: maps.flatMap((m) =>
      m.graphs
        .filter((graph) =>
          graph.edges.some((edge) => edge.from === resourceId || edge.to === resourceId),
        )
        .map((graph) => ({ map: m, graph })),
    ),
  };
}

/** A width and a height together: a Resource's size. */
type Extent = { readonly width: number; readonly height: number };

/** The named Map, and the placement it holds, or the refusal for a Map that is gone. */
const placedIn = (
  snapshot: SpaceSnapshot,
  mapId: UUID,
): { readonly map: Map; readonly placement: Placement } | SnapshotEditRefusal => {
  const found = (snapshot.document.maps ?? []).find((candidate) => candidate.id === mapId);
  if (found === undefined) return { code: 'map-not-found' };
  return { map: found, placement: Placement.fromMap(found) };
};

/** The snapshot with one Map's positions replaced, and nothing else changed. */
const withPlacement = (
  snapshot: SpaceSnapshot,
  mapId: UUID,
  placement: Placement,
): SnapshotEditOutcome => ({
  kind: 'completed',
  snapshot: {
    ...snapshot,
    document: {
      ...snapshot.document,
      maps: (snapshot.document.maps ?? []).map((m) =>
        m.id === mapId ? { ...m, positions: Placement.toPositions(placement) } : m,
      ),
    },
  },
});

const refused = (refusal: SnapshotEditRefusal): SnapshotEditOutcome => ({
  kind: 'refused',
  refusal,
});

const UNCHANGED: SnapshotEditOutcome = { kind: 'unchanged' };

/** The snapshot with one Resource's entry in one Map rewritten, and no other Resource moved. */
const withEntry = (
  snapshot: SpaceSnapshot,
  mapId: UUID,
  placement: Placement,
  resourceId: UUID,
  at: ResourcePlacement,
): SnapshotEditOutcome =>
  withPlacement(snapshot, mapId, Placement.place(placement, resourceId, at));

/**
 * Open a Resource in one Map. Only what is drawn inside its rect changes: its
 * size and every position stay as they are. `unchanged` for a Resource already
 * Open, and `open-requires-content` for an Ur Resource, which has no content to
 * show.
 */
function open(snapshot: SpaceSnapshot, mapId: UUID, resourceId: UUID): SnapshotEditOutcome {
  const placed = placedIn(snapshot, mapId);
  if ('code' in placed) return refused(placed);
  const at = placed.placement.get(resourceId);
  if (at === undefined) return refused({ code: 'resource-not-in-map' });
  const resource = snapshot.resources.find((candidate) => candidate.id === resourceId);
  if (resource === undefined) return refused({ code: 'resource-not-found' });
  if (!takesOpen(resource.document.kind)) return refused({ code: 'open-requires-content' });
  if (resourceOpen(at)) return UNCHANGED;
  return withEntry(snapshot, mapId, placed.placement, resourceId, { ...at, open: true });
}

/**
 * Close a Resource in one Map. Only what is drawn inside its rect changes: its
 * size and every position stay as they are. `unchanged` for a Resource already
 * Closed.
 */
function close(snapshot: SpaceSnapshot, mapId: UUID, resourceId: UUID): SnapshotEditOutcome {
  const placed = placedIn(snapshot, mapId);
  if ('code' in placed) return refused(placed);
  const at = placed.placement.get(resourceId);
  if (at === undefined) return refused({ code: 'resource-not-in-map' });
  if (!resourceOpen(at)) return UNCHANGED;
  return withEntry(snapshot, mapId, placed.placement, resourceId, { ...at, open: false });
}

/**
 * Resize a Resource in one Map, Open or Closed, moving the Resources clear of it
 * by the change from the size it had (ADR 0084, ADR 0093). The size is written
 * even when it is the Closed Size, and Open/Closed is kept. `unchanged` at the
 * size it already draws at. The floor is the schema's: no size below the
 * Closed Size reaches here from a gesture, and intake refuses one.
 */
function resize(
  snapshot: SpaceSnapshot,
  mapId: UUID,
  resourceId: UUID,
  size: Extent,
): SnapshotEditOutcome {
  const placed = placedIn(snapshot, mapId);
  if ('code' in placed) return refused(placed);
  const at = placed.placement.get(resourceId);
  if (at === undefined) return refused({ code: 'resource-not-in-map' });
  const before = resourceSize(at);
  if (before.width === size.width && before.height === size.height) return UNCHANGED;
  const resized = Placement.place(placed.placement, resourceId, {
    ...at,
    size: { width: size.width, height: size.height },
  });
  return withPlacement(snapshot, mapId, Placement.displace(resized, resourceId, before, size));
}

/**
 * Draw an Ur Resource in another Shape in one Map (ADR 0121). Every other
 * kind is the rectangle, so a Shape Edit on one is refused whatever it asks for.
 *
 * The Shape is drawn at the Resource's rect and changes none, so no neighbour
 * moves and the Resource's Open/Closed state and size are kept. The chosen
 * Shape is written, the rectangle included; `unchanged` for the Shape the
 * Resource already draws as, so the rectangle is `unchanged` on an entry that
 * stores none.
 */
function changeResourceShape(
  snapshot: SpaceSnapshot,
  mapId: UUID,
  resourceId: UUID,
  chosen: ResourceShape,
): SnapshotEditOutcome {
  const placed = placedIn(snapshot, mapId);
  if ('code' in placed) return refused(placed);
  const at = placed.placement.get(resourceId);
  if (at === undefined) return refused({ code: 'resource-not-in-map' });
  const resource = snapshot.resources.find((candidate) => candidate.id === resourceId);
  if (resource === undefined) return refused({ code: 'resource-not-found' });
  if (!takesResourceShape(resource.document.kind))
    return refused({ code: 'shape-requires-ur-resource' });
  if (resourceShape(at) === chosen) return UNCHANGED;
  return withPlacement(
    snapshot,
    mapId,
    Placement.place(placed.placement, resourceId, { ...at, shape: chosen }),
  );
}

/**
 * Add a Resource the Space already holds to one Map, Closed, with no Edge.
 *
 * Membership and a position, and nothing else: a Resource added back to a Map
 * is detached, and neither the Edges nor the Shape it once had there are
 * inferred back, so it draws as the rectangle (ADR 0121). The position is an authored one
 * (ADR 0084); `avoidingOverlap` steps off a point another Resource already
 * occupies exactly, as a creation from a menu does ({@link freeAnchor}), and
 * `exact` keeps it.
 */
function addToMap(
  snapshot: SpaceSnapshot,
  mapId: UUID,
  resourceId: UUID,
  position: MapPosition,
  mode: PlacementMode,
): SnapshotEditOutcome {
  const placed = placedIn(snapshot, mapId);
  if ('code' in placed) return refused(placed);
  if (!snapshot.resources.some((resource) => resource.id === resourceId)) {
    return refused({ code: 'resource-not-found' });
  }
  if (placed.placement.has(resourceId)) return refused({ code: 'resource-already-in-map' });
  const at = mode === 'avoidingOverlap' ? freeAnchor(placed.placement, position) : position;
  return withPlacement(
    snapshot,
    mapId,
    Placement.place(placed.placement, resourceId, { x: at.x, y: at.y, open: false }),
  );
}

/**
 * Remove a Resource from one Map: its position gone, and every Edge incident to
 * it gone from **this Map's** Graphs. No other Resource moves.
 *
 * The Resource stays in the Space and in every other Map. Never blocked by a
 * Reference Resource targeting it: a Target that has left one Map is still a
 * Resource of the Space, which is all a Reference Resource needs (ADR 0070).
 */
function removeFromMap(
  snapshot: SpaceSnapshot,
  mapId: UUID,
  resourceId: UUID,
): SnapshotEditOutcome {
  const placed = placedIn(snapshot, mapId);
  if ('code' in placed) return refused(placed);
  if (!placed.placement.has(resourceId)) return refused({ code: 'resource-not-in-map' });
  return {
    kind: 'completed',
    snapshot: {
      ...snapshot,
      document: {
        ...snapshot.document,
        maps: (snapshot.document.maps ?? []).map((m) =>
          m.id === mapId
            ? {
                ...m,
                positions: Placement.toPositions(Placement.remove(placed.placement, resourceId)),
                graphs: withoutIncidentEdges(m.graphs, resourceId),
              }
            : m,
        ),
      },
    },
  };
}

export const SnapshotEdit = {
  createInMap,
  deleteFromSpace,
  open,
  close,
  resize,
  changeResourceShape,
  addToMap,
  removeFromMap,
} as const;
