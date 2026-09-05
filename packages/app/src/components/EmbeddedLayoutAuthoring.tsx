import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Edge, NodeChange } from '@xyflow/react';
import { SPACE_CARD_EMBED_INSET, type CardId, type GraphId, type LayoutId } from '@project/core';
import { Placement, positionedStrategy } from '@project/graph';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { canvasProjection } from '../canvas-projection';
import { useCanvasCardAuthoring } from '../canvas-card-authoring';
import { createEmbeddedAuthoring } from '../embedded-authoring';
import { embeddedLayout, type EmbeddedBounds } from '../embedded-layout';
import type { OpenSpace } from '../open-spaces';
import { usePlacementRendering } from '../placement-rendering';
import { useSpaceCardTargets } from '../space-card-targets';
import { describeAuthoringRefusal } from '../authoring-refusal';

export interface EmbeddedPublication {
  readonly entry: OpenSpace;
  readonly layoutId: LayoutId;
  readonly bodyEditing: boolean;
  readonly titleEditing: boolean;
  readonly nodes: readonly CardFlowNode[];
  readonly edges: readonly Edge[];
  readonly changeNodes: (changes: NodeChange<CardFlowNode>[]) => void;
  readonly removeCard: (id: string) => string | null;
}

const EMPTY_NODES: readonly CardFlowNode[] = [];

/** Reuse production projection and Card controls over an explicitly addressed target Layout. */
export function EmbeddedLayoutAuthoring({
  parent,
  entry,
  layoutId,
  graphId,
  enabled,
  bounds: { left, top, right, bottom },
  publish,
}: {
  readonly parent: CardFlowNode;
  readonly entry: OpenSpace;
  readonly layoutId: LayoutId;
  readonly graphId: GraphId | null;
  readonly enabled: boolean;
  readonly bounds: EmbeddedBounds;
  readonly publish: (id: string, value: EmbeddedPublication | null) => void;
}) {
  const [composition] = useState(() => createEmbeddedAuthoring(entry, layoutId));
  useEffect(() => composition.observe(), [composition]);
  const state = composition.adapter();
  const space = entry.app.currentSpace();
  const resolved = space.lookup.layout(layoutId);
  const pending = useMemo(
    () => (resolved === undefined ? null : canvasProjection(space, resolved)),
    [space, resolved],
  );
  const authored = useMemo(
    () => (resolved === undefined ? Placement.empty() : Placement.fromLayout(resolved.layout)),
    [resolved],
  );
  const strategy = useMemo(() => positionedStrategy(authored), [authored]);
  const emptyGraph = useMemo(() => ({ cards: [], edges: [] }), []);
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
            activeCardId: null,
            selectedCardId: state.selection.kind === 'card' ? state.selection.cardId : null,
            presenting: false,
            moved: state.moved,
          }),
    [pending, laidOut, graphId, state.selection, state.moved],
  );
  useLayoutEffect(() => {
    if (projected !== null)
      composition.adapter.getState().syncProjection(projected.nodes, projected.edges);
  }, [composition, projected]);
  const readTarget = useCallback((id: CardId) => entry.spaceCards.target(id), [entry]);
  const targets = useSpaceCardTargets(space.cards, readTarget);
  const authoring = useCanvasCardAuthoring({
    nodes: state.projection?.nodes ?? EMPTY_NODES,
    editable: true,
    presenting: false,
    enabled,
    nameOnCreation: null,
    authoring: composition.authoring,
    spaceSession: entry.session,
    cardResize: state.cardResize,
    onSelectCard: state.selectCard,
    spaceCardTargets: targets,
  });
  const [origin] = useState(() => {
    const positions = [...Placement.drawn(authored).values()];
    return {
      x: positions.length === 0 ? 0 : Math.min(...positions.map((at) => at.x)),
      y: positions.length === 0 ? 0 : Math.min(...positions.map((at) => at.y)),
    };
  });
  const offset = useMemo(
    () => ({ x: SPACE_CARD_EMBED_INSET.left - origin.x, y: SPACE_CARD_EMBED_INSET.top - origin.y }),
    [origin],
  );
  const value = useMemo((): EmbeddedPublication => {
    const { nodes, edges } = embeddedLayout({
      parent,
      projection: { nodes: authoring.nodes, edges: state.projection?.edges ?? [] },
      offset,
      enabled,
      bounds: { left, top, right, bottom },
    });
    const localIds = new Map(nodes.map((node) => [node.id, node.data.cardId]));
    return {
      entry,
      layoutId,
      nodes,
      edges,
      bodyEditing: authoring.bodyEditing,
      titleEditing: authoring.titleEditing,
      removeCard: (id) => {
        const cardId = localIds.get(id);
        if (cardId === undefined) return null;
        const result = composition.authoring.complete({ kind: 'removed-card-from-layout', cardId });
        return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
      },
      changeNodes: (changes) => {
        const local = changes.flatMap((change): NodeChange<CardFlowNode>[] => {
          if (change.type === 'add' || change.type === 'replace') return [];
          const id = localIds.get(change.id);
          if (id === undefined) return [];
          if (change.type === 'position' && change.position !== undefined) {
            return [
              {
                ...change,
                id,
                position: { x: change.position.x - offset.x, y: change.position.y - offset.y },
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
    layoutId,
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
