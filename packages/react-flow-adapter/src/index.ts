import type { EdgeTypes, NodeTypes } from '@xyflow/react';
import { ThingNode } from './ThingNode';
import { RoutedEdge } from './RoutedEdge';

export * from './projection';
export { ThingNode } from './ThingNode';
export {
  RoutedEdge,
  RoutedEdgePath,
  useEdgeAttachment,
  useRoutedEdgeGeometry,
  type RoutedEdgeData,
  type RoutedEdgeGeometry,
  type RoutedFlowEdge,
} from './RoutedEdge';
export {
  anchorPoint,
  edgeAttachment,
  facingSides,
  selfEdgeAttachment,
  type AnchorPoint,
  type AnchorRect,
  type EdgeAttachment,
  type FacingSides,
} from './edge-attachment';
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
