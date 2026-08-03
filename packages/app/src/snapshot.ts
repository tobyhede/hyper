import { uuidSchema, type RouteId, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot, type LayoutPoint, type Space } from '@project/graph';

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

/** Convert the validated runtime aggregate into the complete persistence seam. */
export const snapshotFromSpace = (space: Space): SpaceSnapshot => ({
  id: space.id,
  document: {
    version: 2,
    title: space.title,
    routes: [...space.routes],
    ...(space.layouts.length > 0 ? { layouts: [...space.layouts] } : {}),
    ...(space.defaultView !== undefined ? { defaultView: space.defaultView } : {}),
  },
  cards: space.cards.map(({ id, ...document }) => ({
    id,
    document,
  })),
});

/**
 * The placement a completed Edit writes into one Layout.
 *
 * `activeRouteId` and `mintedRouteId` are both a `RouteId | null` and each
 * lands somewhere different — the Layout's `activeRoute`, and its `routes`
 * filter — so they are named rather than ordered. As positions they typechecked
 * transposed, and a transposed call wrote both answers wrong in silence.
 */
export interface PositionedLayoutEdit {
  readonly layoutId: UUID;
  readonly title: string;
  readonly positions: ReadonlyMap<string, LayoutPoint>;
  /** The Route the Layout opens on. */
  readonly activeRouteId: RouteId | null;
  /** The Route this same Edit minted, if it minted one. */
  readonly mintedRouteId?: RouteId | null;
}

/**
 * Fold a completed placement edit into a complete authoritative snapshot.
 *
 * A Route minted by this same Edit becomes visible in an existing explicit
 * filter before it is named active. Ordinary edits pass no minted Route and
 * preserve the Layout's authored filter exactly.
 */
export const updatePositionedLayout = (
  base: SpaceSnapshot,
  { layoutId, title, positions, activeRouteId, mintedRouteId = null }: PositionedLayoutEdit,
): SpaceSnapshot => {
  const existing = (base.document.layouts ?? []).find((layout) => layout.id === layoutId);
  const routes =
    existing?.routes === undefined ||
    mintedRouteId === null ||
    existing.routes.includes(mintedRouteId)
      ? existing?.routes
      : [...existing.routes, mintedRouteId];
  const layout = {
    id: layoutId,
    title,
    kind: 'positioned' as const,
    positions: Object.fromEntries(
      [...positions].map(([id, point]) => [uuidSchema.parse(id), { x: point.x, y: point.y }]),
    ),
    ...(routes !== undefined ? { routes } : {}),
    // An Edit with no active Route says nothing about the authored one, so the
    // existing value carries through. Only a named Route replaces it.
    ...(activeRouteId !== null
      ? { activeRoute: activeRouteId }
      : existing?.activeRoute !== undefined
        ? { activeRoute: existing.activeRoute }
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
