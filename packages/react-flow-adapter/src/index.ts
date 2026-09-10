import type { EdgeTypes, NodeTypes } from '@xyflow/react';
import { ThingNode } from './ThingNode';
import { RoutedEdge } from './RoutedEdge';

export * from './projection';
export * from './elk';
export { ThingNode } from './ThingNode';
export {
  RoutedEdge,
  routedEdgeGeometry,
  type RoutedEdgeData,
  type RoutedEdgeGeometry,
  type RoutedFlowEdge,
} from './RoutedEdge';
export { GraphHud } from './GraphHud';
export { GraphConnectionLine } from './GraphConnectionLine';
export { ZoomSlider } from './ZoomSlider';
export type { ZoomSliderProps } from './ZoomSlider';
export type { GraphHudProps } from './GraphHud';

/** Register the custom node type(s) with React Flow. */
export const nodeTypes: NodeTypes = {
  thing: ThingNode,
};

/** Register the custom edge type(s) with React Flow. */
export const edgeTypes: EdgeTypes = {
  routed: RoutedEdge,
};
