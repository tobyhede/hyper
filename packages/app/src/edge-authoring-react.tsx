import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type FinalConnectionState,
  type IsValidConnection,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type OnReconnect,
} from '@xyflow/react';
import type { Card, CardId, Graph, GraphEdge, GraphId } from '@project/core';
import { uuidSchema } from '@project/core';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { CardCombobox, type CardChoice } from '@project/ui';
import {
  newCardDrop,
  type DropTarget,
  type EdgeAuthoring,
  type FocusRequest,
} from './edge-authoring';
import {
  edgeSelectionOf,
  sameEdgeSubject,
  sameSelection,
  type CanvasSelection,
  type EdgeSubject,
} from './render-adapter';
import type { EdgeEndpoint } from './space-authoring';
import { AuthorableEdge } from './components/AuthorableEdge';
import { EdgeAuthoringContext } from './components/edge-authoring-context';
import { NewCardPreview } from './components/NewCardPreview';

/**
 * Edge Authoring's React interface: everything `SpaceCanvas` needs to mount the
 * Edge lifecycle, and nothing it needs to understand.
 *
 * `SpaceCanvas` passes `reactFlowProps` explicitly rather than spreading it, so
 * no property order can silently replace a handler this module owns.
 */
export interface EdgeOwnedReactFlowProps {
  readonly onConnect: OnConnect;
  readonly onConnectStart: OnConnectStart;
  readonly onConnectEnd: OnConnectEnd;
  readonly isValidConnection: IsValidConnection;
  readonly onReconnectStart: (event: unknown, edge: Edge, handleType: 'source' | 'target') => void;
  readonly onReconnect: OnReconnect;
  readonly onReconnectEnd: (
    event: MouseEvent | TouchEvent,
    edge: Edge,
    handleType: 'source' | 'target',
    connectionState: FinalConnectionState,
  ) => void;
  readonly onMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  /** Reconnection is per-Edge, and only the selected Active Graph Edge gets it. */
  readonly edgesReconnectable: false;
  /** Focusability is per-Edge too: only the Active Graph's Edges are tab stops. */
  readonly edgesFocusable: false;
  /** React Flow defaults to Backspace alone; Delete is the other half of the pair. */
  readonly deleteKeyCode: readonly ['Backspace', 'Delete'];
  /** Version 1 authors one element at a time (Edge Authoring design). */
  readonly multiSelectionKeyCode: null;
  readonly selectionKeyCode: null;
  readonly selectionOnDrag: false;
}

export interface EdgeAuthoringSurface {
  readonly edges: Edge[];
  readonly edgeTypes: EdgeTypes;
  readonly reactFlowProps: EdgeOwnedReactFlowProps;
  /** Drawn inside the flow: the empty-drop preview and the keyboard target picker. */
  readonly layer: ReactNode;
  /**
   * Wrap the mounted flow so each authorable Edge can read its commands.
   *
   * React Flow renders Edges itself, as a sibling of the children it is given —
   * so the context has to sit *outside* `<ReactFlow>` rather than inside
   * `layer`, and this is what puts it there without `SpaceCanvas` learning that
   * a context exists.
   */
  readonly provide: (children: ReactNode) => ReactNode;
  /** The Edge-only half of the canvas's `onBeforeDelete` dispatch. */
  readonly deleteEdges: (edges: readonly Edge[]) => void;
  /** Begin a keyboard connection from a Card, for the Card's own control. */
  readonly beginConnectFrom: (cardId: string) => void;
}

export interface EdgeAuthoringInput {
  readonly authoring: EdgeAuthoring;
  /** The projection the canvas is drawing, so a decoration cannot outrun it. */
  readonly edges: readonly Edge[];
  /** The next projection, merged into the live nodes by a completed connection. */
  readonly projectedNodes: readonly CardFlowNode[] | null;
  readonly selection: CanvasSelection;
  readonly activeGraphId: GraphId | null;
  readonly graphs: readonly Graph[];
  /** The Cards this renderer's subject holds — what a picker may offer. */
  readonly subjectCards: readonly Card[];
  readonly newCardTitle: string;
  /** Edge authoring is withdrawn before an arrangement resolves and while presenting. */
  readonly enabled: boolean;
  readonly onSelectCard: (cardId: CardId) => void;
  readonly onSelectEdge: (subject: EdgeSubject) => void;
}

const EDGE_TYPES: EdgeTypes = { routed: AuthorableEdge };

const DELETE_KEYS = ['Backspace', 'Delete'] as const;

/**
 * Which `DropTarget` the element under the pointer is. Both class names are
 * React Flow's published theming API.
 *
 * This is the DOM half of the question only — a connection target in range
 * outranks it, and both suppliers apply that precedence before asking
 * `newCardDrop`.
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
 * Which end of a drafted Edge a proposed connection moves, and to which Card.
 *
 * **`source` and `target` here are already domain-ordered.** React Flow anchors
 * a reconnect drag at the *opposite* end and `isValidHandle` normalises the pair
 * before reporting it, so both anchors produce `{ source: from, target: to }` —
 * which is why the end that moved is read off the pair rather than off the
 * `handleType` the drag started with. A `source` equal to the drafted Edge's
 * `from` therefore names the *target* as the end that changed, however the
 * gesture began, and an endpoint dropped back where it started reads as
 * unchanged on the end that did not move.
 *
 * One helper because the live validator and the completion must agree: a
 * disagreement would mark a drop invalid that the Edit would have accepted, or
 * the reverse.
 */
function movedEndpoint(
  edge: GraphEdge,
  source: CardId,
  target: CardId,
): { readonly endpoint: EdgeEndpoint; readonly cardId: CardId } {
  const endpoint: EdgeEndpoint = source === edge.from ? 'to' : 'from';
  return { endpoint, cardId: endpoint === 'from' ? source : target };
}

export function useEdgeAuthoring({
  authoring,
  edges,
  projectedNodes,
  selection,
  activeGraphId,
  graphs,
  subjectCards,
  newCardTitle,
  enabled,
  onSelectCard,
  onSelectEdge,
}: EdgeAuthoringInput): EdgeAuthoringSurface {
  const state = useSyncExternalStore(authoring.subscribe, authoring.getState);
  const { screenToFlowPosition } = useReactFlow();
  const connecting = useRef(false);
  const [modifierHeld, setModifierHeld] = useState(false);
  // Where the pointer is, not the point it is at: React bails out of an
  // unchanged state write, so a pointer moving across empty canvas no longer
  // re-renders the flow per frame.
  const [pointerOver, setPointerOver] = useState<DropTarget>('off-canvas');

  // The latest projection and module, read by stable callbacks. React Flow warns
  // that handler identities changing per render can drive it into a re-render
  // loop, and a connection handler closing over the projection is rebuilt by
  // every frame of a drag.
  //
  // Written after commit rather than during render, which is safe here because
  // every reader is a browser event: a pointer release or a key press arrives
  // from the event loop, always after the render that produced the value it
  // needs.
  const latest = useRef({ projectedNodes, authoring });
  useEffect(() => {
    latest.current = { projectedNodes, authoring };
  });

  useEffect(() => {
    const updateModifier = (event: KeyboardEvent) => {
      if (connecting.current && event.key === 'Alt') setModifierHeld(event.type === 'keydown');
    };
    window.addEventListener('keydown', updateModifier);
    window.addEventListener('keyup', updateModifier);
    return () => {
      window.removeEventListener('keydown', updateModifier);
      window.removeEventListener('keyup', updateModifier);
    };
  }, []);

  const acceptsEmptyDrop = useCallback((from: string): boolean => {
    const source = uuidSchema.safeParse(from);
    // React Flow knows node ids as plain strings and asks per pointer frame.
    // An id that is not a Card identity is not a connection to accept —
    // answering false is the honest reading, and a throw mid-drag the wrong one.
    return (
      source.success &&
      latest.current.authoring.accepts({ kind: 'create-and-connect', from: source.data })
    );
  }, []);

  /**
   * Whether the drag currently under the pointer may be released here.
   *
   * **React Flow has one global validator and consults it during a reconnect
   * too**, so asking the ordinary connect rule is asking the wrong question
   * whenever an endpoint is in flight. The case that shows it is an endpoint
   * dropped back on the Card it came from: as a *connect* proposal that is the
   * duplicate rule and reads invalid for the whole drag, while as a *reconnect*
   * proposal it is the endpoint returning to where it started, which
   * `reconnectOutcome` settles as `unchanged` before the duplicate check is ever
   * reached. Eligibility already called it offerable; this was the one place
   * still saying otherwise.
   *
   * The endpoint is derived from the proposed connection through the same
   * helper the completion uses, so the preview and the Edit cannot drift.
   */
  const isValidConnection = useCallback<IsValidConnection>((connection) => {
    const from = uuidSchema.safeParse(connection.source);
    const to = uuidSchema.safeParse(connection.target);
    if (!from.success || !to.success) return false;
    const { draft } = latest.current.authoring.getState();
    if (draft?.kind === 'pointer-reconnect') {
      const moved = movedEndpoint(draft.edge, from.data, to.data);
      return latest.current.authoring.accepts({
        kind: 'reconnect',
        graphId: draft.graphId,
        edge: draft.edge,
        ...moved,
      });
    }
    return latest.current.authoring.accepts({ kind: 'connect', from: from.data, to: to.data });
  }, []);

  /**
   * **React Flow drives a reconnect drag through the connection callbacks too**,
   * and the pair below is what keeps that from eating the reconnection.
   *
   * `EdgeUpdateAnchors` calls `onReconnectStart` and then the store's
   * `onConnectStart`, and on release the store's `onConnectEnd` before
   * `onReconnectEnd`. So a reconnect drag arrives here as a *connection*
   * starting from the endpoint that stays put: without this flag
   * `beginPointerConnect` replaces the reconnect draft the line before had
   * installed, `reconnect()` then finds no drafted Edge and silently authors
   * nothing — and an Alt-held release would author a Card and an Edge from the
   * wrong end. The reconnect callbacks own the whole gesture; these two stand
   * down for its duration.
   *
   * A ref rather than state because both reads happen inside React Flow's own
   * event, before any render could deliver a new value.
   */
  const reconnecting = useRef(false);

  const handleConnectStart = useCallback<OnConnectStart>((event, params) => {
    if (reconnecting.current) return;
    connecting.current = true;
    setPointerOver('off-canvas');
    setModifierHeld('altKey' in event && event.altKey);
    const from = uuidSchema.safeParse(params.nodeId);
    if (from.success) latest.current.authoring.beginPointerConnect(from.data);
  }, []);

  const handleConnect = useCallback<OnConnect>((connection) => {
    const from = uuidSchema.safeParse(connection.source);
    const to = uuidSchema.safeParse(connection.target);
    if (!from.success || !to.success) return;
    latest.current.authoring.connect(from.data, to.data, latest.current.projectedNodes);
  }, []);

  const handleConnectEnd = useCallback<OnConnectEnd>(
    (event, connection) => {
      // A reconnect release reaches here first; `onReconnectEnd` owns it.
      if (reconnecting.current) return;
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
              acceptsEmptyDrop,
            );
      if (drop !== null) {
        const from = uuidSchema.safeParse(drop.sourceId);
        if (from.success) {
          latest.current.authoring.createConnectedCard(
            from.data,
            drop.position,
            latest.current.projectedNodes,
          );
        }
      }
      const continuation = latest.current.authoring.endPointerDrag();
      setModifierHeld(false);
      setPointerOver('off-canvas');
      connecting.current = false;
      // After React Flow has settled its own gesture: selecting a Card during
      // the release would be undone by the selection changes the release itself
      // produces.
      if (continuation !== null) {
        requestAnimationFrame(() => onSelectCard(continuation));
      }
    },
    [screenToFlowPosition, acceptsEmptyDrop, onSelectCard],
  );

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!connecting.current) return;
    const over = dropTargetOf(event.target);
    setPointerOver(over);
    if (over === 'empty-canvas') setModifierHeld(event.altKey);
  }, []);

  /**
   * **`handleType` names the endpoint that stays, not the one being dragged.**
   *
   * React Flow hands `onReconnectStart` the *opposite* handle's type: taking
   * hold of the source anchor reports `'target'`, because the target is the end
   * the connection is now anchored at. So `'target'` means the author is moving
   * `from`, and `'source'` means they are moving `to` — the inverse of how it
   * reads. Only the draft depends on this; `handleReconnect` recomputes the
   * endpoint from the proposed connection, which is why getting it wrong here
   * showed up as a cancelled drag returning focus to the wrong Card rather than
   * as a wrong Edit.
   */
  const handleReconnectStart = useCallback(
    (_event: unknown, edge: Edge, handleType: 'source' | 'target') => {
      reconnecting.current = true;
      const subject = edgeSelectionOf(edge);
      if (subject === null) return;
      latest.current.authoring.beginPointerReconnect(
        subject,
        handleType === 'target' ? 'from' : 'to',
      );
    },
    [],
  );

  /**
   * React Flow's `reconnectEdge` helper is deliberately not called. Hyper applies
   * no local change: the next controlled projection carries the completed Space,
   * and until it arrives React Flow re-renders the original Edge.
   *
   * The endpoint comes from `movedEndpoint`, the same derivation the live
   * validator uses — so a drop the anchor showed as valid is one this completes.
   */
  const proposedReconnection = useRef(false);
  const handleReconnect = useCallback<OnReconnect>((oldEdge, connection) => {
    const subject = edgeSelectionOf(oldEdge);
    if (subject === null) return;
    proposedReconnection.current = true;
    const source = uuidSchema.safeParse(connection.source);
    const target = uuidSchema.safeParse(connection.target);
    if (!source.success || !target.success) return;
    const { endpoint, cardId } = movedEndpoint(subject.edge, source.data, target.data);
    latest.current.authoring.reconnect(endpoint, cardId);
  }, []);

  /**
   * The end of a reconnect drag, and the one gesture that deletes an Edge with a
   * pointer alone: **dragging an endpoint onto empty canvas removes it.**
   *
   * `onReconnect` fires first whenever the release was aimed at a Card, so a
   * proposal already made — completed, unchanged or refused — is never a
   * deletion. What is left is a release that proposed nothing, and the same
   * precedence the connect path uses decides it: a connection target in range
   * outranks the element underneath, so a drop that merely *missed* a handle
   * cancels rather than deleting.
   *
   * **There is no Escape to confuse this with, because React Flow has no
   * Escape path for a drag at all.** In the pinned 12.11.2 the only consumers of
   * that key are the focusable node and edge wrappers, which blur and unselect;
   * the reconnect anchor is a bare `<circle>` and takes no focus. `XYHandle`
   * installs `mousemove`/`mouseup` on the document and removes them only from
   * its own `onPointerUp`, and `cancelConnection` is reached from there or from
   * the whole flow unmounting — nowhere else. So reaching here means the author
   * released the pointer somewhere deliberate, and this handler is the only way
   * a drag can end.
   *
   * That is also what makes the guard below safe: the listeners are plain DOM
   * ones with no React cleanup, so even an Edge that leaves the projection
   * mid-drag still ends through here.
   */
  const handleReconnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, edge: Edge, _type: unknown, state: FinalConnectionState) => {
      const proposed = proposedReconnection.current;
      proposedReconnection.current = false;
      const subject = edgeSelectionOf(edge);
      if (!proposed && subject !== null && 'clientX' in event && 'clientY' in event) {
        const over =
          state.toNode !== null
            ? 'connection-target'
            : dropTargetOf(document.elementFromPoint(event.clientX, event.clientY));
        if (over === 'empty-canvas') latest.current.authoring.deleteEdge(subject);
      }
      // Whatever it produced, the drag is over: the draft goes and a refusal's
      // sentence stays, exactly as a connection drag ends.
      latest.current.authoring.endPointerDrag();
      // **Last, and unconditionally.** The connection handlers are stood down
      // for the drag, not for the session — they are the same handlers an
      // ordinary connection uses, so a flag left raised disables the Alt
      // empty-drop and the continue-at-the-target selection for as long as the
      // canvas is mounted. `onConnect` is *not* among them, so an Edge still
      // authors and the damage hides; the empty-drop is what goes dark.
      //
      // Cleared after the work above so nothing between here and
      // `onReconnectStart` can be read as a connection, and outside every guard
      // because this runs even when the Edge names no Graph.
      reconnecting.current = false;
    },
    [],
  );

  const deleteEdges = useCallback((requested: readonly Edge[]) => {
    for (const edge of requested) {
      const subject = edgeSelectionOf(edge);
      if (subject !== null) latest.current.authoring.deleteEdge(subject);
    }
  }, []);

  const beginConnectFrom = useCallback((cardId: string) => {
    const from = uuidSchema.safeParse(cardId);
    if (from.success) latest.current.authoring.beginKeyboardConnect(from.data);
  }, []);

  /**
   * Repair the focus React Flow's native Edge Escape leaves on `body`.
   *
   * Its handler clears the selection and calls `blur()`, which is right for an
   * element it is deselecting and wrong for a workspace whose commands need a
   * defined graph focus. Deferred past React Flow's own handling, and applied
   * only when nothing else has taken focus in the meantime.
   */
  const repairFocus = useCallback(() => {
    requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>('.react-flow')?.focus();
    });
  }, []);

  /**
   * The element a focus request names, resolved against the projection now on
   * screen — the only place a domain subject becomes a React Flow id.
   *
   * A request that names nothing drawn falls through to the canvas, which is the
   * point of having a fallback at all: an Edit can remove the very thing focus
   * was owed to between the request and this effect running.
   */
  const focusTargetOf = useCallback(
    (request: FocusRequest): HTMLElement | null => {
      if (request.kind === 'canvas') return null;
      if (request.kind === 'card') {
        return document.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${CSS.escape(request.cardId)}"]`,
        );
      }
      const drawn = edges.find((edge) => {
        const subject = edgeSelectionOf(edge);
        return subject !== null && sameEdgeSubject(subject, request);
      });
      return drawn === undefined
        ? null
        : document.querySelector<HTMLElement>(
            `.react-flow__edge[data-id="${CSS.escape(drawn.id)}"]`,
          );
    },
    [edges],
  );

  const focusRequest = state.focusRequest;
  useEffect(() => {
    if (focusRequest === null) return;
    const target = focusTargetOf(focusRequest);
    // **An Edge request outlives the render that made it.** It is published
    // synchronously with the Edit, but the projection carrying the Edge that
    // Edit produced arrives a strategy later — so a request that resolves to
    // nothing *yet* stays owed rather than being spent on the canvas fallback.
    // `focusTargetOf` closes over `edges`, so the next projection re-runs this.
    //
    // Only Edges wait. A Card and the canvas are already drawn, so for them an
    // unresolvable request means the element is gone for good, and falling back
    // is the answer rather than a wait with no end.
    if (target === null && focusRequest.kind === 'edge') return;
    authoring.takeFocusRequest();
    // Only when the completed projection has left focus nowhere. An author who
    // has already moved to another control keeps it.
    if (document.activeElement !== document.body) return;
    (target ?? document.querySelector<HTMLElement>('.react-flow'))?.focus();
  }, [focusRequest, authoring, focusTargetOf]);

  const cardTitles = useMemo(
    () => new Map(subjectCards.map((card) => [card.id, card.title])),
    [subjectCards],
  );
  const graphTitles = useMemo(
    () => new Map(graphs.map((graph) => [graph.id, graph.title])),
    [graphs],
  );

  /**
   * Decorate the projected Edges with the authoring facts React Flow reads.
   *
   * Only the Active Graph's Edges are selectable, focusable and reconnectable;
   * an Edge belonging to another Graph the Layout draws is there to be seen, and
   * putting it in the tab order would place inert stops between a keyboard
   * author and the Edges they can act on. Reconnection narrows further to the
   * *selected* Edge, so both transparent endpoint anchors are not permanently
   * live over every Card's authoring handles.
   */
  const decorated = useMemo(
    () =>
      edges.map((edge): Edge => {
        const subject = edgeSelectionOf(edge);
        // An Edge this projection cannot name is drawn and nothing more: not
        // selectable, not focusable, and never a deletion subject.
        if (subject === null) {
          return {
            ...edge,
            selected: false,
            selectable: false,
            focusable: false,
            deletable: false,
          };
        }
        const interactive = enabled && subject.graphId === activeGraphId;
        // **Conjoined with `interactive`, not merely compared with the stored
        // subject.** An Edge outside the Active Graph cannot remain selected
        // (CONTEXT.md), and this Edge draws its own toolbar from `selected` — so
        // reading the union alone would keep Delete live on an Edge activation
        // has just stopped offering, for as long as the union still named it.
        const selected = interactive && sameSelection(selection, subject);
        return {
          ...edge,
          selected,
          selectable: interactive,
          focusable: interactive,
          reconnectable: interactive && selected,
          deletable: interactive,
          ariaLabel: `Edge from ${cardTitles.get(subject.edge.from) ?? subject.edge.from} to ${
            cardTitles.get(subject.edge.to) ?? subject.edge.to
          } in ${graphTitles.get(subject.graphId) ?? 'this Graph'}`,
          domAttributes: {
            // React Flow does not select an Edge when it receives focus, so Tab
            // to an Edge followed by Delete would act on whatever was selected
            // before. This is the bridge that makes the two agree.
            onFocus: () => {
              if (interactive) onSelectEdge(subject);
            },
            onBlur: repairFocus,
          },
        };
      }),
    [edges, activeGraphId, selection, enabled, cardTitles, graphTitles, onSelectEdge, repairFocus],
  );

  /**
   * Which Cards an endpoint may move to, and why each cannot.
   *
   * One eligibility answer per Card, from the same query the completion re-asks:
   * a picker cannot offer a Card the Edit would refuse, and a Card it refuses is
   * shown disabled with its reason rather than dropped from the list.
   */
  const endpointChoices = useCallback(
    // Destructured rather than spread: the caller holds an `EdgeSelection`,
    // whose own `kind` would overwrite the proposal's and ask a different
    // question of eligibility entirely.
    ({ graphId, edge }: EdgeSubject, endpoint: EdgeEndpoint): CardChoice[] =>
      subjectCards.map((card) => {
        const eligibility = latest.current.authoring.eligibility({
          kind: 'reconnect',
          graphId,
          edge,
          endpoint,
          cardId: card.id,
        });
        return {
          id: card.id,
          title: card.title,
          ...(eligibility.kind === 'refused' ? { refusal: eligibility.reason } : {}),
        };
      }),
    [subjectCards],
  );

  // **Every Edge surface is gated on `enabled`, not on the draft alone.** The
  // module cancels a draft the moment authoring is withdrawn, but that lands on
  // a notification and this renders before it — so a picker read only off the
  // draft is briefly usable over a presentation that has already begun.
  const draft = enabled ? state.draft : null;
  const connectTarget = draft?.kind === 'keyboard-connect' ? draft.from : null;

  /**
   * Give the keyboard target picker focus as it opens.
   *
   * The control that opened it is the Card's Connect button, which stays on
   * screen — so without this the picker would be a surface the author has to
   * Tab to, and the Escape that cancels it would never reach the container
   * holding the handler.
   */
  useEffect(() => {
    if (connectTarget === null) return;
    document.querySelector<HTMLElement>('[data-testid="connect-target"]')?.focus();
  }, [connectTarget]);

  // `editing` is derived *inside* the memo rather than beside it: as a plain
  // render computation it would be a fresh object on every render, so the memo
  // it feeds would never hold and every Edge would re-render with it.
  const commands = useMemo(
    () => ({
      editing:
        draft?.kind === 'keyboard-reconnect' ? { graphId: draft.graphId, edge: draft.edge } : null,
      refusal: state.refusal,
      openEditor: authoring.openEdgeEditor,
      closeEditor: authoring.cancelDraft,
      reconnect: authoring.reconnect,
      deleteEdge: authoring.deleteEdge,
      endpointChoices,
    }),
    [draft, state.refusal, authoring, endpointChoices],
  );

  const connectChoices = useMemo((): CardChoice[] => {
    if (connectTarget === null) return [];
    return subjectCards.map((card) => {
      const eligibility = authoring.eligibility({
        kind: 'connect',
        from: connectTarget,
        to: card.id,
      });
      return {
        id: card.id,
        title: card.title,
        ...(eligibility.kind === 'refused' ? { refusal: eligibility.reason } : {}),
      };
    });
  }, [connectTarget, subjectCards, authoring]);

  const layer = (
    <>
      <NewCardPreview
        title={newCardTitle}
        modifierHeld={modifierHeld}
        pointerOver={pointerOver}
        accepts={acceptsEmptyDrop}
      />
      {connectTarget !== null && (
        <div
          className="edge-connect-picker nopan nodrag nokey"
          data-testid="connect-target-picker"
          /*
           * Escape cancels exactly one topmost Edge surface, and the open
           * combobox is a surface above this one.
           *
           * **A portal is not an escape from the React tree.** Radix renders
           * the popover through `createPortal`, but React dispatches synthetic
           * events along the *fiber* tree, so a keydown inside the portalled
           * content still bubbles to this handler — and Radix's own Escape
           * handling only calls `preventDefault`, never `stopPropagation`. One
           * press would therefore close the list and cancel the connection
           * together, leaving no way to back out of the list without losing the
           * gesture.
           *
           * The trigger's `data-state` is what separates the two layers: while
           * it reads `open` the press belongs to Radix, and the next one — with
           * the list closed and focus back on the trigger — is this one's. It
           * survived the move from `Select` to the Combobox composition because
           * both triggers are Radix triggers and both stamp that attribute.
           */
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            const trigger = event.currentTarget.querySelector('[data-testid="connect-target"]');
            if (trigger?.getAttribute('data-state') === 'open') return;
            event.stopPropagation();
            authoring.cancelDraft();
          }}
        >
          <CardCombobox
            label="Connect to"
            testId="connect-target"
            choices={connectChoices}
            value={null}
            onValueChange={(cardId) => {
              const to = uuidSchema.safeParse(cardId);
              if (!to.success) return;
              const completed = authoring.completeKeyboardConnect(
                to.data,
                latest.current.projectedNodes,
              );
              if (completed !== null) requestAnimationFrame(() => onSelectCard(completed));
            }}
          />
          {state.refusal !== null && (
            <span
              role="alert"
              className="edge-connect-picker__refusal"
              data-testid="connect-refusal"
            >
              {state.refusal}
            </span>
          )}
        </div>
      )}
      {/*
        The refusal every *other* path produces, said somewhere the author can
        read it.

        A refusal is retained beside the draft that ran into it, and a keyboard
        draft has a surface of its own — the picker above, or the Edge's
        popover — that shows it in context. A **pointer** gesture has neither:
        the drag is over, its draft is gone, and the sentence is the whole of
        what the author is told. Without this it was stored and shown nowhere.
      */}
      {state.refusal !== null && draft === null && (
        <span role="alert" className="edge-refusal" data-testid="edge-gesture-refusal">
          {state.refusal}
        </span>
      )}
    </>
  );

  const reactFlowProps = useMemo<EdgeOwnedReactFlowProps>(
    () => ({
      onConnect: handleConnect,
      onConnectStart: handleConnectStart,
      onConnectEnd: handleConnectEnd,
      isValidConnection,
      onReconnectStart: handleReconnectStart,
      onReconnect: handleReconnect,
      onReconnectEnd: handleReconnectEnd,
      onMouseMove: handleMouseMove,
      edgesReconnectable: false,
      edgesFocusable: false,
      deleteKeyCode: DELETE_KEYS,
      multiSelectionKeyCode: null,
      selectionKeyCode: null,
      selectionOnDrag: false,
    }),
    [
      handleConnect,
      handleConnectStart,
      handleConnectEnd,
      isValidConnection,
      handleReconnectStart,
      handleReconnect,
      handleReconnectEnd,
      handleMouseMove,
    ],
  );

  const provide = useCallback(
    (children: ReactNode) => (
      <EdgeAuthoringContext.Provider value={commands}>{children}</EdgeAuthoringContext.Provider>
    ),
    [commands],
  );

  return {
    edges: decorated,
    edgeTypes: EDGE_TYPES,
    reactFlowProps,
    layer,
    provide,
    deleteEdges,
    beginConnectFrom,
  };
}
