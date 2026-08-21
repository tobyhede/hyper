import type { Graph } from '@project/core';
import { FALLBACK_GRAPH_COLOR, GraphIcon, Separator, graphColor } from '@project/ui';
import { MiniMap, Panel } from '@xyflow/react';

export interface GraphHudProps {
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  activeGraphId: string | null;
  activeGraphCardIds: ReadonlySet<string>;
}

/** What a node outside the Active Graph is outlined with on the minimap. */
const INACTIVE_NODE_COLOR = 'var(--border)';

/**
 * The canvas HUD: a Graph key over an interactive minimap.
 *
 * **The key is kept deliberately**, although ADR 0053's Sidebar Graphs group
 * says the same three facts. It is the on-canvas colour reference beside the
 * Edges being read, and it is what still names the Active Graph when the Sidebar
 * is collapsed or off-canvas below the mobile breakpoint. What the two must
 * never do is disagree, which is why both resolve a Graph's colour through the
 * one shared `graphColor` seam rather than each deriving its own.
 *
 * It lives in the adapter because the MiniMap is a React Flow component, and it
 * owns its own semantic presentation rather than delegating the markup: the key
 * had one production caller, so a separate published component was a seam with
 * nothing on the other side of it.
 */
export function GraphHud({
  graphs,
  colorByGraphId,
  activeGraphId,
  activeGraphCardIds,
}: GraphHudProps) {
  const activeGraph = graphs.find((graph) => graph.id === activeGraphId);
  const activeGraphColor =
    activeGraph === undefined ? FALLBACK_GRAPH_COLOR : graphColor(activeGraph, colorByGraphId);
  const nodeStrokeColor = ({ id }: { id: string }) =>
    activeGraphId !== null && activeGraphCardIds.has(id) ? activeGraphColor : INACTIVE_NODE_COLOR;

  return (
    <Panel position="bottom-right">
      <div className="w-[214px] overflow-hidden rounded-[8px] border border-border bg-card shadow-[0_12px_40px_rgb(0_0_0/50%)]">
        <div className="flex flex-col gap-[6px] px-[10px] py-[9px]" data-testid="graph-legend">
          <div className="flex items-center gap-[7px] font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
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
                  data-active={activeGraphId !== null && graph.id === activeGraphId}
                  className="legend__item flex items-center gap-[8px] text-[12px] text-foreground"
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
        <Separator />
        <MiniMap
          ariaLabel="Graph overview"
          bgColor="var(--background)"
          nodeColor="var(--secondary)"
          nodeStrokeColor={nodeStrokeColor}
          pannable
          zoomable
          // React Flow's own geometry and integration styling, which stays here
          // rather than moving to the semantic layer with everything else.
          //
          // **`position: relative` is the load-bearing one.** `MiniMap` renders
          // its own `<Panel>`, and a Panel is `position: absolute` with a 15px
          // margin and a `bottom`/`right` of 0 — so nested inside this HUD's
          // Panel it left the flow entirely and drew itself over the Graph key,
          // covering every row but the first. It has been doing that since the
          // HUD was assembled; the `margin: 0` beside it was half the fix and
          // nothing failed, because the rows were still in the DOM for a test to
          // find. The rest is size: the MiniMap sizes its SVG from these, and
          // its default border would float it inside the panel it fills.
          style={{
            position: 'relative',
            display: 'block',
            width: '100%',
            height: 86,
            margin: 0,
            border: 'none',
          }}
        />
      </div>
    </Panel>
  );
}
