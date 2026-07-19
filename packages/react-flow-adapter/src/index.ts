import type { NodeTypes } from '@xyflow/react';
import { CardNode } from './CardNode';

export * from './projection';
export * from './elk';
export { CardNode } from './CardNode';

/** Register the custom node type(s) with React Flow. */
export const nodeTypes: NodeTypes = {
  card: CardNode,
};
