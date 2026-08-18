import type { Graph } from '@project/core';
import { FALLBACK_GRAPH_COLOR, graphColor } from './GraphLegend';
import { CheckIcon, GraphIcon } from './icons';
import { Select, SelectContent, SelectItem } from './Select';
import { SelectorGroupLabel, SelectorTrigger } from './SelectorTrigger';

export interface GraphSelectorProps {
  readonly graphs: readonly Graph[];
  readonly colorByGraphId: Readonly<Record<string, string>>;
  readonly activeGraphId: string | null;
  readonly onActivate: (graphId: string) => void;
}

export function GraphSelector({
  graphs,
  colorByGraphId,
  activeGraphId,
  onActivate,
}: GraphSelectorProps) {
  const activeGraph = graphs.find((graph) => graph.id === activeGraphId);
  const activeColor =
    activeGraph === undefined ? FALLBACK_GRAPH_COLOR : graphColor(activeGraph, colorByGraphId);

  // Controlled across Base UI's native null empty state. A Space with no Layout
  // owns no Graph either (ADR 0040), so this starts null and the first
  // conversion gives it an id.
  return (
    <Select value={activeGraphId} onValueChange={(next) => next !== null && onActivate(next)}>
      <SelectorTrigger
        accessibleName="Active Graph"
        testId="graph-selector"
        glyph={<GraphIcon color={activeColor} />}
        label={activeGraph?.title ?? 'None'}
      />
      <SelectContent className="w-[214px]">
        <SelectorGroupLabel>Active Graph</SelectorGroupLabel>
        {graphs.map((graph) => (
          <SelectItem key={graph.id} value={graph.id} className="px-[8px] py-[7px] text-[13px]">
            <span className="flex w-full items-center gap-[10px]">
              <span
                className="h-[3px] w-[14px] shrink-0 rounded-[2px]"
                style={{ background: graphColor(graph, colorByGraphId) }}
                aria-hidden="true"
              />
              <span className="flex-1">{graph.title}</span>
              {graph.id === activeGraphId && <CheckIcon />}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
