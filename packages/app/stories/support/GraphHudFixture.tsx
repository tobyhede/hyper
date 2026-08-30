import type { Node } from '@xyflow/react';
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
import { StoryCanvas, StoryCanvasFrame } from './ReactFlowCanvas';

/**
 * The HUD's Graphs, colours and Active Graph, derived the way the canvas derives
 * them.
 *
 * `graphColorMap` is the application's own resolution and `GraphHud` reads it
 * through the shared `graphColor` seam the Sidebar reads — so a colour on screen
 * here is one the Space app would agree with, rather than a hex literal a
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
  /**
   * Which Graph is emphasised.
   *
   * A fixture input, and deliberately not a control: activation belongs to the
   * Space Sidebar, and a story-only button that moved the emphasis would be
   * evidence of the button rather than of the HUD. That the two surfaces agree
   * *through* an activation is the paired application evidence's claim (ADR
   * 0052), in `overview.spec.ts`.
   */
  readonly activeGraphId?: GraphId | null;
}

/**
 * The unchanged `GraphHud`, inside a minimal real React Flow canvas.
 *
 * Nothing is replaced or stubbed: this is `<ReactFlow>` with actual nodes and
 * React Flow's own MiniMap drawing them. The one thing the fixture supplies
 * beyond the Space is the viewport the canvas is given, because a story frame
 * has no Space app around it to size one.
 */
export function GraphHudFixture({ activeGraphId = openingGraph() }: GraphHudFixtureProps) {
  const activeGraphCardIds = new Set(
    activeGraphId === null ? [] : graphCardIds(SPACE, activeGraphId),
  );

  return (
    <StoryCanvasFrame height="h-[26rem]">
      <StoryCanvas nodes={NODES} viewport={{ fit: true }} minZoom={0.05} className="h-full">
        <GraphHud
          graphs={SPACE.graphs}
          colorByGraphId={COLORS}
          activeGraphId={activeGraphId}
          activeGraphCardIds={activeGraphCardIds}
        />
      </StoryCanvas>
    </StoryCanvasFrame>
  );
}
