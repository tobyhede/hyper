import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Background,
  ReactFlow,
  type Edge,
  type ReactFlowProps,
  type OnEdgesChange,
  type OnNodesChange,
  useReactFlow,
} from '@xyflow/react';
import {
  SPACE_CARD_EMBED_INSET,
  titleName,
  uuidSchema,
  type DiagramPosition,
  type DiagramId,
  type Card,
  type CardId,
  type Graph,
  type GraphId,
} from '@project/core';
import type { SpaceSession } from '@project/persistence';
import type { EntityActionGroup } from '@project/ui';
import {
  nodeTypes,
  GraphConnectionLine,
  GraphHud,
  ZoomSlider,
  type CardFlowNode,
} from '@project/react-flow-adapter';
import { activeGraphColor } from '../colors';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { AuthoringAvailability } from '../authoring-availability';
import { useCanvasCardAuthoring } from '../canvas-card-authoring';
import type { SpaceCardTargets } from '../space-card-targets';
import { useEdgeAuthoring } from '../edge-authoring-react';
import type { EdgeAuthoring } from '../edge-authoring';
import type { CanvasSelection, CardResize, EdgeSubject } from '../render-adapter';
import type { SpaceAuthoring } from '../space-authoring';
import { MAX_ZOOM, OVERVIEW_FIT } from '../camera';
import { CARD_SIZE } from '../card';
import { CARD_DRAG_TYPE } from './CardsDrawer';
import { OverviewCamera, PresentingCamera } from './cameras';
import type { OpenSpace } from '../open-spaces';
import { clipEmbeddedNode, embeddedClipId, type EmbeddedBounds } from '../embedded-diagram';
import { useOpenSpaces } from '../open-spaces-context';
import { EmbeddedDiagramAuthoring, type EmbeddedPublication } from './EmbeddedDiagramAuthoring';

const EMPTY_ENTRIES = [] as const;
const emptySubscription = () => () => undefined;

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
    'Press enter or space to open a Card, backspace or delete to remove it from this Diagram, the arrow keys to move it, and escape to cancel.',
  'node.a11yDescription.keyboardDisabled':
    'Press enter or space to open a Card, backspace or delete to remove it from this Diagram, the arrow keys to move it, and escape to cancel.',
  'edge.a11yDescription.default':
    'Press backspace or delete to remove this Edge from its Graph, or escape to deselect it.',
} as const;

/** A pending placement keeps Cards readable without advertising authored gestures. */
const PENDING_ARIA_LABEL_CONFIG = {
  ...ARIA_LABEL_CONFIG,
  'node.a11yDescription.default': 'This Card is unavailable while placement is pending.',
  'node.a11yDescription.keyboardDisabled': 'This Card is unavailable while placement is pending.',
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
 *
 * `[data-sidebar]` used to close the list: the registry `Sidebar` was the app's
 * chrome and set that attribute on every part of itself. It went with ADR 0082,
 * and the Command Dock that replaced it marks itself `.nokey` like every other
 * chrome surface — so the entry was covering nothing and has gone rather than
 * standing as a guard against a component the tree no longer contains.
 */
const NOT_A_CANVAS_COMMAND =
  '.nokey, input, textarea, select, button, [contenteditable="true"], [role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]';

/**
 * The Card a key came from, or `null` if it came from anywhere else.
 *
 * Answered from the projection rather than from the DOM id alone, which is what
 * keeps a second canvas's node — a story, a catalogue page — from naming a Card
 * this Diagram is not drawing.
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
  /**
   * That a traversal is running — the Navigation mode, not an availability
   * answer. Two things read it, and neither is an authoring operation: the
   * camera that returns to the overview when the traversal ends (ADR 0027), and
   * the click that resumes an embedded read of a Space that has been Exited,
   * which nothing edits. What presenting *withdraws* from authoring is
   * `availability`'s to say.
   */
  presenting: boolean;
  /**
   * That the selected Diagram's placement has resolved and the store has taken
   * it — the fact, not an operation, and read by one thing: the aria
   * description React Flow gives every node.
   *
   * It is here rather than folded into `availability` because that description
   * is a *statement about the placement* and its withheld form says so in
   * words: "This Card is unavailable while placement is pending." Any
   * availability answer would make it false somewhere — `connectOnCanvas`
   * announces "pending" over a placement that resolved long ago the moment an
   * author begins an inline Diagram rename on the Dock, which is a lie told
   * to exactly the readers who depend on it, and told while the canvas behind
   * that rename is fully reachable (nothing about a chrome rename covers the
   * graph or traps focus).
   *
   * So it is named for the fact rather than for a control, and it is not a
   * reinstatement of any withdrawal term: nothing that decides what may be
   * *authored* reads it.
   */
  placementReady: boolean;
  /**
   * What may be authored right now, answered once for the whole application.
   *
   * Every withdrawal on this canvas is one of these answers rather than a
   * recombination of the facts behind them, so the canvas and the Space's
   * command surface cannot disagree about an operation they both offer
   * (`CONTEXT.md`, Availability).
   */
  availability: AuthoringAvailability;
  onNodesChange: OnNodesChange<CardFlowNode>;
  onEdgesChange: OnEdgesChange;
  /** The whole Edge interaction lifecycle, which this canvas composes rather than interprets. */
  edgeAuthoring: EdgeAuthoring;
  selection: CanvasSelection;
  onSelectCard: (cardId: CardId) => void;
  onSelectEdge: (subject: EdgeSubject) => void;
  /** The Cards this Diagram places — what an Edge picker may offer. */
  placedCards: readonly Card[];
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
  /**
   * Report whether some embedded Diagram on this canvas is running a Card edit.
   *
   * The one availability fact that is produced *inside* this subtree: an
   * embedded Diagram publishes its live edits from within React Flow, so nothing
   * above can see one without being told. It goes into the render adapter
   * rather than up a chain of `useState` because that store re-renders the
   * Space's command surface and this canvas together, and the answer derived
   * from it comes back down as `availability.authorOnCanvas` — one answer, not
   * a term recombined here (`authoring-availability.ts`).
   */
  reportEmbeddedDiagramEditing: (editing: boolean) => void;
  graphs: readonly Graph[];
  colorByGraphId: Readonly<Record<string, string>>;
  activeGraphId: GraphId | null;
  activeGraphCardIds: ReadonlySet<string>;
  /** What each Space Card's target offers it, for the Cards of kind `space` on this canvas. */
  spaceCardTargets?: SpaceCardTargets;
  /**
   * What commands each Card on this canvas offers — copy an address, delete it
   * — drawn on the Card's own rail (ADR 0073).
   *
   * Passed straight through to `useCanvasCardAuthoring`, which is where every
   * other per-Card operation is attached. Absent on a canvas whose Cards have
   * no such commands to run, which is how an embedded Diagram draws none.
   *
   * A command list is built afresh on every render of the composition that owns
   * it — an address and an Edit both read state that has just changed — so this
   * widens the measured exception below from "the node wrappers rebuild
   * whenever `nodes` changes identity" to "whenever this canvas renders".
   * Correctness is unaffected, and closing it is the same per-node cache that
   * note already names.
   */
  cardEntityActions?: (cardId: CardId) => readonly EntityActionGroup[];
}

export function SpaceCanvas({
  nodes,
  edges,
  projectedNodes,
  activeCardId,
  presenting,
  placementReady,
  availability,
  onNodesChange,
  onEdgesChange,
  edgeAuthoring,
  selection,
  onSelectCard,
  onSelectEdge,
  placedCards,
  newCardTitle,
  onAddCard,
  onAddExistingCard,
  nameOnCreation,
  authoring,
  spaceSession,
  onBodyEditingChange,
  onTitleEditingChange,
  cardResize,
  reportEmbeddedDiagramEditing,
  graphs,
  colorByGraphId,
  activeGraphId,
  activeGraphCardIds,
  spaceCardTargets,
  cardEntityActions,
}: SpaceCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  const spaces = useOpenSpaces();
  const getEntries = useCallback(() => spaces?.getState().entries ?? EMPTY_ENTRIES, [spaces]);
  const entries = useSyncExternalStore(spaces?.subscribe ?? emptySubscription, getEntries);
  const [embeddedPublications, setEmbeddedPublications] = useState<
    ReadonlyMap<string, EmbeddedPublication>
  >(new Map());
  /**
   * What each target could not be read with, kept apart from the others'.
   *
   * One string for the whole canvas made every embedding answer for every
   * other: any target that opened cleared a sentence raised by a different
   * Space Card, and the one on screen never said which target it was about.
   * Keyed by the Space the read was aimed at, because that is what
   * `spaces.embed` is asked for — two Cards reaching the same missing Space
   * are reporting one failure, and each names itself where it is drawn.
   */
  const [embeddedFailures, setEmbeddedFailures] = useState<ReadonlyMap<CardId, string>>(new Map());
  const embeddedRequests = useMemo(() => {
    const requests: {
      parent: CardFlowNode;
      spaceId: CardId;
      diagramId: DiagramId;
      graphId: GraphId | null;
      entry: OpenSpace | undefined;
      absolute: DiagramPosition;
      bounds: EmbeddedBounds;
    }[] = [];
    const queue: {
      parent: CardFlowNode;
      session: SpaceSession;
      origin: DiagramPosition;
      clip: EmbeddedBounds | null;
      /** The Diagrams already crossed to reach this parent, newest last. */
      path: ReadonlySet<string>;
    }[] = nodes.map((parent) => ({
      parent,
      session: spaceSession,
      origin: { x: 0, y: 0 },
      clip: null,
      path: new Set<string>(),
    }));
    for (const item of queue) {
      const { parent, session, origin, clip, path } = item;
      if (parent.data.kind !== 'space' || parent.data.expanded !== true) continue;
      const document = session
        .getState()
        .working.cards.find((card) => card.id === parent.data.cardId)?.document;
      if (document?.kind !== 'space' || document.diagram === undefined) continue;
      // A Diagram already on this path would embed itself. Single-Space intake
      // refuses only a Card targeting its own Space, so a mutual pair reaches
      // here validated and would otherwise nest one level deeper per commit.
      const crossing = `${document.spaceId}:${document.diagram}`;
      if (path.has(crossing)) continue;
      const crossed = new Set(path).add(crossing);
      const absolute = { x: origin.x + parent.position.x, y: origin.y + parent.position.y };
      const intersection = {
        left: Math.max(absolute.x + SPACE_CARD_EMBED_INSET.left, clip?.left ?? -Infinity),
        top: Math.max(absolute.y + SPACE_CARD_EMBED_INSET.top, clip?.top ?? -Infinity),
        right: Math.min(
          absolute.x + (parent.width ?? 0) - SPACE_CARD_EMBED_INSET.right,
          clip?.right ?? Infinity,
        ),
        bottom: Math.min(
          absolute.y + (parent.height ?? 0) - SPACE_CARD_EMBED_INSET.bottom,
          clip?.bottom ?? Infinity,
        ),
      };
      requests.push({
        parent,
        spaceId: document.spaceId,
        diagramId: document.diagram,
        graphId: document.graph ?? null,
        entry: entries.find((entry) => entry.id === document.spaceId),
        absolute,
        bounds: {
          left: intersection.left - absolute.x,
          top: intersection.top - absolute.y,
          right: intersection.right - absolute.x,
          bottom: intersection.bottom - absolute.y,
        },
      });
      const published = embeddedPublications.get(parent.id);
      if (published?.diagramId === document.diagram) {
        for (const child of published.nodes)
          queue.push({
            parent: child,
            session: published.entry.session,
            origin: absolute,
            clip: intersection,
            path: crossed,
          });
      }
    }
    return requests;
  }, [nodes, spaceSession, entries, embeddedPublications]);
  /**
   * A read outlives its embedding only while the *target* is gone.
   *
   * That is the Exit case: the request still stands, `request.entry` is
   * `undefined`, and the last read is what the retained read-only drawing is
   * made of. A Space Card that is simply **Closed** makes no request at all, so
   * its read ends with it — a publication left in the map would be picked up as
   * *live* by the next Open of that same Card at that same Diagram, one commit
   * of nodes whose `changeNodes` and `removeCard` are bound to a composition
   * whose `observe()` was torn down, and it would seed the nested traversal
   * above from a Diagram nobody is reading any more.
   *
   * Adjusted during render, the way `commandRefusal` is below: React discards
   * this pass, so neither the DOM nor the load effect ever sees the requests the
   * dead publication produced.
   */
  if (embeddedPublications.size > 0) {
    const standing = new Set(embeddedRequests.map((request) => request.parent.id));
    if ([...embeddedPublications.keys()].some((id) => !standing.has(id))) {
      setEmbeddedPublications(
        new Map([...embeddedPublications].filter(([id]) => standing.has(id))),
      );
    }
  }
  // A refusal belongs to the embedding that asked for the read, so it goes the
  // same way: no standing request means nothing left to announce it on.
  if (embeddedFailures.size > 0) {
    const asked = new Set(embeddedRequests.map((request) => request.spaceId));
    if ([...embeddedFailures.keys()].some((spaceId) => !asked.has(spaceId))) {
      setEmbeddedFailures(new Map([...embeddedFailures].filter(([id]) => asked.has(id))));
    }
  }
  const editingEmbeddingIds = new Set(
    embeddedRequests.flatMap((request) => {
      const value = embeddedPublications.get(request.parent.id);
      return value !== undefined &&
        request.entry === value.entry &&
        value.diagramId === request.diagramId &&
        (value.bodyEditing || value.titleEditing)
        ? [request.parent.id]
        : [];
    }),
  );
  /**
   * The one availability fact this subtree produces, on its way to the module
   * that answers with it.
   *
   * *Whether* an embedding is editing is the fact; *which* one stays here, in
   * the Set above, because it is a question about a Card of this canvas rather
   * than about what is in progress. A layout effect rather than an ordinary
   * one: the answer comes back through the store in the same commit, so no
   * frame is painted with authoring still offered over a live embedded edit.
   *
   * Every reason the answers carry lives in `authoring-availability.ts`, beside
   * the answer it governs — including why the Edge lifecycle reads
   * `authorOnCanvas` rather than the shorter rule it once had, and why a
   * connection is reachable on the presented Card that `authorOnCanvas`
   * withdraws.
   */
  const embeddedEditing = editingEmbeddingIds.size > 0;
  useLayoutEffect(() => {
    reportEmbeddedDiagramEditing(embeddedEditing);
    return () => reportEmbeddedDiagramEditing(false);
  }, [embeddedEditing, reportEmbeddedDiagramEditing]);
  const cardAuthoring = useCanvasCardAuthoring({
    nodes,
    availability,
    nameOnCreation,
    authoring,
    spaceSession,
    cardResize,
    onSelectCard,
    spaceCardTargets,
    cardEntityActions,
  });
  const { bodyEditing, openCard: onOpenCard, beginTitleEditing } = cardAuthoring;

  const embeddedBodyEditing = embeddedRequests.some(
    (request) =>
      editingEmbeddingIds.has(request.parent.id) &&
      embeddedPublications.get(request.parent.id)?.bodyEditing === true,
  );
  const embeddedTitleEditing = embeddedRequests.some(
    (request) =>
      editingEmbeddingIds.has(request.parent.id) &&
      embeddedPublications.get(request.parent.id)?.titleEditing === true,
  );
  useEffect(() => {
    onBodyEditingChange?.(bodyEditing || embeddedBodyEditing);
  }, [bodyEditing, embeddedBodyEditing, onBodyEditingChange]);
  useEffect(() => {
    onTitleEditingChange?.(cardAuthoring.titleEditing || embeddedTitleEditing);
    return () => onTitleEditingChange?.(false);
  }, [cardAuthoring.titleEditing, embeddedTitleEditing, onTitleEditingChange]);
  const requested = useRef(new Set<string>());
  const resumeEmbedded = useCallback(
    async (spaceId: CardId) => {
      try {
        await spaces?.embed(spaceId);
        setEmbeddedFailures((previous) =>
          previous.has(spaceId)
            ? new Map([...previous].filter(([id]) => id !== spaceId))
            : previous,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setEmbeddedFailures((previous) =>
          previous.get(spaceId) === message ? previous : new Map(previous).set(spaceId, message),
        );
      }
    },
    [spaces],
  );
  useEffect(() => {
    const visible = new Map(
      embeddedRequests.map((request) => [
        `${request.parent.id}:${request.diagramId}:${request.graphId ?? ''}`,
        request,
      ]),
    );
    for (const id of requested.current) if (!visible.has(id)) requested.current.delete(id);
    for (const [id, request] of visible) {
      if (spaces === null || requested.current.has(id)) continue;
      // The claim outlives the answer, refusal included. This effect re-runs
      // whenever `embeddedRequests` changes identity — which every session
      // change in every open Space does — so releasing the id on failure asks a
      // permanently unreadable target again on essentially every edit anywhere.
      // One read per embedding: closing and reopening the Card, or selecting
      // another Diagram, is what asks again, and so is `resumeEmbedded`.
      requested.current.add(id);
      void resumeEmbedded(request.spaceId);
    }
  }, [spaces, embeddedRequests, resumeEmbedded]);
  const publishEmbedded = useCallback((id: string, value: EmbeddedPublication | null) => {
    setEmbeddedPublications((previous) => {
      if (previous.get(id) === value || (value === null && !previous.has(id))) return previous;
      const next = new Map(previous);
      if (value === null) next.delete(id);
      else next.set(id, value);
      return next;
    });
  }, []);
  const liveEmbeddings = useMemo(
    () =>
      embeddedRequests.flatMap((request) => {
        const value = embeddedPublications.get(request.parent.id);
        if (value?.diagramId !== request.diagramId) return [];
        if (request.entry === value.entry) return [value];
        return [
          {
            ...value,
            changeNodes: () => undefined,
            // The three Card commands aimed at a retained read answer it the
            // same way: reopen the target's session so the next press acts.
            // The canvas still announces that delete removes the focused Card
            // from its Diagram, and this drawing is still focusable, so an
            // answer of `null` alone consumed the key and did nothing at all.
            // There is no refusal to report either — the target is not open,
            // which is a state this press ends rather than a refused Edit.
            removeCard: () => {
              void resumeEmbedded(request.spaceId);
              return null;
            },
            nodes: value.nodes.map((node): CardFlowNode => ({
              ...clipEmbeddedNode(node, request.bounds),
              draggable: false,
              data: {
                ...node.data,
                readOnly: true,
                onEditCard: () => {
                  void resumeEmbedded(request.spaceId);
                  return 'retained';
                },
                onBeginTitleEditing: () => {
                  void resumeEmbedded(request.spaceId);
                },
              },
            })),
          },
        ];
      }),
    [embeddedRequests, embeddedPublications, resumeEmbedded],
  );

  const edgeSurface = useEdgeAuthoring({
    authoring: edgeAuthoring,
    edges,
    projectedNodes,
    selection,
    activeGraphId,
    graphs,
    placedCards,
    newCardTitle,
    enabled: availability.authorOnCanvas,
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
      if (!availability.authorOnCanvas || !(event.target instanceof Element)) return;
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
        const embedded = liveEmbeddings
          .flatMap((value) => value.nodes)
          .find((node) => node.id === cardId);
        if (embedded === undefined) onOpenCard(cardId);
        else embedded.data.onEditCard?.(true);
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
      // withdrawn is left to whatever else would have had it. The guard at the
      // top of this handler is the other half of that: it is `authorOnCanvas`
      // rather than the mode alone, so every branch below is already behind it.
      if (bodyEditing) return;
      event.preventDefault();
      onAddCard();
    },
    [onOpenCard, availability.authorOnCanvas, bodyEditing, onAddCard, liveEmbeddings],
  );

  // `F2` renames the selected Card, and this is the *only* handler that answers
  // it. A React Flow `onKeyDown` branch used to answer it first and ask nothing
  // about the target, so the key typed into a control renamed whichever Card
  // happened to be selected — a different one, once focus had moved. Two
  // handlers for one key means one of them is the unguarded one; don't add a
  // second back.
  useLayoutEffect(() => {
    if (!availability.authorOnCanvas || bodyEditing) return;
    const beginSelectedTitleEdit = (event: KeyboardEvent): void => {
      if (event.key !== 'F2') return;
      if (event.target instanceof Element && event.target.closest(NOT_A_CANVAS_COMMAND) !== null) {
        return;
      }
      const embedded = liveEmbeddings.flatMap((value) => value.nodes).find((node) => node.selected);
      if (embedded !== undefined) {
        event.preventDefault();
        embedded.data.onBeginTitleEditing?.();
        return;
      }
      const selected = nodes.find((node) => node.selected);
      if (selected === undefined) return;
      event.preventDefault();
      beginTitleEditing(selected.id);
    };
    window.addEventListener('keydown', beginSelectedTitleEdit);
    return () => window.removeEventListener('keydown', beginSelectedTitleEdit);
  }, [availability.authorOnCanvas, bodyEditing, nodes, beginTitleEditing, liveEmbeddings]);

  // The operations, not the surface holding them: `useEdgeAuthoring` answers a
  // fresh object literal per render while each of these is stable, and a hook
  // that depended on the object would be rebuilt every time.
  const deleteEdges = edgeSurface.deleteEdges;
  const editableNodes = cardAuthoring.nodes;
  /**
   * The canvas React Flow draws: this Space's Cards, then the Diagrams its
   * Open Space Cards embed (ADR 0068).
   *
   * Concatenated here and nowhere earlier. React Flow requires a parent to be
   * declared before its children, which appending satisfies for free; and every
   * rule above — deletion, the title-editing selection, focus, Edge authoring —
   * is written over this Space's own Cards, so an embedded node mixed into
   * `editableNodes` would put another Space's Card inside each of them.
   */
  const canvasNodes = useMemo(
    () => [...editableNodes, ...liveEmbeddings.flatMap((value) => value.nodes)],
    [editableNodes, liveEmbeddings],
  );
  const canvasEdges = useMemo(
    () => [...edgeSurface.edges, ...liveEmbeddings.flatMap((value) => value.edges)],
    [edgeSurface.edges, liveEmbeddings],
  );
  const changeCanvasNodes: OnNodesChange<CardFlowNode> = useCallback(
    (changes) => {
      onNodesChange(changes);
      for (const value of liveEmbeddings) value.changeNodes(changes);
    },
    [onNodesChange, liveEmbeddings],
  );
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
    embedded: liveEmbeddings,
    authoring,
    bodyEditing,
    authorOnCanvas: availability.authorOnCanvas,
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
      embedded: liveEmbeddings,
      authoring,
      bodyEditing,
      authorOnCanvas: availability.authorOnCanvas,
      deleteEdges,
      edges: edgeSurface.edges,
      nodes,
      selection,
    };
  }, [
    authoring,
    bodyEditing,
    availability.authorOnCanvas,
    deleteEdges,
    edgeSurface.edges,
    nodes,
    selection,
    liveEmbeddings,
  ]);

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
      if (!current.authorOnCanvas || current.bodyEditing) return;
      const focusedNodeId = event.target.closest<HTMLElement>('.react-flow__node[data-id]')
        ?.dataset['id'];
      const embedded = current.embedded.find((value) =>
        value.nodes.some(
          (node) => node.id === focusedNodeId || (focusedNodeId === undefined && node.selected),
        ),
      );
      const embeddedId = focusedNodeId ?? embedded?.nodes.find((node) => node.selected)?.id;
      if (embedded !== undefined && embeddedId !== undefined) {
        event.preventDefault();
        setCommandRefusal(embedded.removeCard(embeddedId));
        return;
      }
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
          kind: 'removed-card-from-diagram',
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
      if (!availability.authorOnCanvas || !event.dataTransfer.types.includes(CARD_DRAG_TYPE))
        return;
      if (!(event.target instanceof Element) || event.target.closest('.react-flow__pane') === null)
        return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    [availability.authorOnCanvas],
  );

  const onExternalDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!availability.authorOnCanvas || !(event.target instanceof Element)) return;
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
    [availability.authorOnCanvas, onAddExistingCard, screenToFlowPosition],
  );

  const embeddedEvents = useMemo(() => {
    const props: Pick<ReactFlowProps<CardFlowNode>, 'onNodeClick'> = {};
    if (!presenting) {
      props.onNodeClick = (_event, node) => {
        const request = embeddedRequests.find((candidate) => candidate.parent.id === node.parentId);
        if (request !== undefined && request.entry === undefined)
          void resumeEmbedded(request.spaceId);
      };
    }
    return props;
  }, [presenting, embeddedRequests, resumeEmbedded]);

  return edgeSurface.provide(
    <ReactFlow
      ref={canvasRef}
      nodes={canvasNodes}
      edges={canvasEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeSurface.edgeTypes}
      onNodesChange={changeCanvasNodes}
      {...embeddedEvents}
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
      nodesDraggable={availability.dragNodes}
      nodesFocusable={availability.selectNodes}
      elementsSelectable={availability.selectNodes}
      // Half of a pair, and useless without the other half. React Flow resolves
      // this into `NodeProps.isConnectable` and hands it to the node, enforcing
      // nothing itself on a handle it did not render — so `CardNode` forwards it
      // to the four authoring handles, and only then does this line mean
      // anything beyond whether the connection line draws.
      //
      // **Not `authorOnCanvas`**: presenting deliberately keeps this one
      // gesture, and `authoring-availability.ts` records why.
      nodesConnectable={availability.connectOnCanvas}
      // **The placement fact, deliberately not an availability answer.** The
      // withheld form of this description is a sentence about placement, so the
      // only condition that may gate it is whether placement resolved. Every
      // other withdrawal — presenting, a creation pane, a live chrome rename —
      // leaves the description saying "pending" about a placement that is not.
      ariaLabelConfig={placementReady ? ARIA_LABEL_CONFIG : PENDING_ARIA_LABEL_CONFIG}
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
      <svg aria-hidden="true" width={0} height={0}>
        <defs>
          {embeddedRequests.map(({ parent, absolute, bounds }) => (
            <clipPath key={parent.id} id={embeddedClipId(parent.id)} clipPathUnits="userSpaceOnUse">
              <rect
                x={absolute.x + bounds.left}
                y={absolute.y + bounds.top}
                width={Math.max(0, bounds.right - bounds.left)}
                height={Math.max(0, bounds.bottom - bounds.top)}
              />
            </clipPath>
          ))}
        </defs>
      </svg>
      {embeddedRequests.map((request) =>
        request.entry === undefined ? null : (
          <EmbeddedDiagramAuthoring
            key={`${request.parent.id}:${request.diagramId}`}
            parent={request.parent}
            entry={request.entry}
            diagramId={request.diagramId}
            graphId={request.graphId}
            // Two answers and one membership test, and each is here for its own
            // reason. `authorInEmbeddedDiagram` is every way this canvas is not
            // being authored *except* an embedded edit; `authorOnCanvas` adds
            // that one, so it is false the moment any embedding is editing —
            // and the membership test is that same fact read the other way
            // round, reinstating the one embedding that owns the edit. Which
            // embedding it is never leaves this component, so it could not be
            // an answer.
            //
            // The two live edits are this canvas's own and read at same-render
            // freshness; the answers `App` holds are a frame behind them, since
            // each is reported up through an effect.
            enabled={
              availability.authorInEmbeddedDiagram &&
              (availability.authorOnCanvas || editingEmbeddingIds.has(request.parent.id)) &&
              !bodyEditing &&
              !cardAuthoring.titleEditing
            }
            bounds={request.bounds}
            publish={publishEmbedded}
          />
        ),
      )}
      {/*
        A failed read is announced on the Space Card that asked for it, named by
        the Title the author gave that Card: the canvas can hold several
        embeddings, and a sentence naming none of them says nothing about which
        one is empty. Drawn from the standing requests, so a Card that is Closed
        takes its announcement with it.
      */}
      {embeddedRequests.flatMap(({ parent, spaceId }) => {
        const message = embeddedFailures.get(spaceId);
        return message === undefined
          ? []
          : [
              <span key={parent.id} role="alert" className="canvas-refusal">
                {`${titleName(parent.data.title)}: ${message}`}
              </span>,
            ];
      })}
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
