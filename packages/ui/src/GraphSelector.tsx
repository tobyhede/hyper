import type { Graph } from '@project/core';
import { CheckIcon, PresentIcon, GraphIcon } from './icons';
import { FALLBACK_GRAPH_COLOR } from './GraphLegend';
import { Select, SelectContent, SelectItem } from './Select';
import { SelectorTrigger } from './SelectorTrigger';

export interface GraphSelectorProps {
  graphs: readonly Graph[];
  activeGraphId: string | null;
  onActivate: (graphId: string) => void;
  onPresent: () => void;
  presenting?: boolean;
  onExitPresenting: () => void;
}

export function GraphSelector({
  graphs,
  activeGraphId,
  onActivate,
  onPresent,
  presenting = false,
  onExitPresenting,
}: GraphSelectorProps) {
  const activeGraph = graphs.find((graph) => graph.id === activeGraphId);
  const activeColor = activeGraph?.color ?? FALLBACK_GRAPH_COLOR;
  const actionName = presenting ? 'Return to overview' : 'Present this Graph';

  return (
    <div
      role="group"
      aria-label="Graph controls"
      className="inline-flex items-stretch overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--panel-2)]"
    >
      <Select
        {...(activeGraphId === null ? {} : { value: activeGraphId })}
        onValueChange={onActivate}
      >
        <SelectorTrigger
          accessibleName="Active Graph"
          testId="graph-selector"
          glyph={<GraphIcon color={activeColor} />}
          label={activeGraph?.title ?? 'None'}
          className="rounded-none border-0 bg-transparent hover:bg-[var(--border)]"
        />
        <SelectContent className="w-[214px]">
          <div className="px-[8px] pt-[7px] pb-[5px] font-mono text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
            Active Graph
          </div>
          {graphs.map((graph) => (
            <SelectItem key={graph.id} value={graph.id} className="px-[8px] py-[7px] text-[13px]">
              <span className="flex w-full items-center gap-[10px]">
                <span
                  className="h-[3px] w-[14px] shrink-0 rounded-[2px]"
                  style={{ background: graph.color ?? FALLBACK_GRAPH_COLOR }}
                  aria-hidden="true"
                />
                <span className="flex-1">{graph.title}</span>
                {graph.id === activeGraphId && <CheckIcon />}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Dead on exactly one thing: no Graph is active to present. */}
      <button
        type="button"
        data-testid={presenting ? 'exit-presenting-button' : 'present-button'}
        aria-label={actionName}
        title={actionName}
        disabled={!presenting && activeGraph === undefined}
        onClick={presenting ? onExitPresenting : onPresent}
        className="inline-flex items-center gap-[7px] border-0 border-l border-l-[var(--border)] bg-transparent px-[11px] py-[6px] text-[13px] text-[var(--text)] hover:bg-[var(--border)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {presenting ? null : <PresentIcon color={activeColor} />}
        {presenting ? 'Overview' : 'Present'}
      </button>
    </div>
  );
}
