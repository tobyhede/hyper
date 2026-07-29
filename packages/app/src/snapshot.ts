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

/** Fold a completed placement edit into a complete authoritative snapshot. */
export const updatePositionedLayout = (
  base: SpaceSnapshot,
  layoutId: UUID,
  title: string,
  positions: ReadonlyMap<string, LayoutPoint>,
  activeRouteId: RouteId | null,
): SpaceSnapshot => {
  const existing = (base.document.layouts ?? []).find((layout) => layout.id === layoutId);
  const layout = {
    id: layoutId,
    title,
    kind: 'positioned' as const,
    positions: Object.fromEntries(
      [...positions].map(([id, point]) => [uuidSchema.parse(id), { x: point.x, y: point.y }]),
    ),
    ...(existing?.routes ? { routes: existing.routes } : {}),
    ...(activeRouteId !== null ? { activeRoute: activeRouteId } : {}),
  };
  const others = (base.document.layouts ?? []).filter((candidate) => candidate.id !== layoutId);
  return {
    ...base,
    document: {
      ...base.document,
      layouts: [...others, layout],
      defaultView: layoutId,
    },
  };
};
