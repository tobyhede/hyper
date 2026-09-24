import type { Graph } from '@project/core';
import { MapIcon, GraphColorLine, GraphIcon, Separator, SpaceIcon, graphColor } from '@project/ui';
import { MiniMap, Panel } from '@xyflow/react';

export interface GraphHudProps {
  /** The Space and Map this HUD's Graph key describes. */
  spaceTitle: string;
  mapTitle: string;
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  activeGraphId: string | null;
}

/**
 * React Flow's default MiniMap height, shared with the attached key's offset.
 *
 * Both uses are the same fact: the map is this tall, and the key sits exactly
 * that far above the corner so the two meet. It is also the *only* sizing input
 * `MiniMap` has — it reads `style.width`/`style.height` and divides its
 * bounding rect by them, so repeating React Flow's own 200×150 here is what
 * keeps the viewBox finite rather than a customisation.
 */
const MINIMAP_HEIGHT = 150;

/** React Flow's own `.react-flow__panel` margin, which both Panels sit inside. */
const PANEL_INSET = 15;

/**
 * The canvas HUD: a Graph key attached above React Flow's minimap.
 *
 * **The key is kept deliberately**, although ADR 0053's Sidebar Graphs group
 * says the same three facts. It is the on-canvas colour reference beside the
 * Edges being read, and it is what still names the Active Graph when the Sidebar
 * is collapsed or off-canvas below the mobile breakpoint. What the two must
 * never do is disagree, which is why both resolve a Graph's colour through the
 * one shared `graphColor` seam rather than each deriving its own — and why each
 * key row draws `GraphColorLine`, the same mark the Graph choice lists draw.
 *
 * It lives in the adapter because the MiniMap is a React Flow component, and it
 * owns its own semantic presentation rather than delegating the markup: the key
 * had one production caller, so a separate published component was a seam with
 * nothing on the other side of it.
 *
 * **The key panel takes no pointer and the map takes every one it is given.**
 * A `.react-flow__panel` carries no `pointer-events` rule of React Flow's own,
 * so both of these sit in the corner a Resource's resize control lives in and
 * would swallow the gestures aimed at it — the harm `command-dock.css`'s
 * bottom-edge offset already names. The key holds no control, so it hands them
 * straight back to the canvas; the two clipped names take theirs again, because
 * a `title` is the only place a truncated name can be read. The map keeps
 * `pannable` and `zoomable` because it cannot hand anything back: `XYMinimap`
 * calls d3-zoom on its SVG unconditionally, and d3-zoom stops the wheel and the
 * mousedown whatever those props say. Dropping them buys no canvas back and
 * costs the pan and zoom.
 */
export function GraphHud({
  spaceTitle,
  mapTitle,
  graphs,
  colorByGraphId,
  activeGraphId,
}: GraphHudProps) {
  return (
    <>
      <Panel
        position="bottom-right"
        style={{
          marginBottom: `calc(${PANEL_INSET}px + ${MINIMAP_HEIGHT}px)`,
          pointerEvents: 'none',
        }}
      >
        <div className="w-[200px] overflow-hidden rounded-t-chrome-lg border border-border bg-card shadow-lg">
          <div
            className="flex flex-col gap-[6px] px-[10px] pt-[9px] pb-[11px]"
            data-testid="canvas-identity"
          >
            <p className="m-0 flex items-center gap-[8px] text-chrome-xs text-foreground">
              <span className="flex w-[14px] shrink-0 justify-center" aria-hidden="true">
                <SpaceIcon size={13} />
              </span>
              {/* The glyph is decoration, so the word it stands for is supplied
                  here. `Space: <title>` is the name the Command Dock's own
                  identity gives, read the same way by a reader who cannot see
                  which of the two rows is which. */}
              <span className="sr-only">Space</span>
              <span
                className="pointer-events-auto truncate"
                data-testid="hud-space"
                title={spaceTitle}
              >
                {spaceTitle}
              </span>
            </p>
            <p className="m-0 flex items-center gap-[8px] text-chrome-xs text-foreground">
              <span className="flex w-[14px] shrink-0 justify-center" aria-hidden="true">
                <MapIcon size={13} />
              </span>
              <span className="sr-only">Map</span>
              <span className="pointer-events-auto truncate" data-testid="hud-map" title={mapTitle}>
                {mapTitle}
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
                    <GraphColorLine color={graphColor(graph, colorByGraphId)} />
                    {graph.title}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Panel>
      <MiniMap
        ariaLabel="Graph overview"
        pannable
        zoomable
        style={{ width: 200, height: MINIMAP_HEIGHT }}
      />
    </>
  );
}
