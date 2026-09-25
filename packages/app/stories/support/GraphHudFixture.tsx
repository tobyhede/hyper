import { useMemo } from 'react';
import '@xyflow/react/dist/style.css';
import type { GraphId } from '@project/core';
import type { Space } from '@project/graph';
import { GraphHud, nodeTypes, edgeTypes } from '@project/react-flow-adapter';
import { canvasProjection } from '#src/canvas-projection';
import { resolveMap } from '#src/map-resolution';
import { authoredSpace } from './spaces';
import { StoryCanvas, StoryCanvasFrame, useProjection } from './ReactFlowCanvas';

/** The Space a story draws unless it names another. */
const SPACE = authoredSpace;

export interface GraphHudFixtureProps {
  /**
   * The Space the story draws. Its `defaultMap` selects the Map.
   */
  readonly space?: Space;
  /** Which Graph is emphasised. */
  readonly activeGraphId?: GraphId | null;
}

/**
 * The unchanged `GraphHud`, inside a minimal real React Flow canvas.
 *
 * **The nodes are the production projection's, so the minimap draws the Map
 * and not the Space.** `useProjection` runs the same `canvasProjection` the
 * canvas publishes, whose membership is `mapResources(space, map)` — so a
 * Map that places two of the Space's five Resources puts two marks on the
 * minimap, and the key beside it and the map under it mean the same "open
 * Map". Do not map `space.resources` here: that draws all five either way and
 * leaves the two halves disagreeing.
 *
 * The projection's nodes are production `ResourceFlowNode`s, so the canvas is
 * given the adapter's own `nodeTypes`/`edgeTypes`: without them React Flow
 * cannot find `type: 'resource'`, falls back to its default node and draws five
 * empty rectangles with the titles missing.
 *
 * Node dimensions come with the placement rather than from a fixture constant —
 * `projectResourceNodes` declares `width`/`height` for every placed Resource — which
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
  const opening = useMemo(() => resolveMap(space), [space]);
  const emphasised = activeGraphId === undefined ? opening.activeGraph.id : activeGraphId;
  const projected = useProjection(emphasised, null, {
    space,
    mapId: opening.map.id,
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
          mapTitle={opening.map.title}
          graphs={projection.visibleGraphs}
          colorByGraphId={projection.colors}
          activeGraphId={emphasised}
        />
      </StoryCanvas>
    </StoryCanvasFrame>
  );
}
