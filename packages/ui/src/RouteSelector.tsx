import type { Route } from '@project/core';
import { CheckIcon, PresentIcon, RouteIcon } from './icons';
import { FALLBACK_ROUTE_COLOR } from './RouteLegend';
import { Select, SelectContent, SelectItem } from './Select';
import { SelectorTrigger } from './SelectorTrigger';

export interface RouteSelectorProps {
  routes: readonly Route[];
  activeRouteId: string | null;
  onActivate: (routeId: string) => void;
  onPresent: () => void;
  presenting?: boolean;
  onExitPresenting: () => void;
}

export function RouteSelector({
  routes,
  activeRouteId,
  onActivate,
  onPresent,
  presenting = false,
  onExitPresenting,
}: RouteSelectorProps) {
  const activeRoute = routes.find((route) => route.id === activeRouteId);
  const activeColor = activeRoute?.color ?? FALLBACK_ROUTE_COLOR;
  const actionName = presenting ? 'Return to overview' : 'Present this route';

  return (
    <div
      role="group"
      aria-label="Route controls"
      className="inline-flex items-stretch overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--panel-2)]"
    >
      <Select
        {...(activeRouteId === null ? {} : { value: activeRouteId })}
        onValueChange={onActivate}
      >
        <SelectorTrigger
          accessibleName="Active route"
          testId="route-selector"
          glyph={<RouteIcon color={activeColor} />}
          label={activeRoute?.title ?? 'None'}
          className="rounded-none border-0 bg-transparent hover:bg-[var(--border)]"
        />
        <SelectContent className="w-[214px]">
          <div className="px-[8px] pt-[7px] pb-[5px] font-mono text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
            Active route
          </div>
          {routes.map((route) => (
            <SelectItem key={route.id} value={route.id} className="px-[8px] py-[7px] text-[13px]">
              <span className="flex w-full items-center gap-[10px]">
                <span
                  className="h-[3px] w-[14px] shrink-0 rounded-[2px]"
                  style={{ background: route.color ?? FALLBACK_ROUTE_COLOR }}
                  aria-hidden="true"
                />
                <span className="flex-1">{route.title}</span>
                {route.id === activeRouteId && <CheckIcon />}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        data-testid={presenting ? 'exit-presenting-button' : 'present-button'}
        aria-label={actionName}
        title={actionName}
        disabled={!presenting && activeRoute === undefined}
        onClick={presenting ? onExitPresenting : onPresent}
        className="inline-flex items-center gap-[7px] border-0 border-l border-l-[var(--border)] bg-transparent px-[11px] py-[6px] text-[13px] text-[var(--text)] hover:bg-[var(--border)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {presenting ? null : <PresentIcon color={activeColor} />}
        {presenting ? 'Overview' : 'Present'}
      </button>
    </div>
  );
}
