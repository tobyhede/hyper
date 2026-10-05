import {
  COLLAPSED_RESOURCE_SIZE,
  titleName,
  firstOpenSize,
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
import { resolveDocumentContent } from './content-resolution';

/**
 * The Resource membership rules that turn a Space snapshot into the next one when
 * a Resource joins, grows, shrinks, changes Shape or leaves a Map — Add, Open,
 * Close, Resize, change Shape, Remove from Map, Delete from Space.
 *
 * `SnapshotEdit` operates on `SpaceSnapshot` — the one representation both
 * Space Authoring and the session registry already hold — rather than the
 * loaded `Space` (the registry would have to parse every snapshot to edit it)
 * or a bare `Placement` (a caller would keep assembling snapshots around it,
 * and every such assembly is a second copy of these rules free to diverge —
 * skipping {@link Placement.reclaim} on a delete, or not stepping off an
 * occupied point on a create).
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
  /** A Resize of a Resource that is not Open: there is no Open Size to change. */
  | { readonly code: 'resource-not-open' }
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
 * and partial overlap of the Front is deliberate. Only an *exact* anchor
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
    Placement.place(placement, resourceId, { x: at.x, y: at.y }),
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
 * The placement with a Resource gone and the room it held given back.
 *
 * Leaving a Map is a Close the Resource does not come back from, so it
 * reclaims as a Close does (ADR 0084) — the room is written into the
 * neighbours' own coordinates, so a removal that only dropped the entry would
 * leave a hole nothing on the canvas explains and no Edit can give back. The
 * reclaim runs **before** the removal, because `Placement.reclaim` reads the
 * Resource's own entry.
 */
const removedFrom = (placement: Placement, resourceId: UUID): Placement =>
  Placement.remove(Placement.reclaim(placement, resourceId), resourceId);

/**
 * Remove a Resource from a Space entirely: its own entry, its position and every
 * Edge incident to it in **every** Map, with the room it held given back
 * wherever it was Open (ADR 0084).
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
          positions: Placement.toPositions(removedFrom(Placement.fromMap(m), resourceId)),
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

/** A width and a height together: an Open Size, or the room between two. */
type Extent = { readonly width: number; readonly height: number };

/** An entry for a Resource that is Open, which is the only kind that holds room. */
type OpenPlacement = Extract<ResourcePlacement, { readonly open: true }>;

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

/**
 * The placement after a Resource's own entry changes and the room it holds
 * changes with it: one Edit, and the whole of displacement at the Edit
 * (ADR 0084).
 *
 * The entry is written first and the displacement runs over the result. The
 * coordinates are the same either way, because `displace` compares every
 * neighbour against the *subject's* `x`/`y` and neither step moves the subject.
 * But `displace` answers the placement unchanged for a subject the map does not
 * hold, and after `place` the subject is certainly held.
 */
const withRoomFor = (
  placement: Placement,
  resourceId: UUID,
  at: ResourcePlacement,
  room: Extent,
): Placement => Placement.displace(Placement.place(placement, resourceId, at), resourceId, room);

/**
 * The placement after a Resource Closes: Closed on its own entry, and the room
 * it held given back by `Placement.reclaim`.
 *
 * Both ways a Resource closes end here — {@link close}, and a {@link resize} to
 * exactly the Closed Size (ADR 0066) — so the magnetic Close reclaims the
 * growth of the size the Resource was actually Open at rather than the zero
 * growth of the collapsed rect being proposed.
 *
 * The reclaim runs first and the Closed entry is written over the result,
 * because `Placement.reclaim` reads the Open Size off the entry it is given and
 * a Closed entry no longer holds any room. The remembered Open Size rides
 * through untouched (ADR 0066), which is what makes the next Open apply exactly
 * what this gives back.
 */
const closedResource = (placement: Placement, resourceId: UUID, at: OpenPlacement): Placement =>
  Placement.place(Placement.reclaim(placement, resourceId), resourceId, { ...at, open: false });

/**
 * The room a Resource's neighbours gain when it goes from one Open Size to
 * another: the difference between the two growths, per axis (ADR 0084).
 *
 * Negative on an axis the Resource shrank on, which is the whole of a
 * shrinking Resize. It is **not** the involution the Open/Close pair is: a
 * negative room reverses a growth only for the Resources that growth was
 * applied to, and a Resource the author placed clear of the subject *after* the
 * Open was never one of them. Such a Resource can be carried back inside the
 * subject — subject Open at `x = 0`, a Resource dropped at `x = 260`, a shrink
 * of 200 — and growing back skips it as no longer clear, so it keeps the 200.
 * That is the memorylessness ADR 0084 chose for Close, which reclaims from
 * every Resource currently clear of the closing Resource; remembering which
 * Resources a growth actually pushed is the per-Resource history it rejected.
 */
const roomBetween = (from: Extent, to: Extent): Extent => {
  const before = Placement.growth(from);
  const after = Placement.growth(to);
  return { width: after.width - before.width, height: after.height - before.height };
};

/**
 * Open a Resource in one Map, moving the Resources clear of it by the room it
 * now takes (ADR 0084, ADR 0093).
 *
 * It Opens at the Open Size it remembers (ADR 0066), or at its content's
 * {@link firstOpenSize}. The room it
 * takes is that size's growth, so the Close that reverses this reads the same
 * number back off the entry. `unchanged` for a Resource already Open.
 */
function open(snapshot: SpaceSnapshot, mapId: UUID, resourceId: UUID): SnapshotEditOutcome {
  const placed = placedIn(snapshot, mapId);
  if ('code' in placed) return refused(placed);
  const at = placed.placement.get(resourceId);
  if (at === undefined) return refused({ code: 'resource-not-in-map' });
  if (at.open) return UNCHANGED;
  const documentOf = (id: UUID) =>
    snapshot.resources.find((resource) => resource.id === id)?.document;
  const openSize =
    at.openSize ?? firstOpenSize(resolveDocumentContent(documentOf(resourceId), documentOf));
  return withPlacement(
    snapshot,
    mapId,
    withRoomFor(
      placed.placement,
      resourceId,
      { ...at, open: true, openSize },
      Placement.growth(openSize),
    ),
  );
}

/**
 * Close a Resource in one Map, giving back the room it held and keeping its
 * Open Size for the next Open (ADR 0066).
 *
 * Read as the Map stands, with no record of who this Resource's Open pushed:
 * everything currently clear of it moves back, the Resources the author dragged
 * there while it was open included (ADR 0084). `unchanged` for a Resource
 * already Closed.
 */
function close(snapshot: SpaceSnapshot, mapId: UUID, resourceId: UUID): SnapshotEditOutcome {
  const placed = placedIn(snapshot, mapId);
  if ('code' in placed) return refused(placed);
  const at = placed.placement.get(resourceId);
  if (at === undefined) return refused({ code: 'resource-not-in-map' });
  if (!at.open) return UNCHANGED;
  return withPlacement(snapshot, mapId, closedResource(placed.placement, resourceId, at));
}

/**
 * Resize an Open Resource in one Map, moving its neighbours by the difference
 * between the room it held and the room it now takes.
 *
 * A size of exactly `COLLAPSED_RESOURCE_SIZE` is a Close, and closes as
 * {@link close} does — reclaiming the growth of the size it was Open at, not
 * the proposal's. Which near misses count as that size is the application's
 * magnetic range (ADR 0066), decided before this is reached; only the exact
 * size arrives here as a Close. `unchanged` at the size it already has, and
 * `resource-not-open` for a Resource that is not Open, which has no Open
 * Size to change.
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
  if (!at.open) return refused({ code: 'resource-not-open' });
  if (
    size.width === COLLAPSED_RESOURCE_SIZE.width &&
    size.height === COLLAPSED_RESOURCE_SIZE.height
  ) {
    return withPlacement(snapshot, mapId, closedResource(placed.placement, resourceId, at));
  }
  if (at.openSize.width === size.width && at.openSize.height === size.height) return UNCHANGED;
  return withPlacement(
    snapshot,
    mapId,
    withRoomFor(
      placed.placement,
      resourceId,
      { ...at, openSize: { width: size.width, height: size.height } },
      roomBetween(at.openSize, size),
    ),
  );
}

/**
 * Draw an Ur Resource in another Shape in one Map (ADR 0117). Every other
 * kind is the rectangle, so a Shape Edit on one is refused whatever it asks for.
 *
 * The Shape is drawn at the Resource's rect and changes none, so no neighbour
 * moves and the Resource's Open/Closed state and Open Size are kept.
 * `unchanged` for the Shape it already has, including while it is Open.
 */
function changeResourceShape(
  snapshot: SpaceSnapshot,
  mapId: UUID,
  resourceId: UUID,
  resourceShape: ResourceShape,
): SnapshotEditOutcome {
  const placed = placedIn(snapshot, mapId);
  if ('code' in placed) return refused(placed);
  const at = placed.placement.get(resourceId);
  if (at === undefined) return refused({ code: 'resource-not-in-map' });
  const resource = snapshot.resources.find((candidate) => candidate.id === resourceId);
  if (resource === undefined) return refused({ code: 'resource-not-found' });
  if (resource.document.kind !== 'ur') return refused({ code: 'shape-requires-ur-resource' });
  if (at.shape === resourceShape) return UNCHANGED;
  return withPlacement(
    snapshot,
    mapId,
    Placement.place(placed.placement, resourceId, { ...at, shape: resourceShape }),
  );
}

/**
 * Add a Resource the Space already holds to one Map, Closed, with no Edge.
 *
 * Membership, a position and the rectangle, and nothing else: a Resource added
 * back to a Map is detached, and neither the Edges nor the Shape it once had
 * there are inferred back (ADR 0117). The position is an authored one
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
    Placement.place(placed.placement, resourceId, { x: at.x, y: at.y }),
  );
}

/**
 * Remove a Resource from one Map: the room it held given back, its position
 * gone, and every Edge incident to it gone from **this Map's** Graphs.
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
                positions: Placement.toPositions(removedFrom(placed.placement, resourceId)),
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
