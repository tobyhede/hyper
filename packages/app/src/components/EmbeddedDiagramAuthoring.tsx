import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { NodeChange } from '@xyflow/react';
import { type ThingId, type GraphId, type DiagramId, type DiagramPosition } from '@project/core';
import { Placement, positionedStrategy } from '@project/graph';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import { authoringAvailability } from '../authoring-availability';
import { canvasProjection } from '../canvas-projection';
import { useCanvasThingAuthoring } from '../canvas-thing-authoring';
import { createEmbeddedAuthoring } from '../embedded-authoring';
import {
  constrainEmbeddedPosition,
  embeddedDiagram,
  type EmbeddedBounds,
  type EmbeddedParentProjection,
  type EmbeddedTilt,
} from '../embedded-diagram';
import type { OpenSpace } from '../open-spaces';
import { usePlacementRendering } from '../placement-rendering';
import { useSpaceThingTargets } from '../space-thing-targets';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { Continuation } from '../continuation';
import type { EmbeddedPublication } from '../embedded-publication';
import { authoredFromDrawn, type SpaceThingFraming } from '../space-thing-framing';
import { spaceThingEmbedCamera } from '../camera';

export type { EmbeddedPublication };

const EMPTY_NODES: readonly ThingFlowNode[] = [];

/** Reuse production projection and Thing controls over an explicitly addressed target Diagram. */
export function EmbeddedDiagramAuthoring({
  continuation,
  parent,
  entry,
  diagramId,
  graphId,
  enabled,
  framing,
  bounds: { left, top, right, bottom },
  absolute: { x: absoluteX, y: absoluteY },
  tiltCenter,
  publish,
}: {
  readonly continuation: Continuation;
  readonly parent: ThingFlowNode;
  readonly entry: OpenSpace;
  readonly diagramId: DiagramId;
  /**
   * The Graph the Space Thing selects, emphasised inside the embedding.
   *
   * Not nullable, unlike the Space's own Active Graph this feeds: a Space Thing
   * stores a Graph as well as a Diagram (ADR 0079), so an embedding always has
   * one to emphasise even where the Space it draws has authored none.
   */
  readonly graphId: GraphId;
  readonly enabled: boolean;
  readonly framing: SpaceThingFraming | undefined;
  readonly bounds: EmbeddedBounds;
  /** This Thing's own top-left in canvas coordinates, which the lean is measured from. */
  readonly absolute: DiagramPosition;
  /** The centre a dragged ancestor leans about, or `undefined` while none moves. */
  readonly tiltCenter: DiagramPosition | undefined;
  readonly publish: (id: string, value: EmbeddedPublication | null) => void;
}) {
  const parentId = parent.id;
  // The target's own composition names where this reports (ADR 0016); nothing
  // here holds a second sink, and a default in the module would be one.
  const [composition] = useState(() =>
    createEmbeddedAuthoring(entry, diagramId, entry.app.reportObserverError),
  );
  useEffect(() => composition.observe(), [composition]);
  const state = composition.adapter();
  const space = entry.app.currentSpace();
  const resolved = space.lookup.diagram(diagramId);
  const pending = useMemo(
    () => (resolved === undefined ? null : canvasProjection(space, resolved)),
    [space, resolved],
  );
  const authored = useMemo(
    () => (resolved === undefined ? Placement.empty() : Placement.fromDiagram(resolved.diagram)),
    [resolved],
  );
  const strategy = useMemo(() => positionedStrategy(authored), [authored]);
  const emptyGraph = useMemo(() => ({ things: [], edges: [] }), []);
  const placement = usePlacementRendering(
    pending?.strategyGraph ?? emptyGraph,
    strategy,
    state.resizeDraft?.placement ?? authored,
  );
  const laidOut = placement.kind === 'ready' ? placement.strategyGraph : null;
  const projected = useMemo(
    () =>
      pending === null || laidOut === null
        ? null
        : pending.project(laidOut, {
            activeGraphId: graphId,
            activeThingId: null,
            selectedThingId: state.selection.kind === 'thing' ? state.selection.thingId : null,
            presenting: false,
          }),
    [pending, laidOut, graphId, state.selection],
  );
  useLayoutEffect(() => {
    if (projected !== null)
      composition.adapter.getState().syncProjection(projected.nodes, projected.edges);
  }, [composition, projected]);
  const readTarget = useCallback((id: ThingId) => entry.spaceThings.target(id), [entry]);
  const targets = useSpaceThingTargets(space.things, readTarget);
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

        editingThingBody: false,
        editingThingTitle: false,
        thingIsOpen: false,
        editingChromeTitle: false,
        spaceOnCanvas: enabled,
        creatingSpaceThing: false,
        // Never this embedding's own fact. A Space Thing *inside* this Diagram is
        // drawn by the containing `SpaceCanvas` too — its queue descends into
        // the nodes this one publishes — so a nested edit is reported into that
        // one Set, and reaches back here as `enabled` rather than from below.
        editingEmbeddedDiagram: false,
      }),
    [enabled],
  );
  const authoring = useCanvasThingAuthoring({
    continuation,
    nodes: state.projection?.nodes ?? EMPTY_NODES,
    availability,
    nameOnCreation: null,
    authoring: composition.authoring,
    spaceSession: entry.session,
    thingResize: state.thingResize,
    onSelectThing: state.selectThing,
    spaceThingTargets: targets,
  });
  const [origin] = useState(() => {
    const positions = [...authored.values()];
    return {
      x: positions.length === 0 ? 0 : Math.min(...positions.map((at) => at.x)),
      y: positions.length === 0 ? 0 : Math.min(...positions.map((at) => at.y)),
    };
  });
  const camera = useMemo(
    () => spaceThingEmbedCamera({ left, top, right, bottom }, origin, framing),
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
  // of a drag and not per render: the centre moves with the Thing, and these
  // four numbers are the whole of what the lean depends on.
  const tiltX = tiltCenter?.x;
  const tiltY = tiltCenter?.y;
  const tilt = useMemo(
    (): EmbeddedTilt | undefined =>
      tiltX === undefined || tiltY === undefined
        ? undefined
        : { center: { x: tiltX, y: tiltY }, parentAbsolute: { x: absoluteX, y: absoluteY } },
    [tiltX, tiltY, absoluteX, absoluteY],
  );
  const { nodes, edges } = useMemo(
    () =>
      embeddedDiagram({
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
    const localIds = new Map(nodes.map((node) => [node.id, node.data.thingId]));
    return {
      entry,
      diagramId,
      nodes,
      edges,
      origin,
      bodyEditing: authoring.bodyEditing,
      titleEditing: authoring.titleEditing,
      removeThing: (id) => {
        const thingId = localIds.get(id);
        if (thingId === undefined) return null;
        const result = composition.authoring.complete({
          kind: 'removed-thing-from-diagram',
          thingId,
        });
        return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
      },
      mayConnectThings: (from, to) => {
        const resolvedDiagram = entry.app.currentSpace().lookup.diagram(diagramId);
        const owned = entry.app.currentSpace().lookup.graph(graphId);
        if (resolvedDiagram === undefined || owned?.owner.diagram.id !== diagramId) return false;
        const members = Placement.fromDiagram(resolvedDiagram.diagram);
        if (!members.has(from) || !members.has(to)) return false;
        return !owned.graph.edges.some((edge) => edge.from === from && edge.to === to);
      },
      connectThings: (from, to) => {
        const resolvedDiagram = entry.app.currentSpace().lookup.diagram(diagramId);
        if (resolvedDiagram === undefined) return false;
        const result = composition.authoring.complete({
          kind: 'connected-things',
          from,
          to,
          rendered: Placement.fromDiagram(resolvedDiagram.diagram),
          graphId,
        });
        return result.kind === 'completed';
      },
      changeNodes: (changes) => {
        const local = changes.flatMap((change): NodeChange<ThingFlowNode>[] => {
          if (change.type === 'add' || change.type === 'replace') return [];
          const id = localIds.get(change.id);
          if (id === undefined) return [];
          if (change.type === 'position' && change.position !== undefined) {
            // The drawn bounds constrain what a gesture proposes, never where
            // an authored Thing is drawn (`constrainEmbeddedPosition`). These are
            // the bounds an ancestor has already narrowed, not this Thing's box.
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
    diagramId,
    graphId,
    left,
    top,
    right,
    bottom,
  ]);
  useLayoutEffect(() => {
    if (import.meta.env.MODE === 'benchmark')
      performance.mark('hyper:embedded-diagram-publication');
    publish(parentId, value);
  }, [parentId, value, publish]);
  return null;
}
