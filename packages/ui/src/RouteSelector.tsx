import type { Route } from '@project/core';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';

export interface RouteSelectorProps {
  routes: readonly Route[];
  selectedRouteId: string | null;
  onSelect: (routeId: string) => void;
}

export function RouteSelector({ routes, selectedRouteId, onSelect }: RouteSelectorProps) {
  return (
    <label className="route-selector">
      <span className="route-selector__label">Route</span>
      <Select value={selectedRouteId ?? undefined} onValueChange={onSelect}>
        <SelectTrigger
          className="route-selector__select"
          data-testid="route-selector"
          aria-label="Route"
        >
          <SelectValue placeholder="Select a route…" />
        </SelectTrigger>
        <SelectContent>
          {routes.map((route) => (
            <SelectItem key={route.id} value={route.id}>
              {route.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
