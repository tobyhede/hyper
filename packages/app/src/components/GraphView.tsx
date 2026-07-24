import { useEffect } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Edge,
  type OnNodesChange,
} from '@xyflow/react';
import { edgeTypes, nodeTypes, type CardFlowNode } from '@project/react-flow-adapter';

/** Frames the graph: fits the active card while presenting, refits the whole
 *  graph in overview once the ELK layout resolves. */
function ViewController({
  activeCardId,
  layoutReady,
}: {
  activeCardId: string | null;
  layoutReady: boolean;
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!activeCardId) return;
    void fitView({ nodes: [{ id: activeCardId }], duration: 600, padding: 0.4, maxZoom: 1.3 });
  }, [activeCardId, fitView]);

  useEffect(() => {
    if (activeCardId) return;
    void fitView({ duration: 400, padding: 0.2 });
  }, [layoutReady, activeCardId, fitView]);

  return null;
}

export interface GraphViewProps {
  nodes: CardFlowNode[];
  edges: Edge[];
  activeCardId: string | null;
  layoutReady: boolean;
  /**
   * Whether this view can be edited: true when it has a Layout to write a
   * placement into (ADR 0013). Not an edit mode — there is nothing to toggle and
   * nothing to keep in sync; a view either has somewhere to record where a card
   * was put, or it does not.
   */
  editable: boolean;
  onNodesChange: OnNodesChange<CardFlowNode>;
  /** Opening a card is a view gesture; the graph only reports which was picked. */
  onOpenCard: (cardId: string) => void;
}

export function GraphView({
  nodes,
  edges,
  activeCardId,
  layoutReady,
  editable,
  onNodesChange,
  onOpenCard,
}: GraphViewProps) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_event, node) => onOpenCard(node.id)}
      fitView
      nodesDraggable={editable}
      nodesConnectable={false}
      edgesFocusable={false}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
      <ViewController activeCardId={activeCardId} layoutReady={layoutReady} />
    </ReactFlow>
  );
}
