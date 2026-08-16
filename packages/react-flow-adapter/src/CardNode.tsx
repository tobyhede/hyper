import { useEffect, useRef, useState } from 'react';
import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
import {
  CanvasCard,
  ConnectIcon,
  EditIcon,
  RenderedCardContent,
  type CanvasCardState,
} from '@project/ui';
import type { CardFlowNode, CardHandle } from './projection';
import {
  AUTHORING_HANDLE_SIDES,
  AuthoringHandle,
  GRAPH_PORT_DIAMETER,
  type AuthoringHandleSide,
} from './authoring-handle';

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
 */
interface CardTitleEditorProps {
  readonly cardId: string;
  readonly title: string;
  readonly onComplete?: (title: string) => string | null;
  readonly onCancel?: () => void;
}

function CardTitleEditor({ cardId, title, onComplete, onCancel }: CardTitleEditorProps) {
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const closingByKey = useRef(false);

  // Focus on mount whichever control opened this editor, pointer or keyboard.
  // A created Card enters here with its neutral title *selected*, and an
  // unfocused input has no selection an author can type over — so the accepted
  // prototype's separate sentence about keyboard activation restates that
  // requirement rather than restricting it to the keyboard path. "Pointer
  // placement selects without forcing keyboard focus" is about placement
  // gestures, which end at a placed Card rather than in a field.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  /**
   * Submit the draft and show whatever came back, answering the refusal so a
   * caller can tell an accepted completion from a refused one — which is the
   * only thing the two exits disagree about.
   */
  const complete = (): string | null => {
    const refusal = onComplete?.(draft) ?? null;
    setError(refusal);
    return refusal;
  };

  /**
   * Enter and Escape both leave the editor, and neither may leave focus on
   * `<body>` — a Card created from the toolbar or from `C` opens straight into
   * this field, so where focus lands when the naming ends is where the whole
   * gesture ends. The Card is what the author was working on, it survives the
   * editor, and outside presenting it is focusable, so it is the answer.
   *
   * Taken *before* the parent unmounts the input: focus moves to a node that is
   * already in the tree, and the unmount that follows has nothing left to
   * displace. That move blurs the input, which is why `closingByKey` is raised
   * first — the blur handler completes the draft, and it must not complete a
   * second time on the way out of a completion, nor at all on the way out of a
   * cancellation.
   *
   * Only the keyboard paths restore. A blur is the author clicking somewhere
   * else, and taking focus back from wherever they clicked would be a steal.
   */
  const returnFocusToCard = (): void => {
    closingByKey.current = true;
    input.current?.closest<HTMLElement>('.react-flow__node')?.focus();
  };

  return (
    <div className="card__title-editor nodrag nopan nowheel">
      <input
        ref={input}
        className="card__title-input"
        aria-label="Card title"
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `card-title-error-${cardId}`}
        value={draft}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setError(null);
        }}
        onBlur={() => {
          if (closingByKey.current) {
            closingByKey.current = false;
            return;
          }
          complete();
        }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            // A refused draft keeps the editor open, so focus stays in the
            // field with the message beside it rather than leaving for a Card
            // whose name the author has not settled.
            if (complete() === null) returnFocusToCard();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            returnFocusToCard();
            onCancel?.();
          }
        }}
      />
      {error !== null && (
        <span id={`card-title-error-${cardId}`} role="alert" className="card__field-error">
          {error}
        </span>
      )}
    </div>
  );
}

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
  const [hovered, setHovered] = useState(false);
  const visuallySelected = selected || data.selectedForAuthoring;
  const visualState: CanvasCardState = data.editingTitle
    ? 'editing'
    : dragging
      ? 'dragging'
      : visuallySelected && hovered
        ? 'selected-hover'
        : visuallySelected
          ? 'selected'
          : hovered
            ? 'hover'
            : 'rest';

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

  const renderAuthoringHandle = (side: AuthoringHandleSide, role: 'source' | 'target') => (
    <AuthoringHandle
      key={`${role}-${side}`}
      side={side}
      role={role}
      color={data.activeGraphColor}
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
    />
  );

  const handles = (
    <>
      {data.targetHandles.map((handle) => renderHandle(handle, 'target'))}
      {AUTHORING_HANDLE_SIDES.map((side) => renderAuthoringHandle(side, 'target'))}
      {AUTHORING_HANDLE_SIDES.map((side) => renderAuthoringHandle(side, 'source'))}
      {data.sourceHandles.map((handle) => renderHandle(handle, 'source'))}
    </>
  );

  return (
    <div
      className="rf-card-node__inner"
      data-active={data.active}
      data-editing={data.editingTitle}
      data-selected={visuallySelected}
      data-connection-in-progress={connectionInProgress}
      data-connection-seeking={seeking ?? 'none'}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {data.showContent ? (
        <>
          {handles}
          <div className="rf-card-node__content">
            <RenderedCardContent title={data.title} markdown={data.body ?? ''} />
          </div>
        </>
      ) : (
        <CanvasCard
          kind={data.kind}
          state={visualState}
          title={data.title}
          graphColor={data.activeGraphColor}
          titleEditable={data.titleEditingEnabled === true}
          {...(data.titleEditingEnabled
            ? {
                onDoubleClickTitle: (event) => {
                  event.stopPropagation();
                  data.onBeginTitleEditing?.();
                },
              }
            : {})}
          {...(data.editingTitle
            ? {
                titleEditor: (
                  <CardTitleEditor
                    cardId={data.cardId}
                    title={data.title}
                    {...(data.onCompleteTitleEditing !== undefined
                      ? { onComplete: data.onCompleteTitleEditing }
                      : {})}
                    {...(data.onCancelTitleEditing !== undefined
                      ? { onCancel: data.onCancelTitleEditing }
                      : {})}
                  />
                ),
              }
            : {})}
          actions={
            <>
              {/* The keyboard's way into an Edge. The four spatial handles (ADR
              0033) are drag affordances and reach no keyboard author, so this
              is the one tab stop that begins a connection — it opens a target
              picker rather than starting a drag. Same event discipline as the
              Edit control beside it. */}
              {data.connectingEnabled && !data.editingTitle && (
                <button
                  type="button"
                  className="card__connect nodrag nopan"
                  data-testid="connect-from-card"
                  aria-label={`Connect from ${data.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onBeginConnect?.();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <ConnectIcon />
                </button>
              )}
              {data.cardEditingEnabled && !data.editingTitle && (
                <button
                  type="button"
                  className="card__edit nodrag nopan"
                  aria-label={`Edit Card ${data.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onEditCard?.();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  // A real button in the tab order, and its activation keys are the
                  // same two the graph reads as "open this Card". The graph's
                  // handler sits on an ancestor and sees them first, so Enter and
                  // Space opened the Card and called `preventDefault`, cancelling
                  // the activation this button never got — unusable by the very
                  // input it is here for.
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {/* The glyph is `aria-hidden`, so the `aria-label` above is the
                  button's *only* accessible name — not a refinement of visible
                  text the way it was when this read "Edit title". Removing it
                  leaves the control unnamed rather than coarsely named.

                  It opens the Card's *content* editor, which is why it is absent
                  on an Alias: an Alias owns a title and a pointer, and its title
                  is renamed on the graph. */}
                  <EditIcon />
                </button>
              )}
            </>
          }
          handles={handles}
        />
      )}
    </div>
  );
}
