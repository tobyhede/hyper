import type { EdgeTypes, NodeTypes } from '@xyflow/react';
import { ResourceNode } from './ResourceNode';
import { ROUTED_EDGE_TYPE, RoutedEdge } from './RoutedEdge';

export * from './projection';
export { AUTHORING_HANDLE_DIAMETER } from './authoring-handle';
export { ResourceNode } from './ResourceNode';
export {
  CONNECTION_TARGET_PROXIMITY,
  connectionPointerInFlow,
  distanceToAabb,
  isNearConnectionTarget,
  offersConnectionEnd,
  type CanvasPoint,
  type CanvasRect,
} from './connection-target-reveal';
export {
  ConnectionEndEligibilityContext,
  type ConnectionEndEligibility,
} from './connection-end-eligibility';
export { ConnectionTargetProximityProvider } from './connection-target-proximity';
export {
  ROUTED_EDGE_TYPE,
  RoutedEdge,
  RoutedEdgePath,
  routedEdgePathProps,
  useRoutedEdgeGeometry,
  type RoutedEdgeData,
  type RoutedEdgeGeometry,
  type RoutedFlowEdge,
} from './RoutedEdge';
// `edge-attachment` is absent whole, for the reason `@project/graph`'s index
// gives for `frontmatter` and `validate`: `facingSides`, `anchorPoint`,
// `edgeAttachment`, `selfEdgeAttachment` and the rects they are written in are
// how `RoutedEdge` decides where a curve lands, and no consumer outside this
// package asks that question — the application composes the Edge, not the rule.
// A test of the rule imports it from its own module.
export { GraphHud } from './GraphHud';
export { GraphHeadMarkers } from './GraphHeadMarkers';
export { GraphConnectionLine, GraphConnectionLineHeadShape } from './GraphConnectionLine';
export { ZoomSlider } from './ZoomSlider';
export type { ZoomSliderProps } from './ZoomSlider';
export type { GraphHudProps } from './GraphHud';

/** Register the custom node type(s) with React Flow. */
export const nodeTypes: NodeTypes = {
  resource: ResourceNode,
};

/** Register the custom edge type(s) with React Flow. */
export const edgeTypes: EdgeTypes = {
  [ROUTED_EDGE_TYPE]: RoutedEdge,
};
