import {
  SPACE_FILE_VERSION,
  type CardId,
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
    ...(space.defaultRenderer !== undefined ? { defaultRenderer: space.defaultRenderer } : {}),
  },
  cards: space.cards.map(({ id, ...document }) => ({
    id,
    document,
  })),
});

/**
 * The graphs a Card has left, with every Edge incident to it gone.
 *
 * A Card that is not a member of a Layout cannot be an endpoint of a Graph that
 * Layout owns (ADR 0040), so this is what both removals owe: Remove from
 * Layout, which applies it to the one Layout the Edit writes, and Delete Card
 * from Space, which applies it to every Layout through
 * {@link withCardRemovedFromLayouts}. One rule, in one place, so the two
 * scopes of the same deletion cannot come to disagree about what an incident
 * Edge is. The graphs themselves stay, empty ones included: deleting a graph is
 * its own action.
 */
export const withoutIncidentEdges = (graphs: readonly Graph[], cardId: CardId): Graph[] =>
  graphs.map((graph) => ({
    ...graph,
    edges: graph.edges.filter((edge) => edge.from !== cardId && edge.to !== cardId),
  }));

/**
 * The snapshot with one Card gone from every Layout: its membership, its
 * position and every Edge incident to it, in every Graph every Layout owns.
 *
 * The cascade half of Delete Card from Space, and the one write in this module
 * that is not about a single Layout — which is exactly why it is here rather
 * than folded into {@link updatePositionedLayout}. The Card itself stays in
 * `cards`: this answers what the Layouts hold, and removing the Card is the
 * caller's own statement in the same Edit. Empty Graphs and empty Layouts
 * remain, because deleting a Card is not an instruction to delete either
 * (ADR 0040).
 *
 * Answers the snapshot it was given when no Layout held the Card, so a deletion
 * that only ever affected the current Layout — which the caller writes
 * separately — does not rebuild every other Layout to say nothing about them.
 */
export const withCardRemovedFromLayouts = (base: SpaceSnapshot, cardId: CardId): SpaceSnapshot => {
  const layouts = base.document.layouts ?? [];
  const affected = layouts.some(
    (layout) =>
      Object.hasOwn(layout.positions, cardId) ||
      layout.graphs.some((graph) =>
        graph.edges.some((edge) => edge.from === cardId || edge.to === cardId),
      ),
  );
  if (!affected) return base;
  return {
    ...base,
    document: {
      ...base.document,
      layouts: layouts.map((layout) => ({
        ...layout,
        positions: Object.fromEntries(
          Object.entries(layout.positions).filter(([id]) => id !== cardId),
        ),
        graphs: withoutIncidentEdges(layout.graphs, cardId),
      })),
    },
  };
};

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
      defaultRenderer: layoutId,
    },
  };
};
