import { useEffect, useState } from 'react';
import { Background, Controls, ReactFlow, type Edge } from '@xyflow/react';
import type { CardId, GraphId } from '@project/core';
import { nodeTypes, edgeTypes, type CardFlowNode } from '@project/react-flow-adapter';
import { MAX_ZOOM, OVERVIEW_FIT } from '#src/camera';
import { canvasProjection, type CanvasInteraction } from '#src/canvas-projection';
import { cardSizeVars } from '#src/card';
import { createRendererResolver } from '#src/renderer';
import { cardIds, graphIds, layoutId, space } from './fixture';

const resolveRenderer = createRendererResolver({
  // A selected Layout never converts, so the resolver cannot call this. It is
  // still a real UUID because the resolver's interface deliberately accepts no
  // story-specific partial adapter.
  newGraphId: () => graphIds.short,
});
const renderer = resolveRenderer(space, { kind: 'layout', layoutId });
const pending = canvasProjection(space, renderer);
const laidOut = renderer.strategy(pending.strategyGraph);

const interaction = (
  activeGraphId: GraphId | null,
  selectedCardId: CardId | null = null,
): CanvasInteraction => ({
  activeGraphId,
  activeCardId: null,
  selectedCardId,
  presenting: false,
  moved: false,
});

type ProjectedCanvas = ReturnType<typeof pending.project>;

/**
 * A story that cannot lay out says so. Left unhandled, a rejected strategy
 * leaves `projected` null for good — a permanently blank story that reads as
 * "still loading" and reports to Ladle E2E as a missing element, with the cause
 * visible only as an unhandled rejection in the console.
 */
function useProjection(
  activeGraphId: GraphId | null,
  selectedCardId: CardId | null = null,
): ProjectedCanvas | Error | null {
  const [projected, setProjected] = useState<ProjectedCanvas | Error | null>(null);

  useEffect(() => {
    const mounted = { current: true };
    void (async () => {
      try {
        const resolved = await laidOut;
        if (mounted.current)
          setProjected(pending.project(resolved, interaction(activeGraphId, selectedCardId)));
      } catch (error) {
        if (mounted.current)
          setProjected(error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [activeGraphId, selectedCardId]);

  return projected;
}

/** What a story draws in place of a canvas the strategy could not place. */
function PlacementFailure({ reason }: { readonly reason: Error }) {
  return <p role="alert">Placement failed: {reason.message}</p>;
}

function RealReactFlow({
  nodes,
  edges,
  className,
  controls = false,
}: {
  readonly nodes: readonly CardFlowNode[];
  readonly edges: readonly Edge[];
  readonly className: string;
  readonly controls?: boolean;
}) {
  return (
    <div className={className} style={cardSizeVars}>
      <ReactFlow
        nodes={[...nodes]}
        edges={[...edges]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={OVERVIEW_FIT}
        minZoom={0.2}
        maxZoom={MAX_ZOOM}
        nodesConnectable
        nodesDraggable={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        {controls && <Controls showInteractive={false} />}
      </ReactFlow>
    </div>
  );
}

export interface CanvasCardNodeSpecimenProps {
  readonly cardId?: CardId;
  readonly selected?: boolean;
  readonly editingTitle?: boolean;
  readonly graphColor?: string;
  readonly cardEditingEnabled?: boolean;
  readonly onEditCard?: () => 'completed' | 'retained';
}

/**
 * A typed one-node React Flow harness. It supplies fixture state only; CardNode
 * remains responsible for presentation state, controls, handles and geometry.
 */
export function CanvasCardNodeSpecimen({
  cardId = cardIds.strategies,
  selected = false,
  editingTitle = false,
  graphColor,
  cardEditingEnabled,
  onEditCard = () => 'completed',
}: CanvasCardNodeSpecimenProps) {
  const projected = useProjection(graphIds.long);
  if (projected === null) return null;
  if (projected instanceof Error) return <PlacementFailure reason={projected} />;

  const source = projected.nodes.find(({ id }) => id === cardId);
  if (source === undefined) throw new Error(`Missing fixture Card ${cardId}`);

  const data: CardFlowNode['data'] = {
    ...source.data,
    titleEditingEnabled: true,
    cardEditingEnabled: cardEditingEnabled ?? source.data.kind === 'markdown',
    onEditCard,
    onBeginTitleEditing: () => undefined,
  };
  // The editor is the state, so a specimen that asks to be renaming supplies
  // what ends the edit along with it.
  if (editingTitle) {
    data.titleEditor = { onComplete: () => null, onCancel: () => undefined };
  }
  if (graphColor !== undefined) data.activeGraphColor = graphColor;

  const node: CardFlowNode = { ...source, selected, data };

  return <RealReactFlow className="inv-card-node-stage" nodes={[node]} edges={[]} />;
}
