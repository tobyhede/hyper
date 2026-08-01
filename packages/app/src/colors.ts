import type { Space } from '@project/graph';

/** Distinct, reasonably accessible edge colors, assigned to routes by order. */
export const ROUTE_PALETTE = [
  '#6ea8fe', // blue
  '#f59e0b', // amber
  '#34d399', // green
  '#f472b6', // pink
  '#c084fc', // purple
  '#f87171', // red
] as const;

/**
 * The active route's color, which authoring draws in as well as the overview.
 * A Space with no active Route still needs a stroke — a first connection is
 * drawn before the Route it mints exists — so the first palette slot stands in.
 */
export function activeRouteColor(
  colorByRouteId: Record<string, string>,
  activeRouteId: string | null,
): string {
  if (activeRouteId === null) return ROUTE_PALETTE[0];
  return colorByRouteId[activeRouteId] ?? ROUTE_PALETTE[0];
}

/** Resolve each route's color: its space `color`, else a palette slot by order. */
export function routeColorMap(space: Space): Record<string, string> {
  const map: Record<string, string> = {};
  space.routes.forEach((route, index) => {
    map[route.id] = route.color ?? ROUTE_PALETTE[index % ROUTE_PALETTE.length] ?? '#8a94a6';
  });
  return map;
}
