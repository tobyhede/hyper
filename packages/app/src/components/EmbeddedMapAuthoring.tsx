import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { NodeChange } from '@xyflow/react';
import { type ResourceId, type GraphId, type MapId, type MapPosition } from '@project/core';
import { Placement } from '@project/graph';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import { authoringAvailability } from '../authoring-availability';
import { canvasProjection } from '../canvas-projection';
import { connectionAppearance } from '../colors';
import { useCanvasResourceAuthoring } from '../canvas-resource-authoring';
import { createEmbeddedAuthoring } from '../embedded-authoring';
import {
  constrainEmbeddedPosition,
  embeddedMap,
  type EmbeddedBounds,
  type EmbeddedParentProjection,
  type EmbeddedTilt,
} from '../embedded-map';
import type { OpenSpace } from '../open-spaces';
import { usePlacementRendering } from '../placement-rendering';
import { useSpaceResourceTargets } from '../space-resource-targets';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { CommandOutcomes } from '../command-outcomes';
import type { EmbeddedPublication } from '../embedded-publication';
import { authoredFromDrawn, type SpaceResourceFraming } from '../space-resource-framing';
import { spaceResourceEmbedCamera } from '../camera';

export type { EmbeddedPublication };

const EMPTY_NODES: readonly ResourceFlowNode[] = [];

/** Reuse production projection and Resource controls over an explicitly addressed target Map. */
export function EmbeddedMapAuthoring({
  commandOutcomes,
  parent,
  entry,
  mapId,
  graphId,
  enabled,
  framing,
  bounds: { left, top, right, bottom },
  absolute: { x: absoluteX, y: absoluteY },
  drawnAbsolute: { x: drawnX, y: drawnY },
  tiltCenter,
  publish,
}: {
  readonly commandOutcomes: CommandOutcomes;
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
  readonly enabled: boolean;
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
  // The target's own composition names where this reports (ADR 0016); nothing
  // here holds a second sink, and a default in the module would be one.
  const [composition] = useState(() =>
    createEmbeddedAuthoring(entry, mapId, entry.app.reportObserverError),
  );
  useEffect(() => composition.observe(), [composition]);
  const state = composition.adapter();
  const space = entry.app.currentSpace();
  const resolved = space.lookup.map(mapId);
  const pending = useMemo(
    () => (resolved === undefined ? null : canvasProjection(space, resolved)),
    [space, resolved],
  );
  const authored = useMemo(
    () => (resolved === undefined ? Placement.empty() : Placement.fromMap(resolved.map)),
    [resolved],
  );
  const emptyGraph = useMemo(() => ({ resources: [], edges: [] }), []);
  const placement = usePlacementRendering(
    pending?.strategyGraph ?? emptyGraph,
    state.resizeDraft?.placement ?? authored,
  );
  const laidOut = placement.kind === 'ready' ? placement.strategyGraph : null;
  const projected = useMemo(
    () =>
      pending === null || laidOut === null
        ? null
        : pending.project(laidOut, {
            activeGraphId: graphId,
            activeResourceId: null,
            selectedResourceId:
              state.selection.kind === 'resource' ? state.selection.resourceId : null,
            presenting: false,
          }),
    [pending, laidOut, graphId, state.selection],
  );
  useLayoutEffect(() => {
    if (projected !== null)
      composition.adapter.getState().syncProjection(projected.nodes, projected.edges);
  }, [composition, projected]);
  const readTarget = useCallback((id: ResourceId) => entry.spaceResources.target(id), [entry]);
  const targets = useSpaceResourceTargets(space.resources, readTarget);
  /**
   * This embedding's own answers, from the one module that owns them.
   *
   * The facts are stated about *this* canvas rather than the containing one:
   * its placement has resolved by the time anything is drawn, a traversal never
   * runs inside an embedding, and no pane or chrome rename belongs to it.
   * `enabled` is the containing canvas's `authorOnCanvas`, already narrowed to
   * this embedding, and it arrives here as the same question one level down —
   * so it is the `spaceOnCanvas` fact and nothing else, which is what keeps a
   * live content editor in here through a withdrawal up there.
   */
  const availability = useMemo(
    () =>
      authoringAvailability({
        editable: true,
        presenting: false,

        editingResourceBody: false,
        editingResourceTitle: false,
        resourceIsOpen: false,
        editingChromeTitle: false,
        spaceOnCanvas: enabled,
        creatingSpaceResource: false,
        // Never this embedding's own fact. A Space Resource *inside* this Map is
        // drawn by the containing `SpaceCanvas` too — its queue descends into
        // the nodes this one publishes — so a nested edit is reported into that
        // one Set, and reaches back here as `enabled` rather than from below.
        editingEmbeddedMap: false,
      }),
    [enabled],
  );
  const authoring = useCanvasResourceAuthoring({
    commandOutcomes,
    nodes: state.projection?.nodes ?? EMPTY_NODES,
    availability,
    nameOnCreation: null,
    authoring: composition.authoring,
    spaceSession: entry.session,
    resourceResize: state.resourceResize,
    onSelectResource: state.selectResource,
    spaceResourceTargets: targets,
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
    () => ({ nodes: authoring.nodes, edges: state.projection?.edges ?? [] }),
    [authoring.nodes, state.projection?.edges],
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
        enabled,
        bounds: { left, top, right, bottom },
        tilt,
      }),
    [
      projectionParent,
      drawingProjection,
      offsetX,
      offsetY,
      camera.zoom,
      enabled,
      left,
      top,
      right,
      bottom,
      tilt,
    ],
  );
  const value = useMemo((): EmbeddedPublication => {
    const localIds = new Map(nodes.map((node) => [node.id, node.data.resourceId]));
    return {
      entry,
      mapId,
      nodes,
      edges,
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
      mayConnectResources: (from, to) => {
        const resolvedMap = entry.app.currentSpace().lookup.map(mapId);
        const owned = entry.app.currentSpace().lookup.graph(graphId);
        if (resolvedMap === undefined || owned?.owner.map.id !== mapId) return false;
        const members = Placement.fromMap(resolvedMap.map);
        if (!members.has(from) || !members.has(to)) return false;
        return !owned.graph.edges.some((edge) => edge.from === from && edge.to === to);
      },
      connectResources: (from, to) => {
        const resolvedMap = entry.app.currentSpace().lookup.map(mapId);
        if (resolvedMap === undefined) return false;
        const result = composition.authoring.complete({
          kind: 'connected-resources',
          from,
          to,
          graphId,
        });
        return result.kind === 'completed';
      },
      connectionAppearance: () =>
        connectionAppearance(pending?.visibleGraphs ?? [], pending?.colors ?? {}, graphId),
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
    authoring.bodyEditing,
    authoring.titleEditing,
    nodes,
    edges,
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
  return null;
}
