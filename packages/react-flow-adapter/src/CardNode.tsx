import { useRef } from 'react';
import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
import { CanvasCard, CardContent, type CanvasCardFront, type CanvasCardProps } from '@project/ui';
import type { CardFlowNode, CardHandle } from './projection';
import { AUTHORING_HANDLE_DIAMETER, GRAPH_PORT_DIAMETER } from './authoring-handle';

/**
 * React Flow custom node: a card's title, with one colored handle per graph at
 * the vertical offset ELK computed for it.
 *
 * The card's content is deliberately not drawn here (ADR 0006) — a graph is for
 * reading the shape of a space, and a wall of clipped markdown at graph zoom is
 * unreadable anyway. Opening a card is how you read it.
 *
 * The one exception is the Card reached during traversal while presenting, which draws
 * its content instead: presenting is the graph seen close enough that one card
 * fills the screen (ADR 0027), so at that zoom the content is exactly what is
 * legible. It is still the same node — nothing is transformed into anything, and
 * there is no second artefact (ADR 0024).
 *
 * The Card front itself — Markdown and Alias treatment, title editing, refusal
 * display, Connect/Edit controls and interaction-state visuals — is the
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
  const front: CanvasCardFront =
    data.kind === 'alias' ? { kind: 'alias', aliasOf: data.aliasOf ?? '' } : { kind: 'markdown' };

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

  const canvasCardOptionalProps: Mutable<
    Pick<CanvasCardProps, 'onBeginTitleEdit' | 'onConnect' | 'onEdit'>
  > = {};
  if (data.titleEditingEnabled === true) {
    canvasCardOptionalProps.onBeginTitleEdit = () => data.onBeginTitleEditing?.();
  }
  if (data.connectingEnabled === true) {
    canvasCardOptionalProps.onConnect = () => data.onBeginConnect?.();
  }
  if (data.cardEditingEnabled === true) {
    canvasCardOptionalProps.onEdit = () => data.onEditCard?.();
  }

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
    >
      {data.targetHandles.map((handle) => renderHandle(handle, 'target'))}
      {data.showContent ? (
        <div className="rf-card-node__content">
          <CardContent title={data.title} markdown={data.body ?? ''} />
        </div>
      ) : data.editingTitle ? (
        <CanvasCard
          front={front}
          title={data.title}
          graphColor={data.activeGraphColor}
          state="editing"
          onCompleteTitleEdit={(title) => data.onCompleteTitleEditing?.(title) ?? null}
          onCancelTitleEdit={() => data.onCancelTitleEditing?.()}
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
