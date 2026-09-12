import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Edge, NodeChange } from '@xyflow/react';
import { SPACE_THING_EMBED_INSET, type ThingId, type GraphId, type DiagramId } from '@project/core';
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
} from '../embedded-diagram';
import type { OpenSpace } from '../open-spaces';
import { usePlacementRendering } from '../placement-rendering';
import { useSpaceThingTargets } from '../space-thing-targets';
import { describeAuthoringRefusal } from '../authoring-refusal';

export interface EmbeddedPublication {
  readonly entry: OpenSpace;
  readonly diagramId: DiagramId;
  readonly bodyEditing: boolean;
  readonly titleEditing: boolean;
  readonly nodes: readonly ThingFlowNode[];
  readonly edges: readonly Edge[];
  readonly changeNodes: (changes: NodeChange<ThingFlowNode>[]) => void;
  readonly removeThing: (id: string) => string | null;
}

const EMPTY_NODES: readonly ThingFlowNode[] = [];

/** Reuse production projection and Thing controls over an explicitly addressed target Diagram. */
export function EmbeddedDiagramAuthoring({
  parent,
  entry,
  diagramId,
  graphId,
  enabled,
  bounds: { left, top, right, bottom },
  publish,
}: {
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
  readonly bounds: EmbeddedBounds;
  readonly publish: (id: string, value: EmbeddedPublication | null) => void;
}) {
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
        // Never this embedding's own fact. A Space Thing *inside* this Diagram is
        // drawn by the containing `SpaceCanvas` too — its queue descends into
        // the nodes this one publishes — so a nested edit is reported into that
        // one Set, and reaches back here as `enabled` rather than from below.
        editingEmbeddedDiagram: false,
      }),
    [enabled],
  );
  const authoring = useCanvasThingAuthoring({
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
  const offset = useMemo(
    () => ({
      x: SPACE_THING_EMBED_INSET.left - origin.x,
      y: SPACE_THING_EMBED_INSET.top - origin.y,
    }),
    [origin],
  );
  const value = useMemo((): EmbeddedPublication => {
    const { nodes, edges } = embeddedDiagram({
      parent,
      projection: { nodes: authoring.nodes, edges: state.projection?.edges ?? [] },
      offset,
      enabled,
      bounds: { left, top, right, bottom },
    });
    const localIds = new Map(nodes.map((node) => [node.id, node.data.thingId]));
    return {
      entry,
      diagramId,
      nodes,
      edges,
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
                position: { x: held.x - offset.x, y: held.y - offset.y },
              },
            ];
          }
          return [{ ...change, id }];
        });
        composition.adapter.getState().changeNodes(local);
      },
    };
  }, [
    authoring.nodes,
    authoring.bodyEditing,
    authoring.titleEditing,
    state.projection,
    parent,
    offset,
    enabled,
    composition,
    entry,
    diagramId,
    left,
    top,
    right,
    bottom,
  ]);
  useLayoutEffect(() => {
    publish(parent.id, value);
  }, [parent.id, value, publish]);
  return null;
}
