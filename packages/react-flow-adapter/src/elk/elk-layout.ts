import ELK, {
  type ElkExtendedEdge,
  type ElkNode as ElkGraphNode,
  type ElkPort,
  type LayoutOptions,
} from 'elkjs/lib/elk.bundled.js';
import type { Layout, LayoutGraph } from '@project/graph';
import { DEFAULT_ELK_LAYOUT_OPTIONS, elkPortId, PORT_ID_SEPARATOR } from './layout';

/**
 * The ELK layout, as a `Layout`. The strategy *is* the `layoutOptions` — that is
 * all a Layout is (ADR 0005) — and the engine is injectable so the seam can be
 * tested without running elkjs.
 */

/** The slice of elkjs this module uses, so a fake can stand in for it. */
export interface ElkEngine {
  layout: (graph: ElkGraphNode) => Promise<ElkGraphNode>;
}

const defaultEngine: ElkEngine = new ELK();

export function elkLayout(
  layoutOptions: LayoutOptions = DEFAULT_ELK_LAYOUT_OPTIONS,
  engine: ElkEngine = defaultEngine,
): Layout {
  return async (graph: LayoutGraph): Promise<LayoutGraph> => {
    const elkGraph: ElkGraphNode = {
      id: 'root',
      layoutOptions,
      children: graph.cards.map((card) => ({
        id: card.id,
        width: card.width,
        height: card.height,
        layoutOptions: { 'org.eclipse.elk.portConstraints': 'FIXED_ORDER' },
        ports: card.ports.map((port): ElkPort => ({
          id: elkPortId(card.id, port.id),
          layoutOptions: {
            'org.eclipse.elk.port.side': port.side === 'in' ? 'WEST' : 'EAST',
          },
        })),
      })),
      edges: graph.edges.map((edge): ElkExtendedEdge => ({
        id: edge.id,
        sources: [elkPortId(edge.source, edge.sourceHandle)],
        targets: [elkPortId(edge.target, edge.targetHandle)],
      })),
    };

    const laid = await engine.layout(elkGraph);
    const byId = new Map((laid.children ?? []).map((child) => [child.id, child]));

    return {
      cards: graph.cards.map((card) => {
        const child = byId.get(card.id);
        if (!child) return card;

        // Undo the per-card namespacing so ports keep the ids the render layer knows.
        const prefix = `${card.id}${PORT_ID_SEPARATOR}`;
        const offsets = new Map(
          (child.ports ?? []).map((port) => [
            port.id.startsWith(prefix) ? port.id.slice(prefix.length) : port.id,
            { x: port.x ?? 0, y: port.y ?? 0 },
          ]),
        );

        return {
          ...card,
          x: child.x ?? 0,
          y: child.y ?? 0,
          width: child.width ?? card.width,
          height: child.height ?? card.height,
          ports: card.ports.map((port) => ({ ...port, ...offsets.get(port.id) })),
        };
      }),
      edges: graph.edges,
    };
  };
}
