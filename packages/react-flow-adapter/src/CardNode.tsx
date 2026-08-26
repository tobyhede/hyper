import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Handle,
  NodeResizeControl,
  Position,
  useConnection,
  type NodeProps,
  type OnResizeStart,
  type ShouldResize,
} from '@xyflow/react';
import { CanvasCard, CardContent, type CanvasCardFront, type CanvasCardProps } from '@project/ui';
import type { CardFlowNode, CardHandle } from './projection';
import { AUTHORING_HANDLE_DIAMETER, GRAPH_PORT_DIAMETER } from './authoring-handle';

/**
 * React Flow custom node: a Card front with one coloured handle per Graph at
 * the vertical offset the strategy computed for it. An opened Markdown Card
 * draws its content inside the same node; presenting independently draws the
 * active Card's rendered content at the frame's scale (ADR 0064, ADR 0027).
 *
 * The Card front itself — Markdown and Alias treatment, title editing, refusal
 * display, Open/Edit controls and interaction-state visuals — is the
 * production `@project/ui` `CanvasCard`. This module owns everything React
 * Flow: handles and their declared geometry, connection state, translating
 * selection/dragging into the Card's four external visual states, keeping a
 * Card's controls from leaking into node opening, dragging, panning or canvas
 * keyboard handling, and returning focus to this node once the title editor
 * completes or cancels from the keyboard.
 */
const AUTHORING_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;

/** Strips `readonly` off a props type so an optional slice of it can be built by
 *  conditionally assigning keys rather than by a conditional empty-object
 *  spread — the props themselves stay readonly to every other caller. The keys
 *  are already optional; this changes nothing but their mutability. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MarkdownOperations = Mutable<
  Pick<Extract<CanvasCardFront, { kind: 'markdown' }>, 'onOpenChange' | 'onBeginEdit'>
>;
type AliasFront = Mutable<Extract<CanvasCardFront, { kind: 'alias' }>>;

/*
 * Handle geometry is *declared*, not measured, so nothing here reports a change
 * to React Flow.
 *
 * React Flow measures a node's handles once and caches the result, which is its
 * own named cause of warning #008 and of edges attaching to stale points; the
 * documented remedy is `useUpdateNodeInternals`. That remedy is for nodes that
 * leave measuring to React Flow. `projection.ts` does not: it puts the
 * strategy's geometry on `node.handles`, `parseHandles` prefers that to the DOM,
 * and every projection allocates fresh nodes, so a Graph gaining a handle or a
 * strategy moving one is re-derived on the spot.
 *
 * Calling the hook on top of that is a regression rather than a belt-and-braces:
 * a forced update rebuilds the bounds with `getHandleBounds`, which reads only
 * the handles the DOM renders — the anchors of Graphs this Card is already on.
 * The declarations for every other Graph go with it, and those are exactly what
 * lets an Edge completed onto this Card resolve in the render that first makes
 * it incident, before the projection catches up.
 */

export function CardNode({ data, selected, dragging, isConnectable }: NodeProps<CardFlowNode>) {
  /**
   * Which handle role the live drag is looking for, or `null` when none is.
   *
   * A connection drawn from a source handle seeks a target — the ordinary case,
   * and the whole of what this used to answer. A **source-endpoint
   * reconnection** inverts it: React Flow anchors the drag at the Edge's
   * *target* and looks for a new source, so a Card that went on offering only
   * its target handles left that gesture with nowhere to land. Reading the
   * anchored end's type is what tells the two apart, and it changes nothing for
   * an ordinary connection, whose `fromHandle` is a source.
   */
  const seeking = useConnection((connection) =>
    connection.inProgress ? (connection.fromHandle.type === 'target' ? 'source' : 'target') : null,
  );
  const connectionInProgress = seeking !== null;
  const visuallySelected = selected || data.selectedForAuthoring;

  /**
   * The DOM subtree this node renders, kept only to reach the React Flow node
   * wrapper that contains it (`.react-flow__node`) — an ancestor React Flow
   * itself renders around whatever this component returns. It is what
   * `onReturnFocus` gives the Card's title editor a way to ask for without the
   * design-system component knowing React Flow exists.
   */
  const inner = useRef<HTMLDivElement>(null);

  // An absent `aliasOf` means the Target title did not resolve — unreachable for
  // a Space that survives intake (`validate.ts` refuses `unresolved-alias-target`
  // and `alias-targets-alias`), but `projection.ts` types it optional and the
  // Alias front carries the Target title as required. The empty string is how
  // that reaches `CanvasCard` as "no Target to name", and `CanvasCard` draws no
  // Target line for it rather than an empty one.
  const markdownOperations: MarkdownOperations = {};
  if (data.cardEditingEnabled === true && data.onEditCard !== undefined) {
    markdownOperations.onOpenChange = data.onEditCard;
  }
  if (data.onBeginBodyEditing !== undefined) {
    markdownOperations.onBeginEdit = data.onBeginBodyEditing;
  }
  const markdownFront: CanvasCardFront =
    data.expanded === true && data.bodyEditor !== undefined
      ? {
          kind: 'markdown',
          source: data.body ?? '',
          open: true,
          editor: data.bodyEditor,
          ...markdownOperations,
        }
      : data.expanded === true
        ? { kind: 'markdown', source: data.body ?? '', open: true, ...markdownOperations }
        : {
            kind: 'markdown',
            source: data.body ?? '',
            open: false,
            ...markdownOperations,
          };
  const aliasFront: AliasFront = {
    kind: 'alias',
    aliasOf: data.aliasOf ?? '',
  };
  if (data.cardEditingEnabled === true && data.onEditCard !== undefined) {
    const openAlias = data.onEditCard;
    aliasFront.onOpen = () => openAlias(true);
  }
  const front: CanvasCardFront = data.kind === 'alias' ? aliasFront : markdownFront;

  const renderHandle = (handle: CardHandle, type: 'source' | 'target') => (
    <Handle
      key={handle.id}
      id={handle.id}
      type={type}
      position={type === 'target' ? Position.Left : Position.Right}
      className="rf-card-node__port"
      aria-hidden="true"
      isConnectable={false}
      style={{
        top: handle.offsetY,
        width: GRAPH_PORT_DIAMETER,
        height: GRAPH_PORT_DIAMETER,
        background: handle.color,
        opacity: 0,
      }}
    />
  );

  const renderAuthoringHandle = (
    side: (typeof AUTHORING_SIDES)[number],
    role: 'source' | 'target',
  ) => (
    <Handle
      key={`${role}-${side}`}
      id={`authoring-${role}-${side}`}
      type={role}
      position={side}
      className={`rf-card-node__authoring-handle rf-card-node__authoring-handle--${role}`}
      aria-label={`${role === 'source' ? 'Connect from' : 'Connect to'} ${side}`}
      // `isConnectable` is React Flow's own switch and it only works if a custom
      // node forwards it: `NodeWrapper` resolves `nodesConnectable` and the
      // node's own `connectable` into this one prop and hands it over, and
      // enforces nothing itself on a handle it did not render. Its `DefaultNode`
      // passes it straight to both `Handle`s, and this is the same forwarding.
      //
      // These four are the only handles that can begin a gesture — the graph
      // ports below are `isConnectable={false}` outright — so dropping it left
      // the flow-level flag governing nothing but whether the connection line
      // rendered, with CSS and a pane's backdrop standing in for the withdrawal.
      isConnectableStart={isConnectable && role === 'source' && !connectionInProgress}
      isConnectableEnd={isConnectable && role === seeking}
      // A handle is a drag affordance, and a click is not a drag. A press and
      // release inside React Flow's drag threshold starts no connection, so the
      // click reached the Card underneath and opened it to read — from the one
      // control whose whole purpose is to begin an Edge. React Flow spreads
      // caller props after its own `onClick`, so this replaces it.
      onClick={(event) => event.stopPropagation()}
      style={{
        width: AUTHORING_HANDLE_DIAMETER,
        height: AUTHORING_HANDLE_DIAMETER,
        background: data.activeGraphColor,
      }}
    />
  );

  /*
   * A control reaches the Card only when the composition both offered it and
   * said how it is performed. The flag and the operation answer different
   * questions — whether this Card takes part at all, and what happens when the
   * control is used — and `SpaceCanvas` supplies them together, but the type
   * lets them diverge. Taking the flag alone put a live control on the Card
   * whose activation ran nothing; forwarding the operation with `?.` made the
   * miss silent. `CanvasCard` draws no control it has no operation for, so
   * withholding it here is the same answer one layer up.
   */
  const canvasCardOptionalProps: Mutable<Pick<CanvasCardProps, 'onBeginTitleEdit'>> = {};
  if (
    data.bodyEditor === undefined &&
    data.titleEditingEnabled === true &&
    data.onBeginTitleEditing !== undefined
  ) {
    canvasCardOptionalProps.onBeginTitleEdit = data.onBeginTitleEditing;
  }

  /* The editor's presence is the editing state, and it arrives with the two
     operations that end it — so nothing here has to stand in for a completion
     the composition did not supply. */
  const titleEditor = data.bodyEditor === undefined ? data.titleEditor : undefined;

  /*
   * What an open Card draws below its title (ADR 0064).
   *
   * **Not a fourth arm of the branch below.** It is a prop handed to whichever
   * arm the *title* state selects, so a Card can be open while it is being
   * renamed — expansion is what the Layout authored and the caret is a gesture,
   * and a branch would have made them exclusive. It is not `showContent`
   * either: both presenting and expanding draw through the one rendered-Markdown
   * seam, while the open Card swaps that display for source only during an
   * edit.
   *
   * The Alias kind has no open front yet, so authored `expanded` state is false
   * for one. `CanvasCard` receives the Markdown source, authored open state and
   * live editor as one front rather than receiving body markup from this adapter.
   */
  const resize = data.resize;
  const resizeOperation = useRef(resize);
  useEffect(() => {
    resizeOperation.current = resize;
  }, [resize]);
  const resizing = useRef(false);
  const [resizeActive, setResizeActive] = useState(false);
  /*
   * Narrow interactive deviation for cancellation the specialist control does
   * not expose:
   * - Existing Hyper component considered: the existing CardNode composition.
   * - shadcn/Base UI component considered: none owns graph-node resizing.
   * - Product requirement that cannot be expressed: pointer cancellation,
   *   window focus loss and unmount must discard the whole canvas draft.
   * - Why composition or a variant is insufficient: NodeResizeControl exposes
   *   start/change/end only, with no cancellation callback.
   * - Custom behavior being introduced: translate those three loss signals to
   *   the resize capability's one cancellation operation.
   * - Tests proving the deviation: render-adapter cancellation and replacement
   *   tests, plus the application browser's pointer-cancellation assertion.
   */
  useEffect(() => {
    const finish = () => {
      if (!resizing.current) return;
      resizing.current = false;
      setResizeActive(false);
      resizeOperation.current?.onResizeEnd();
    };
    const cancel = () => {
      if (!resizing.current) return;
      resizing.current = false;
      setResizeActive(false);
      resizeOperation.current?.onResizeCancel();
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      cancel();
    };
  }, []);
  /*
   * One identity for the life of the node, which is a contract rather than a
   * tidy-up: `NodeResizeControl` lists the resize callbacks among an effect's
   * dependencies, and that effect's cleanup is `selection.on('.drag', null)` —
   * it strips *every* `.drag` listener from the control element. d3-drag leaves
   * a touch gesture's `touchmove` and `touchend` there for the whole gesture,
   * so a callback rebuilt mid-drag takes the gesture down with it and the
   * resize dies on its first frame. And this node re-renders mid-drag by
   * construction: the adapter republishes the projection on every preview
   * frame, and beginning the gesture flips `resizeActive` here as well. A mouse
   * gesture survives the same teardown only by accident, because d3-drag moved
   * its two listeners to the window at `mousedown`. The ref above is what lets
   * a stable callback still reach a replaced capability.
   */
  const beginResize = useCallback<OnResizeStart>(() => {
    resizing.current = true;
    setResizeActive(true);
    resizeOperation.current?.onResizeStart();
  }, []);
  /*
   * React Flow otherwise applies this Card's dimensions immediately after
   * calling the proposal callback. Returning false keeps that node-only change
   * out: the render adapter projects the proposed Placement and publishes Card,
   * neighbours, handles and Edges once.
   *
   * The guard is what makes the three loss signals above final. None of them
   * ends the drag underneath: `NodeResizeControl` drives d3-drag, which installs
   * its own `mousemove`/`mouseup` on the window at `mousedown` and removes them
   * only at `mouseup`, and neither `pointercancel` nor losing the window is a
   * signal it listens for. So frames keep arriving after cancellation, with no
   * way to stop them and no draft left to answer them. Refusing them here is
   * what keeps the Card the author sees — back at its authored rect, controls
   * returned — the same fact as the draft the adapter holds.
   */
  const proposeResize = useCallback<ShouldResize>((_event, next) => {
    if (!resizing.current) return false;
    resizeOperation.current?.onResize({ width: next.width, height: next.height });
    return false;
  }, []);
  const expanded = data.expanded === true;

  const onReturnFocus = () => {
    inner.current?.closest<HTMLElement>('.react-flow__node')?.focus();
  };

  return (
    <div
      ref={inner}
      className="rf-card-node__inner"
      data-active={data.active}
      data-selected={visuallySelected}
      data-connection-in-progress={connectionInProgress}
      data-connection-seeking={seeking ?? 'none'}
      data-resizing={resizeActive}
      // The wrapper React Flow sizes from `node.width`/`node.height` is this
      // element's parent, so an Expanded Card only reaches its own rect if this
      // one stops declaring the collapsed constant — which `styles.css` does
      // unconditionally rather than under this attribute, because keying
      // geometry on the flag is exactly the discontinuity that makes a close
      // snap. **No stylesheet reads this**, deliberately: it publishes authored
      // open state for tests and assistive technology, and geometry is never
      // allowed to depend on it.
      data-expanded={expanded}
    >
      {/*
        React Flow's own bottom-right resize control, revealed on an Expanded Card
        by hover, Selection or focus rather than drawn only once selected. An
        Expanded Card is whatever box the author drew — there is no ratio on it,
        because the closed Card is what keeps the silhouette that predicts
        what an audience sees (ADR 0064).

        Rendered *before* the Card, which is not cosmetic: `canvas-card.css`
        keeps the Card's hover treatment alive while the pointer is on an
        authoring handle through `:has(~ …__authoring-handle:hover)`, and `~`
        reaches following siblings only. Anything inserted between the Card and
        those handles would be invisible to that rule; anything before the Card
        is harmless to it.
      */}
      {expanded && resize !== undefined && (
        <NodeResizeControl
          position="bottom-right"
          minWidth={resize.minWidth}
          minHeight={resize.minHeight}
          className="rf-card-node__resize-control"
          onResizeStart={beginResize}
          shouldResize={proposeResize}
        >
          <span className="rf-card-node__resize-mark" aria-hidden="true" />
        </NodeResizeControl>
      )}
      {data.targetHandles.map((handle) => renderHandle(handle, 'target'))}
      {data.showContent ? (
        <div className="rf-card-node__content">
          <CardContent title={data.title} markdown={data.body ?? ''} />
        </div>
      ) : titleEditor !== undefined ? (
        <CanvasCard
          front={front}
          title={data.title}
          graphColor={data.activeGraphColor}
          state="editing"
          onCompleteTitleEdit={titleEditor.onComplete}
          onCancelTitleEdit={titleEditor.onCancel}
          onReturnFocus={onReturnFocus}
          {...canvasCardOptionalProps}
        />
      ) : (
        <CanvasCard
          front={front}
          title={data.title}
          graphColor={data.activeGraphColor}
          state={dragging ? 'dragging' : visuallySelected ? 'selected' : 'rest'}
          {...canvasCardOptionalProps}
        />
      )}
      {/*
        Every authoring handle renders *after* the Card, both roles together.
        `canvas-card.css` keeps the Card's hover treatment alive while the
        pointer sits on a handle through `:has(~ …__authoring-handle:hover)`,
        and `~` reaches following siblings only — a handle rendered before the
        Card is one that rule cannot see, which is what left the target handles
        dropping the Card back to its rest face mid-connection. Position is
        `position` on the handle itself, so the four sides are unaffected by the
        order they are declared in. `CardNode.test.tsx` pins the ordering.
      */}
      {AUTHORING_SIDES.map((side) => renderAuthoringHandle(side, 'target'))}
      {AUTHORING_SIDES.map((side) => renderAuthoringHandle(side, 'source'))}
      {data.sourceHandles.map((handle) => renderHandle(handle, 'source'))}
    </div>
  );
}
