import type { Route } from '@project/core';

export interface RouteLegendProps {
  routes: readonly Route[];
  colorByRouteId: Readonly<Record<string, string>>;
  /** When set, non-active routes are dimmed. */
  activeRouteId?: string | null;
}

/** A color key mapping each route to its rail color. */
export function RouteLegend({ routes, colorByRouteId, activeRouteId = null }: RouteLegendProps) {
  return (
    <ul className="legend" data-testid="route-legend">
      {routes.map((route) => {
        const dimmed = activeRouteId !== null && route.id !== activeRouteId;
        return (
          <li key={route.id} className="legend__item" style={{ opacity: dimmed ? 0.4 : 1 }}>
            <span
              className="legend__swatch"
              style={{ background: colorByRouteId[route.id] ?? '#8a94a6' }}
              aria-hidden="true"
            />
            {route.title}
          </li>
        );
      })}
    </ul>
  );
}
