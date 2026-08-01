import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
import { CardContent } from '@project/ui';
import type { CardFlowNode, CardHandle } from './projection';
import { AUTHORING_HANDLE_DIAMETER } from './authoring-handle';

/**
 * React Flow custom node: a card's title, with one colored handle per route at
 * the vertical offset ELK computed for it.
 *
 * The card's content is deliberately not drawn here (ADR 0006) — a graph is for
 * reading the shape of a space, and a wall of clipped markdown at graph zoom is
 * unreadable anyway. Opening a card is how you read it.
 *
 * The one exception is the card a walk has reached while presenting, which draws
 * its content instead: presenting is the graph seen close enough that one card
 * fills the screen (ADR 0027), so at that zoom the content is exactly what is
 * legible. It is still the same node — nothing is transformed into anything, and
 * there is no second artefact (ADR 0024).
 */
/** Inlined lucide `corner-down-right` — the house pattern is a hand-inlined SVG
 *  path, not an icon dependency (see the Select chevron in `@project/ui`). */
const AliasGlyph = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="15 10 20 15 15 20" />
    <path d="M4 4v7a4 4 0 0 0 4 4h12" />
  </svg>
);

const AUTHORING_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;

/*
 * Handle geometry is *declared*, not measured, so nothing here reports a change
 * to React Flow.
 *
 * React Flow measures a node's handles once and caches the result, which is its
 * own named cause of warning #008 and of edges attaching to stale points; the
 * documented remedy is `useUpdateNodeInternals`. That remedy is for nodes that
 * leave measuring to React Flow. `projection.ts` does not: it puts the
 * strategy's geometry on `node.handles`, `parseHandles` prefers that to the DOM,
 * and every projection allocates fresh nodes, so a Route gaining a handle or a
 * strategy moving one is re-derived on the spot.
 *
 * Calling the hook on top of that is a regression rather than a belt-and-braces:
 * a forced update rebuilds the bounds with `getHandleBounds`, which reads only
 * the handles the DOM renders — the anchors of Routes this Card is already on.
 * The declarations for every other Route go with it, and those are exactly what
 * lets an Edge completed onto this Card resolve in the render that first makes
 * it incident, before the projection catches up.
 */
export function CardNode({ data, selected }: NodeProps<CardFlowNode>) {
  const connectionInProgress = useConnection((connection) => connection.inProgress);

  const renderHandle = (handle: CardHandle, type: 'source' | 'target') => (
    <Handle
      key={handle.id}
      id={handle.id}
      type={type}
      position={type === 'target' ? Position.Left : Position.Right}
      className="rf-card-node__port"
      aria-hidden="true"
      isConnectable={false}
      style={{ top: handle.offsetY, background: handle.color, opacity: 0 }}
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
      isConnectableStart={role === 'source' && !connectionInProgress}
      isConnectableEnd={role === 'target' && connectionInProgress}
      // A handle is a drag affordance, and a click is not a drag. A press and
      // release inside React Flow's drag threshold starts no connection, so the
      // click reached the Card underneath and opened it to read — from the one
      // control whose whole purpose is to begin an Edge. React Flow spreads
      // caller props after its own `onClick`, so this replaces it.
      onClick={(event) => event.stopPropagation()}
      style={{
        width: AUTHORING_HANDLE_DIAMETER,
        height: AUTHORING_HANDLE_DIAMETER,
        background: data.activeRouteColor,
      }}
    />
  );

  return (
    <div
      className="rf-card-node__inner"
      data-active={data.active}
      data-selected={selected || data.selectedForAuthoring}
      data-connection-in-progress={connectionInProgress}
    >
      {data.targetHandles.map((handle) => renderHandle(handle, 'target'))}
      {AUTHORING_SIDES.map((side) => renderAuthoringHandle(side, 'target'))}
      {data.showContent ? (
        <div className="rf-card-node__content">
          <CardContent title={data.title} markdown={data.body ?? ''} />
        </div>
      ) : (
        <article className="card card--node" data-testid="card">
          <h2 className="card__title">{data.title}</h2>
          {data.description && (
            <p className="card__description" data-testid="card-description">
              {data.description}
            </p>
          )}
          {data.aliasOf && (
            <p className="card__alias-of" data-testid="alias-marker">
              <AliasGlyph />
              <span>{data.aliasOf}</span>
            </p>
          )}
        </article>
      )}
      {AUTHORING_SIDES.map((side) => renderAuthoringHandle(side, 'source'))}
      {data.sourceHandles.map((handle) => renderHandle(handle, 'source'))}
    </div>
  );
}
