import type { Graph } from '@project/core';
import { DiagramIcon, GraphIcon, Separator, SpaceIcon, graphColor } from '@project/ui';
import { MiniMap, Panel } from '@xyflow/react';

export interface GraphHudProps {
  /** The Space and Diagram this HUD's Graph key describes. */
  spaceTitle: string;
  diagramTitle: string;
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  activeGraphId: string | null;
}

/** React Flow's default MiniMap height, shared with the attached key's offset. */
const MINIMAP_HEIGHT = 150;

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
  spaceTitle,
  diagramTitle,
  graphs,
  colorByGraphId,
  activeGraphId,
}: GraphHudProps) {
  return (
    <>
      <Panel position="bottom-right" style={{ marginBottom: `calc(15px + ${MINIMAP_HEIGHT}px)` }}>
        <div className="w-[200px] overflow-hidden rounded-t-chrome-lg border border-border bg-card shadow-lg">
          <div
            className="flex flex-col gap-[6px] px-[10px] pt-[9px] pb-[11px]"
            data-testid="canvas-identity"
          >
            <p className="m-0 flex items-center gap-[8px] text-chrome-xs text-foreground">
              <span className="flex w-[14px] shrink-0 justify-center" aria-hidden="true">
                <SpaceIcon size={13} />
              </span>
              <span className="truncate" data-testid="hud-space">
                {spaceTitle}
              </span>
            </p>
            <p className="m-0 flex items-center gap-[8px] text-chrome-xs text-foreground">
              <span className="flex w-[14px] shrink-0 justify-center" aria-hidden="true">
                <DiagramIcon />
              </span>
              <span className="truncate" data-testid="hud-diagram">
                {diagramTitle}
              </span>
            </p>
          </div>
          <Separator />
          <div className="flex flex-col gap-[6px] px-[10px] py-[9px]" data-testid="graph-legend">
            <div className="flex items-center gap-[7px] font-mono text-chrome-2xs tracking-[0.12em] text-muted-foreground uppercase">
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
                    className="legend__item flex items-center gap-[8px] text-chrome-xs text-foreground"
                    style={{ opacity: dimmed ? 0.5 : 1 }}
                  >
                    <span
                      className="h-[3px] w-[14px] shrink-0 rounded-chrome-2xs"
                      style={{ background: graphColor(graph, colorByGraphId) }}
                      aria-hidden="true"
                    />
                    {graph.title}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Panel>
      <MiniMap ariaLabel="Graph overview" style={{ width: 200, height: MINIMAP_HEIGHT }} />
    </>
  );
}
