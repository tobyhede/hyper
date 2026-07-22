import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CardFlowNode, CardHandle } from './projection';
import { OTHER_ROUTE_OPACITY } from './projection';

/**
 * React Flow custom node: a card's title, with one colored handle per route at
 * the vertical offset ELK computed for it.
 *
 * The card's content is deliberately not drawn here (ADR 0006) — a graph is for
 * reading the shape of a space, and a wall of clipped markdown at graph zoom is
 * unreadable anyway. Opening a card is how you read it.
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

export function CardNode({ data }: NodeProps<CardFlowNode>) {
  // Handles fade by the same amount as their route's edges, so a receding route
  // recedes as a whole rather than leaving bright dots on the cards.
  const dim = (handle: CardHandle): number =>
    handle.routeId === data.activeRouteId ? 1 : OTHER_ROUTE_OPACITY[data.emphasis];

  const renderHandle = (handle: CardHandle, type: 'source' | 'target') => (
    <Handle
      key={handle.id}
      id={handle.id}
      type={type}
      position={type === 'target' ? Position.Left : Position.Right}
      className="rf-card-node__port"
      style={{ top: handle.offsetY, background: handle.color, opacity: dim(handle) }}
    />
  );

  return (
    <div className="rf-card-node__inner" data-active={data.active}>
      {data.targetHandles.map((handle) => renderHandle(handle, 'target'))}
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
      {data.sourceHandles.map((handle) => renderHandle(handle, 'source'))}
    </div>
  );
}
