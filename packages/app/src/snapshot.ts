import {
  SPACE_FILE_VERSION,
  type GraphId,
  type Map,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, type Space } from '@project/graph';

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
 * What a completed Edit says about the Map it continues in: the Map's
 * identity, as distinct from its content.
 *
 * Positions and Graphs are deliberately absent. The Edit that changes them
 * writes them into the working snapshot itself — through `SnapshotEdit` or its
 * own arm — before this is folded over the result, so a whole-snapshot answer
 * from one of those operations is never overwritten here by a copy of the Map
 * taken before it ran.
 */
export interface PositionedMapEdit {
  readonly mapId: UUID;
  readonly title: string;
  /** The Graph the Map opens on. */
  readonly activeGraphId: GraphId | null;
}

/**
 * Fold a completed Edit's Map identity — title, kind and Active Graph — into
 * the snapshot, and make that Map the Space's opening one.
 *
 * Writes into a Map the snapshot already holds, and throws for one it does not:
 * creating a Map is the `created-map` Edit's own statement, not a side effect
 * of naming an id here.
 */
export const updatePositionedMap = (
  base: SpaceSnapshot,
  { mapId, title, activeGraphId }: PositionedMapEdit,
): SpaceSnapshot => {
  const maps = base.document.maps ?? [];
  if (!maps.some((map) => map.id === mapId)) {
    throw new Error(`Cannot write Map ${mapId}: the snapshot holds no such Map.`);
  }
  return {
    ...base,
    document: {
      ...base.document,
      maps: maps.map((existing) => {
        if (existing.id !== mapId) return existing;
        const written: Map = { ...existing, title, kind: 'positioned' };
        // An Edit with no active Graph says nothing about the authored one, so
        // the existing value carries through. Only a named Graph replaces it.
        if (activeGraphId !== null) written.activeGraph = activeGraphId;
        return written;
      }),
      defaultMap: mapId,
    },
  };
};
