import { useEffect } from 'react';
import { Background, Controls, MiniMap, ReactFlow, useReactFlow, type Edge } from '@xyflow/react';
import { nodeTypes, type CardFlowNode } from '@project/react-flow-adapter';

/** Frames the graph: fits the active node while presenting, refits the whole
 *  graph in overview once the ELK layout resolves. */
function ViewController({
  activeNodeId,
  layoutReady,
}: {
  activeNodeId: string | null;
  layoutReady: boolean;
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!activeNodeId) return;
    void fitView({ nodes: [{ id: activeNodeId }], duration: 600, padding: 0.4, maxZoom: 1.3 });
  }, [activeNodeId, fitView]);

  useEffect(() => {
    if (activeNodeId) return;
    void fitView({ duration: 400, padding: 0.2 });
  }, [layoutReady, activeNodeId, fitView]);

  return null;
}

export interface GraphViewProps {
  nodes: CardFlowNode[];
  edges: Edge[];
  activeNodeId: string | null;
  layoutReady: boolean;
}

export function GraphView({ nodes, edges, activeNodeId, layoutReady }: GraphViewProps) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
      <ViewController activeNodeId={activeNodeId} layoutReady={layoutReady} />
    </ReactFlow>
  );
}
