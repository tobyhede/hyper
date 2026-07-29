import type { NodeChange } from '@xyflow/react';
import { uuidSchema } from '@project/core';
import type { CardFlowNode } from '@project/react-flow-adapter';
import type { EditorStore } from '../src/editor';

export function node(id: string, x: number, y: number, title = id): CardFlowNode {
  return {
    id,
    type: 'card',
    position: { x, y },
    className: 'rf-card-node',
    data: {
      cardId: uuidSchema.parse(id),
      title,
      sourceHandles: [],
      targetHandles: [],
      active: false,
      showContent: false,
      activeRouteId: null,
      emphasis: 'equal',
    },
  };
}

export function moving(id: string, x: number, y: number): NodeChange<CardFlowNode>[] {
  return [{ type: 'position', id, position: { x, y }, dragging: true }];
}

export function settled(id: string, x: number, y: number): NodeChange<CardFlowNode>[] {
  return [{ type: 'position', id, position: { x, y }, dragging: false }];
}

export function completeDrag(store: EditorStore, id: string, x: number, y: number): void {
  store.getState().changeNodes(moving(id, x, y));
  store.getState().changeNodes(settled(id, x, y));
}
