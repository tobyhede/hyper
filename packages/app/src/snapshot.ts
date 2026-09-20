import {
  SPACE_FILE_VERSION,
  type ResourceId,
  type Graph,
  type GraphId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, Placement, type Space } from '@project/graph';

/**
 * Read a working snapshot as the validated aggregate, revalidating only when
 * handed a different one.
 *
 * Domain intake parses and reindexes the whole Space, and the runtime reads it
 * on paths that run per render — `navigation.moves()` is called during every
 * App render, including the per-pointer-frame renders a drag produces. Caching
 * on the snapshot's identity restores what the store used to give for free by
 * holding an installed `Space`, and is sound because a session publishes a
 * fresh `working` clone on a new state object rather than mutating one.
 *
 * The snapshot is an argument rather than something the reader fetches, so each
 * caller says which one it means: the render path reads the snapshot React is
 * rendering, and Navigation reads the session's live one. Sharing one reader
 * then gives both the same `Space` identity, which is what lets the render path
 * memoize on it.
 *
 * A failure is never cached: the reader keeps the last good pair untouched and
 * throws again on the next read, so an invalid snapshot cannot leave a stale
 * Space answering as the current one.
 */
export const createWorkingSpaceReader = (): ((snapshot: SpaceSnapshot) => Space) => {
  let validated: { snapshot: SpaceSnapshot; space: Space } | null = null;
  return (snapshot) => {
    if (validated !== null && validated.snapshot === snapshot) return validated.space;
    const loaded = loadSpaceSnapshot(snapshot);
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('; '));
    validated = { snapshot, space: loaded.space };
    return loaded.space;
  };
};

/**
 * Convert the validated runtime aggregate into the complete persistence seam.
 *
 * `space.graphs` is deliberately not written: it is a *derived* flatten across
 * the maps that own them (ADR 0040, ADR 0045), and the document has no
 * space-level collection for it to go back into. Every graph reaches the wire
 * inside the map that owns it, which `space.maps` already carries.
 */
export const snapshotFromSpace = (space: Space): SpaceSnapshot => {
  const document: SpaceSnapshot['document'] = {
    version: SPACE_FILE_VERSION,
    title: space.title,
  };
  if (space.maps.length > 0) document.maps = [...space.maps];
  if (space.defaultMap !== undefined) document.defaultMap = space.defaultMap;
  return {
    id: space.id,
    document,
    resources: space.resources.map(({ id, ...rest }) => ({
      id,
      document: rest,
    })),
  };
};

/**
 * The graphs a Resource has left, with every Edge incident to it gone.
 *
 * A Resource that is not a member of a Map cannot be an endpoint of a Graph that
 * Map owns (ADR 0040), so this is what both removals owe: Remove from
 * Map, which applies it to the one Map the Edit writes, and Delete Resource
 * from Space, which applies it to every Map through
 * {@link withResourceRemovedFromMaps}. One rule, in one place, so the two
 * scopes of the same deletion cannot come to disagree about what an incident
 * Edge is. The graphs themselves stay, empty ones included: deleting a graph is
 * its own action.
 */
export const withoutIncidentEdges = (graphs: readonly Graph[], resourceId: ResourceId): Graph[] =>
  graphs.map((graph) => ({
    ...graph,
    edges: graph.edges.filter((edge) => edge.from !== resourceId && edge.to !== resourceId),
  }));

/**
 * The snapshot with one Resource gone from every Map: its membership, its
 * position and every Edge incident to it, in every Graph every Map owns.
 *
 * The cascade half of Delete Resource from Space, and the one write in this module
 * that is not about a single Map — which is exactly why it is here rather
 * than folded into {@link updatePositionedMap}. The Resource itself stays in
 * `resources`: this answers what the Maps hold, and removing the Resource is the
 * caller's own statement in the same Edit. Empty Graphs and empty Maps
 * remain, because deleting a Resource is not an instruction to delete either
 * (ADR 0040).
 *
 * Every Map that held the Resource **Open** also gets the room it was holding
 * back, through the same `Placement.reclaim` the single-Map removal uses.
 * Under the derivation ADR 0084 removed, dropping the entry dropped its
 * displacement with it and this could be a filter; now the room lives in the
 * neighbours' own stored coordinates, so a Map the Edit is not drawing would
 * otherwise keep it forever — with no Resource left on that canvas to Close and no
 * Edit that could give it back. Open/Closed is Map-owned (ADR 0064), so
 * whether there is any room to reclaim is asked of each Map separately and
 * is not what the drawing one answered.
 *
 * Answers the snapshot it was given when no Map held the Resource, so a deletion
 * that only ever affected the current Map — which the caller writes
 * separately — does not rebuild every other Map to say nothing about them.
 */
export const withResourceRemovedFromMaps = (
  base: SpaceSnapshot,
  resourceId: ResourceId,
): SpaceSnapshot => {
  const maps = base.document.maps ?? [];
  const affected = maps.some(
    (map) =>
      Object.hasOwn(map.positions, resourceId) ||
      map.graphs.some((graph) =>
        graph.edges.some((edge) => edge.from === resourceId || edge.to === resourceId),
      ),
  );
  if (!affected) return base;
  return {
    ...base,
    document: {
      ...base.document,
      maps: maps.map((map) => ({
        ...map,
        positions: Placement.toPositions(
          Placement.remove(Placement.reclaim(Placement.fromMap(map), resourceId), resourceId),
        ),
        graphs: withoutIncidentEdges(map.graphs, resourceId),
      })),
    },
  };
};

/** Everything a completed Edit writes into one Map. */
export interface PositionedMapEdit {
  readonly mapId: UUID;
  readonly title: string;
  readonly positions: Placement;
  /**
   * The graphs this Map owns after the Edit, in author order (ADR 0040).
   *
   * Replaced whole rather than merged, for the same reason the positions are:
   * the editor holds the whole truth of them. A graph is a nested owned value
   * of exactly one Map, so there is nowhere else for this Edit's graphs to
   * be written and nothing at the space level left to reconcile them with.
   */
  readonly graphs: readonly Graph[];
  /** The Graph the Map opens on. */
  readonly activeGraphId: GraphId | null;
}

/** Fold a completed placement edit into a complete authoritative snapshot. */
export const updatePositionedMap = (
  base: SpaceSnapshot,
  { mapId, title, positions, graphs, activeGraphId }: PositionedMapEdit,
): SpaceSnapshot => {
  const existing = (base.document.maps ?? []).find((map) => map.id === mapId);
  const map = {
    id: mapId,
    title,
    kind: 'positioned' as const,
    positions: Placement.toPositions(positions),
    graphs: [...graphs],
    // An Edit with no active Graph says nothing about the authored one, so the
    // existing value carries through. Only a named Graph replaces it.
    ...(activeGraphId !== null
      ? { activeGraph: activeGraphId }
      : existing?.activeGraph !== undefined
        ? { activeGraph: existing.activeGraph }
        : {}),
  };
  const maps = [...(base.document.maps ?? [])];
  const existingIndex = maps.findIndex((candidate) => candidate.id === mapId);
  if (existingIndex === -1) maps.push(map);
  else maps[existingIndex] = map;
  return {
    ...base,
    document: {
      ...base.document,
      maps,
      defaultMap: mapId,
    },
  };
};
