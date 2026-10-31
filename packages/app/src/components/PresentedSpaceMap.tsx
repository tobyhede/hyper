import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { titleName, type GraphId, type MapId, type UUID } from '@project/core';
import { edgeTypes, GraphHeadMarkers, nodeTypes } from '@project/react-flow-adapter';
import { Empty, EmptyHeader, EmptyTitle } from '@project/ui';
import { createMapSurface } from '../map-surface';
import { withSurfacePolicy } from '../map-surface-policy';
import type { OpenSpace } from '../open-spaces';
import { useOpenSpaces } from '../open-spaces-context';
import { useMapSurface } from '../use-map-surface';
import './presented-space-map.css';

/** The frame a presented Map is fitted to: the whole Map, a little in from the edges. */
const STAGE_FIT = { padding: 0.08, maxZoom: 4 } as const;

/**
 * A Space Resource on the Stage: the Map and Graph it selects, drawn whole and
 * fitted to the frame, so the audience sees what the Space Resource shows on
 * the canvas rather than its name alone.
 *
 * The target Space is held while it is drawn, exactly as a Space Resource's
 * embedding on the canvas holds it (ADR 0112), and drawn by the same surface
 * under the inert policy: nothing on it takes a pointer or a key, and it
 * authors nothing. A Space that cannot be held, or that has no such Map, says
 * so on the slide rather than leaving it blank.
 */
export function PresentedSpaceMap({
  spaceId,
  mapId,
  graphId,
}: {
  readonly spaceId: UUID;
  readonly mapId: MapId;
  readonly graphId: GraphId;
}) {
  const spaces = useOpenSpaces();
  const [entry, setEntry] = useState<OpenSpace | null>(null);
  const [unheld, setUnheld] = useState(false);
  useEffect(() => {
    if (spaces === null) return undefined;
    let release: (() => Promise<void>) | undefined;
    let left = false;
    void spaces.hold(spaceId).then(
      (hold) => {
        if (left) {
          void hold.release();
          return;
        }
        release = hold.release;
        setEntry(hold.entry);
      },
      () => {
        if (!left) setUnheld(true);
      },
    );
    return () => {
      left = true;
      setEntry(null);
      setUnheld(false);
      void release?.();
    };
  }, [spaces, spaceId]);
  const drawn = entry?.app.currentSpace().lookup.map(mapId);
  if (unheld || (entry !== null && drawn === undefined)) {
    return (
      <Empty className="presented-map" data-testid="presented-map-missing">
        <EmptyHeader>
          <EmptyTitle>Map not available</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  if (entry === null || drawn === undefined) {
    return <div className="presented-map" data-testid="presented-map" aria-busy="true" />;
  }
  return (
    <ReactFlowProvider>
      <PresentedMapDrawing
        entry={entry}
        mapId={mapId}
        graphId={graphId}
        mapTitle={drawn.map.title}
      />
    </ReactFlowProvider>
  );
}

function PresentedMapDrawing({
  entry,
  mapId,
  graphId,
  mapTitle,
}: {
  readonly entry: OpenSpace;
  readonly mapId: MapId;
  readonly graphId: GraphId;
  readonly mapTitle: string;
}) {
  const [surface] = useState(() =>
    createMapSurface(entry.app, () => ({
      kind: 'drawn',
      mapId,
      graphId,
      policy: 'inert',
      occurrence: 'stage',
    })),
  );
  useEffect(() => surface.observe(), [surface]);
  useEffect(() => () => surface.dispose(), [surface]);
  useLayoutEffect(() => {
    surface.update({ kind: 'drawn', mapId, graphId, policy: 'inert', occurrence: 'stage' });
  }, [surface, mapId, graphId]);
  const { canvasRendering } = useMapSurface(entry.app, surface, {
    presenting: false,
    spaceOnCanvas: false,
  });
  const projected = canvasRendering.projected;
  // The canvas fades what is off the selected Graph so an author can see the
  // Graph; an audience is shown the whole diagram, so nothing recedes here.
  const nodes = useMemo(
    () =>
      projected?.nodes.map((node) =>
        withSurfacePolicy({ ...node, data: { ...node.data, receding: false } }, 'inert'),
      ) ?? [],
    [projected],
  );
  const edges = useMemo(
    () => projected?.edges.map((edge) => ({ ...edge, style: { ...edge.style, opacity: 1 } })) ?? [],
    [projected],
  );
  const frame = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();
  // The frame grows and shrinks with the window and with fullscreen, and the
  // Map is fitted again each time, so it always fills the frame it is in.
  useEffect(() => {
    const element = frame.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(() => void fitView(STAGE_FIT));
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitView]);
  // Fitted again whenever the drawing changes, so a Resource moved or resized
  // in the held Space while it is presented stays inside the frame.
  useEffect(() => {
    if (nodes.length > 0) void fitView(STAGE_FIT);
  }, [nodes, fitView]);
  return (
    // One image to assistive technology, named by its Map and described by the
    // names of the Resources on it: the nodes inside are drawn for the audience
    // and take no focus.
    <div
      ref={frame}
      className="presented-map"
      data-testid="presented-map"
      role="img"
      aria-label={`Map ${mapTitle}`}
      aria-description={nodes.map((node) => titleName(node.data.title)).join(', ')}
    >
      <ReactFlow
        className="presented-map__flow"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={STAGE_FIT}
        minZoom={0.05}
        maxZoom={STAGE_FIT.maxZoom}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <GraphHeadMarkers />
      </ReactFlow>
    </div>
  );
}
