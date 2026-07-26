import { useEffect } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useStore,
  type Edge,
  type OnNodesChange,
} from '@xyflow/react';
import { edgeTypes, nodeTypes, type CardFlowNode } from '@project/react-flow-adapter';

/**
 * How much of the shorter viewport axis the presented card leaves as margin.
 * The card fills the screen; this is the letterbox around it.
 */
const PRESENTING_PADDING = 1.15;

/** Frames the whole graph — the overview `fitBounds` gives (ADR 0027). */
function OverviewCamera({
  layoutReady,
  presenting,
}: {
  layoutReady: boolean;
  presenting: boolean;
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (presenting) return;
    // `maxZoom` caps the fit at natural size. Without it React Flow's default max
    // of 2 applies, and a space with a single card — which is what a new space is
    // (ADR 0018) — gets scaled to 2x and fills the screen. Padding does not help:
    // it reserves margin, it does not cap zoom.
    void fitView({ duration: 400, padding: 0.2, maxZoom: 1 });
  }, [layoutReady, presenting, fitView]);

  return null;
}

/**
 * Moves the camera to the card a walk has reached (ADR 0027).
 *
 * There is no second surface: presenting is this canvas, drawn close enough that
 * one card fills the screen. `setCenter` is the whole mechanism.
 *
 * Arriving from the overview changes zoom by a large factor, and a single
 * combined move whips — the translation happens while scaled in, so the cards
 * tear past. So a zoom-changing move is **split**: pan at the wider of the two
 * scales, then close in. Card-to-card inside a walk holds zoom, so it is one
 * move. (Copied from impress.js, which is the one thing the spike kept from it.)
 */
function PresentingCamera({ activeCardId }: { activeCardId: string | null }) {
  const { setCenter, getNode, getZoom } = useReactFlow();
  const viewportWidth = useStore((s) => s.width);
  const viewportHeight = useStore((s) => s.height);

  useEffect(() => {
    if (!activeCardId || viewportWidth === 0 || viewportHeight === 0) return;
    const node = getNode(activeCardId);
    if (!node) return;

    const width = node.width ?? node.measured?.width ?? 0;
    const height = node.height ?? node.measured?.height ?? 0;
    if (width === 0 || height === 0) return;

    const x = node.position.x + width / 2;
    const y = node.position.y + height / 2;
    const zoom = Math.min(
      viewportWidth / (width * PRESENTING_PADDING),
      viewportHeight / (height * PRESENTING_PADDING),
    );

    let cancelled = false;
    const from = getZoom();
    // A tenth of a stop either way is not a jump worth splitting.
    if (Math.abs(from - zoom) / zoom < 0.1) {
      void setCenter(x, y, { zoom, duration: 500 });
      return;
    }

    void setCenter(x, y, { zoom: Math.min(from, zoom), duration: 400 }).then(() => {
      if (!cancelled) void setCenter(x, y, { zoom, duration: 300 });
    });
    return () => {
      cancelled = true;
    };
  }, [activeCardId, viewportWidth, viewportHeight, getNode, getZoom, setCenter]);

  return null;
}

export interface GraphViewProps {
  nodes: CardFlowNode[];
  edges: Edge[];
  layoutReady: boolean;
  /** The card a walk has reached, or `null` in overview. */
  activeCardId: string | null;
  presenting: boolean;
  /**
   * Whether there is an arrangement to drag yet: false for the one frame before
   * the layout resolves, true afterwards, for every view. Every view is editable
   * (ADR 0025) — an automatic one gets its Layout by being edited — so this is a
   * readiness gate and not a permission. Not an edit mode either: there is
   * nothing to toggle and nothing to keep in sync.
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
  activeCardId,
  presenting,
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
      // Clicking a card opens it to read — a gesture that belongs to the
      // overview. While presenting the canvas is the presentation, so a click
      // must not drop a reading panel over it.
      onNodeClick={(_event, node) => {
        if (!presenting) onOpenCard(node.id);
      }}
      fitView
      // While presenting the arrow keys are the walk's, so React Flow must not
      // also read them as moving or selecting a node.
      nodesDraggable={editable && !presenting}
      nodesFocusable={!presenting}
      elementsSelectable={!presenting}
      nodesConnectable={false}
      edgesFocusable={false}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} />
      <Controls showInteractive={false} />
      {/* Screen-fixed, so the camera does not touch it: at a zoom where the
          active card is legible a fork's branch cards are off screen, and the
          minimap is where the space stays visible (ADR 0027). */}
      <MiniMap pannable zoomable />
      <OverviewCamera layoutReady={layoutReady} presenting={presenting} />
      <PresentingCamera activeCardId={activeCardId} />
    </ReactFlow>
  );
}
