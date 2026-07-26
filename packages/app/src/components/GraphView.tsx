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

/** Frames the whole graph once the layout resolves. */
function ViewController({ layoutReady }: { layoutReady: boolean }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    // `maxZoom` caps the fit at natural size. Without it React Flow's default max
    // of 2 applies, and a space with a single card — which is what a new space is
    // (ADR 0018) — gets scaled to 2x and fills the screen. Padding does not help:
    // it reserves margin, it does not cap zoom.
    void fitView({ duration: 400, padding: 0.2, maxZoom: 1 });
  }, [layoutReady, fitView]);

  return null;
}

export interface GraphViewProps {
  nodes: CardFlowNode[];
  edges: Edge[];
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
      <ViewController layoutReady={layoutReady} />
    </ReactFlow>
  );
}
