import {
  SPACE_FILE_VERSION,
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
 * the layouts that own them (ADR 0040, ADR 0045), and the document has no
 * space-level collection for it to go back into. Every graph reaches the wire
 * inside the layout that owns it, which `space.layouts` already carries.
 */
export const snapshotFromSpace = (space: Space): SpaceSnapshot => ({
  id: space.id,
  document: {
    version: SPACE_FILE_VERSION,
    title: space.title,
    ...(space.layouts.length > 0 ? { layouts: [...space.layouts] } : {}),
    ...(space.defaultView !== undefined ? { defaultView: space.defaultView } : {}),
  },
  cards: space.cards.map(({ id, ...document }) => ({
    id,
    document,
  })),
});

/** Everything a completed Edit writes into one Layout. */
export interface PositionedLayoutEdit {
  readonly layoutId: UUID;
  readonly title: string;
  readonly positions: Placement;
  /**
   * The graphs this Layout owns after the Edit, in author order (ADR 0040).
   *
   * Replaced whole rather than merged, for the same reason the positions are:
   * the editor holds the whole truth of them. A graph is a nested owned value
   * of exactly one Layout, so there is nowhere else for this Edit's graphs to
   * be written and nothing at the space level left to reconcile them with.
   */
  readonly graphs: readonly Graph[];
  /** The Graph the Layout opens on. */
  readonly activeGraphId: GraphId | null;
}

/** Fold a completed placement edit into a complete authoritative snapshot. */
export const updatePositionedLayout = (
  base: SpaceSnapshot,
  { layoutId, title, positions, graphs, activeGraphId }: PositionedLayoutEdit,
): SpaceSnapshot => {
  const existing = (base.document.layouts ?? []).find((layout) => layout.id === layoutId);
  const layout = {
    id: layoutId,
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
  const layouts = [...(base.document.layouts ?? [])];
  const existingIndex = layouts.findIndex((candidate) => candidate.id === layoutId);
  if (existingIndex === -1) layouts.push(layout);
  else layouts[existingIndex] = layout;
  return {
    ...base,
    document: {
      ...base.document,
      layouts,
      defaultView: layoutId,
    },
  };
};
