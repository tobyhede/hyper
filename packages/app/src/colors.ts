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

/** Resolve each route's color: its space `color`, else a palette slot by order. */
export function routeColorMap(space: Space): Record<string, string> {
  const map: Record<string, string> = {};
  space.routes.forEach((route, index) => {
    map[route.id] = route.color ?? ROUTE_PALETTE[index % ROUTE_PALETTE.length] ?? '#8a94a6';
  });
  return map;
}
