import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  useReactFlow,
  type Edge,
  type EdgeMouseHandler,
  type EdgeTypes,
  type IsValidConnection,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
} from '@xyflow/react';
import type { Resource, ResourceId, Graph, GraphId } from '@project/core';
import { titleName, uuidSchema } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import {
  ConnectionEndEligibilityContext,
  ConnectionTargetProximityProvider,
  ROUTED_EDGE_TYPE,
} from '@project/react-flow-adapter';
import { describeAuthoringRefusal } from './authoring-refusal';
import {
  dropTarget,
  newResourceDrop,
  type ElementDropTarget,
  type EdgeAuthoring,
} from './edge-authoring';
import {
  edgeSelectionOf,
  sameSelection,
  type CanvasSelection,
  type EdgeSubject,
} from './render-adapter';
import { AuthorableEdge } from './components/AuthorableEdge';
import {
  EdgeAuthoringContext,
  type EdgeAuthoringCommands,
} from './components/edge-authoring-context';
import { NewResourcePreview } from './components/NewResourcePreview';

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
  readonly onMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  /** Hover on an Edge's line reveals its commands. */
  readonly onEdgeMouseEnter: EdgeMouseHandler;
  readonly onEdgeMouseLeave: EdgeMouseHandler;
  /** An Edge's ends cannot be moved; changing one is Delete and draw again. */
  readonly edgesReconnectable: false;
  /** Focusability is per-Edge: only the Active Graph's Edges are tab stops. */
  readonly edgesFocusable: false;
  /** The app owns deletion; React Flow must install no document listener. */
  readonly deleteKeyCode: null;
  /** Version 1 authors one element at a time (Edge Authoring design). */
  readonly multiSelectionKeyCode: null;
  readonly selectionKeyCode: null;
  readonly selectionOnDrag: false;
}

export interface EdgeAuthoringSurface {
  readonly edges: Edge[];
  readonly edgeTypes: EdgeTypes;
  readonly reactFlowProps: EdgeOwnedReactFlowProps;
  /** Drawn inside the flow: the empty-drop preview and pointer-refusal announcement. */
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
  /** Remove the selected projected Edges through Edge Authoring. */
  readonly deleteEdges: (edges: readonly Edge[]) => void;
}

export interface EdgeAuthoringInput {
  readonly authoring: EdgeAuthoring;
  /** The projection the canvas is drawing, so a decoration cannot outrun it. */
  readonly edges: readonly Edge[];
  /** The next projection, merged into the live nodes by a completed connection. */
  readonly projectedNodes: readonly ResourceFlowNode[] | null;
  readonly selection: CanvasSelection;
  readonly activeGraphId: GraphId | null;
  readonly graphs: readonly Graph[];
  /** The Resources this Map places — what a picker may offer. */
  readonly placedResources: readonly Resource[];
  readonly newResourceTitle: string;
  /**
   * Edge authoring is withdrawn before a placement resolves, while a modal pane
   * covers the graph, while a chrome title edit is running, and while
   * presenting — the four terms `authorOnCanvas` carries, and the canvas passes
   * one value to it and to the Resource controls alike. The pane was missing here,
   * which left the pointer gesture live behind it; see
   * `authoring-availability.ts`'s `authorOnCanvas`.
   *
   * The chrome rename is its own term rather than a second pane: it is inline
   * and not modal at all — no backdrop, no focus trap, the canvas fully
   * reachable behind it — and it withdraws this lifecycle because a second
   * authoring surface must not start over a live one.
   *
   * Placement readiness is separate from Map existence because the
   * positioned strategy resolves asynchronously.
   */
  readonly enabled: boolean;
  readonly onSelectEdge: (subject: EdgeSubject) => void;
  /**
   * Extra seeking-end eligibility, for a connect that is not this canvas's
   * Active Graph — a Space Resource in Edit writing the Graph it is showing.
   */
  readonly mayOfferAlso?: (resourceId: ResourceId) => boolean;
}

const EDGE_TYPES: EdgeTypes = { [ROUTED_EDGE_TYPE]: AuthorableEdge };

/**
 * Which `ElementDropTarget` the element under the pointer is. Both class names
 * are React Flow's published theming API.
 *
 * React Flow's own `connectionState.isValid` does not answer this: it is `null`
 * — falsy — whenever no handle is in range, which is exactly what a release over
 * the toolbar produces. The canonical add-node-on-edge-drop example would author
 * a Resource there too.
 */
function elementDropTargetOf(target: EventTarget | null): ElementDropTarget {
  if (!(target instanceof Element)) return 'off-canvas';
  if (target.closest('.react-flow__renderer') === null) return 'off-canvas';
  return target.closest('.react-flow__node') === null ? 'empty-canvas' : 'resource';
}

/**
 * An Edge's toolbar, found from the flow: the chrome is portalled into React
 * Flow's label layer, not inside the Edge.
 */
const toolbarOf = (from: Element, edgeId: string): Element | null =>
  from.closest('.react-flow')?.querySelector(`[data-edge-chrome="${edgeId}"] [role="toolbar"]`) ??
  null;

/**
 * How long an Edge's commands outlast the pointer, so crossing the gap from the
 * line to the toolbar does not hide them.
 */
const HOVER_RELEASE_MS = 150;

export function useEdgeAuthoring({
  authoring,
  edges,
  projectedNodes,
  selection,
  activeGraphId,
  graphs,
  placedResources,
  newResourceTitle,
  enabled,
  onSelectEdge,
  mayOfferAlso,
}: EdgeAuthoringInput): EdgeAuthoringSurface {
  const state = useSyncExternalStore(authoring.subscribe, authoring.getState);
  const { screenToFlowPosition } = useReactFlow();
  const connecting = useRef(false);
  const [modifierHeld, setModifierHeld] = useState(false);
  // Where the pointer is, not the point it is at: React bails out of an
  // unchanged state write, so a pointer moving across empty canvas no longer
  // re-renders the flow per frame.
  const [pointerOver, setPointerOver] = useState<ElementDropTarget>('off-canvas');

  // The latest projection and module, read by stable callbacks. React Flow warns
  // that handler identities changing per render can drive it into a re-render
  // loop, and a connection handler closing over the projection is rebuilt by
  // every frame of a drag.
  //
  // Written after commit rather than during render, which is safe here because
  // every reader is a browser event: a pointer release or a key press arrives
  // from the event loop, always after the render that produced the value it
  // needs.
  const latest = useRef({ projectedNodes, authoring, mayOfferAlso });
  useEffect(() => {
    latest.current = { projectedNodes, authoring, mayOfferAlso };
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
    // An id that is not a Resource identity is not a connection to accept —
    // answering false is the honest reading, and a throw mid-drag the wrong one.
    return (
      source.success &&
      latest.current.authoring.accepts({ kind: 'create-and-connect', from: source.data })
    );
  }, []);

  /**
   * Whether releasing the seeking end on this Resource may be offered.
   *
   * Feeds `ResourceNode`'s reveal and `isConnectableEnd` so a refused target stays
   * invisible and unsnappable for the whole drag, matching `isValidConnection`
   * rather than lighting every Resource and only failing at release.
   */
  const mayOfferConnectionEnd = useCallback((resourceId: ResourceId): boolean => {
    if (latest.current.mayOfferAlso?.(resourceId) === true) return true;
    const { draft } = latest.current.authoring.getState();
    if (draft?.kind !== 'pointer-connect') return false;
    return latest.current.authoring.accepts({ kind: 'connect', from: draft.from, to: resourceId });
  }, []);

  /** Whether the drag currently under the pointer may be released here. */
  const isValidConnection = useCallback<IsValidConnection>((connection) => {
    const from = uuidSchema.safeParse(connection.source);
    const to = uuidSchema.safeParse(connection.target);
    if (!from.success || !to.success) return false;
    return latest.current.authoring.accepts({ kind: 'connect', from: from.data, to: to.data });
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
          : newResourceDrop(
              {
                kind: 'dragging',
                sourceId: connection.fromNode.id,
                point: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                over: dropTarget({
                  connectionTarget: connection.toNode !== null,
                  // Resolved from the point rather than read off the event:
                  // `event.target` is only the released-over element because
                  // `XYHandle` happens not to capture the pointer, which is an
                  // implementation detail rather than a documented guarantee.
                  // `elementFromPoint` is what React Flow itself uses to resolve
                  // a drop target.
                  element: elementDropTargetOf(
                    document.elementFromPoint(event.clientX, event.clientY),
                  ),
                }),
                modifierHeld: event.altKey,
              },
              acceptsEmptyDrop,
            );
      if (drop !== null) {
        const from = uuidSchema.safeParse(drop.sourceId);
        if (from.success) {
          latest.current.authoring.createConnectedResource(
            from.data,
            drop.position,
            latest.current.projectedNodes,
          );
        }
      }
      // The Resource a completed connection reached is published as a continuation
      // rather than selected here. **The frame this used to defer by is gone
      // with it**: it existed because selecting during the release would be
      // undone by the selection changes the release itself produces, and the
      // spend no longer happens inside `onConnectEnd` at all — the gesture
      // posts, and `CanvasContinuation` spends on a later render, after React
      // has committed the release.
      latest.current.authoring.endPointerDrag();
      setModifierHeld(false);
      setPointerOver('off-canvas');
      connecting.current = false;
    },
    [screenToFlowPosition, acceptsEmptyDrop],
  );

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!connecting.current) return;
    const over = elementDropTargetOf(event.target);
    setPointerOver(over);
    if (over === 'empty-canvas') setModifierHeld(event.altKey);
  }, []);

  const deleteEdges = useCallback((requested: readonly Edge[]) => {
    for (const edge of requested) {
      const subject = edgeSelectionOf(edge);
      if (subject !== null) latest.current.authoring.deleteEdge(subject);
    }
  }, []);

  /**
   * Repair the focus React Flow's native Edge Escape leaves on `body`.
   *
   * Its handler clears the selection and calls `blur()`, which is right for an
   * element it is deselecting and wrong for a canvas whose commands need a
   * defined graph focus. Deferred past React Flow's own handling, and applied
   * only when nothing else has taken focus in the meantime.
   */
  const enterToolbar = useCallback(
    (edgeId: string) =>
      (event: ReactKeyboardEvent<SVGGElement>): void => {
        if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
        const first = toolbarOf(event.currentTarget, edgeId)?.querySelector('button');
        if (first === null || first === undefined) return;
        event.preventDefault();
        first.focus();
      },
    [],
  );

  const repairFocus = useCallback(() => {
    requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>('.react-flow')?.focus();
    });
  }, []);

  // Names rather than Titles: these are read into an Edge's accessible name
  // below, and a name is one line (ADR 0083).
  const resourceTitles = useMemo(
    () => new Map(placedResources.map((resource) => [resource.id, titleName(resource.title)])),
    [placedResources],
  );
  const graphTitles = useMemo(
    () => new Map(graphs.map((graph) => [graph.id, graph.title])),
    [graphs],
  );

  /**
   * Decorate the projected Edges with the authoring facts React Flow reads.
   *
   * Only the Active Graph's Edges are selectable and focusable; an Edge
   * belonging to another Graph the Map draws is there to be seen, and putting it
   * in the tab order would place inert stops between a keyboard author and the
   * Edges they can act on. An Edge's toolbar is entered with Enter, not Tab.
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
        // (CONTEXT.md), and this Edge draws its own controls from `selected` — so
        // reading the union alone would keep Delete live on an Edge activation
        // has just stopped offering, for as long as the union still named it.
        const selected = interactive && sameSelection(selection, subject);
        return {
          ...edge,
          selected,
          selectable: interactive,
          focusable: interactive,
          deletable: interactive,
          ariaLabel: `Edge from ${resourceTitles.get(subject.edge.from) ?? subject.edge.from} to ${
            resourceTitles.get(subject.edge.to) ?? subject.edge.to
          } in ${graphTitles.get(subject.graphId) ?? 'this Graph'}`,
          domAttributes: {
            // React Flow does not select an Edge when it receives focus, so Tab
            // to an Edge followed by Delete would act on whatever was selected
            // before. This is the bridge that makes the two agree.
            onFocus: () => {
              if (interactive) onSelectEdge(subject);
            },
            onBlur: repairFocus,
            // Captured so React Flow's handler keeps its other keys (Escape
            // deselects); its Enter would only re-select the Edge.
            onKeyDownCapture: interactive ? enterToolbar(edge.id) : undefined,
          },
        };
      }),
    [
      edges,
      activeGraphId,
      selection,
      enabled,
      resourceTitles,
      graphTitles,
      onSelectEdge,
      repairFocus,
      enterToolbar,
    ],
  );

  /**
   * Which Edge the pointer is over, released {@link HOVER_RELEASE_MS} after it
   * leaves. One value for the canvas, because the line reports through React
   * Flow's canvas-level `onEdgeMouseEnter` and the Title and toolbar through the
   * Edge's own layer, and both must move the same fact.
   */
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverRelease = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdHover = useCallback(() => {
    if (hoverRelease.current !== null) clearTimeout(hoverRelease.current);
    hoverRelease.current = null;
  }, []);
  useEffect(() => holdHover, [holdHover]);
  const hover = useCallback(
    (edgeId: string) => {
      holdHover();
      setHovered(edgeId);
    },
    [holdHover],
  );
  const unhover = useCallback(
    (edgeId: string) => {
      holdHover();
      hoverRelease.current = setTimeout(() => {
        hoverRelease.current = null;
        setHovered((current) => (current === edgeId ? null : current));
      }, HOVER_RELEASE_MS);
    },
    [holdHover],
  );
  const handleEdgeMouseEnter = useCallback<EdgeMouseHandler>((_, edge) => hover(edge.id), [hover]);
  const handleEdgeMouseLeave = useCallback<EdgeMouseHandler>(
    (_, edge) => unhover(edge.id),
    [unhover],
  );

  const resourceName = useCallback(
    (resourceId: ResourceId): string => resourceTitles.get(resourceId) ?? resourceId,
    [resourceTitles],
  );

  /**
   * The sentence comes from the same retained refusal the Edge's alert region
   * draws, so the field and the region cannot disagree.
   */
  const completeTitle = useCallback(
    (title: string): string | null => {
      const refusal = authoring.completeTitle(title);
      return refusal === null ? null : describeAuthoringRefusal(refusal);
    },
    [authoring],
  );

  // **Every Edge surface is gated on `enabled`, not on the draft alone.** The
  // module cancels a draft the moment authoring is withdrawn, but that lands on
  // a notification and this renders before it.
  const draft = enabled ? state.draft : null;

  // `editingTitle` is derived *inside* the memo: outside it, a fresh object each
  // render would defeat the memo and re-render every Edge. `hovered` is gated on
  // `enabled` for the reason the draft is.
  const commands = useMemo<EdgeAuthoringCommands>(
    () => ({
      activeGraphId,
      editingTitle: draft?.kind === 'title' ? { graphId: draft.graphId, edge: draft.edge } : null,
      refusal: state.refusal,
      hovered: enabled ? hovered : null,
      hover,
      unhover,
      resourceName,
      beginTitleEdit: authoring.beginTitleEdit,
      completeTitle,
      cancelTitleEdit: authoring.cancelDraft,
      setTitleHidden: (subject, hidden) => {
        authoring.setTitleHidden(subject, hidden);
      },
      deleteEdge: (subject) => {
        authoring.deleteEdge(subject);
      },
    }),
    [
      activeGraphId,
      draft,
      state.refusal,
      enabled,
      hovered,
      hover,
      unhover,
      resourceName,
      authoring,
      completeTitle,
    ],
  );

  const layer = (
    <>
      <NewResourcePreview
        title={newResourceTitle}
        modifierHeld={modifierHeld}
        pointerOver={pointerOver}
        accepts={acceptsEmptyDrop}
      />
      {/*
        The canvas announcement channel: the one refusal with no surface left.

        Every other channel is owned by a surface that is still on screen — the
        Edge's toolbar, which reports its commands' refusals itself. A
        **completed pointer gesture** has none: the drag is over,
        its draft is gone, and this sentence is the whole of what the author is
        told. Which channel a refusal is on is Edge Authoring's answer, so this
        no longer has to infer it from an absent draft.
      */}
      {state.refusal?.kind === 'gesture' && (
        <span role="alert" className="canvas-refusal" data-testid="edge-gesture-refusal">
          {describeAuthoringRefusal(state.refusal.refusal)}
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
      onMouseMove: handleMouseMove,
      onEdgeMouseEnter: handleEdgeMouseEnter,
      onEdgeMouseLeave: handleEdgeMouseLeave,
      edgesReconnectable: false,
      edgesFocusable: false,
      deleteKeyCode: null,
      multiSelectionKeyCode: null,
      selectionKeyCode: null,
      selectionOnDrag: false,
    }),
    [
      handleConnect,
      handleConnectStart,
      handleConnectEnd,
      isValidConnection,
      handleMouseMove,
      handleEdgeMouseEnter,
      handleEdgeMouseLeave,
    ],
  );

  const connectionEndEligibility = useMemo(
    () => ({ mayOffer: mayOfferConnectionEnd }),
    [mayOfferConnectionEnd],
  );

  const provide = useCallback(
    (children: ReactNode) => (
      <ConnectionEndEligibilityContext.Provider value={connectionEndEligibility}>
        <ConnectionTargetProximityProvider>
          <EdgeAuthoringContext.Provider value={commands}>{children}</EdgeAuthoringContext.Provider>
        </ConnectionTargetProximityProvider>
      </ConnectionEndEligibilityContext.Provider>
    ),
    [commands, connectionEndEligibility],
  );

  return {
    edges: decorated,
    edgeTypes: EDGE_TYPES,
    reactFlowProps,
    layer,
    provide,
    deleteEdges,
  };
}
