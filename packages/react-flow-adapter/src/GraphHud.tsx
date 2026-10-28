import { useId, useState } from 'react';
import type { Graph } from '@project/core';
import {
  Button,
  ChevronDownIcon,
  GraphIcon,
  GraphLegendMark,
  cn,
  graphAppearance,
} from '@project/ui';
import { MiniMap, Panel, useStore } from '@xyflow/react';

export interface GraphHudProps {
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
 * Below either of these the canvas is a phone's, and the overview (some 220px
 * of key and map in one corner) would cover the canvas it describes, so it
 * starts hidden. Short counts as well as narrow: a phone on its side is 390px
 * tall.
 */
const ROOMY_WIDTH = 640;
const ROOMY_HEIGHT = 400;

/**
 * Whether the canvas has room for the overview. An unmeasured canvas reports
 * zero and answers no, so a phone never draws the overview for a frame first.
 */
const canvasIsRoomy = (state: { width: number; height: number }): boolean =>
  state.width >= ROOMY_WIDTH && state.height >= ROOMY_HEIGHT;

/**
 * The canvas HUD: a Graph key attached above React Flow's minimap.
 *
 * **It names neither the Space nor the Map.** The Command Dock names both, and
 * the corner repeating them said nothing a reader did not already have.
 *
 * **The key's header shows and hides the whole overview, key and map
 * together.** It starts shown where the canvas has room for it and hidden on a
 * phone, where it would cover the canvas it describes; once the reader has
 * pressed it, their choice stands whatever the canvas later measures. Hidden,
 * the header alone stays in the corner, so there is always one way back.
 *
 * **The key is kept deliberately**, although the Command Dock's Graph choice
 * says the same three facts. It is the on-canvas colour reference beside the
 * Edges being read. What the two must
 * never do is disagree, which is why both resolve a Graph's colour through the
 * one shared `graphAppearance` seam rather than each deriving its own — and why each
 * key row draws `GraphLegendMark`, the same mark the Graph choice lists draw
 * (held by the `graph-choice-rows-draw-the-graph-legend-mark` parity claim).
 *
 * It lives in the adapter because the MiniMap is a React Flow component, and it
 * owns its own semantic presentation rather than delegating the markup: the key
 * has one production caller, so a separate published component would be a seam
 * with nothing on the other side of it.
 *
 * **The key panel takes no pointer and the map takes every one it is given.**
 * A `.react-flow__panel` carries no `pointer-events` rule of React Flow's own,
 * so both of these sit in the corner a Resource's resize control lives in and
 * would swallow the gestures aimed at it — the harm `command-dock.css`'s
 * bottom-edge offset already names. The key is a list, so it hands them
 * straight back to the canvas; the header takes its own again, because it is
 * the one control here. The map keeps
 * `pannable` and `zoomable` because it cannot hand anything back: `XYMinimap`
 * calls d3-zoom on its SVG unconditionally, and d3-zoom stops the wheel and the
 * mousedown whatever those props say. Dropping them buys no canvas back and
 * costs the pan and zoom.
 */
export function GraphHud({ graphs, colorByGraphId, activeGraphId }: GraphHudProps) {
  const roomy = useStore(canvasIsRoomy);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const shown = chosen ?? roomy;
  const keyId = useId();

  return (
    <>
      <Panel
        position="bottom-right"
        style={{
          marginBottom: shown ? `calc(${PANEL_INSET}px + ${MINIMAP_HEIGHT}px)` : `${PANEL_INSET}px`,
          pointerEvents: 'none',
        }}
      >
        <div
          className={cn(
            'overflow-hidden border border-border bg-card shadow-lg',
            // Hidden, the header shrinks to its words, so on a phone it clears
            // the zoom control across the bottom edge.
            shown ? 'w-[200px] rounded-t-chrome-lg' : 'rounded-chrome-lg',
          )}
        >
          <div className="px-[4px] pt-[4px] pb-[4px]">
            <Button
              variant="ghost"
              size="compact"
              className="pointer-events-auto w-full justify-between gap-[10px] font-mono text-chrome-2xs tracking-[0.12em] uppercase"
              aria-expanded={shown}
              aria-controls={shown ? keyId : undefined}
              onClick={() => setChosen(!shown)}
            >
              <span className="flex items-center gap-[7px]">
                <GraphIcon size={13} />
                <span>Graphs</span>
              </span>
              <span
                aria-hidden="true"
                className={cn('flex transition-transform', shown ? undefined : 'rotate-180')}
              >
                <ChevronDownIcon />
              </span>
            </Button>
          </div>
          {shown && (
            <div
              id={keyId}
              className="flex flex-col gap-[6px] px-[10px] pb-[11px]"
              data-testid="graph-legend"
            >
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
                      <GraphLegendMark {...graphAppearance(graph, colorByGraphId)} />
                      {graph.title}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </Panel>
      {shown && (
        <MiniMap
          ariaLabel="Graph overview"
          pannable
          zoomable
          style={{ width: 200, height: MINIMAP_HEIGHT }}
        />
      )}
    </>
  );
}
