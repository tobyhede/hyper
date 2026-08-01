import { uuidSchema, type RouteId, type SpaceSnapshot, type UUID } from '@project/core';
import type { LayoutPoint, Space } from '@project/graph';

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
    ...(activeRouteId !== null ? { activeRoute: activeRouteId } : {}),
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
