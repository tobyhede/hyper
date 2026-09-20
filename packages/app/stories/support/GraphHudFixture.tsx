import { useMemo } from 'react';
import '@xyflow/react/dist/style.css';
import type { GraphId } from '@project/core';
import type { Space } from '@project/graph';
import { GraphHud, nodeTypes, edgeTypes } from '@project/react-flow-adapter';
import { canvasProjection } from '#src/canvas-projection';
import { resolveDiagram } from '#src/diagram-resolution';
import { authoredSpace } from './spaces';
import { StoryCanvas, StoryCanvasFrame, useProjection } from './ReactFlowCanvas';

/** The Space a story draws unless it names another. */
const SPACE = authoredSpace;

export interface GraphHudFixtureProps {
  /**
   * The Space the story draws. Its `defaultDiagram` selects the Diagram.
   */
  readonly space?: Space;
  /** Which Graph is emphasised. */
  readonly activeGraphId?: GraphId | null;
}

/**
 * The unchanged `GraphHud`, inside a minimal real React Flow canvas.
 *
 * **The nodes are the production projection's, so the minimap draws the Diagram
 * and not the Space.** `useProjection` runs the same `canvasProjection` the
 * canvas publishes, whose membership is `diagramThings(space, diagram)` — so a
 * Diagram that places two of the Space's five Things puts two marks on the
 * minimap, and the key beside it and the map under it mean the same "open
 * Diagram". The fixture used to map `space.things` itself, which drew all five
 * either way and left the two halves disagreeing.
 *
 * The projection's nodes are production `ThingFlowNode`s, so the canvas is
 * given the adapter's own `nodeTypes`/`edgeTypes`: without them React Flow
 * cannot find `type: 'thing'`, falls back to its default node and draws five
 * empty rectangles with the titles missing.
 *
 * Node dimensions come with the placement rather than from a fixture constant —
 * `projectThingNodes` declares `width`/`height` for every placed Thing — which
 * is what the MiniMap needs, since it omits any node still waiting on a
 * ResizeObserver.
 *
 * The key's Graphs and colours are that same projection's `visibleGraphs` and
 * `colors`, derived from **the Space this fixture was handed** rather than from
 * the default one: a map built from the wrong Space answers `undefined` for
 * every Graph of another and `graphColor` falls back to neutral grey without
 * complaining, so a second-Space story would have drawn a colourless key and
 * nothing would have failed.
 */
export function GraphHudFixture({ space = SPACE, activeGraphId }: GraphHudFixtureProps) {
  const opening = useMemo(() => resolveDiagram(space), [space]);
  const emphasised = activeGraphId === undefined ? opening.activeGraph.id : activeGraphId;
  const projected = useProjection(emphasised, null, {
    space,
    diagramId: opening.diagram.id,
  });
  const projection = useMemo(() => canvasProjection(space, opening), [opening, space]);

  if (projected === null) return null;
  if (projected instanceof Error) return <p role="alert">Placement failed: {projected.message}</p>;

  return (
    <StoryCanvasFrame height="h-[26rem]">
      <StoryCanvas
        nodes={projected.nodes}
        edges={projected.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        viewport={{ fit: true }}
        minZoom={0.05}
        className="h-full"
      >
        <GraphHud
          spaceTitle={space.title}
          diagramTitle={opening.diagram.title}
          graphs={projection.visibleGraphs}
          colorByGraphId={projection.colors}
          activeGraphId={emphasised}
        />
      </StoryCanvas>
    </StoryCanvasFrame>
  );
}
