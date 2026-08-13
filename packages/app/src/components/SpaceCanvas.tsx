import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type OnBeforeDelete,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import type { Card, CardId, Graph, GraphId } from '@project/core';
import {
  nodeTypes,
  GraphConnectionLine,
  GraphHud,
  type CardFlowNode,
} from '@project/react-flow-adapter';
import { activeGraphColor } from '../colors';
import { useEdgeAuthoring } from '../edge-authoring-react';
import type { EdgeAuthoring } from '../edge-authoring';
import type { CanvasSelection, EdgeSubject } from '../render-adapter';
import { MAX_ZOOM, OVERVIEW_FIT } from '../camera';
import { OverviewCamera, PresentingCamera } from './cameras';

/**
 * What the graph tells assistive technology it can do.
 *
 * React Flow's defaults offer "Press delete to remove it" for both a node and an
 * edge. **Only the Edge half is true.** Deleting an Edge is built (package 7)
 * and routed through `onBeforeDelete` into a completed Space Edit; deleting a
 * Card from a Layout or from the Space is package 8's, and until it lands the
 * key is inert for a node — a removal applied to the live node array is undone
 * by the next projection sync. Sighted users never meet the claim; a screen
 * reader reads it out as the way to work with a Card.
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
 * not for the other. They disagreed — `C` named only text entry — and React
 * Flow's own `<Controls>` renders *inside* the wrapper both are bound to, so a
 * `c` with Zoom in focused added a Card.
 *
 * `button` and `select` are here for a different reason from `input`,
 * `textarea` and `contenteditable`: those are places an author is typing the
 * letter, while a button is a control with a keyboard model of its own that the
 * canvas must not shadow. Both are cases where the key was not aimed here.
 */
const NOT_A_CANVAS_COMMAND = 'input, textarea, select, button, [contenteditable="true"]';

export interface SpaceCanvasProps {
  nodes: CardFlowNode[];
  edges: Edge[];
  /** The next projection, merged in by a completed connection so its Edge draws. */
  projectedNodes: readonly CardFlowNode[] | null;
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
  nameOnCreation,
  onOpenCard,
  onCompleteCardTitle,
  editableCardIds,
  graphs,
  colorByGraphId,
  activeGraphId,
  activeGraphCardIds,
}: SpaceCanvasProps) {
  const [editingTitleCardId, setEditingTitleCardId] = useState<string | null>(null);
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

  const edgeSurface = useEdgeAuthoring({
    authoring: edgeAuthoring,
    edges,
    projectedNodes,
    selection,
    activeGraphId: (activeGraphId as GraphId | null) ?? null,
    graphs,
    subjectCards,
    newCardTitle,
    enabled: editable && !presenting,
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
  // React Flow, which selects; the double click belongs to the title, which
  // centres in a Card and would otherwise be competing with the Card underneath
  // it for the same pixels. Opening is the affordance and the keyboard.

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
      if (event.target.closest(NOT_A_CANVAS_COMMAND) !== null) return;
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
      if (event.target instanceof Element && event.target.closest(NOT_A_CANVAS_COMMAND) !== null) {
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

  // The operations, not the surface holding them: `useEdgeAuthoring` answers a
  // fresh object literal per render while each of these is stable, and a hook
  // that depended on the object would be rebuilt every time.
  const beginConnectFrom = edgeSurface.beginConnectFrom;
  const deleteEdges = edgeSurface.deleteEdges;
  const editableNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          // Three controls, three flags. The title's double click is offered on
          // every Card; the affordance only on one that owns content to edit;
          // the Connect control wherever an Edge may begin.
          titleEditingEnabled: canAuthorCards,
          cardEditingEnabled: canAuthorCards && editableCardIds.has(node.id),
          connectingEnabled: canAuthorCards,
          editingTitle: canAuthorCards && node.id === editingTitleCardId,
          onBeginConnect: () => beginConnectFrom(node.id),
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
    [
      nodes,
      canAuthorCards,
      editableCardIds,
      editingTitleCardId,
      onCompleteCardTitle,
      onOpenCard,
      beginConnectFrom,
    ],
  );

  const connectionLineStyle = useMemo(
    () => ({
      stroke: activeGraphColor(colorByGraphId, activeGraphId),
      strokeWidth: 3,
    }),
    [activeGraphId, colorByGraphId],
  );

  /**
   * Dispatch one deletion request, and never apply it locally.
   *
   * React Flow calls `onBeforeDelete` once for the *combined* payload, having
   * already gathered every deletable Edge incident to a requested node. So a
   * payload carrying nodes is a Card deletion whose Edges are consequences, not
   * several independent Edge deletions — routing on that shape is event
   * translation, not a deletion rule.
   *
   * Returning `false` for the whole payload is what keeps the Space
   * authoritative: React Flow removes nothing, and the completed Edit supplies
   * the next controlled projection. A refusal therefore leaves the Edge exactly
   * where it was, with its reason on the surface that asked.
   */
  const beforeDelete = useCallback<OnBeforeDelete<CardFlowNode>>(
    ({ nodes: requestedNodes, edges: requestedEdges }) => {
      // Card deletion is package 8's. Until it lands the request is declined
      // whole, incident Edges included — dropping the Edges of a Card that is
      // not going anywhere would be a deletion the author never asked for.
      if (requestedNodes.length === 0) deleteEdges(requestedEdges);
      // A promise because React Flow awaits this, and `false` because a
      // completed Edit — not React Flow — supplies the next projection.
      return Promise.resolve(false);
    },
    [deleteEdges],
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

  return edgeSurface.provide(
    <ReactFlow
      nodes={editableNodes}
      edges={edgeSurface.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeSurface.edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onBeforeDelete={beforeDelete}
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
      {edgeSurface.layer}
    </ReactFlow>,
  );
}
