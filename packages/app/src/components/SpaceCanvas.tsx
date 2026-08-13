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
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import type { LayoutPosition, Graph } from '@project/core';
import {
  edgeTypes,
  nodeTypes,
  GraphConnectionLine,
  GraphHud,
  type CardFlowNode,
} from '@project/react-flow-adapter';
import { activeGraphColor } from '../colors';
import { CARD_SIZE } from '../card';
import { newCardDrop, type ConnectionGesture, type DropTarget } from '../connection-gesture';
import { MAX_ZOOM, OVERVIEW_FIT } from '../camera';
import { OverviewCamera, PresentingCamera } from './cameras';

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
 *
 * The Edge description names no key, because `edgesFocusable` is false and an
 * Edge therefore never reaches the tab order to receive one. Selecting an Edge
 * leads nowhere — nothing acts on the selection — so opening the tab order to
 * every Edge in the graph would put inert stops between a keyboard user and the
 * next Card. A Card is the opposite case, and keeps its instructions.
 */
const ARIA_LABEL_CONFIG = {
  'node.a11yDescription.default':
    'Press enter or space to open a Card, the arrow keys to move it, and escape to cancel.',
  'node.a11yDescription.keyboardDisabled':
    'Press enter or space to open a Card, the arrow keys to move it, and escape to cancel.',
  'edge.a11yDescription.default': 'An Edge a Graph draws from one Card to the next.',
} as const;

/**
 * Which `DropTarget` the element under the pointer is. Both class names are
 * React Flow's published theming API.
 *
 * This is the DOM half of the question only — a connection target in range
 * outranks it, and both callers apply that precedence before asking
 * `newCardDrop`. Why neither half is sufficient alone is written out in
 * `connection-gesture.ts`.
 *
 * React Flow's own `connectionState.isValid` does not answer this: it is `null`
 * — falsy — whenever no handle is in range, which is exactly what a release over
 * the toolbar produces. The canonical add-node-on-edge-drop example would author
 * a Card there too.
 */
function dropTargetOf(target: EventTarget | null): DropTarget {
  if (!(target instanceof Element)) return 'off-canvas';
  if (target.closest('.react-flow__renderer') === null) return 'off-canvas';
  return target.closest('.react-flow__node') === null ? 'empty-canvas' : 'card';
}

/**
 * The Card an Alt-drop would author, drawn where it would land.
 *
 * The endpoint comes from `useConnection`, which converts it to flow coordinates
 * before handing it over — so this needs no `screenToFlowPosition` and no
 * viewport subscription to stay put under pan and zoom. Tracking the point in
 * `SpaceCanvas`'s own state instead re-rendered the whole flow on every pointer
 * frame of a connection.
 *
 * Both eligibility and position come from `newCardDrop`, which the release asks
 * as well: the ghost cannot appear where a release would refuse, and cannot land
 * anywhere but where a release would put it. Each selector stays primitive —
 * returning the assembled gesture from one `useConnection` would hand the store
 * a fresh object every frame.
 */
function NewCardPreview({
  title,
  modifierHeld,
  pointerOver,
  acceptsNewCardTarget,
}: {
  title: string;
  modifierHeld: boolean;
  pointerOver: DropTarget;
  acceptsNewCardTarget: (from: string) => boolean;
}) {
  const endpoint = useConnection((connection) => (connection.inProgress ? connection.to : null));
  const overNode = useConnection(
    (connection) => connection.inProgress && connection.toNode !== null,
  );
  const sourceId = useConnection((connection) =>
    connection.inProgress ? connection.fromNode.id : null,
  );
  const gesture: ConnectionGesture =
    endpoint === null || sourceId === null
      ? { kind: 'idle' }
      : {
          kind: 'dragging',
          sourceId,
          point: endpoint,
          over: overNode ? 'connection-target' : pointerOver,
          modifierHeld,
        };
  const drop = newCardDrop(gesture, acceptsNewCardTarget);
  if (drop === null) return null;
  const position = drop.position;

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

/**
 * The one unmodified authoring shortcut, named where it is bound.
 *
 * Exported so the control that announces it to a screen reader takes the key
 * from the handler that answers it rather than from a literal beside it: the
 * announcement and the binding are one fact, and two copies of it can drift
 * without anything failing.
 */
export const ADD_CARD_KEY = 'C';

export interface SpaceCanvasProps {
  nodes: CardFlowNode[];
  edges: Edge[];
  /** The Card the traversal has reached, or `null` in overview. */
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
  /** Card authoring is unavailable while another in-place surface owns focus. */
  titleEditingEnabled: boolean;
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
  onCreateConnectedCard: (sourceId: string, position: LayoutPosition) => void;
  /** Exact neutral title shown by the transient empty-drop preview. */
  newCardTitle: string;
  /**
   * Create a detached Card at the visible centre — the graph-focused `C`, whose
   * toolbar twin lives outside this component.
   */
  onAddCard: () => void;
  /**
   * The Card a completed creation asks to be named, or `null`.
   *
   * The identity, not a flag: each creation mints a fresh one, so a *change* is
   * what says a Card has just been created — which is how the naming
   * continuation survives being a prop rather than a command. A remount takes
   * nothing with it, because the initial state is whatever arrives with it.
   */
  nameOnCreation: string | null;
  /** Opening a card is a view gesture; the graph only reports which was picked. */
  onOpenCard: (cardId: string) => void;
  /** Complete one locally validated title draft, or return its field error. */
  onCompleteCardTitle: (cardId: string, title: string) => string | null;
  /** Which Cards resolve to content the opened editor can author. */
  editableCardIds: ReadonlySet<string>;
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  activeGraphId: string | null;
  activeGraphCardIds: ReadonlySet<string>;
}

export function SpaceCanvas({
  nodes,
  edges,
  activeCardId,
  presenting,
  editable,
  titleEditingEnabled,
  onNodesChange,
  onConnect,
  acceptsConnection,
  acceptsNewCardTarget,
  onConnectEnd,
  onCreateConnectedCard,
  newCardTitle,
  onAddCard,
  nameOnCreation,
  onOpenCard,
  onCompleteCardTitle,
  editableCardIds,
  graphs,
  colorByGraphId,
  activeGraphId,
  activeGraphCardIds,
}: SpaceCanvasProps) {
  const connectionGesture = useRef(false);
  const [modifierHeld, setModifierHeld] = useState(false);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(() => new Set());
  // Where the pointer is, not the point it is at: React bails out of an
  // unchanged state write, so a pointer moving across empty canvas no longer
  // re-renders the flow per frame.
  const [pointerOver, setPointerOver] = useState<DropTarget>('off-canvas');
  const [editingTitleCardId, setEditingTitleCardId] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  // One rule for every authoring control drawn on a Card — the title editor and
  // the Card affordance are offered and withdrawn together.
  const canAuthorCards = editable && titleEditingEnabled && !presenting;

  // A withdrawn editor does not come back on its own.
  //
  // `canAuthorCards` going false — presenting starts, a Card opens over the graph
  // — unmounts the editor along with the only controls that could settle a draft
  // it refused, so the Card it named is forgotten at that moment rather than
  // remembered until editing returns and reopened over a Card nobody asked to
  // rename. Adjusted during render rather than in an effect: this is React's
  // documented way to reset state on a changed input, and an effect would both
  // cost a second render and be rejected by lint.
  const [cardAuthoringWasEnabled, setCardAuthoringWasEnabled] = useState(canAuthorCards);
  if (cardAuthoringWasEnabled !== canAuthorCards) {
    setCardAuthoringWasEnabled(canAuthorCards);
    if (!canAuthorCards) setEditingTitleCardId(null);
  }

  // A created Card is named in place, in the editor that already exists for
  // renaming one. Adjusted during render for the same reason as the reset above
  // — React's documented way to react to a changed input, without the second
  // render an effect would cost — and driven by the identity changing rather
  // than by a request being raised and cleared, so nothing has to be handed
  // back once the naming is over.
  const [lastCreatedCardId, setLastCreatedCardId] = useState(nameOnCreation);
  if (lastCreatedCardId !== nameOnCreation) {
    setLastCreatedCardId(nameOnCreation);
    if (nameOnCreation !== null) setEditingTitleCardId(nameOnCreation);
  }

  useEffect(() => {
    const updateModifier = (event: KeyboardEvent) => {
      if (connectionGesture.current && event.key === 'Alt') {
        setModifierHeld(event.type === 'keydown');
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
  //
  // `editableNodes` is the known exception, and memoized does not mean cheap
  // there: it rebuilds every node's wrapper whenever `nodes` changes identity,
  // which a drag does per frame, so React Flow's per-node
  // `userNode === internals.userNode` fast path misses and all of them re-render
  // rather than the one being dragged. Correctness is unaffected. Closing it
  // needs a per-node cache or the callbacks moved into context — more machinery
  // than a ten-Card fixture asks for, so read it as a measured exception rather
  // than an oversight.
  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => acceptsConnection(connection.source, connection.target),
    [acceptsConnection],
  );

  const handleConnectStart = useCallback<OnConnectStart>((event) => {
    connectionGesture.current = true;
    setPointerOver('off-canvas');
    setModifierHeld('altKey' in event && event.altKey);
  }, []);

  const handleConnectEnd = useCallback<OnConnectEnd>(
    (event, connection) => {
      const drop =
        connection.fromNode === null || !('altKey' in event) || !('clientX' in event)
          ? null
          : newCardDrop(
              {
                kind: 'dragging',
                sourceId: connection.fromNode.id,
                point: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                over:
                  connection.toNode !== null
                    ? 'connection-target'
                    : // Resolved from the point rather than read off the event:
                      // `event.target` is only the released-over element because
                      // `XYHandle` happens not to capture the pointer, which is
                      // an implementation detail rather than a documented
                      // guarantee. `elementFromPoint` is what React Flow itself
                      // uses to resolve a drop target.
                      dropTargetOf(document.elementFromPoint(event.clientX, event.clientY)),
                modifierHeld: event.altKey,
              },
              acceptsNewCardTarget,
            );
      if (drop !== null) onCreateConnectedCard(drop.sourceId, drop.position);
      onConnectEnd();
      setModifierHeld(false);
      setPointerOver('off-canvas');
      // Lowered here rather than deferred past the pointer-up node click React
      // Flow dispatches after this callback. That deferral existed so the click
      // ending a connection drag could not open the Card just connected to; a
      // drag release produces a `click`, and no click opens a Card at all
      // (ADR 0036). The flag itself stays — the Alt listener and the
      // empty-canvas hover tracking read it, and neither concerns clicks.
      connectionGesture.current = false;
    },
    [screenToFlowPosition, onCreateConnectedCard, onConnectEnd, acceptsNewCardTarget],
  );

  // No pointer gesture on a Card's body opens it (ADR 0036). A click is left to
  // React Flow, which selects; the double click belongs to the title, which
  // centres in a Card and would otherwise be competing with the Card underneath
  // it for the same pixels. Opening is the affordance and the keyboard.

  const handleMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!connectionGesture.current) return;
    const over = dropTargetOf(event.target);
    setPointerOver(over);
    if (over === 'empty-canvas') setModifierHeld(event.altKey);
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (presenting || !(event.target instanceof Element)) return;
      if (event.key === 'Enter' || event.key === ' ') {
        const card = event.target.closest<HTMLElement>('.react-flow__node[data-id]');
        if (card === null || !event.currentTarget.contains(card)) return;
        const cardId = card.dataset['id'];
        if (cardId === undefined) return;
        event.preventDefault();
        onOpenCard(cardId);
        return;
      }
      // `C` adds a Card, and it is the only unmodified authoring shortcut there
      // is. Answered here rather than on the window, so "graph focused" is a
      // fact about where the event came from rather than a guess: this handler
      // sits on React Flow's own wrapper, so a key pressed in the toolbar, in a
      // pane over the graph or in the Cards View never reaches it.
      //
      // Three exclusions, and each names a different way the key is not a
      // command. A modifier makes it a browser or OS shortcut. A repeat is one
      // press held down, and a command runs once per press. And a text control
      // is somewhere the author is *typing* a c — the inline title editor stops
      // its own key events before they get here, so this covers whatever text
      // entry the canvas gains next rather than a case that exists today.
      if (event.key.toUpperCase() !== ADD_CARD_KEY) return;
      // `shiftKey` belongs here for a reason the others do not share: matching
      // case-insensitively is what lets Caps Lock work, and it lets Shift
      // through in the same breath, since both arrive as `C`. Only the flag
      // tells them apart — Caps Lock changes the character and never sets it.
      // Without this the toolbar announces `aria-keyshortcuts="C"`, which ARIA
      // defines as the unmodified key, while the canvas answers Shift+C too.
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.target.closest('input, textarea, [contenteditable="true"]') !== null) return;
      // The default is prevented only where the command can actually run
      // (`AGENTS.md`'s keyboard contract), so a `c` typed while authoring is
      // withdrawn is left to whatever else would have had it.
      if (!canAuthorCards) return;
      event.preventDefault();
      onAddCard();
    },
    [presenting, onOpenCard, canAuthorCards, onAddCard],
  );

  // `F2` renames the selected Card, and this is the *only* handler that answers
  // it. A React Flow `onKeyDown` branch used to answer it first and ask nothing
  // about the target, so the key typed into a control renamed whichever Card
  // happened to be selected — a different one, once focus had moved. Two
  // handlers for one key means one of them is the unguarded one; don't add a
  // second back.
  useEffect(() => {
    if (!canAuthorCards) return;
    const beginSelectedTitleEdit = (event: KeyboardEvent): void => {
      if (event.key !== 'F2') return;
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, button, [contenteditable="true"]') !== null
      ) {
        return;
      }
      const selected = nodes.find((node) => node.selected);
      if (selected === undefined) return;
      event.preventDefault();
      setEditingTitleCardId(selected.id);
    };
    window.addEventListener('keydown', beginSelectedTitleEdit);
    return () => window.removeEventListener('keydown', beginSelectedTitleEdit);
  }, [canAuthorCards, nodes]);

  const editableNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          // Two controls, two flags. The title's double click is offered on
          // every Card; the affordance only on one that owns content to edit.
          titleEditingEnabled: canAuthorCards,
          cardEditingEnabled: canAuthorCards && editableCardIds.has(node.id),
          editingTitle: canAuthorCards && node.id === editingTitleCardId,
          onEditCard: () => onOpenCard(node.id),
          onBeginTitleEditing: () => setEditingTitleCardId(node.id),
          onCompleteTitleEditing: (title: string) => {
            const error = onCompleteCardTitle(node.id, title);
            if (error === null) setEditingTitleCardId(null);
            return error;
          },
          onCancelTitleEditing: () => setEditingTitleCardId(null),
        },
      })),
    [nodes, canAuthorCards, editableCardIds, editingTitleCardId, onCompleteCardTitle, onOpenCard],
  );

  const connectionLineStyle = useMemo(
    () => ({
      stroke: activeGraphColor(colorByGraphId, activeGraphId),
      strokeWidth: 3,
    }),
    [activeGraphId, colorByGraphId],
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
      nodes={editableNodes}
      edges={selectableEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={handleEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onConnectStart={handleConnectStart}
      onConnectEnd={handleConnectEnd}
      onKeyDown={handleKeyDown}
      fitView
      fitViewOptions={OVERVIEW_FIT}
      // Double click on a title renames the Card (ADR 0036); opening is reached
      // through the Card's own control or the keyboard. React Flow's own
      // double-click zoom would fire underneath the rename — its filter exempts
      // only `.nopan`, which a Card is not. Off for the whole canvas rather than
      // per node, so the gesture does not change meaning two pixels away from a
      // Card.
      zoomOnDoubleClick={false}
      // While presenting the arrow keys control traversal, so React Flow must not
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
      // authoring handles refuse via `isConnectableEnd` and the graph ports via
      // `pointer-events: none` — so it advertised a capability the design forbids.
      connectionLineStyle={connectionLineStyle}
      connectionLineComponent={GraphConnectionLine}
      onMouseMove={handleMouseMove}
      edgesFocusable={false}
      minZoom={0.2}
      // Presenting draws one card full-screen, which is far closer than React
      // Flow's default ceiling of 2. See `MAX_ZOOM` — without it the camera sits
      // outside its own extent and the first wheel tick yanks it back.
      maxZoom={MAX_ZOOM}
    >
      <Background gap={24} />
      <Controls showInteractive={false} />
      {graphs.length > 0 && (
        <GraphHud
          graphs={graphs}
          colorByGraphId={colorByGraphId}
          activeGraphId={activeGraphId}
          activeGraphCardIds={activeGraphCardIds}
        />
      )}
      <OverviewCamera presenting={presenting} />
      <PresentingCamera activeCardId={activeCardId} />
      <NewCardPreview
        title={newCardTitle}
        modifierHeld={modifierHeld}
        pointerOver={pointerOver}
        acceptsNewCardTarget={acceptsNewCardTarget}
      />
    </ReactFlow>
  );
}
