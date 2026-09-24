import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Handle,
  NodeResizeControl,
  NodeToolbar,
  Position,
  useConnection,
  useStore,
  useViewport,
  type NodeProps,
  type OnResizeStart,
  type ShouldResize,
} from '@xyflow/react';
import {
  CanvasResource,
  ResourceContent,
  type CanvasResourceFront,
  type CanvasResourceProps,
} from '@project/ui';
import type { ResourceFlowNode } from './projection';
import { AUTHORING_HANDLE_DIAMETER } from './authoring-handle';
import { useConnectionEndEligible } from './connection-end-eligibility';
import { useConnectionTargetProximity } from './connection-target-proximity';
import { offersConnectionEnd } from './connection-target-reveal';

/**
 * React Flow custom node: a Resource front with one Edge anchor on each of its four
 * sides. An opened Markdown Resource draws its content inside the same node;
 * presenting independently draws the active Resource's rendered content at the
 * frame's scale (ADR 0064, ADR 0027).
 *
 * The Resource front itself — Markdown and Reference Resource treatment, title editing, refusal
 * display, Open/Edit controls and interaction-state visuals — is the
 * production `@project/ui` `CanvasResource`. This module owns everything React
 * Flow: handles and their declared geometry, connection state, translating
 * selection/dragging into the Resource's four external visual states, keeping a
 * Resource's controls from leaking into node opening, dragging, panning or canvas
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
  Pick<Extract<CanvasResourceFront, { kind: 'markdown' }>, 'onOpenChange' | 'onBeginEdit'>
>;
type ReferenceFront = Mutable<Extract<CanvasResourceFront, { kind: 'reference' }>>;
type SpaceFront = Mutable<Extract<CanvasResourceFront, { kind: 'space' }>>;

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
 * the handles the DOM renders — the anchors of Graphs this Resource is already on.
 * The declarations for every other Graph go with it, and those are exactly what
 * lets an Edge completed onto this Resource resolve in the render that first makes
 * it incident, before the projection catches up.
 */

export function ResourceNode({
  id,
  data,
  selected,
  dragging,
  isConnectable,
}: NodeProps<ResourceFlowNode>) {
  /**
   * Which handle role the live drag is looking for, or `null` when none is.
   *
   * Always a target while a drag is live: a drag begins only at a source handle
   * (`isConnectableStart` below), and an Edge's ends cannot be dragged.
   */
  const seeking = useConnection((connection) =>
    connection.inProgress ? ('target' as const) : null,
  );
  const connectionInProgress = seeking !== null;
  /**
   * React Flow has already snapped here. A snapped Resource is near by definition
   * (`ResourceNode.test.tsx`).
   */
  const snappedHere = useConnection(
    (connection) => connection.inProgress && connection.toNode?.id === id,
  );
  /**
   * Seeking-end handles show only when the pointer is near this Resource *and*
   * Space Authoring would accept a release here. Far or refused Resources stay
   * quiet; anchors remain mounted either way (ADR 0087).
   */
  const near = useConnectionTargetProximity(id) || snappedHere;
  const eligible = useConnectionEndEligible(data.resourceId);
  const offerEnd = offersConnectionEnd({ seeking, near, eligible });
  const visuallySelected = selected || data.selectedForAuthoring;

  /**
   * The DOM subtree this node renders, kept only to reach the React Flow node
   * wrapper that contains it (`.react-flow__node`) — an ancestor React Flow
   * itself renders around whatever this component returns. It is what
   * `onReturnFocus` gives the Resource's title editor a way to ask for without the
   * design-system component knowing React Flow exists.
   */
  const inner = useRef<HTMLDivElement>(null);
  const reportBodyHeight = data.onBodyHeightChange;
  const onBodyHeightChange = useCallback(
    (height: number | null) => reportBodyHeight?.(id, height),
    [id, reportBodyHeight],
  );

  const markdownOperations: MarkdownOperations = {};
  if (data.onEditResource !== undefined) {
    markdownOperations.onOpenChange = data.onEditResource;
  }
  if (data.onBeginBodyEditing !== undefined) {
    markdownOperations.onBeginEdit = data.onBeginBodyEditing;
  }
  const markdownFront: CanvasResourceFront =
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
  const referenceFront: ReferenceFront = {
    kind: 'reference',
    target:
      data.spaceContent !== undefined
        ? { kind: 'space' }
        : { kind: 'markdown', source: data.body ?? '' },
    open: data.expanded === true,
  };
  if (data.onEditResource !== undefined) {
    referenceFront.onOpenChange = data.onEditResource;
  }
  // A Space Resource's own front carries nothing it authors of the target: its
  // Title is the Resource's, its content is the target Space's, and the
  // composition hands down the rail fragment plus Enter.
  const spaceFront: SpaceFront = {
    kind: 'space',
    open: data.expanded === true,
  };
  if (data.onEditResource !== undefined) {
    spaceFront.onOpenChange = data.onEditResource;
  }
  if (data.spaceSelection !== undefined) spaceFront.selection = data.spaceSelection;
  if (data.spaceRail !== undefined) spaceFront.spaceRail = data.spaceRail;
  if (data.portal !== undefined) spaceFront.portal = data.portal;
  const front: CanvasResourceFront =
    data.kind === 'reference' ? referenceFront : data.kind === 'space' ? spaceFront : markdownFront;

  /**
   * Whether this Resource's anchors are also affordances.
   *
   * Read-only draws a Resource without Resource-owned controls, and a Read embedding
   * withholds the gesture — but both still draw Edges, and an Edge attaches to
   * an anchor (ADR 0087). So the four sides render either way and this decides
   * only whether an author may take hold of one.
   */
  const connectionAuthoring = !data.readOnly && data.connectionAuthoringEnabled !== false;

  const renderAuthoringHandle = (
    side: (typeof AUTHORING_SIDES)[number],
    role: 'source' | 'target',
  ) => (
    <Handle
      key={`${role}-${side}`}
      id={`authoring-${role}-${side}`}
      type={role}
      position={side}
      className={`rf-resource-node__authoring-handle rf-resource-node__authoring-handle--${role}`}
      {...(connectionAuthoring
        ? { 'aria-label': `${role === 'source' ? 'Connect from' : 'Connect to'} ${side}` }
        : { 'aria-hidden': true })}
      // `isConnectable` is React Flow's own switch and it only works if a custom
      // node forwards it: `NodeWrapper` resolves `nodesConnectable` and the
      // node's own `connectable` into this one prop and hands it over, and
      // enforces nothing itself on a handle it did not render. Its `DefaultNode`
      // passes it straight to both `Handle`s, and this is the same forwarding.
      //
      // These are the only handles a gesture can begin at — there are no others
      // left since ADR 0087 — so dropping it left the flow-level flag governing
      // nothing but whether the connection line rendered, with CSS and a pane's
      // backdrop standing in for the withdrawal.
      isConnectable={connectionAuthoring && isConnectable}
      isConnectableStart={
        connectionAuthoring && isConnectable && role === 'source' && !connectionInProgress
      }
      // Eligibility withdraws the end from snap as well as from reveal; proximity
      // only gates the latter — within React Flow's 20px snap the Resource is already
      // inside the 80-unit magnet, so a visible handle and a landable one agree.
      isConnectableEnd={connectionAuthoring && isConnectable && role === seeking && eligible}
      // A handle is a drag affordance, and a click is not a drag. A press and
      // release inside React Flow's drag threshold starts no connection, so the
      // click reached the Resource underneath and opened it to read — from the one
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
   * A control reaches the Resource only when the composition supplied the
   * operation that performs it. Presence is the capability — there is no
   * separate flag left to disagree with it — so `CanvasResource` draws no
   * control it has no operation for, and withholding it here is the same
   * answer one layer up.
   */
  const canvasResourceOptionalProps: Mutable<
    Pick<
      CanvasResourceProps,
      'onBeginTitleEdit' | 'entityActions' | 'onBodyHeightChange' | 'contextNotice'
    >
  > = {};
  if (data.contextNotice !== undefined && data.contextNotice !== null) {
    canvasResourceOptionalProps.contextNotice = data.contextNotice;
  }
  if (reportBodyHeight !== undefined) {
    canvasResourceOptionalProps.onBodyHeightChange = onBodyHeightChange;
  }
  if (data.onBeginTitleEditing !== undefined) {
    canvasResourceOptionalProps.onBeginTitleEdit = data.onBeginTitleEditing;
  }
  /*
   * Forwarded whole rather than flag-and-operation, because a command list is
   * already both: each command carries what running it does, and a command the
   * composition withheld is simply not in the list. What is decided here is the
   * one fact this layer knows and the composition does not — a read-only
   * canvas draws content and no commands, so the menu goes with the rest of the
   * rail rather than being the one control that survived it.
   */
  if (!data.readOnly && data.entityActions !== undefined) {
    canvasResourceOptionalProps.entityActions = data.entityActions;
  }

  /* The editor's presence is the editing state, and it arrives with the two
     operations that end it — so nothing here has to stand in for a completion
     the composition did not supply. */
  const titleEditor = !data.readOnly ? data.titleEditor : undefined;

  /*
   * What an open Resource draws below its title (ADR 0064).
   *
   * **Not a fourth arm of the branch below.** It is a prop handed to whichever
   * arm the *title* state selects, so a Resource can be open while it is being
   * renamed — Opening is what the Map authored and the caret is a gesture,
   * and a branch would have made them exclusive. It is not `showContent`
   * either: both presenting and Opening draw through the one rendered-Markdown
   * seam, while the open Resource swaps that display for source only during an
   * edit.
   *
   * For a Reference Resource, the projection resolves the immutable Target's Markdown source.
   * `CanvasResource` receives that source and authored open state as one front rather
   * than receiving body markup from this adapter.
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
   * - Existing Hyper component considered: the existing ResourceNode composition.
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
   * React Flow otherwise applies this Resource's dimensions immediately after
   * calling the proposal callback. Returning false keeps that node-only change
   * out: the render adapter projects the proposed Placement and publishes Resource,
   * neighbours, handles and Edges once.
   *
   * The guard is what makes the three loss signals above final. None of them
   * ends the drag underneath: `NodeResizeControl` drives d3-drag, which installs
   * its own `mousemove`/`mouseup` on the window at `mousedown` and removes them
   * only at `mouseup`, and neither `pointercancel` nor losing the window is a
   * signal it listens for. So frames keep arriving after cancellation, with no
   * way to stop them and no draft left to answer them. Refusing them here is
   * what keeps the Resource the author sees — back at its authored rect, controls
   * returned — the same fact as the draft the adapter holds.
   */
  const proposeResize = useCallback<ShouldResize>((_event, next) => {
    if (!resizing.current) return false;
    resizeOperation.current?.onResize({ width: next.width, height: next.height });
    return false;
  }, []);
  const expanded = data.expanded === true;
  const { zoom } = useViewport();
  const resizeScale = Math.max(1 / zoom, 1);

  /**
   * Whether React Flow holds some other Resource selected. The toolbar is one
   * Resource's commands, so a multi-selection shows none — `NodeToolbar`'s own
   * default. Asked of React Flow's own selection, because this Resource may be
   * selected only by the authoring selection (`selectedForAuthoring`) for a render;
   * and asked only of a selected Resource, so every other Resource answers without
   * walking the flow.
   */
  const otherSelected = useStore((state) =>
    visuallySelected ? state.nodes.some((node) => node.selected && node.id !== id) : false,
  );
  const toolbarVisible =
    ((visuallySelected && !otherSelected) ||
      data.bodyEditor !== undefined ||
      data.portal?.editing === true) &&
    !dragging &&
    !resizeActive;
  /**
   * The Resource's commands float above its top-right corner, outside the Resource
   * and at a constant screen size, as React Flow's `NodeToolbar` draws them. The
   * offset is screen pixels and the top anchor reaches half its diameter above
   * the Resource in canvas units, so the offset scales with it to keep the
   * toolbar clear of the anchor at every zoom.
   */
  const renderToolbar = (toolbar: ReactNode) =>
    toolbar === null ? null : (
      <NodeToolbar
        isVisible={toolbarVisible}
        position={Position.Top}
        align="end"
        offset={(AUTHORING_HANDLE_DIAMETER / 2) * zoom + 6}
        data-resource-rail-for={id}
      >
        {toolbar}
      </NodeToolbar>
    );

  const onReturnFocus = () => {
    inner.current?.closest<HTMLElement>('.react-flow__node')?.focus();
  };

  return (
    <div
      ref={inner}
      className="rf-resource-node__inner"
      data-active={data.active}
      data-selected={visuallySelected}
      data-connection-in-progress={connectionInProgress}
      data-connection-seeking={offerEnd ? seeking : 'none'}
      // Whether the four anchors are also affordances. They render either way —
      // an Edge attaches to an anchor and React Flow draws no Edge for a Resource
      // whose handles it cannot resolve — so this is what the reveal in
      // `styles.css` reads before showing one to a pointer (ADR 0087).
      data-connection-authoring={connectionAuthoring}
      data-resizing={resizeActive}
      // Whether this Resource is the one being moved. A drag satisfies every
      // condition the hover chrome is revealed by — the pointer is on the Resource
      // it carries, and React Flow Selects it — so the reveal in `styles.css`
      // reads this to withhold the anchors and the resize control for the
      // gesture, exactly as it reads `data-resizing` for the other one.
      data-dragging={dragging}
      // The wrapper React Flow sizes from `node.width`/`node.height` is this
      // element's parent, so an Expanded Resource only reaches its own rect if this
      // one stops declaring the collapsed constant — which `styles.css` does
      // unconditionally rather than under this attribute, because keying
      // geometry on the flag is exactly the discontinuity that makes a close
      // snap. **No stylesheet reads this**, deliberately: it publishes authored
      // open state for tests and assistive technology, and geometry is never
      // allowed to depend on it.
      data-expanded={expanded}
      // Read by `styles.css`, which leans the Resource rather than this element.
      // The Resource is a sibling of the handles, not their ancestor.
      data-drag-tilted={data.dragTilted === true}
    >
      {/*
        React Flow's own bottom-right resize control, revealed on an Expanded Resource
        by hover, Selection or focus rather than drawn only once selected. An
        Expanded Resource is whatever box the author drew — there is no ratio on it,
        because the closed Resource is what keeps the silhouette that predicts
        what an audience sees (ADR 0064).

        Rendered *before* the Resource, which is not cosmetic: `canvas-resource.css`
        keeps the Resource's hover treatment alive while the pointer is on an
        authoring handle through `:has(~ …__authoring-handle:hover)`, and `~`
        reaches following siblings only. Anything inserted between the Resource and
        those handles would be invisible to that rule; anything before the Resource
        is harmless to it.
      */}
      {!data.readOnly && expanded && resize !== undefined && (
        <>
          <span
            className="rf-resource-node__resize-mark"
            style={{
              right: `${-4 * resizeScale}px`,
              bottom: `${-4 * resizeScale}px`,
              scale: String(resizeScale),
            }}
            aria-hidden="true"
          />
          <NodeResizeControl
            position="bottom-right"
            minWidth={resize.minWidth}
            minHeight={resize.minHeight}
            className="rf-resource-node__resize-control"
            onResizeStart={beginResize}
            shouldResize={proposeResize}
          />
        </>
      )}
      {data.showContent ? (
        <div className="rf-resource-node__content">
          <ResourceContent title={data.title} markdown={data.body ?? ''} />
        </div>
      ) : titleEditor !== undefined ? (
        <CanvasResource
          readOnly={data.readOnly}
          front={front}
          renderToolbar={renderToolbar}
          title={data.title}
          graphColor={data.activeGraphColor}
          state="editing"
          onCompleteTitleEdit={titleEditor.onComplete}
          onCancelTitleEdit={titleEditor.onCancel}
          onReturnFocus={onReturnFocus}
          {...canvasResourceOptionalProps}
        />
      ) : (
        <CanvasResource
          readOnly={data.readOnly}
          front={front}
          renderToolbar={renderToolbar}
          title={data.title}
          graphColor={data.activeGraphColor}
          state={dragging ? 'dragging' : visuallySelected ? 'selected' : 'rest'}
          onReturnFocus={onReturnFocus}
          {...canvasResourceOptionalProps}
        />
      )}
      {/*
        Every anchor renders *after* the Resource, both roles together.
        `canvas-resource.css` keeps the Resource's hover treatment alive while the
        pointer sits on a handle through `:has(~ …__authoring-handle:hover)`,
        and `~` reaches following siblings only — a handle rendered before the
        Resource is one that rule cannot see, which is what left the target handles
        dropping the Resource back to its rest face mid-connection. Position is
        `position` on the handle itself, so the four sides are unaffected by the
        order they are declared in. `ResourceNode.test.tsx` pins the ordering.
      */}
      {AUTHORING_SIDES.map((side) => renderAuthoringHandle(side, 'target'))}
      {AUTHORING_SIDES.map((side) => renderAuthoringHandle(side, 'source'))}
    </div>
  );
}
