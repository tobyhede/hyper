import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Background,
  ReactFlow,
  type Edge,
  type OnEdgesChange,
  type OnNodesChange,
  useReactFlow,
} from '@xyflow/react';
import { uuidSchema, type Card, type CardId, type Graph, type GraphId } from '@project/core';
import type { SpaceSession } from '@project/persistence';
import {
  nodeTypes,
  GraphConnectionLine,
  GraphHud,
  ZoomSlider,
  type CardFlowNode,
} from '@project/react-flow-adapter';
import { activeGraphColor } from '../colors';
import { describeAuthoringRefusal } from '../authoring-refusal';
import { useCanvasCardAuthoring } from '../canvas-card-authoring';
import { useEdgeAuthoring } from '../edge-authoring-react';
import type { EdgeAuthoring } from '../edge-authoring';
import type { CanvasSelection, CardResize, EdgeSubject } from '../render-adapter';
import type { SpaceAuthoring } from '../space-authoring';
import { MAX_ZOOM, OVERVIEW_FIT } from '../camera';
import { CARD_SIZE } from '../card';
import { CARD_DRAG_TYPE } from './CardsDrawer';
import { OverviewCamera, PresentingCamera } from './cameras';

/**
 * What the graph tells assistive technology it can do.
 *
 * React Flow's defaults describe its own local deletion. Hyper instead routes
 * both Cards and Edges through the completed Space Edit lifecycle, so these
 * labels describe the application-owned commands rather than a local array
 * mutation.
 *
 * Both node keys are set because React Flow picks between them on
 * `disableKeyboardA11y`, and the one it names `keyboardDisabled` is the one an
 * ordinary keyboard-enabled graph gets.
 */
const ARIA_LABEL_CONFIG = {
  'node.a11yDescription.default':
    'Press enter or space to open a Card, backspace or delete to remove it from this Layout, the arrow keys to move it, and escape to cancel.',
  'node.a11yDescription.keyboardDisabled':
    'Press enter or space to open a Card, backspace or delete to remove it from this Layout, the arrow keys to move it, and escape to cancel.',
  'edge.a11yDescription.default':
    'Press backspace or delete to remove this Edge from its Graph, or escape to deselect it.',
} as const;

/**
 * The one unmodified authoring shortcut, named where it is bound.
 *
 * Exported so the control that announces it to a screen reader takes the key
 * from the handler that answers it rather than from a literal beside it: the
 * announcement and the binding are one fact, and two copies of it can drift
 * without anything failing.
 */
export const ADD_CARD_KEY = 'C';

/**
 * Where an unmodified letter is somebody else's, not the canvas's command.
 *
 * One selector for both shortcuts, because the two answers have to agree: `C`
 * and `F2` are pressed on the same tree, and a control missing from one list and
 * present in the other makes the same element a command target for one key and
 * not for the other. They disagreed — `C` named only text entry — and the canvas
 * zoom controls render *inside* the wrapper both are bound to, so a `c` with
 * Zoom in focused added a Card.
 *
 * `button` and `select` are here for a different reason from `input`,
 * `textarea` and `contenteditable`: those are places an author is typing the
 * letter, while a button is a control with a keyboard model of its own that the
 * canvas must not shadow. Both are cases where the key was not aimed here.
 *
 * **`.nokey` is the first entry and the load-bearing one.** Every portalled and
 * chrome surface in the tree already marks itself with it for React Flow's own
 * `useKeyPress` subscriptions, whose `isInputDOMNode` walks `closest('.nokey')`.
 * Reading the same marker is what stops this list drifting into a second,
 * hand-maintained copy of an exclusion the components already declare: a
 * surface has to opt out once, not once per listener. The roles below stay for
 * the surfaces that carry no marker of their own — `CardSearchCombobox`'s popup
 * is `role="presentation"`, not `dialog`, because its input sits outside the
 * popup, so the marker rather than a role is what covers it.
 */
const NOT_A_CANVAS_COMMAND =
  '.nokey, input, textarea, select, button, [contenteditable="true"], [role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], [data-sidebar]';

/**
 * The Card a key came from, or `null` if it came from anywhere else.
 *
 * Answered from the projection rather than from the DOM id alone, which is what
 * keeps a second canvas's node — a story, a catalogue page — from naming a Card
 * this renderer is not drawing.
 */
const focusedCard = (target: Element, nodes: readonly CardFlowNode[]): CardId | null => {
  const element = target.closest<HTMLElement>('.react-flow__node[data-id]');
  if (element === null) return null;
  const id = element.dataset['id'];
  return nodes.find((node) => node.id === id)?.data.cardId ?? null;
};

export interface SpaceCanvasProps {
  nodes: CardFlowNode[];
  edges: Edge[];
  /** The next projection, merged in by a completed connection so its Edge draws. */
  projectedNodes: readonly CardFlowNode[] | null;
  /** The Card the traversal has reached, or `null` in overview. */
  activeCardId: string | null;
  presenting: boolean;
  /**
   * Whether there are Cards on the canvas to drag yet: false for the one frame before
   * the layout resolves, true afterwards, for every view. Every view is editable
   * (ADR 0025) — an automatic one gets its Layout by being edited — so this is a
   * readiness gate and not a permission. Not an edit mode either: there is
   * nothing to toggle and nothing to keep in sync.
   */
  editable: boolean;
  /**
   * Whether the graph is uncovered — no modal pane is open over it.
   *
   * **Named for the first control it took away, and read by all of them.** `App`
   * passes `openedCardId === null && !creatingAlias`, and both of those are a
   * `CardPane`: `role="dialog" aria-modal="true"`, a backdrop across the whole
   * graph area, and a focus trap. So this says nothing about titles — it says
   * one authoring surface at a time, the same rule `AddCardControl` is
   * withdrawn on. The name is stale vocabulary rather than a second concept;
   * renaming it is its own change (`docs/agents/workflow.md`).
   */
  titleEditingEnabled: boolean;
  onNodesChange: OnNodesChange<CardFlowNode>;
  onEdgesChange: OnEdgesChange;
  /** The whole Edge interaction lifecycle, which this canvas composes rather than interprets. */
  edgeAuthoring: EdgeAuthoring;
  selection: CanvasSelection;
  onSelectCard: (cardId: CardId) => void;
  onSelectEdge: (subject: EdgeSubject) => void;
  /** The Cards this renderer's subject holds — what an Edge picker may offer. */
  subjectCards: readonly Card[];
  /** Exact neutral title shown by the transient empty-drop preview. */
  newCardTitle: string;
  /**
   * Create a detached Card at the visible centre — the graph-focused `C`, whose
   * toolbar twin lives outside this component.
   */
  onAddCard: () => void;
  /** Complete an external Cards View drop at an authored top-left anchor. */
  onAddExistingCard: (cardId: CardId, anchor: { readonly x: number; readonly y: number }) => void;
  /**
   * The Card a completed creation asks to be named, or `null`.
   *
   * The identity, not a flag: each creation mints a fresh one, so a *change* is
   * what says a Card has just been created — which is how the naming
   * continuation survives being a prop rather than a command. A remount takes
   * nothing with it, because the initial state is whatever arrives with it.
   */
  nameOnCreation: string | null;
  authoring: SpaceAuthoring;
  spaceSession: SpaceSession;
  onOpenAlias: (cardId: CardId) => void;
  /**
   * Whether a content edit is running, for the one control outside this canvas
   * that has to know: Present.
   *
   * Presenting replaces the Card with its content rather than drawing content on
   * it, so an editor cannot survive it and the draft would go with no exit
   * spent. The caret stays this component's (`spec.md` §6) — what leaves is the
   * one bit a sibling surface needs to stay out of the way.
   */
  onBodyEditingChange?: (editing: boolean) => void;
  /** Reports the Card title draft so sibling naming surfaces stay withdrawn. */
  onTitleEditingChange?: (editing: boolean) => void;
  cardResize: CardResize;
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  activeGraphId: GraphId | null;
  activeGraphCardIds: ReadonlySet<string>;
}

export function SpaceCanvas({
  nodes,
  edges,
  projectedNodes,
  activeCardId,
  presenting,
  editable,
  titleEditingEnabled,
  onNodesChange,
  onEdgesChange,
  edgeAuthoring,
  selection,
  onSelectCard,
  onSelectEdge,
  subjectCards,
  newCardTitle,
  onAddCard,
  onAddExistingCard,
  nameOnCreation,
  authoring,
  spaceSession,
  onOpenAlias,
  onBodyEditingChange,
  onTitleEditingChange,
  cardResize,
  graphs,
  colorByGraphId,
  activeGraphId,
  activeGraphCardIds,
}: SpaceCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  /**
   * Whether a drag may begin at a Card's authoring handles.
   *
   * **The one authoring gesture presenting does not withdraw**, and the reason
   * is a product decision rather than an oversight: the presenting chrome
   * enumerates the active Card's outgoing Edges at render time precisely so an
   * Edge drawn from the presented Card is a move the presenter can take without
   * leaving the presentation (ADR 0027, and the `moves()` note in `docs/agents/rendering.md`).
   * `editing.spec.ts` authors a self-Edge mid-presentation and asserts the
   * chrome offers it.
   *
   * A pane is different, and so is a canvas with no Cards on it yet — one covers
   * the graph, the other has nowhere to write.
   */
  const canConnectOnCanvas = editable && titleEditingEnabled;
  /**
   * One rule for everything this canvas authors — the Card controls *and* the
   * whole Edge lifecycle.
   *
   * The three conditions are three ways there is nothing to author: no Cards on
   * the canvas to write into, a modal pane covering the graph, and a
   * presentation running. `AddCardControl` in the toolbar is withdrawn on
   * exactly these, and so is every control drawn on a Card.
   *
   * **Edge authoring was the one thing reading a shorter rule**, and the gap was
   * not cosmetic. A pane covering the canvas must withdraw its keyboard
   * commands as well as its spatial gestures. The Card controls and Edge
   * lifecycle agree here, and `edge-authoring-react.test.tsx` holds them to it.
   */
  const cardAuthoring = useCanvasCardAuthoring({
    nodes,
    editable,
    presenting,
    enabled: titleEditingEnabled,
    nameOnCreation,
    authoring,
    spaceSession,
    cardResize,
    onOpenAlias,
    onSelectCard,
    onBodyEditingChange,
    onTitleEditingChange,
  });
  const { bodyEditing, canAuthorOnCanvas, openCard: onOpenCard, beginTitleEditing } = cardAuthoring;

  const edgeSurface = useEdgeAuthoring({
    authoring: edgeAuthoring,
    edges,
    projectedNodes,
    selection,
    activeGraphId,
    graphs,
    subjectCards,
    newCardTitle,
    enabled: canAuthorOnCanvas,
    onSelectCard,
    onSelectEdge,
  });

  // Every handler and object below is memoized because React Flow's own docs
  // carry a warning about it: props recreated each render can drive it into a
  // re-render loop.
  //
  // `editableNodes` is the known exception, and memoized does not mean cheap
  // there: it rebuilds every node's wrapper whenever `nodes` changes identity,
  // which a drag does per frame, so React Flow's per-node
  // `userNode === internals.userNode` fast path misses and all of them re-render
  // rather than the one being dragged. Correctness is unaffected. Closing it
  // needs a per-node cache or the callbacks moved into context — more machinery
  // than a ten-Card fixture asks for, so read it as a measured exception rather
  // than an oversight.

  // No pointer gesture on a Card's body opens it (ADR 0036). A click is left to
  // React Flow, which selects; the Title is its own one-activation control
  // (ADR 0065), whose events stop before this canvas handler. Opening is the
  // affordance and the Card-level keyboard command.

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (presenting || !(event.target instanceof Element)) return;
      if (event.key === 'Enter' || event.key === ' ') {
        if (bodyEditing) return;
        // The same exclusion the `C` branch below makes, and now load-bearing
        // rather than defensive: an Expanded Card draws its editor *inside* the
        // node, so a Space typed into it would otherwise be cancelled here
        // before the document ever received the character.
        if (event.target.closest(NOT_A_CANVAS_COMMAND) !== null) return;
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
      if (event.target.closest(NOT_A_CANVAS_COMMAND) !== null) return;
      // The default is prevented only where the command can actually run
      // (`docs/agents/rendering.md`'s keyboard contract), so a `c` typed while authoring is
      // withdrawn is left to whatever else would have had it.
      if (!canAuthorOnCanvas || bodyEditing) return;
      event.preventDefault();
      onAddCard();
    },
    [presenting, onOpenCard, canAuthorOnCanvas, bodyEditing, onAddCard],
  );

  // `F2` renames the selected Card, and this is the *only* handler that answers
  // it. A React Flow `onKeyDown` branch used to answer it first and ask nothing
  // about the target, so the key typed into a control renamed whichever Card
  // happened to be selected — a different one, once focus had moved. Two
  // handlers for one key means one of them is the unguarded one; don't add a
  // second back.
  useLayoutEffect(() => {
    if (!canAuthorOnCanvas || bodyEditing) return;
    const beginSelectedTitleEdit = (event: KeyboardEvent): void => {
      if (event.key !== 'F2') return;
      if (event.target instanceof Element && event.target.closest(NOT_A_CANVAS_COMMAND) !== null) {
        return;
      }
      const selected = nodes.find((node) => node.selected);
      if (selected === undefined) return;
      event.preventDefault();
      beginTitleEditing(selected.id);
    };
    window.addEventListener('keydown', beginSelectedTitleEdit);
    return () => window.removeEventListener('keydown', beginSelectedTitleEdit);
  }, [canAuthorOnCanvas, bodyEditing, nodes, beginTitleEditing]);

  // The operations, not the surface holding them: `useEdgeAuthoring` answers a
  // fresh object literal per render while each of these is stable, and a hook
  // that depended on the object would be rebuilt every time.
  const deleteEdges = edgeSurface.deleteEdges;
  const editableNodes = cardAuthoring.nodes;
  const canvasRef = useRef<HTMLDivElement>(null);

  /**
   * What a refused canvas command left the author with, or `null`.
   *
   * The Edge half of this key has surfaces of its own to land a refusal on —
   * the selected Edge's controls and its endpoint editor. The Card half has
   * none: the press is over and the Card it named may not even be on screen, so
   * this sentence is the whole of what the author is told. It is the same case
   * `edge-authoring-react.tsx` calls a `gesture` refusal, and it shares that
   * announcement's placement.
   */
  const [commandRefusal, setCommandRefusal] = useState<string | null>(null);
  // A refusal names the selection it was made against, so a selection that moves
  // takes it with it — the same rule Edge Authoring applies to a retained
  // `deletion` refusal. Adjusted during render rather than in an effect, the way
  // `canvas-card-authoring.ts` drops a caret when authoring is withdrawn: the
  // stale sentence never reaches the DOM, and no cascading render is scheduled.
  const [refusalSelection, setRefusalSelection] = useState(selection);
  if (refusalSelection !== selection) {
    setRefusalSelection(selection);
    setCommandRefusal(null);
  }

  const latestDeletion = useRef({
    authoring,
    bodyEditing,
    canAuthorOnCanvas,
    deleteEdges,
    edges: edgeSurface.edges,
    nodes,
    selection,
  });
  // A native event can arrive after commit but before passive effects. Refresh
  // the snapshot in the synchronous commit phase so the stable listener cannot
  // act on the previous selection or refusal state.
  useLayoutEffect(() => {
    latestDeletion.current = {
      authoring,
      bodyEditing,
      canAuthorOnCanvas,
      deleteEdges,
      edges: edgeSurface.edges,
      nodes,
      selection,
    };
  }, [authoring, bodyEditing, canAuthorOnCanvas, deleteEdges, edgeSurface.edges, nodes, selection]);

  useEffect(() => {
    const deleteSelection = (event: KeyboardEvent): void => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      // The two exclusions the `C` binding above spells out, for the reasons it
      // gives: a command runs once per press, and a modifier makes the key a
      // browser or OS shortcut rather than this canvas's. `shiftKey` is in the
      // list for a plainer reason than it is up there — the key is already the
      // same key, so Shift only makes a chord this canvas never advertised, and
      // one that belongs to somebody else in several places a browser runs.
      // Nothing here holds Shift either: `selectionKeyCode` and
      // `multiSelectionKeyCode` are both `null`.
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(NOT_A_CANVAS_COMMAND) !== null) return;
      if (canvasRef.current?.contains(event.target) !== true) return;
      const current = latestDeletion.current;
      if (!current.canAuthorOnCanvas || current.bodyEditing) return;
      // The Card the key was *aimed at* wins over the one selected before it.
      // React Flow never selects a node on focus — its `onFocus` only auto-pans
      // — and only the Edge half of this canvas bridges the two, so a Tab to
      // another Card leaves the selection behind while that Card's assistive
      // description promises Delete removes *it*. The open branch above already
      // resolves its Card this way; the selection is the fallback for a press
      // that came from the pane rather than from a node.
      const focusedCardId = focusedCard(event.target, current.nodes);
      const { selection } = current;
      const cardId = focusedCardId ?? (selection.kind === 'card' ? selection.cardId : null);
      if (cardId !== null) {
        event.preventDefault();
        const result = current.authoring.complete({
          kind: 'removed-card-from-layout',
          cardId,
        });
        setCommandRefusal(
          result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null,
        );
        return;
      }
      if (selection.kind === 'edge') {
        const selectedEdges = current.edges.filter((edge) => edge.selected);
        if (selectedEdges.length === 0) return;
        event.preventDefault();
        current.deleteEdges(selectedEdges);
      }
    };
    window.addEventListener('keydown', deleteSelection);
    return () => window.removeEventListener('keydown', deleteSelection);
  }, []);

  const connectionLineStyle = useMemo(
    () => ({
      stroke: activeGraphColor(colorByGraphId, activeGraphId),
      strokeWidth: 3,
    }),
    [activeGraphId, colorByGraphId],
  );

  const {
    onConnect,
    onConnectStart,
    onConnectEnd,
    isValidConnection,
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
    onMouseMove,
    edgesReconnectable,
    edgesFocusable,
    deleteKeyCode,
    multiSelectionKeyCode,
    selectionKeyCode,
    selectionOnDrag,
  } = edgeSurface.reactFlowProps;

  const onExternalDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!canAuthorOnCanvas || !event.dataTransfer.types.includes(CARD_DRAG_TYPE)) return;
      if (!(event.target instanceof Element) || event.target.closest('.react-flow__pane') === null)
        return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    [canAuthorOnCanvas],
  );

  const onExternalDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!canAuthorOnCanvas || !(event.target instanceof Element)) return;
      if (event.target.closest('.react-flow__pane') === null) return;
      const cardId = uuidSchema.safeParse(event.dataTransfer.getData(CARD_DRAG_TYPE));
      if (!cardId.success) return;
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onAddExistingCard(cardId.data, {
        x: point.x - CARD_SIZE.width / 2,
        y: point.y - CARD_SIZE.height / 2,
      });
    },
    [canAuthorOnCanvas, onAddExistingCard, screenToFlowPosition],
  );

  return edgeSurface.provide(
    <ReactFlow
      ref={canvasRef}
      nodes={editableNodes}
      edges={edgeSurface.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeSurface.edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      // Edge Authoring's own properties, named one by one rather than spread, so
      // no property order below can silently replace one of its handlers.
      onConnect={onConnect}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      isValidConnection={isValidConnection}
      onReconnectStart={onReconnectStart}
      onReconnect={onReconnect}
      onReconnectEnd={onReconnectEnd}
      onMouseMove={onMouseMove}
      onDragOver={onExternalDragOver}
      onDrop={onExternalDrop}
      edgesReconnectable={edgesReconnectable}
      edgesFocusable={edgesFocusable}
      // Passed through rather than copied: `useKeyPress` has this value in the
      // dependency array of its listener effect, so a fresh array per render
      // re-attaches React Flow's `keydown`/`keyup` on `document`.
      deleteKeyCode={deleteKeyCode}
      multiSelectionKeyCode={multiSelectionKeyCode}
      selectionKeyCode={selectionKeyCode}
      selectionOnDrag={selectionOnDrag}
      onKeyDown={handleKeyDown}
      // Programmatically focusable, and deliberately not a tab stop. React Flow's
      // native Edge Escape calls `blur()`, which leaves focus on `body` — not an
      // authoring context — and its pane carries no `tabindex`, so there is
      // nothing for the repair to focus without this. Negative, so the canvas
      // never becomes a stop a keyboard author has to pass through.
      tabIndex={-1}
      fitView
      fitViewOptions={OVERVIEW_FIT}
      // Nothing on a Card answers a double click. ADR 0065 made the Title a
      // one-activation control, so the second click of a pair lands in the field
      // the first one opened — and that field, like the control, carries
      // `.nopan`, the one thing React Flow's zoom filter exempts. The Card body
      // carries no such class, so a double click there would zoom the canvas
      // while meaning nothing to the Card. Off for the whole canvas rather than
      // per node, so the gesture does not change meaning two pixels away from a
      // Card.
      zoomOnDoubleClick={false}
      // While presenting the arrow keys control traversal, so React Flow must not
      // also read them as moving or selecting a node.
      nodesDraggable={editable && !presenting}
      nodesFocusable={!presenting}
      elementsSelectable={!presenting}
      // Half of a pair, and useless without the other half. React Flow resolves
      // this into `NodeProps.isConnectable` and hands it to the node, enforcing
      // nothing itself on a handle it did not render — so `CardNode` forwards it
      // to the four authoring handles, and only then does this line mean
      // anything beyond whether the connection line draws.
      //
      // **Not `canAuthorOnCanvas`**, and the difference is the whole of
      // `canConnectOnCanvas`: this line read `editable && !presenting` for as
      // long as it was inert, and the first thing forwarding it did was break
      // the presented-Card connection `editing.spec.ts` has always asserted. An
      // expression nothing reads is not a decision that was made.
      nodesConnectable={canConnectOnCanvas}
      ariaLabelConfig={ARIA_LABEL_CONFIG}
      // No `connectionMode`: the default is Strict, and every legal drop here is
      // already source-to-target. Loose only adds source-to-source, which the
      // authoring handles refuse via `isConnectableEnd` and the graph ports via
      // `pointer-events: none` — so it advertised a capability the design forbids.
      connectionLineStyle={connectionLineStyle}
      connectionLineComponent={GraphConnectionLine}
      minZoom={0.2}
      // Presenting draws one card full-screen, which is far closer than React
      // Flow's default ceiling of 2. See `MAX_ZOOM` — without it the camera sits
      // outside its own extent and the first wheel tick yanks it back.
      maxZoom={MAX_ZOOM}
    >
      <Background gap={24} />
      {/*
        The sentence a refused canvas command leaves behind. Placed and styled
        exactly like Edge Authoring's `gesture` refusal, because it is the same
        case: the press is over, and there is no surface left to attach it to.
      */}
      {commandRefusal !== null && (
        <span role="alert" className="canvas-refusal" data-testid="canvas-command-refusal">
          {commandRefusal}
        </span>
      )}
      <ZoomSlider />
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
      {edgeSurface.layer}
    </ReactFlow>,
  );
}
