import type { EdgeTypes, NodeTypes } from '@xyflow/react';
import { CardNode } from './CardNode';
import { RoutedEdge } from './RoutedEdge';

export * from './projection';
export * from './elk';
export { CardNode } from './CardNode';
export { RoutedEdge, type RoutedEdgeData } from './RoutedEdge';
export { RouteHud } from './RouteHud';
export { RouteConnectionLine } from './RouteConnectionLine';
export type { RouteHudProps } from './RouteHud';

/** Register the custom node type(s) with React Flow. */
export const nodeTypes: NodeTypes = {
  card: CardNode,
};

/** Register the custom edge type(s) with React Flow. */
export const edgeTypes: EdgeTypes = {
  routed: RoutedEdge,
};
