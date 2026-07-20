/**
 * The Layout contract: a named strategy for arranging a space's cards.
 *
 * Modelled on how ELK does it, deliberately. Geometry lives as *optional fields
 * on the elements* — a card carries `x`/`y`, a port carries its offset — and a
 * layout takes a graph and returns the same graph with those fields populated.
 * There is no separate arranged-result type; `CONTEXT.md` lists "arrangement"
 * under _Avoid_ and ADR 0005 records why.
 *
 * Which cards a layout arranges is decided by the view before it runs. A layout
 * is free to ignore parts of the graph it has no use for — a grid never looks at
 * the edges, exactly as ELK's own algorithms differ in what they consume.
 */

import type { CardHandleSet, RouteEdge } from './routes';

/** A port on a card, by the handle id the render layer knows it by. */
export interface LayoutPort {
  id: string;
  /** Inbound ports sit on the card's left, outbound on its right. */
  side: 'in' | 'out';
  /** Offset from the card's top-left corner, once a layout has placed it. */
  x?: number;
  y?: number;
}

export interface LayoutCard {
  id: string;
  width: number;
  height: number;
  ports: LayoutPort[];
  x?: number;
  y?: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface LayoutGraph {
  cards: LayoutCard[];
  edges: LayoutEdge[];
}

/**
 * A layout strategy. Synchronous ones (grid, hand-placed) return the graph
 * directly; ones that hand off to an engine return a promise.
 */
export type Layout = (graph: LayoutGraph) => LayoutGraph | Promise<LayoutGraph>;

/**
 * Assemble the graph to arrange, from cards the view has already chosen plus the
 * ports and rail edges derived from the routes running through them.
 */
export function buildLayoutGraph(
  cardIds: readonly string[],
  handlesByCard: ReadonlyMap<string, CardHandleSet>,
  edges: readonly RouteEdge[],
  size: { width: number; height: number },
): LayoutGraph {
  const visible = new Set(cardIds);

  return {
    cards: cardIds.map((id) => {
      const handles = handlesByCard.get(id);
      return {
        id,
        width: size.width,
        height: size.height,
        ports: [
          ...(handles?.targetHandles ?? []).map((h) => ({ id: h.id, side: 'in' as const })),
          ...(handles?.sourceHandles ?? []).map((h) => ({ id: h.id, side: 'out' as const })),
        ],
      };
    }),
    edges: edges
      .filter((e) => visible.has(e.source) && visible.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
  };
}
