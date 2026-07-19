import type { PresentationPath } from '@project/core';

export interface PathLegendProps {
  paths: readonly PresentationPath[];
  colorByPathId: Readonly<Record<string, string>>;
  /** When set, non-active paths are dimmed. */
  activePathId?: string | null;
}

/** A color key mapping each path to its rail color. */
export function PathLegend({ paths, colorByPathId, activePathId = null }: PathLegendProps) {
  return (
    <ul className="legend" data-testid="path-legend">
      {paths.map((path) => {
        const dimmed = activePathId !== null && path.id !== activePathId;
        return (
          <li key={path.id} className="legend__item" style={{ opacity: dimmed ? 0.4 : 1 }}>
            <span
              className="legend__swatch"
              style={{ background: colorByPathId[path.id] ?? '#8a94a6' }}
              aria-hidden="true"
            />
            {path.title}
          </li>
        );
      })}
    </ul>
  );
}
