import { useRef } from 'react';
import { Handle, NodeResizer, Position, useConnection, type NodeProps } from '@xyflow/react';
import {
  CanvasCard,
  CardContent,
  MarkdownCardBody,
  type CanvasCardFront,
  type CanvasCardProps,
  type MarkdownCardBodyProps,
} from '@project/ui';
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
/**
 * Whether a resize drag in this direction leaves the Card's top-left where the
 * author placed it.
 *
 * `CardNodeData.resize.onResize` answers a size and no origin, which is what
 * keeps a resize out of the family of gestures that must go back through the
 * authored placement. React Flow's eight controls do not all respect that: a
 * top or left drag moves the node's top-left in React Flow's own store, and the
 * composition hears only the new size — so the authored origin stays where it
 * was and the next projection publish snaps the Card back under the author's
 * pointer. Refusing those drags is what makes a reported size sufficient.
 *
 * React Flow reports direction as `[x, y]`, where `-1` is the leading edge
 * moving. If a resize is ever allowed to move the top-left, this goes and
 * `onResize` reports an origin (`projection.ts`).
 */
export const growsFromOrigin = (direction: readonly number[]): boolean =>
  direction[0] !== -1 && direction[1] !== -1;

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
  const canvasCardOptionalProps: Mutable<
    Pick<CanvasCardProps, 'onBeginTitleEdit' | 'onConnect' | 'onEdit'>
  > = {};
  if (data.titleEditingEnabled === true && data.onBeginTitleEditing !== undefined) {
    canvasCardOptionalProps.onBeginTitleEdit = data.onBeginTitleEditing;
  }
  if (data.connectingEnabled === true && data.onBeginConnect !== undefined) {
    canvasCardOptionalProps.onConnect = data.onBeginConnect;
  }
  if (data.cardEditingEnabled === true && data.onEditCard !== undefined) {
    canvasCardOptionalProps.onEdit = data.onEditCard;
  }

  /* The editor's presence is the editing state, and it arrives with the two
     operations that end it — so nothing here has to stand in for a completion
     the composition did not supply. */
  const titleEditor = data.titleEditor;

  /*
   * What an Expanded Card draws below its title (ADR 0064).
   *
   * **Not a fourth arm of the branch below.** It is a prop handed to whichever
   * arm the *title* state selects, so a Card can be Expanded while it is being
   * renamed — expansion is what the Layout authored and the caret is a gesture,
   * and a branch would have made them exclusive. It is not `showContent`
   * either: both presenting and expanding draw through the one rendered-Markdown
   * seam, while the Expanded Card swaps that display for source only during an
   * edit.
   *
   * The Alias kind has no Expanded front yet, so it answers `undefined` and the
   * Card draws its collapsed self. `CanvasCard` reads the slot's presence as the
   * Expanded state, so this is also what says whether the Card fills its box —
   * one fact, not two that can disagree.
   */
  const resize = data.resize;
  const bodyProps: Mutable<Pick<MarkdownCardBodyProps, 'onBeginEdit' | 'editor'>> = {};
  if (data.onBeginBodyEditing !== undefined) bodyProps.onBeginEdit = data.onBeginBodyEditing;
  if (data.bodyEditor !== undefined) bodyProps.editor = data.bodyEditor;
  const content =
    data.expanded === true && data.kind === 'markdown' ? (
      <MarkdownCardBody
        source={data.body ?? ''}
        ariaLabel={`Markdown source of ${data.title}`}
        {...bodyProps}
      />
    ) : undefined;

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
      // The wrapper React Flow sizes from `node.width`/`node.height` is this
      // element's parent, so an Expanded Card only reaches its own rect if this
      // one stops declaring the collapsed constant. Read by `styles.css`.
      data-expanded={content !== undefined}
    >
      {/*
        React Flow's own resizer, on an Expanded Card the author has selected.
        An Expanded Card is whatever box the author drew — there is no ratio on
        it, because the collapsed Card is what keeps the silhouette that predicts
        what an audience sees (ADR 0064).

        Rendered *before* the Card, which is not cosmetic: `canvas-card.css`
        keeps the Card's hover treatment alive while the pointer is on an
        authoring handle through `:has(~ …__authoring-handle:hover)`, and `~`
        reaches following siblings only. Anything inserted between the Card and
        those handles would be invisible to that rule; anything before the Card
        is harmless to it.
      */}
      {content !== undefined && resize !== undefined && (
        <NodeResizer
          isVisible={visuallySelected}
          minWidth={resize.minWidth}
          minHeight={resize.minHeight}
          lineClassName="rf-card-node__resize-line"
          handleClassName="rf-card-node__resize-handle"
          shouldResize={(_event, params) => growsFromOrigin(params.direction)}
          onResize={(_event, next) => resize.onResize({ width: next.width, height: next.height })}
        />
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
          content={content}
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
          content={content}
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
