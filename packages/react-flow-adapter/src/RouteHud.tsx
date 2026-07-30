import type { Route } from '@project/core';
import { FALLBACK_ROUTE_COLOR, RouteLegend } from '@project/ui';
import { MiniMap, Panel } from '@xyflow/react';

export interface RouteHudProps {
  routes: readonly Route[];
  colorByRouteId: Readonly<Record<string, string>>;
  activeRouteId: string | null;
  activeRouteCardIds: ReadonlySet<string>;
}

const inactiveNodeColor = 'var(--border)';

/** A route key and interactive minimap grouped into one canvas HUD. */
export function RouteHud({
  routes,
  colorByRouteId,
  activeRouteId,
  activeRouteCardIds,
}: RouteHudProps) {
  const activeRoute = routes.find((route) => route.id === activeRouteId);
  const activeRouteColor =
    (activeRouteId === null ? undefined : colorByRouteId[activeRouteId]) ??
    activeRoute?.color ??
    FALLBACK_ROUTE_COLOR;
  const nodeStrokeColor = ({ id }: { id: string }) =>
    activeRouteId !== null && activeRouteCardIds.has(id) ? activeRouteColor : inactiveNodeColor;

  return (
    <Panel position="bottom-right">
      <div
        className="route-hud"
        style={{
          width: 214,
          overflow: 'hidden',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <RouteLegend
          routes={routes}
          colorByRouteId={colorByRouteId}
          activeRouteId={activeRouteId}
        />
        <div aria-hidden="true" style={{ height: 1, background: 'var(--border)' }} />
        <MiniMap
          ariaLabel="Route overview"
          bgColor="var(--bg)"
          nodeColor="var(--panel-2)"
          nodeStrokeColor={nodeStrokeColor}
          pannable
          zoomable
          style={{ display: 'block', width: '100%', height: 86, margin: 0, border: 'none' }}
        />
      </div>
    </Panel>
  );
}
