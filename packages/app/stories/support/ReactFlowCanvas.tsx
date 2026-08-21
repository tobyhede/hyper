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

function useProjection(
  activeGraphId: GraphId | null,
  selectedCardId: CardId | null = null,
): ProjectedCanvas | null {
  const [projected, setProjected] = useState<ProjectedCanvas | null>(null);

  useEffect(() => {
    let current = true;
    void laidOut.then((resolved) => {
      if (current)
        setProjected(pending.project(resolved, interaction(activeGraphId, selectedCardId)));
    });
    return () => {
      current = false;
    };
  }, [activeGraphId, selectedCardId]);

  return projected;
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
  readonly onEditCard?: () => void;
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
  onEditCard = () => undefined,
}: CanvasCardNodeSpecimenProps) {
  const projected = useProjection(graphIds.long);
  if (projected === null) return null;

  const source = projected.nodes.find(({ id }) => id === cardId);
  if (source === undefined) throw new Error(`Missing fixture Card ${cardId}`);

  const data: CardFlowNode['data'] = {
    ...source.data,
    titleEditingEnabled: true,
    cardEditingEnabled: cardEditingEnabled ?? source.data.kind === 'markdown',
    connectingEnabled: true,
    editingTitle,
    onBeginConnect: () => undefined,
    onEditCard,
    onBeginTitleEditing: () => undefined,
    onCompleteTitleEditing: () => null,
    onCancelTitleEditing: () => undefined,
  };
  if (graphColor !== undefined) data.activeGraphColor = graphColor;

  const node: CardFlowNode = { ...source, selected, data };

  return <RealReactFlow className="inv-card-node-stage" nodes={[node]} edges={[]} />;
}

export interface ReactFlowCanvasProps {
  readonly activeGraphId?: GraphId | null;
  readonly selectedCardId?: CardId | null;
}

/** The real production projection mounted under the same React Flow owners. */
export function ReactFlowCanvas({
  activeGraphId = graphIds.long,
  selectedCardId = null,
}: ReactFlowCanvasProps) {
  const projected = useProjection(activeGraphId, selectedCardId);
  if (projected === null) return null;

  const { nodes, edges } = projected;
  return <RealReactFlow className="inv-canvas" nodes={nodes} edges={edges} controls />;
}
