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
      </article>
      {data.sourceHandles.map((handle) => renderHandle(handle, 'source'))}
    </div>
  );
}
