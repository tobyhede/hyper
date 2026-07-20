import ELK, {
  type ElkExtendedEdge,
  type ElkNode as ElkGraphNode,
  type ElkPort,
  type LayoutOptions,
} from 'elkjs/lib/elk.bundled.js';
import type { Edge, Node } from '@xyflow/react';
import type { ElkLayoutResult, ElkPortData } from './types';

/**
 * ELK "layered" options for a left→right graph. `NETWORK_SIMPLEX` node placement
 * aligns connected nodes vertically so their ports line up, which keeps the
 * route rails close to horizontal.
 * Reference: https://www.eclipse.org/elk/reference/algorithms/org-eclipse-elk-layered.html
 */
export const DEFAULT_ELK_LAYOUT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.spacing.nodeNodeBetweenLayers': '160',
  'elk.spacing.nodeNode': '80',
  'elk.spacing.portPort': '18',
};

const DEFAULT_NODE_WIDTH = 150;
const DEFAULT_NODE_HEIGHT = 50;

const elk = new ELK();

const PORT_ID_SEPARATOR = '##';

/**
 * ELK port ids must be unique across the whole graph, but a handle id
 * (`<routeId>::out`) is the *same* on every card the route passes through.
 * Handing ELK the bare handle id leaves it unable to tell which card an edge
 * attaches to, so it resolves arbitrarily and the layout collapses — badly
 * enough to mislay even a single route. Namespacing by card id is what makes the
 * endpoint unambiguous. The render layer never sees these; `getElkLayout`
 * strips the prefix back off, so handles keep their bare ids.
 */
export const elkPortId = (nodeId: string, handleId: string): string =>
  `${nodeId}${PORT_ID_SEPARATOR}${handleId}`;

/**
 * Translate React Flow nodes/edges into an ELK graph. Pure and deterministic, so
 * it can be unit-tested without running the layout engine.
 *
 * Ports use typed `layoutOptions` with fully-qualified ELK keys
 * (`org.eclipse.elk.port.side`, `org.eclipse.elk.portConstraints`): targets on
 * the left (WEST), sources on the right (EAST), in fixed order per side.
 */
export function buildElkGraph<N extends Node<ElkPortData>>(
  nodes: N[],
  edges: Edge[],
  layoutOptions: LayoutOptions = DEFAULT_ELK_LAYOUT_OPTIONS,
): ElkGraphNode {
  return {
    id: 'root',
    layoutOptions,
    children: nodes.map((node) => {
      const targetPorts: ElkPort[] = node.data.targetHandles.map((handle) => ({
        id: elkPortId(node.id, handle.id),
        layoutOptions: { 'org.eclipse.elk.port.side': 'WEST' },
      }));
      const sourcePorts: ElkPort[] = node.data.sourceHandles.map((handle) => ({
        id: elkPortId(node.id, handle.id),
        layoutOptions: { 'org.eclipse.elk.port.side': 'EAST' },
      }));

      return {
        id: node.id,
        width: node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH,
        height: node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT,
        layoutOptions: {
          'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
        },
        ports: [...targetPorts, ...sourcePorts],
      };
    }),
    edges: edges.map((edge): ElkExtendedEdge => ({
      id: edge.id,
      // An edge with no explicit handle attaches to the node itself.
      sources: [edge.sourceHandle ? elkPortId(edge.source, edge.sourceHandle) : edge.source],
      targets: [edge.targetHandle ? elkPortId(edge.target, edge.targetHandle) : edge.target],
    })),
  };
}

/**
 * Run ELK and return each node's computed geometry: position plus every port's
 * offset within the node, so handles can be rendered exactly where ELK placed
 * them.
 */
export async function getElkLayout<N extends Node<ElkPortData>>(
  nodes: N[],
  edges: Edge[],
  layoutOptions?: LayoutOptions,
): Promise<ElkLayoutResult> {
  const graph = buildElkGraph(nodes, edges, layoutOptions);
  const layouted = await elk.layout(graph);

  const result: ElkLayoutResult = {};
  for (const child of layouted.children ?? []) {
    const ports: Record<string, { x: number; y: number }> = {};
    // Undo the per-node namespacing so callers look ports up by handle id.
    const prefix = `${child.id}${PORT_ID_SEPARATOR}`;
    for (const port of child.ports ?? []) {
      const handleId = port.id.startsWith(prefix) ? port.id.slice(prefix.length) : port.id;
      ports[handleId] = { x: port.x ?? 0, y: port.y ?? 0 };
    }
    result[child.id] = {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? DEFAULT_NODE_WIDTH,
      height: child.height ?? DEFAULT_NODE_HEIGHT,
      ports,
    };
  }
  return result;
}
