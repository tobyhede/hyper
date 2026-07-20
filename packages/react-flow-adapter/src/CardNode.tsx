import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CardRenderer } from '@project/ui';
import type { CardFlowNode, CardHandle } from './projection';

/** React Flow custom node: a markdown card with one colored handle per route,
 *  each positioned at the vertical offset ELK computed for its port. */
export function CardNode({ data }: NodeProps<CardFlowNode>) {
  const dim = (handle: CardHandle): number =>
    data.activeRouteId && handle.routeId !== data.activeRouteId ? 0.15 : 1;

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
      <CardRenderer title={data.title} markdown={data.markdown} variant="node" />
      {data.sourceHandles.map((handle) => renderHandle(handle, 'source'))}
    </div>
  );
}
