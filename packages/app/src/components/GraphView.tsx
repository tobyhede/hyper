import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ViewportPortal,
  useConnection,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type NodeMouseHandler,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type OnEdgesChange,
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
 * How the overview frames the graph, shared by the `fitView` prop and the camera.
 *
 * `maxZoom` caps the fit at natural size. Without it React Flow's default max of
 * 2 applies, and a space with a single card — which is what a new space is (ADR
 * 0018) — gets scaled to 2x and fills the screen. Padding does not help: it
 * reserves margin, it does not cap zoom. The prop-driven first fit and the
 * camera's own must agree, or the one-card space fits at 2x and is then animated
 * back out.
 */
const OVERVIEW_FIT = { padding: 0.2, maxZoom: 1 } as const;

/**
 * What the graph tells assistive technology it can do — minus the delete.
 *
 * React Flow's defaults offer "Press delete to remove it" for both a node and an
 * edge. Hyper has no delete Edit: the key is inert, because a removal applied to
 * the live node array is undone by the next projection sync. Sighted users never
 * meet the claim; a screen reader reads it out as the way to work with a Card.
 *
 * Both node keys are set because React Flow picks between them on
 * `disableKeyboardA11y`, and the one it names `keyboardDisabled` is the one an
 * ordinary keyboard-enabled graph gets.
 */
const ARIA_LABEL_CONFIG = {
  'node.a11yDescription.default':
    'Press enter or space to open a Card, the arrow keys to move it, and escape to cancel.',
  'node.a11yDescription.keyboardDisabled':
    'Press enter or space to open a Card, the arrow keys to move it, and escape to cancel.',
  'edge.a11yDescription.default': 'Press enter or space to select an Edge, and escape to cancel.',
} as const;

/**
 * The empty canvas an Alt-drop may author a Card on: inside the renderer, clear
 * of every node. Both class names are React Flow's published theming API.
 *
 * The live preview and the release must ask the same question. The preview's
 * point is tracked from `onMouseMove`, which is bound to the React Flow element
 * and therefore stops firing the moment the pointer leaves it — so a pointer
 * that departs over the toolbar leaves the last eligible point standing. Judging
 * the release by that stale point authored a Card wherever the pointer happened
 * to be let go, off-canvas and far from the preview the author could see.
 *
 * React Flow's own `connectionState.isValid` does not answer this: it is `null`
 * — falsy — whenever no handle is in range, which is exactly what a release over
 * the toolbar produces. The canonical add-node-on-edge-drop example would author
 * a Card there too.
 */
function isEmptyCanvasTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('.react-flow__renderer') !== null &&
    target.closest('.react-flow__node') === null
  );
}

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
    void fitView({ ...OVERVIEW_FIT, duration: 400 });
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

/**
 * The Card an Alt-drop would author, drawn where it would land.
 *
 * The endpoint comes from `useConnection`, which converts it to flow coordinates
 * before handing it over — so this needs no `screenToFlowPosition` and no
 * viewport subscription to stay put under pan and zoom. Tracking the point in
 * `GraphView`'s own state instead re-rendered the whole flow on every pointer
 * frame of a connection.
 */
function NewCardPreview({
  title,
  active,
  acceptsNewCardTarget,
}: {
  title: string;
  active: boolean;
  acceptsNewCardTarget: (from: string) => boolean;
}) {
  const endpoint = useConnection((connection) => (connection.inProgress ? connection.to : null));
  const overNode = useConnection(
    (connection) => connection.inProgress && connection.toNode !== null,
  );
  const sourceId = useConnection((connection) =>
    connection.inProgress ? connection.fromNode.id : null,
  );
  if (
    !active ||
    endpoint === null ||
    overNode ||
    sourceId === null ||
    !acceptsNewCardTarget(sourceId)
  ) {
    return null;
  }
  const position = {
    x: endpoint.x - CARD_SIZE.width / 2,
    y: endpoint.y - CARD_SIZE.height / 2,
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
  /**
   * Whether an Edge between these two Cards is acceptable as things stand. Asked
   * during the drag so a target that cannot take the Edge says so before the
   * author lets go, and asked again by the editor on release.
   */
  acceptsConnection: (from: string, to: string) => boolean;
  /** Whether this Card may create and connect a new Card on an Alt/Option empty-drop. */
  acceptsNewCardTarget: (from: string) => boolean;
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
  acceptsConnection,
  acceptsNewCardTarget,
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
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(() => new Set());
  // A boolean, not a point: React bails out of an unchanged state write, so a
  // pointer moving across empty canvas no longer re-renders the flow per frame.
  const [overEmptyCanvas, setOverEmptyCanvas] = useState(false);
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

  // Every handler and object below is memoized because React Flow's own docs
  // carry a warning about it: props recreated each render can drive it into a
  // re-render loop. `onMouseMove` is the hot one — it runs per pointer frame
  // during a connection.
  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => acceptsConnection(connection.source, connection.target),
    [acceptsConnection],
  );

  const handleConnectStart = useCallback<OnConnectStart>((event) => {
    connectionGesture.current = true;
    setOverEmptyCanvas(false);
    setModifierCreatesCard('altKey' in event && event.altKey);
  }, []);

  const handleConnectEnd = useCallback<OnConnectEnd>(
    (event, connection) => {
      const createsCard =
        connection.fromNode !== null &&
        connection.toNode === null &&
        acceptsNewCardTarget(connection.fromNode.id) &&
        'altKey' in event &&
        'clientX' in event &&
        event.altKey &&
        // Resolved from the point rather than read off the event: `event.target`
        // is only the released-over element because `XYHandle` happens not to
        // capture the pointer, which is an implementation detail rather than a
        // documented guarantee. `elementFromPoint` is what React Flow itself
        // uses to resolve a drop target.
        isEmptyCanvasTarget(document.elementFromPoint(event.clientX, event.clientY));
      if (createsCard) {
        const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        onCreateConnectedCard(connection.fromNode.id, {
          x: pointer.x - CARD_SIZE.width / 2,
          y: pointer.y - CARD_SIZE.height / 2,
        });
      }
      onConnectEnd();
      setModifierCreatesCard(false);
      setOverEmptyCanvas(false);
      // React Flow dispatches the pointer-up node click after this callback.
      // Keep the guard through that event, then restore ordinary card opening.
      setTimeout(() => {
        connectionGesture.current = false;
      }, 0);
    },
    [screenToFlowPosition, onCreateConnectedCard, onConnectEnd, acceptsNewCardTarget],
  );

  // Clicking a card opens it to read — a gesture that belongs to the overview.
  // While presenting the canvas is the presentation, so a click must not drop a
  // reading panel over it.
  const handleNodeClick = useCallback<NodeMouseHandler<CardFlowNode>>(
    (_event, node) => {
      if (!presenting && !connectionGesture.current) onOpenCard(node.id);
    },
    [presenting, onOpenCard],
  );

  const handleMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!connectionGesture.current) return;
    const empty = isEmptyCanvasTarget(event.target);
    setOverEmptyCanvas(empty);
    if (empty) setModifierCreatesCard(event.altKey);
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (presenting || (event.key !== 'Enter' && event.key !== ' ')) return;
      if (!(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>('.react-flow__node[data-id]');
      if (card === null || !event.currentTarget.contains(card)) return;
      const cardId = card.dataset['id'];
      if (cardId === undefined) return;
      event.preventDefault();
      onOpenCard(cardId);
    },
    [presenting, onOpenCard],
  );

  const connectionLineStyle = useMemo(
    () => ({
      stroke: activeRouteColor(colorByRouteId, activeRouteId),
      strokeWidth: 3,
    }),
    [activeRouteId, colorByRouteId],
  );

  const selectableEdges = useMemo(
    () => edges.map((edge) => ({ ...edge, selected: selectedEdgeIds.has(edge.id) })),
    [edges, selectedEdgeIds],
  );
  const handleEdgesChange = useCallback<OnEdgesChange>(
    (changes) => {
      const selections = changes.filter(
        (change): change is Extract<EdgeChange<Edge>, { type: 'select' }> =>
          change.type === 'select',
      );
      if (selections.length === 0) return;
      setSelectedEdgeIds((selected) => {
        const currentEdgeIds = new Set(edges.map((edge) => edge.id));
        const next = new Set([...selected].filter((id) => currentEdgeIds.has(id)));
        for (const change of selections) {
          if (change.selected) next.add(change.id);
          else next.delete(change.id);
        }
        return next;
      });
    },
    [edges],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={selectableEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={handleEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onConnectStart={handleConnectStart}
      onConnectEnd={handleConnectEnd}
      onNodeClick={handleNodeClick}
      onKeyDown={handleKeyDown}
      fitView
      fitViewOptions={OVERVIEW_FIT}
      // While presenting the arrow keys are the walk's, so React Flow must not
      // also read them as moving or selecting a node.
      nodesDraggable={editable && !presenting}
      nodesFocusable={!presenting}
      elementsSelectable={!presenting}
      nodesConnectable={editable && !presenting}
      ariaLabelConfig={ARIA_LABEL_CONFIG}
      // Deletion is not built. React Flow's default would apply a removal to the
      // live node array with no completed Edit behind it — inert today only
      // because the next projection sync restores the Card.
      deleteKeyCode={null}
      // No `connectionMode`: the default is Strict, and every legal drop here is
      // already source-to-target. Loose only adds source-to-source, which the
      // authoring handles refuse via `isConnectableEnd` and the route ports via
      // `pointer-events: none` — so it advertised a capability the design forbids.
      connectionLineStyle={connectionLineStyle}
      connectionLineComponent={RouteConnectionLine}
      onMouseMove={handleMouseMove}
      edgesFocusable={false}
      minZoom={0.2}
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
      <NewCardPreview
        title={newCardTitle}
        active={modifierCreatesCard && overEmptyCanvas}
        acceptsNewCardTarget={acceptsNewCardTarget}
      />
    </ReactFlow>
  );
}
