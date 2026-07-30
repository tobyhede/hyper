import type { Route } from '@project/core';
import { RouteIcon } from './icons';

export const FALLBACK_ROUTE_COLOR = '#8a94a6';

export interface RouteLegendProps {
  routes: readonly Route[];
  colorByRouteId: Readonly<Record<string, string>>;
  /** When set, non-active routes are dimmed. */
  activeRouteId?: string | null;
}

/** The route colour key block mounted above the minimap in the graph HUD. */
export function RouteLegend({ routes, colorByRouteId, activeRouteId = null }: RouteLegendProps) {
  return (
    <div className="flex flex-col gap-[6px] p-[9px_10px]" data-testid="route-legend">
      <div className="flex items-center gap-[7px] font-mono text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
        <RouteIcon size={13} />
        <span>Routes</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
        {routes.map((route) => {
          const dimmed = activeRouteId !== null && route.id !== activeRouteId;
          return (
            <li
              key={route.id}
              className="legend__item flex items-center gap-[8px] text-[12px] text-[var(--text)]"
              style={{ opacity: dimmed ? 0.5 : 1 }}
            >
              <span
                className="h-[3px] w-[14px] shrink-0 rounded-[2px]"
                style={{ background: colorByRouteId[route.id] ?? FALLBACK_ROUTE_COLOR }}
                aria-hidden="true"
              />
              {route.title}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
