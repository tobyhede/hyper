/**
 * The LayoutStrategy contract: a named strategy for arranging a space's cards.
 *
 * A strategy is behaviour; a **Layout** (`@project/core`) is the authored data
 * one of them reads. ADR 0005 called the strategy itself a Layout, which ADR
 * 0014 corrected once the authored kind became a value you can hold.
 *
 * Modelled on how ELK does it, deliberately. Geometry lives as *optional fields
 * on the elements* — a card carries `x`/`y`, a port carries its offset — and a
 * strategy takes a layout-strategy graph and returns the same value with those fields populated.
 * There is no separate arranged-result type; `CONTEXT.md` lists "arrangement"
 * under _Avoid_ and ADR 0005 records why.
 *
 * Which cards a strategy arranges is decided by the view before it runs. A
 * strategy is free to ignore parts of the graph it has no use for — a grid never
 * looks at the edges, exactly as ELK's own algorithms differ in what they
 * consume.
 */

import type { CardId, LayoutPosition } from '@project/core';
import type { CardHandleSet, GraphRenderEdge } from './graph-rendering';

/** A port on a card, by the handle id the render layer knows it by. */
export interface LayoutStrategyPort {
  id: string;
  /** Inbound ports sit on the card's left, outbound on its right. */
  side: 'in' | 'out';
  /** Offset from the card's top-left corner, once a layout has placed it. */
  x?: number;
  y?: number;
}

export interface LayoutStrategyCard {
  id: CardId;
  width: number;
  height: number;
  ports: LayoutStrategyPort[];
  x?: number;
  y?: number;
}

/**
 * A routed span of an edge: where it starts, where it ends, and the corners it
 * turns through in between. Mirrors ELK's `ElkEdgeSection` — an orthogonal
 * back-edge routes *around* the cards as a channel rather than cutting straight
 * across them, and the bend points are how it does that.
 *
 * These points are computed by a strategy, and they are `core`'s
 * `LayoutPosition` — the same schema-derived type an author's Layout stores.
 * That is what collapsing the duplicate `LayoutPoint` bought, and it is worth
 * knowing which way the sharing runs: a constraint added to `layoutPositionSchema`
 * for the sake of authored placement (a bound, an integer, a non-negative x)
 * would land here too, on geometry no author wrote and no schema parses. The
 * schema is bare `{x, y}` today and nothing checks these against it. Constrain
 * authored positions somewhere that only authored positions pass through, or
 * split the two again deliberately.
 */
export interface LayoutStrategyEdgeSection {
  startPoint: LayoutPosition;
  endPoint: LayoutPosition;
  bendPoints?: LayoutPosition[];
}

export interface LayoutStrategyEdge {
  id: string;
  source: CardId;
  target: CardId;
  sourceHandle: string;
  targetHandle: string;
  /**
   * The routed geometry, once a routing layout has placed it. Optional like the
   * cards' `x`/`y`: a routing layout (ELK) populates it; a placement-only one
   * (grid) leaves it undefined and the render layer falls back to a plain curve.
   */
  sections?: LayoutStrategyEdgeSection[];
}

export interface LayoutStrategyGraph {
  cards: LayoutStrategyCard[];
  edges: LayoutStrategyEdge[];
}

/**
 * A layout strategy: takes a graph and returns it with geometry filled in.
 *
 * Always async. Engine-backed strategies (ELK) are inherently asynchronous; the
 * arithmetic ones (grid, positioned) resolve immediately but still return a
 * promise, so every caller handles a single shape. The type once carried a
 * `LayoutStrategyGraph | Promise<LayoutStrategyGraph>` union, but nothing exercised the sync
 * branch — `App` awaited every strategy regardless — so it was collapsed to
 * async-only (`.scratch/layout-seam/issues/06-revisit-async-optionality.md`).
 */
export type LayoutStrategy = (strategyGraph: LayoutStrategyGraph) => Promise<LayoutStrategyGraph>;

/**
 * Assemble the graph to arrange, from cards the view has already chosen plus the
 * handles and edges derived from the graphs running through them.
 */
export function buildLayoutStrategyGraph(
  cardIds: readonly CardId[],
  handlesByCard: ReadonlyMap<CardId, CardHandleSet>,
  edges: readonly GraphRenderEdge[],
  sizeOf: (cardId: CardId) => { width: number; height: number },
): LayoutStrategyGraph {
  const visible = new Set(cardIds);

  return {
    cards: cardIds.map((id) => {
      const handles = handlesByCard.get(id);
      const cardSize = sizeOf(id);
      return {
        id,
        width: cardSize.width,
        height: cardSize.height,
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
