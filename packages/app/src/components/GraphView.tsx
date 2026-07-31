import { useEffect, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  ViewportPortal,
  useConnection,
  useReactFlow,
  useStore,
  useViewport,
  type Edge,
  type OnConnect,
  type OnNodesChange,
} from '@xyflow/react';
import type { Route } from '@project/core';
import type { LayoutPoint } from '@project/graph';
import {
  edgeTypes,
  nodeTypes,
  RouteConnectionLine,
  RouteHud,
  type CardFlowNode,
} from '@project/react-flow-adapter';
import { activeRouteColor } from '../colors';
import { CARD_SIZE } from '../card';

/**
 * How much of the shorter viewport axis the presented card leaves as margin.
 * The card fills the screen; this is the letterbox around it.
 */
const PRESENTING_PADDING = 1.15;

/**
 * Frames the whole graph — the overview `fitBounds` gives (ADR 0027).
 *
 * Fitting on mount is the whole of it: the graph area draws this canvas only
 * once a placement has produced an arrangement, so there is no not-yet-arranged
 * state to wait out here.
 */
function OverviewCamera({ presenting }: { presenting: boolean }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (presenting) return;
    // `maxZoom` caps the fit at natural size. Without it React Flow's default max
    // of 2 applies, and a space with a single card — which is what a new space is
    // (ADR 0018) — gets scaled to 2x and fills the screen. Padding does not help:
    // it reserves margin, it does not cap zoom.
    void fitView({ duration: 400, padding: 0.2, maxZoom: 1 });
  }, [presenting, fitView]);

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

function NewCardPreview({ title, pointer }: { title: string; pointer: LayoutPoint | null }) {
  const connection = useConnection();
  const { screenToFlowPosition } = useReactFlow();
  useViewport();
  if (pointer === null || !connection.inProgress || connection.toNode !== null) return null;
  const flowPointer = screenToFlowPosition(pointer);
  const position = {
    x: flowPointer.x - CARD_SIZE.width / 2,
    y: flowPointer.y - CARD_SIZE.height / 2,
  };

  return (
    <ViewportPortal>
      <div
        className="new-card-preview"
        data-testid="new-card-preview"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          width: CARD_SIZE.width,
        }}
      >
        <article className="card card--node">
          <h2 className="card__title">{title}</h2>
        </article>
      </div>
    </ViewportPortal>
  );
}

export interface GraphViewProps {
  nodes: CardFlowNode[];
  edges: Edge[];
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
  /** A completed React Flow gesture; incomplete connection state stays local. */
  onConnect: OnConnect;
  /** Runs before React Flow clears its transient connection state. */
  onConnectEnd: () => void;
  /** Complete an explicit modifier empty-drop at the preview's top-left position. */
  onCreateConnectedCard: (sourceId: string, position: LayoutPoint) => void;
  /** Exact neutral title shown by the transient empty-drop preview. */
  newCardTitle: string;
  /** Opening a card is a view gesture; the graph only reports which was picked. */
  onOpenCard: (cardId: string) => void;
  routes: readonly Route[];
  colorByRouteId: Readonly<Record<string, string>>;
  activeRouteId: string | null;
  activeRouteCardIds: ReadonlySet<string>;
}

export function GraphView({
  nodes,
  edges,
  activeCardId,
  presenting,
  editable,
  onNodesChange,
  onConnect,
  onConnectEnd,
  onCreateConnectedCard,
  newCardTitle,
  onOpenCard,
  routes,
  colorByRouteId,
  activeRouteId,
  activeRouteCardIds,
}: GraphViewProps) {
  const connectionGesture = useRef(false);
  const [modifierCreatesCard, setModifierCreatesCard] = useState(false);
  const [previewPointer, setPreviewPointer] = useState<LayoutPoint | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    const updateModifier = (event: KeyboardEvent) => {
      if (connectionGesture.current && event.key === 'Alt') {
        setModifierCreatesCard(event.type === 'keydown');
      }
    };
    window.addEventListener('keydown', updateModifier);
    window.addEventListener('keyup', updateModifier);
    return () => {
      window.removeEventListener('keydown', updateModifier);
      window.removeEventListener('keyup', updateModifier);
    };
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onConnect={onConnect}
      onConnectStart={(event) => {
        connectionGesture.current = true;
        setPreviewPointer(null);
        setModifierCreatesCard('altKey' in event && event.altKey);
      }}
      onConnectEnd={(event, connection) => {
        const createsCard =
          connection.fromNode !== null &&
          connection.toNode === null &&
          previewPointer !== null &&
          'altKey' in event &&
          'clientX' in event &&
          event.altKey;
        if (createsCard) {
          const sourceId = connection.fromNode.id;
          const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          const position = {
            x: pointer.x - CARD_SIZE.width / 2,
            y: pointer.y - CARD_SIZE.height / 2,
          };
          onCreateConnectedCard(sourceId, position);
          onConnectEnd();
        } else {
          onConnectEnd();
        }
        setModifierCreatesCard(false);
        setPreviewPointer(null);
        // React Flow dispatches the pointer-up node click after this callback.
        // Keep the guard through that event, then restore ordinary card opening.
        setTimeout(() => {
          connectionGesture.current = false;
        }, 0);
      }}
      // Clicking a card opens it to read — a gesture that belongs to the
      // overview. While presenting the canvas is the presentation, so a click
      // must not drop a reading panel over it.
      onNodeClick={(_event, node) => {
        if (!presenting && !connectionGesture.current) onOpenCard(node.id);
      }}
      fitView
      // While presenting the arrow keys are the walk's, so React Flow must not
      // also read them as moving or selecting a node.
      nodesDraggable={editable && !presenting}
      nodesFocusable={!presenting}
      elementsSelectable={!presenting}
      nodesConnectable={editable && !presenting}
      connectionMode={ConnectionMode.Loose}
      connectionLineStyle={{
        stroke: activeRouteColor(colorByRouteId, activeRouteId),
        strokeWidth: 3,
      }}
      connectionLineComponent={RouteConnectionLine}
      onMouseMove={(event) => {
        if (!connectionGesture.current) return;
        if (
          !(event.target instanceof Element) ||
          event.target.closest('.react-flow__renderer') === null ||
          event.target.closest('.react-flow__node') !== null
        ) {
          setPreviewPointer(null);
          return;
        }
        setPreviewPointer({ x: event.clientX, y: event.clientY });
        setModifierCreatesCard(event.altKey);
      }}
      edgesFocusable={false}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} />
      <Controls showInteractive={false} />
      {routes.length > 0 && (
        <RouteHud
          routes={routes}
          colorByRouteId={colorByRouteId}
          activeRouteId={activeRouteId}
          activeRouteCardIds={activeRouteCardIds}
        />
      )}
      <OverviewCamera presenting={presenting} />
      <PresentingCamera activeCardId={activeCardId} />
      <NewCardPreview title={newCardTitle} pointer={modifierCreatesCard ? previewPointer : null} />
    </ReactFlow>
  );
}
