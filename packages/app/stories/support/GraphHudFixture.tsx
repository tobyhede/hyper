import type { Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphId } from '@project/core';
import type { Space } from '@project/graph';
import { GraphHud } from '@project/react-flow-adapter';
// Through the package's own subpath imports, as `#components/*` already is: a
// story sits two directories above `src`, and climbing there by relative path is
// how a package boundary gets crossed without naming one (AGENTS.md).
import { THING_SIZE } from '#src/thing';
import { graphColorMap } from '#src/colors';
import { resolveDiagram } from '#src/diagram-resolution';
import { authoredSpace } from './spaces';
import { StoryCanvas, StoryCanvasFrame } from './ReactFlowCanvas';

/** The Space a story draws unless it names another. */
const SPACE = authoredSpace;

export interface GraphHudFixtureProps {
  /**
   * The Space the story draws, and — through `resolveDiagram` — the Diagram it
   * opens on. Resolved through that Space's own `defaultDiagram`, never by
   * indexing `diagrams[0]` (array order is not a declaration). Defaults to the
   * tracked story Space, so a story that wants a different key names another
   * Space rather than another index into this one.
   */
  readonly space?: Space;
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
 *
 * **The key holds the opening Diagram's own Graphs, never the Space's.**
 * `resolveDiagram` is the same module `App` resolves a Diagram through
 * (`packages/app/src/diagram-resolution.ts`), and its answer's
 * `.diagram.graphs` is exactly what `canvasProjection` reads as
 * `visibleGraphs` — so a Space with more than one Diagram draws the key its
 * opening Diagram owns, and none that belongs only to another. A throw rather
 * than a fallback when the Space names no opening Diagram: a story that
 * rendered something subtly empty there would be worse than one that fails at
 * load with a sentence.
 */
export function GraphHudFixture({ space = SPACE, activeGraphId }: GraphHudFixtureProps) {
  const opening = resolveDiagram(space);
  /**
   * The Graphs' colours, derived the way the canvas derives them — **from the
   * Space this fixture was handed**, not from the default one.
   *
   * `graphColorMap` is the application's own resolution and `GraphHud` reads it
   * through the shared `graphColor` seam, so a colour on screen here is one the
   * Space app would agree with rather than a hex literal a fixture chose. It is
   * keyed over the whole Space, flattened across every Diagram in declared order
   * (ADR 0045), exactly as `canvasProjection`'s own `colors` is — so a Graph
   * keeps the one colour it has whichever Diagram of that Space draws it.
   *
   * **Derived here rather than once at module scope**, which is where it sat
   * while there was one Space and no prop. A map built from the default Space
   * answers `undefined` for every Graph of any other, and `graphColor` falls
   * back to the neutral grey without complaining — so a story naming a second
   * Space would have drawn a key with no colours in it and nothing would have
   * failed. The two stories here share their Graph ids, so the trap was live
   * and invisible.
   */
  const colors = graphColorMap(space);
  const emphasised = activeGraphId === undefined ? opening.activeGraph.id : activeGraphId;

  /**
   * Real React Flow nodes, one per Thing of the Space this story draws.
   *
   * The MiniMap draws what the flow actually measured, so the geometry has to be
   * the framework's rather than a stand-in: these are ordinary nodes React Flow
   * lays out, measures and reports bounds for, at the size the application's own
   * `THING_SIZE` declares. **The positions are the fixture's**, which is the one
   * thing a story is allowed to supply here — a Space's placement is a Diagram
   * strategy's answer, and running one to draw a HUD would put a placement
   * computation between this story and the surface it is about. They are staggered
   * so the minimap frame has two dimensions to show rather than a single line.
   */
  const nodes: readonly Node[] = space.things.map((thing, index) => ({
    id: thing.id,
    position: { x: index * 320, y: (index % 2) * 180 },
    data: { label: thing.title },
    // Declared rather than left to be measured, as the production projection
    // declares its own: the MiniMap draws only nodes React Flow already has
    // dimensions for, so a node waiting on a ResizeObserver is one the minimap
    // silently omits.
    width: THING_SIZE.width,
    height: THING_SIZE.height,
    style: { width: THING_SIZE.width, height: THING_SIZE.height },
  }));

  return (
    <StoryCanvasFrame height="h-[26rem]">
      <StoryCanvas nodes={nodes} viewport={{ fit: true }} minZoom={0.05} className="h-full">
        <GraphHud
          spaceTitle={space.title}
          diagramTitle={opening.diagram.title}
          graphs={opening.diagram.graphs}
          colorByGraphId={colors}
          activeGraphId={emphasised}
        />
      </StoryCanvas>
    </StoryCanvasFrame>
  );
}
