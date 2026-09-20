import {
  titleName,
  type MapPosition,
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
 * `createInMap` and `deleteFromSpace` are what the session registry needs
 * (ticket 01); Space Authoring's own Open, Close, Resize and Remove from
 * Map stay where they are until ticket 03 routes them through here too.
 */

/** Why a `SnapshotEdit` operation refused, with the typed context a sentence needs. */
export type SnapshotEditRefusal =
  | { readonly code: 'resource-not-found' }
  | { readonly code: 'map-not-found' }
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
          positions: Placement.toPositions(
            Placement.remove(Placement.reclaim(Placement.fromMap(map), resourceId), resourceId),
          ),
          graphs: map.graphs.map((graph) => ({
            ...graph,
            edges: graph.edges.filter((edge) => edge.from !== resourceId && edge.to !== resourceId),
          })),
        })),
      },
    },
  };
}

export const SnapshotEdit = {
  createInMap,
  deleteFromSpace,
} as const;
