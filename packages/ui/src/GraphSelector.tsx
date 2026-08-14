import type { Graph } from '@project/core';
import { CheckIcon, PresentIcon, GraphIcon } from './icons';
import { FALLBACK_GRAPH_COLOR } from './GraphLegend';
import { Select, SelectContent, SelectItem } from './Select';
import { SelectorTrigger } from './SelectorTrigger';

export interface GraphSelectorProps {
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  activeGraphId: string | null;
  onActivate: (graphId: string) => void;
  onPresent: () => void;
  presenting?: boolean;
  onExitPresenting: () => void;
}

export function GraphSelector({
  graphs,
  colorByGraphId,
  activeGraphId,
  onActivate,
  onPresent,
  presenting = false,
  onExitPresenting,
}: GraphSelectorProps) {
  const activeGraph = graphs.find((graph) => graph.id === activeGraphId);
  const activeColor =
    activeGraph === undefined
      ? FALLBACK_GRAPH_COLOR
      : (colorByGraphId[activeGraph.id] ?? activeGraph.color ?? FALLBACK_GRAPH_COLOR);
  const actionName = presenting ? 'Return to overview' : 'Present this Graph';

  return (
    <div
      role="group"
      aria-label="Graph controls"
      className="inline-flex items-stretch overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--panel-2)]"
    >
      {/*
        Controlled across Base UI's native null empty state. A Space with no
        Layout owns no Graph either (ADR 0040), so this starts null and the
        first conversion gives it an id.
      */}
      <Select value={activeGraphId} onValueChange={(next) => next !== null && onActivate(next)}>
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
                  style={{
                    background: colorByGraphId[graph.id] ?? graph.color ?? FALLBACK_GRAPH_COLOR,
                  }}
                  aria-hidden="true"
                />
                <span className="flex-1">{graph.title}</span>
                {graph.id === activeGraphId && <CheckIcon />}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/*
        Dead on two things, and they are one rule: there is no Card to begin at.
        No Graph is active, or the active Graph holds no Edges — and the second
        is not a defensive nicety. Creating a Layout creates its initial Active
        Graph empty in the same Edit (ADR 0040), so a Layout converted out of an
        Algorithmic View by a plain Card drag is *always* in this state until the
        author draws something. `graphStartCard` has no answer for such a Graph
        and `present()` returns without changing anything, so an enabled control
        here would read `Present` and swallow the click — the exact defect a
        fully cyclic Graph used to produce.
      */}
      <button
        type="button"
        data-testid={presenting ? 'exit-presenting-button' : 'present-button'}
        aria-label={actionName}
        title={actionName}
        disabled={!presenting && (activeGraph === undefined || activeGraph.edges.length === 0)}
        onClick={presenting ? onExitPresenting : onPresent}
        className="inline-flex items-center gap-[7px] border-0 border-l border-l-[var(--border)] bg-transparent px-[11px] py-[6px] text-[13px] text-[var(--text)] hover:bg-[var(--border)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {presenting ? null : <PresentIcon color={activeColor} />}
        {presenting ? 'Overview' : 'Present'}
      </button>
    </div>
  );
}
