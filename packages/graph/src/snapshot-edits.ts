import {
  COLLAPSED_RESOURCE_SIZE,
  DEFAULT_OPEN_SIZE,
  DEFAULT_SPACE_RESOURCE_OPEN_SIZE,
  titleName,
  type Graph,
  type Map,
  type MapPosition,
  type ResourcePlacement,
  type SpaceSnapshot,
  type ResourceDocument,
  type UUID,
} from '@project/core';
import { Placement } from './placement';

/**
 * The Resource membership rules that turn a Space snapshot into the next one when
 * a Resource joins, grows, shrinks or leaves a Map — Add, Open, Close, Resize,
 * Remove from Map, Delete from Space (ADR 0084, ADR 0086).
 *
 * `SnapshotEdit` operates on `SpaceSnapshot` — the one representation both
 * Space Authoring and the session registry already hold — rather than the
 * loaded `Space` (the registry would have to parse every snapshot to edit it)
 * or a bare `Placement` (a caller would keep assembling snapshots around it,
 * which is where the registry's copy of these rules diverged from Authoring's:
 * `session-registry.ts`'s own `removeSpaceResource` never called
 * {@link Placement.reclaim}, so an Open Space Resource's room stayed displaced
 * after it was deleted, and `addSpaceResource` never stepped off an occupied
 * point the way a menu-created Markdown Resource does).
 *
 * Every operation answers `completed(snapshot) | unchanged | refused(code)`,
 * never a throw for a domain rule (ADR 0057). This module declares its own
 * small refusal union carrying codes and typed context only — wording stays in
 * `app`, which maps a code into `AuthoringRefusal` or `SpaceResourceRefusal`.
 *
 * Operations arrive with their first real caller rather than ahead of one:
 * `createInMap` and `deleteFromSpace` are what the session registry needs;
 * `open`, `close`, `resize`, `addToMap` and `removeFromMap` are Space
 * Authoring's.
 */

/** Why a `SnapshotEdit` operation refused, with the typed context a sentence needs. */
export type SnapshotEditRefusal =
  | { readonly code: 'resource-not-found' }
  | { readonly code: 'map-not-found' }
  | { readonly code: 'resource-not-in-map' }
  | { readonly code: 'resource-already-in-map' }
  /** A Resize of a Resource that is not Open: there is no Open Size to change. */
  | { readonly code: 'resource-not-expanded' }
  | {
      readonly code: 'resource-has-references';
      /** The Reference Resources by **name**, which is what a sentence listing Resources says (ADR 0083). */
      readonly referenceTitles: readonly string[];
    };

/** What a `SnapshotEdit` operation answers. */
export type SnapshotEditOutcome =
  | { readonly kind: 'completed'; readonly snapshot: SpaceSnapshot }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: SnapshotEditRefusal };

/**
 * How far a Resource creation steps when the point it was given is already taken,
 * and in which direction.
 *
 * Moved here from Space Authoring's own `freeAnchor`
 * (`packages/app/src/space-authoring.ts`), because the registry has to place a
 * menu-created Space Resource exactly as a menu-created Markdown Resource lands
 * (ADR 0089) and a rule with two owners had none — the registry wrote the
 * anchor it was given exactly, so a repeated centre-add stacked Space Resources
 * on top of each other. Authoring keeps its own copy until ticket 03 routes it
 * through this module too.
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
 * caller with one to aim — create-and-connect's drop point, which does not
 * reach this module yet (ticket 03).
 */
function createInMap(
  snapshot: SpaceSnapshot,
  mapId: UUID,
  resourceId: UUID,
  document: ResourceDocument,
  position: MapPosition,
  mode: 'exact' | 'avoidingOverlap',
): SnapshotEditOutcome {
  const maps = snapshot.document.maps ?? [];
  const target = maps.find((map) => map.id === mapId);
  if (target === undefined) {
    return { kind: 'refused', refusal: { code: 'map-not-found' } };
  }
  const at =
    mode === 'avoidingOverlap' ? freeAnchor(Placement.fromMap(target), position) : position;
  return {
    kind: 'completed',
    snapshot: {
      ...snapshot,
      resources: [...snapshot.resources, { id: resourceId, document }],
      document: {
        ...snapshot.document,
        maps: maps.map((map) =>
          map.id === mapId
            ? {
                ...map,
                positions: { ...map.positions, [resourceId]: { ...at, open: false } },
              }
            : map,
        ),
      },
    },
  };
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
 * Reference Resources. Space Resource deletion used to skip this guard entirely and reach
 * intake instead, which answered the generic `aggregate-refused` — nothing
 * committed, but nothing useful said either.
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
        maps: maps.map((map) => ({
          ...map,
          positions: Placement.toPositions(removedFrom(Placement.fromMap(map), resourceId)),
          graphs: withoutIncidentEdges(map.graphs, resourceId),
        })),
      },
    },
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
  const map = (snapshot.document.maps ?? []).find((candidate) => candidate.id === mapId);
  if (map === undefined) return { code: 'map-not-found' };
  return { map, placement: Placement.fromMap(map) };
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
      maps: (snapshot.document.maps ?? []).map((map) =>
        map.id === mapId ? { ...map, positions: Placement.toPositions(placement) } : map,
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
 * It Opens at the Open Size it remembers (ADR 0066), or at the default for its
 * kind — a Space Resource draws a whole Map and opens larger. The room it
 * takes is that size's growth, so the Close that reverses this reads the same
 * number back off the entry. `unchanged` for a Resource already Open.
 */
function open(snapshot: SpaceSnapshot, mapId: UUID, resourceId: UUID): SnapshotEditOutcome {
  const placed = placedIn(snapshot, mapId);
  if ('code' in placed) return refused(placed);
  const at = placed.placement.get(resourceId);
  if (at === undefined) return refused({ code: 'resource-not-in-map' });
  if (at.open) return UNCHANGED;
  const kind = snapshot.resources.find((resource) => resource.id === resourceId)?.document.kind;
  const openSize =
    at.openSize ?? (kind === 'space' ? DEFAULT_SPACE_RESOURCE_OPEN_SIZE : DEFAULT_OPEN_SIZE);
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
 * `resource-not-expanded` for a Resource that is not Open, which has no Open
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
  if (!at.open) return refused({ code: 'resource-not-expanded' });
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
 * Add a Resource the Space already holds to one Map, Closed, with no Edge.
 *
 * Membership and a position and nothing else: a Resource added back to a Map
 * is detached, and the Edges it once had there are never inferred back. The
 * position is an authored one (ADR 0084); `avoidingOverlap` steps off a point
 * another Resource already occupies exactly, as a creation from a menu does
 * ({@link freeAnchor}), and `exact` keeps it.
 */
function addToMap(
  snapshot: SpaceSnapshot,
  mapId: UUID,
  resourceId: UUID,
  position: MapPosition,
  mode: 'exact' | 'avoidingOverlap',
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
        maps: (snapshot.document.maps ?? []).map((map) =>
          map.id === mapId
            ? {
                ...map,
                positions: Placement.toPositions(removedFrom(placed.placement, resourceId)),
                graphs: withoutIncidentEdges(map.graphs, resourceId),
              }
            : map,
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
  addToMap,
  removeFromMap,
} as const;
