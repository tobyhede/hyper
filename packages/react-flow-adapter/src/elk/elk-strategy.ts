import ELK, {
  type ElkExtendedEdge,
  type ElkNode as ElkGraphNode,
  type ElkPort,
  type LayoutOptions,
} from 'elkjs/lib/elk.bundled.js';
import type { LayoutEdgeSection, LayoutGraph, LayoutStrategy } from '@project/graph';
import { DEFAULT_ELK_LAYOUT_OPTIONS, elkPortId, PORT_ID_SEPARATOR } from './layout';

/**
 * ELK, as a `LayoutStrategy`. The strategy *is* the `layoutOptions` — that is
 * all a strategy is (ADR 0005) — and the engine is injectable so the seam can be
 * tested without running elkjs.
 *
 * Automatic: it computes placement from the cards and routes, so no Layout
 * stands behind it and a view of it is read-only (ADR 0013).
 */

/** The slice of elkjs this module uses, so a fake can stand in for it. */
export interface ElkEngine {
  layout: (graph: ElkGraphNode) => Promise<ElkGraphNode>;
}

const defaultEngine: ElkEngine = new ELK();

export function elkStrategy(
  layoutOptions: LayoutOptions = DEFAULT_ELK_LAYOUT_OPTIONS,
  engine: ElkEngine = defaultEngine,
): LayoutStrategy {
  return async (graph: LayoutGraph): Promise<LayoutGraph> => {
    const elkGraph: ElkGraphNode = {
      id: 'root',
      layoutOptions,
      children: graph.cards.map((card) => ({
        id: card.id,
        width: card.width,
        height: card.height,
        layoutOptions: { 'org.eclipse.elk.portConstraints': 'FIXED_SIDE' },
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

    // ELK's routed geometry, keyed by edge id. Points are in the root graph's
    // coordinate space — the same one the node positions come back in — so they
    // map straight onto React Flow's flow coordinates without translation.
    const sectionsByEdgeId = new Map<string, LayoutEdgeSection[]>();
    for (const edge of laid.edges ?? []) {
      if (!edge.sections?.length) continue;
      sectionsByEdgeId.set(
        edge.id,
        edge.sections.map((section) => ({
          startPoint: { x: section.startPoint.x, y: section.startPoint.y },
          endPoint: { x: section.endPoint.x, y: section.endPoint.y },
          ...(section.bendPoints
            ? { bendPoints: section.bendPoints.map((point) => ({ x: point.x, y: point.y })) }
            : {}),
        })),
      );
    }

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
      // Carry ELK's routed geometry back onto the edges so the render layer can
      // draw the channels ELK computed rather than its own bezier (issue 03).
      edges: graph.edges.map((edge) => {
        const sections = sectionsByEdgeId.get(edge.id);
        return sections ? { ...edge, sections } : edge;
      }),
    };
  };
}
