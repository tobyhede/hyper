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
import { CardPicker, type CardChoice } from '@project/ui';
import { newCardDrop, type DropTarget, type EdgeAuthoring } from './edge-authoring';
import { edgeSelectionOf, sameSelection, type CanvasSelection } from './render-adapter';
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
  readonly onSelectEdge: (graphId: GraphId, edge: GraphEdge) => void;
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

  const isValidConnection = useCallback<IsValidConnection>((connection) => {
    const from = uuidSchema.safeParse(connection.source);
    const to = uuidSchema.safeParse(connection.target);
    return (
      from.success &&
      to.success &&
      latest.current.authoring.accepts({ kind: 'connect', from: from.data, to: to.data })
    );
  }, []);

  const handleConnectStart = useCallback<OnConnectStart>((event, params) => {
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

  const handleReconnectStart = useCallback(
    (_event: unknown, edge: Edge, handleType: 'source' | 'target') => {
      const subject = edgeSelectionOf(edge);
      if (subject === null) return;
      latest.current.authoring.beginPointerReconnect(
        subject.graphId,
        subject.edge,
        handleType === 'source' ? 'from' : 'to',
      );
    },
    [],
  );

  /**
   * React Flow's `reconnectEdge` helper is deliberately not called. Hyper applies
   * no local change: the next controlled projection carries the completed Space,
   * and until it arrives React Flow re-renders the original Edge.
   *
   * The endpoint is derived from the proposed connection rather than read from
   * the draft's `handleType`, because the connection is what actually moved. A
   * drag moves exactly one end, so a `source` equal to the original's names the
   * *target* as the end that changed however the gesture began — including when
   * an endpoint is dropped back where it started, which then reads as unchanged
   * on the end that did not move and settles the same way.
   */
  const proposedReconnection = useRef(false);
  const handleReconnect = useCallback<OnReconnect>((oldEdge, connection) => {
    const subject = edgeSelectionOf(oldEdge);
    if (subject === null) return;
    proposedReconnection.current = true;
    const endpoint: EdgeEndpoint = connection.source === subject.edge.from ? 'to' : 'from';
    const cardId = uuidSchema.safeParse(
      endpoint === 'from' ? connection.source : connection.target,
    );
    if (cardId.success) latest.current.authoring.reconnect(endpoint, cardId.data);
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
   * There is no Escape to confuse this with. In the pinned 12.11.2 React Flow
   * calls `onReconnectEnd` only from `onPointerUp` — its Escape path runs
   * `cancelConnection` without it — so reaching here means the author released
   * the pointer somewhere deliberate.
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
        if (over === 'empty-canvas') {
          latest.current.authoring.deleteEdge(subject.graphId, subject.edge);
        }
      }
      // Whatever it produced, the drag is over: the draft goes and a refusal's
      // sentence stays, exactly as a connection drag ends.
      latest.current.authoring.endPointerDrag();
    },
    [],
  );

  const deleteEdges = useCallback((requested: readonly Edge[]) => {
    for (const edge of requested) {
      const subject = edgeSelectionOf(edge);
      if (subject !== null) latest.current.authoring.deleteEdge(subject.graphId, subject.edge);
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

  const focusRequest = state.focusRequest;
  useEffect(() => {
    if (focusRequest === null) return;
    authoring.takeFocusRequest();
    // Only when the completed projection has left focus nowhere. An author who
    // has already moved to another control keeps it.
    if (document.activeElement !== document.body) return;
    const node =
      focusRequest.kind === 'card'
        ? document.querySelector<HTMLElement>(
            `.react-flow__node[data-id="${CSS.escape(focusRequest.cardId)}"]`,
          )
        : null;
    (node ?? document.querySelector<HTMLElement>('.react-flow'))?.focus();
  }, [focusRequest, authoring]);

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
              if (interactive) onSelectEdge(subject.graphId, subject.edge);
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
    (graphId: GraphId, edge: GraphEdge, endpoint: EdgeEndpoint): CardChoice[] =>
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

  const draft = state.draft;
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
          // Escape cancels exactly one topmost Edge surface. While the Select's
          // listbox is open Radix owns the key and closes it — its content is
          // portalled, so that keydown never reaches here — and the next Escape,
          // with focus back on the trigger inside this container, cancels the
          // connection and returns the author to the source Card.
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            authoring.cancelDraft();
          }}
        >
          <CardPicker
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
