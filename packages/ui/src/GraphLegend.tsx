import type { Graph } from '@project/core';
import { GraphIcon } from './icons';

export const FALLBACK_GRAPH_COLOR = '#8a94a6';

/** Resolve a Graph's displayed colour from projection, authorship, then UI fallback. */
export function graphColor(graph: Graph, colorByGraphId: Readonly<Record<string, string>>): string {
  return colorByGraphId[graph.id] ?? graph.color ?? FALLBACK_GRAPH_COLOR;
}

export interface GraphLegendProps {
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  /** When set, non-active graphs are dimmed. */
  activeGraphId?: string | null;
}

/** The graph colour key block mounted above the minimap in the graph HUD. */
export function GraphLegend({ graphs, colorByGraphId, activeGraphId = null }: GraphLegendProps) {
  return (
    <div className="flex flex-col gap-[6px] p-[9px_10px]" data-testid="graph-legend">
      <div className="flex items-center gap-[7px] font-mono text-[10px] tracking-[0.12em] text-[var(--muted-foreground)] uppercase">
        <GraphIcon size={13} />
        <span>Graphs</span>
      </div>
      {/* `list-none` strips list semantics in Safari/VoiceOver; the role restores them. */}
      <ul role="list" className="m-0 flex list-none flex-col gap-[6px] p-0">
        {graphs.map((graph) => {
          const dimmed = activeGraphId !== null && graph.id !== activeGraphId;
          return (
            <li
              key={graph.id}
              className="legend__item flex items-center gap-[8px] text-[12px] text-[var(--foreground)]"
              style={{ opacity: dimmed ? 0.5 : 1 }}
            >
              <span
                className="h-[3px] w-[14px] shrink-0 rounded-[2px]"
                style={{ background: graphColor(graph, colorByGraphId) }}
                aria-hidden="true"
              />
              {graph.title}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
