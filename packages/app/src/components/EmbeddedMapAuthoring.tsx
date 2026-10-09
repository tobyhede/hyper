import { ChromeContinuation } from './ChromeContinuation';
import { GraphIcon } from '@project/ui';
import { ResourceConnect, type Connecting } from './ResourceConnect';
import { useEdgeAuthoring, type EdgeDrawing } from '../edge-authoring-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { NodeChange } from '@xyflow/react';
import { type ResourceId, type GraphId, type MapId, type MapPosition } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import { connectionAppearance } from '../colors';
import { useCanvasResourceAuthoring } from '../canvas-resource-authoring';
import { createMapSurface, mapSurfaceComposition } from '../map-surface';
import { useOpenSpaces } from '../open-spaces-context';
import { useResourcePlacement } from '../resource-placement';
import { useResourceRailActions } from '../resource-rail-actions';
import { useSpaceAddresses } from '../space-addresses';
import { useMapSurface } from '../use-map-surface';
import type { MapSurfacePolicy } from '../map-surface-policy';
import {
  constrainEmbeddedPosition,
  embeddedNodeId,
  embeddedMap,
  parseEmbeddedNodeId,
  type EmbeddedBounds,
  type EmbeddedParentProjection,
  type EmbeddedTilt,
} from '../embedded-map';
import type { OpenSpace } from '../open-spaces';
import { useSpaceResourceTargets } from '../space-resource-targets';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { EmbeddedPublication } from '../embedded-publication';
import { authoredFromDrawn, type SpaceResourceFraming } from '../space-resource-framing';
import { spaceResourceEmbedCamera } from '../camera';
import { CanvasContinuation } from './CanvasContinuation';
import { useNameOnCreation } from '../name-on-creation';

export type { EmbeddedPublication };

const EMPTY_NODES: readonly ResourceFlowNode[] = [];

/** Reuse production projection and Resource controls over an explicitly addressed target Map. */
export function EmbeddedMapAuthoring({
  parent,
  entry,
  mapId,
  graphId,
  policy,
  spaceOnCanvas,
  framing,
  bounds: { left, top, right, bottom },
  absolute: { x: absoluteX, y: absoluteY },
  drawnAbsolute: { x: drawnX, y: drawnY },
  tiltCenter,
  publish,
}: {
  readonly parent: ResourceFlowNode;
  readonly entry: OpenSpace;
  readonly mapId: MapId;
  /**
   * The Graph the Space Resource selects, emphasised inside the embedding.
   *
   * Not nullable, unlike the Space's own Active Graph this feeds: a Space Resource
   * stores a Graph as well as a Map (ADR 0079), so an embedding always has
   * one to emphasise even where the Space it draws has authored none.
   */
  readonly graphId: GraphId;
  readonly policy: MapSurfacePolicy;
  readonly spaceOnCanvas: boolean;
  readonly framing: SpaceResourceFraming | undefined;
  readonly bounds: EmbeddedBounds;
  /** This Resource's authored top-left in canvas coordinates. */
  readonly absolute: MapPosition;
  /**
   * This Resource's top-left as React Flow draws it, which the lean is measured
   * from. `places Resources inside a nested window relative to where that window
   * is drawn` in `embedded-open-space-resource.test.ts` holds the split from
   * `absolute`.
   */
  readonly drawnAbsolute: MapPosition;
  /** The centre a dragged ancestor leans about, or `undefined` while none moves. */
  readonly tiltCenter: MapPosition | undefined;
  readonly publish: (id: string, value: EmbeddedPublication | null) => void;
}) {
  const parentId = parent.id;
  const chromeRoot = useRef<HTMLElement>(null);
  const [composition] = useState(() =>
    createMapSurface(entry.app, () => ({
      kind: 'drawn',
      mapId,
      graphId,
      policy,
      occurrence: parentId,
    })),
  );
  useEffect(() => composition.observe(), [composition]);
  useLayoutEffect(() => {
    composition.update({ kind: 'drawn', mapId, graphId, policy, occurrence: parentId });
  }, [composition, mapId, graphId, policy, parentId]);
  const {
    view,
    newResourceTitle,
    canvasRendering,
    availability,
    editingResourceBody,
    setEditingResourceBody,
    setEditingResourceTitle,
  } = useMapSurface(entry.app, composition, {
    presenting: false,
    spaceOnCanvas: policy === 'authoring' && spaceOnCanvas,
    creatingSpaceResource: false,
  });
  const state = composition.adapter();
  const space = entry.app.currentSpace();
  const spaces = useOpenSpaces();
  if (spaces === null) throw new Error('A drawn Map requires its Open Spaces composition.');
  const contextual = useMemo(
    () => mapSurfaceComposition(entry.app, composition),
    [entry, composition],
  );
  const contextualEntry = useMemo(() => ({ ...entry, app: contextual }), [entry, contextual]);
  const placement = useResourcePlacement(contextualEntry, {
    map: view.selectedMap.map,
    presenting: false,
    replacementEpoch: composition.authoring.getState().replacementEpoch,
    reportBreak: entry.app.reportObserverError,
  });
  const { entityActions, clipboardFailure, dismissClipboardFailure } = useSpaceAddresses(
    spaces.browserLocation,
    space,
  );
  const resourceRailActions = useResourceRailActions(contextual, {
    space,
    map: view.selectedMap.map,
    entityActions,
    availability,
    editingResourceBody,
    createReferenceFrom: placement.createReferenceFrom,
    spaces,
  });
  const selectResource = state.selectResource;
  const [connecting, setConnecting] = useState<Connecting | null>(null);
  if (
    connecting !== null &&
    (!availability.connectOnCanvas ||
      !view.placedResources.some((resource) => resource.id === connecting.from.id))
  )
    setConnecting(null);
  const resourceEntityActions = useCallback(
    (resourceId: ResourceId) =>
      resourceRailActions(resourceId, [
        {
          id: 'connect',
          label: 'Connect to Resource',
          icon: <GraphIcon size={14} />,
          onSelect: (anchor) => {
            const from = view.placedResources.find((resource) => resource.id === resourceId);
            if (from !== undefined) {
              selectResource(resourceId);
              setConnecting({ from, anchor });
            }
            return 'done';
          },
        },
      ]),
    [resourceRailActions, view.placedResources, selectResource],
  );
  const authored = view.mapPlacement;
  const pending = view.projection;
  const readTarget = useCallback((id: ResourceId) => entry.spaceResources.target(id), [entry]);
  const targets = useSpaceResourceTargets(space.resources, readTarget);
  const nameOnCreation = useNameOnCreation(composition.continuation);
  const authoring = useCanvasResourceAuthoring({
    continuation: composition.continuation,
    commandOutcomes: entry.app.commandOutcomes,
    deleteConfirmation: entry.app.deleteConfirmation,
    imageReplacement: entry.app.imageReplacement,
    nodes: canvasRendering.liveProjection?.nodes ?? EMPTY_NODES,
    availability,
    nameOnCreation,
    authoring: composition.authoring,
    spaceSession: entry.session,
    resourceResize: state.resourceResize,
    onSelectResource: state.selectResource,
    onBodyEditingChange: setEditingResourceBody,
    onTitleEditingChange: setEditingResourceTitle,
    spaceResourceTargets: targets,
    resourceEntityActions,
  });
  const [origin] = useState(() => {
    const positions = [...authored.values()];
    return {
      x: positions.length === 0 ? 0 : Math.min(...positions.map((at) => at.x)),
      y: positions.length === 0 ? 0 : Math.min(...positions.map((at) => at.y)),
    };
  });
  const camera = useMemo(
    () => spaceResourceEmbedCamera({ left, top, right, bottom }, origin, framing),
    [origin, left, top, right, bottom, framing],
  );
  const drawingProjection = useMemo(
    () => ({
      nodes: authoring.nodes.map((node) => ({
        ...node,
        draggable: availability.dragNodes,
        selectable: availability.selectNodes,
        focusable: availability.selectNodes,
        connectable: availability.connectOnCanvas,
      })),
      edges: state.projection?.edges ?? [],
    }),
    [authoring.nodes, state.projection?.edges, availability],
  );
  const parentWidth = parent.width;
  const parentHeight = parent.height;
  const parentZIndex = parent.zIndex;
  const projectionParent = useMemo(
    (): EmbeddedParentProjection => ({
      id: parentId,
      width: parentWidth,
      height: parentHeight,
      zIndex: parentZIndex,
    }),
    [parentId, parentWidth, parentHeight, parentZIndex],
  );
  const offsetX = camera.offset.x;
  const offsetY = camera.offset.y;
  // Held apart from the request so the projection is rebuilt per pointer frame
  // of a drag and not per render: the centre moves with the Resource, and these
  // numbers are the whole of what the lean depends on.
  const tiltX = tiltCenter?.x;
  const tiltY = tiltCenter?.y;
  const tilt = useMemo(
    (): EmbeddedTilt | undefined =>
      tiltX === undefined || tiltY === undefined
        ? undefined
        : {
            center: { x: tiltX, y: tiltY },
            parentAbsolute: { x: absoluteX, y: absoluteY },
            parentDrawn: { x: drawnX, y: drawnY },
          },
    [tiltX, tiltY, absoluteX, absoluteY, drawnX, drawnY],
  );
  const { nodes, edges } = useMemo(
    () =>
      embeddedMap({
        parent: projectionParent,
        projection: drawingProjection,
        offset: { x: offsetX, y: offsetY },
        zoom: camera.zoom,
        policy,
        bounds: { left, top, right, bottom },
        tilt,
      }),
    [
      projectionParent,
      drawingProjection,
      offsetX,
      offsetY,
      camera.zoom,
      policy,
      left,
      top,
      right,
      bottom,
      tilt,
    ],
  );
  const resourceNodeId = useCallback(
    (resourceId: ResourceId) => embeddedNodeId(parentId, resourceId),
    [parentId],
  );
  const cameraOffset = camera.offset;
  const edgeDrawing = useMemo(
    (): EdgeDrawing => ({
      resourceOf: (nodeId) => {
        const parsed = parseEmbeddedNodeId(nodeId);
        return parsed?.parentId === parentId ? parsed.resourceId : undefined;
      },
      toMap: (point) =>
        authoredFromDrawn(
          { x: point.x - absoluteX, y: point.y - absoluteY },
          cameraOffset,
          camera.zoom,
        ),
      dropTargetOf: (element, point) => {
        const within =
          point.x >= absoluteX + left &&
          point.x <= absoluteX + right &&
          point.y >= absoluteY + top &&
          point.y <= absoluteY + bottom;
        if (!within) return 'off-canvas';
        const under = element?.closest<HTMLElement>('.react-flow__node[data-id]')?.dataset['id'];
        if (under === undefined || under === parentId) return 'empty-canvas';
        return parseEmbeddedNodeId(under)?.parentId === parentId ? 'resource' : 'off-canvas';
      },
      previewScale: camera.zoom,
    }),
    [parentId, absoluteX, absoluteY, cameraOffset, camera.zoom, left, right, top, bottom],
  );
  const edgeSurface = useEdgeAuthoring({
    authoring: composition.edgeAuthoring,
    edges,
    projectedNodes: canvasRendering.liveProjection?.nodes ?? null,
    selection: state.selection,
    activeGraphId: graphId,
    graphs: view.projection.visibleGraphs,
    placedResources: view.placedResources,
    newResourceTitle,
    resourceNodeId,
    enabled: availability.authorOnCanvas,
    onSelectEdge: state.selectEdge,
    drawing: edgeDrawing,
  });
  const value = useMemo((): EmbeddedPublication => {
    const localIds = new Map(nodes.map((node) => [node.id, node.data.resourceId]));
    return {
      clipboardFailure:
        clipboardFailure === null
          ? null
          : {
              occurrence: parentId,
              title: space.title,
              message: clipboardFailure,
              dismiss: dismissClipboardFailure,
            },
      entry,
      placement,
      toAuthored: (point) =>
        authoredFromDrawn(
          { x: point.x - absoluteX, y: point.y - absoluteY },
          camera.offset,
          camera.zoom,
        ),
      surface: composition,
      edgeSurface,
      availability,
      openResource: authoring.openResource,
      beginTitleEditing: authoring.beginTitleEditing,
      mapId,
      nodes,
      edges: edgeSurface.edges,
      origin,
      bodyEditing: authoring.bodyEditing,
      titleEditing: authoring.titleEditing,
      removeResource: (id) => {
        const resourceId = localIds.get(id);
        if (resourceId === undefined) return null;
        const result = composition.authoring.complete({
          kind: 'removed-resource-from-map',
          resourceId,
        });
        return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
      },
      mayConnectResources: (from, to) =>
        composition.authoring.edgeEligibility({ kind: 'connect', from, to }).kind === 'eligible',
      connectionAppearance: () =>
        connectionAppearance(pending.visibleGraphs, pending.colors, graphId),
      changeNodes: (changes) => {
        const local = changes.flatMap((change): NodeChange<ResourceFlowNode>[] => {
          if (change.type === 'add' || change.type === 'replace') return [];
          const id = localIds.get(change.id);
          if (id === undefined) return [];
          if (change.type === 'position' && change.position !== undefined) {
            // The drawn bounds constrain what a gesture proposes, never where
            // an authored Resource is drawn (`constrainEmbeddedPosition`). These are
            // the bounds an ancestor has already narrowed, not this Resource's box.
            const held = constrainEmbeddedPosition(change.position, {
              left,
              top,
              right,
              bottom,
            });
            return [
              {
                ...change,
                id,
                position: authoredFromDrawn(held, camera.offset, camera.zoom),
              },
            ];
          }
          return [{ ...change, id }];
        });
        composition.adapter.getState().changeNodes(local);
      },
    };
  }, [
    clipboardFailure,
    dismissClipboardFailure,
    parentId,
    space.title,
    edgeSurface,
    availability,
    placement,
    absoluteX,
    absoluteY,
    authoring.openResource,
    authoring.beginTitleEditing,
    authoring.bodyEditing,
    authoring.titleEditing,
    nodes,
    camera,
    origin,
    composition,
    entry,
    mapId,
    graphId,
    pending,
    left,
    top,
    right,
    bottom,
  ]);
  useLayoutEffect(() => {
    if (import.meta.env.MODE === 'benchmark') performance.mark('hyper:embedded-map-publication');
    publish(parentId, value);
  }, [parentId, value, publish]);
  return (
    <>
      {edgeSurface.layer}
      <ResourceConnect
        connecting={connecting}
        placed={view.placedResources}
        edgeAuthoring={composition.edgeAuthoring}
        projectedNodes={canvasRendering.liveProjection?.nodes ?? null}
        onClose={() => setConnecting(null)}
      />
      <ChromeContinuation
        continuation={composition.continuation}
        within={chromeRoot}
        chromeRenameReady={availability.authorOnCanvas}
      />
      <CanvasContinuation
        continuation={composition.continuation}
        onSelectResource={state.selectResource}
        onSelectEdge={state.selectEdge}
        resourceNodeId={resourceNodeId}
      />
    </>
  );
}
