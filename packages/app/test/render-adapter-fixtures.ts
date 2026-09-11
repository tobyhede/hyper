import type { NodeChange } from '@xyflow/react';
import { uuidSchema } from '@project/core';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import type { RenderAdapter } from '../src/render-adapter';

export function node(id: string, x: number, y: number, title = id): ThingFlowNode {
  return {
    id,
    type: 'thing',
    position: { x, y },
    className: 'rf-thing-node',
    data: {
      thingId: uuidSchema.parse(id),
      title,
      readOnly: false,
      kind: 'markdown',
      sourceHandles: [],
      targetHandles: [],
      active: false,
      selectedForAuthoring: false,
      showContent: false,
      activeGraphId: null,
      activeGraphColor: '#8a94a6',
      emphasis: 'equal',
    },
  };
}

export function moving(id: string, x: number, y: number): NodeChange<ThingFlowNode>[] {
  return [{ type: 'position', id, position: { x, y }, dragging: true }];
}

export function settled(id: string, x: number, y: number): NodeChange<ThingFlowNode>[] {
  return [{ type: 'position', id, position: { x, y }, dragging: false }];
}

export function completeDrag(store: RenderAdapter, id: string, x: number, y: number): void {
  store.getState().changeNodes(moving(id, x, y));
  store.getState().changeNodes(settled(id, x, y));
}
