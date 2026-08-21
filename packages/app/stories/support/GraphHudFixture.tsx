import { useState } from 'react';
import { Background, ReactFlow, ReactFlowProvider, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphId } from '@project/core';
import { graphCardIds } from '@project/graph';
import { GraphHud } from '@project/react-flow-adapter';
// Through the package's own subpath imports, as `#components/*` already is: a
// story sits two directories above `src`, and climbing there by relative path is
// how a package boundary gets crossed without naming one (AGENTS.md).
import { CARD_SIZE } from '#src/card';
import { graphColorMap } from '#src/colors';
import { authoredSpace } from './spaces';

/**
 * The HUD's Graphs, colours and Active Graph, derived the way the canvas derives
 * them.
 *
 * `graphColorMap` is the application's own resolution and `GraphHud` reads it
 * through the shared `graphColor` seam the Sidebar reads — so a colour on screen
 * here is one the workspace would agree with, rather than a hex literal a
 * fixture chose. The Graphs are the tracked story Space's, flattened across its
 * Layouts in declared order exactly as `space.graphs` is.
 */
const SPACE = authoredSpace;
const COLORS = graphColorMap(SPACE);

/**
 * The Graph the story opens on, read out at module scope.
 *
 * A `throw` here rather than a fallback: a Space with no Graph would render a
 * HUD with nothing to say, and failing at load says so with a sentence instead
 * of drawing something subtly empty.
 */
const openingGraph = (): GraphId => {
  const first = SPACE.graphs[0];
  if (first === undefined) throw new Error('The story Space declares no Graph.');
  return first.id;
};

/**
 * Real React Flow nodes, one per Card of the story Space.
 *
 * The MiniMap draws what the flow actually measured, so the geometry has to be
 * the framework's rather than a stand-in: these are ordinary nodes React Flow
 * lays out, measures and reports bounds for, at the size the application's own
 * `CARD_SIZE` declares. **The positions are the fixture's**, which is the one
 * thing a story is allowed to supply here — a Space's placement is a Layout
 * strategy's answer, and running one to draw a HUD would put elkjs between this
 * story and the surface it is about. They are staggered so the minimap frame has
 * two dimensions to show rather than a single line.
 */
const NODES: readonly Node[] = SPACE.cards.map((card, index) => ({
  id: card.id,
  position: { x: index * 320, y: (index % 2) * 180 },
  data: { label: card.title },
  // Declared rather than left to be measured, as the production projection
  // declares its own: the MiniMap draws only nodes React Flow already has
  // dimensions for, so a node waiting on a ResizeObserver is one the minimap
  // silently omits.
  width: CARD_SIZE.width,
  height: CARD_SIZE.height,
  style: { width: CARD_SIZE.width, height: CARD_SIZE.height },
}));

export interface GraphHudFixtureProps {
  /** Which Graph opens emphasised. A Ladle spec activates the others. */
  readonly activeGraphId?: GraphId | null;
}

/**
 * The unchanged `GraphHud`, inside a minimal real React Flow canvas.
 *
 * Nothing is replaced or stubbed: this is `<ReactFlow>` with actual nodes and
 * React Flow's own MiniMap drawing them. The one thing the fixture supplies
 * beyond the Space is the viewport the canvas is given, because a story frame
 * has no workspace around it to size one.
 */
export function GraphHudFixture({ activeGraphId = openingGraph() }: GraphHudFixtureProps) {
  const [active, setActive] = useState<GraphId | null>(activeGraphId);
  const activeGraphCardIds = new Set(active === null ? [] : graphCardIds(SPACE, active));

  return (
    <div className="flex h-[26rem] w-full flex-col gap-[0.75rem] bg-background p-[0.75rem] text-foreground">
      {/* The Sidebar's job in the application, reduced to the one thing this
          story pairs it with: activating a Graph, so the HUD's emphasis can be
          watched moving. The Sidebar's own rendering is Issue 14's story. */}
      <div role="group" aria-label="Graphs" className="flex gap-[0.5rem]">
        {SPACE.graphs.map((graph) => (
          <button
            key={graph.id}
            type="button"
            aria-pressed={graph.id === active}
            data-testid={`activate-${graph.title}`}
            className="rounded-[6px] border border-border bg-secondary px-[0.6rem] py-[0.3rem] text-[0.8rem] aria-pressed:border-accent"
            onClick={() => setActive(graph.id)}
          >
            {graph.title}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[8px] border border-border">
        <ReactFlowProvider>
          <ReactFlow nodes={[...NODES]} edges={[]} fitView minZoom={0.05}>
            <Background gap={24} />
            <GraphHud
              graphs={SPACE.graphs}
              colorByGraphId={COLORS}
              activeGraphId={active}
              activeGraphCardIds={activeGraphCardIds}
            />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
