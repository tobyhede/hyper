import type { CardId } from '@project/core';
import type { LayoutCard, LayoutGraph, LayoutPoint, LayoutStrategy } from './layout';

/**
 * The positioned strategy: the cards go where the author put them.
 *
 * The third strategy, and the only one that *reads* geometry rather than
 * computing it — placement is authored content, not an artifact of an algorithm
 * (ADR 0025). It is the one strategy with a **Layout** behind it: the positions
 * it takes are that Layout's, and Auto-arrange is the same conversion run
 * backwards. Like `gridStrategy` it consumes only the cards: it never looks at
 * the edges, places no ports, and populates no edge sections, leaving the render
 * layer to spread handles evenly and draw a plain curve. If this file ever needs
 * to know about ports or routing, the seam has leaked.
 *
 * Positions are deliberately **sparse**. A space can hold several positioned
 * layouts, so a card created while one was active genuinely has no position in
 * another; that is correct rather than a hole to backfill. Cards the map omits
 * are laid out in a grid strictly below everything the map does place, so they
 * read as unplaced instead of stacking at the origin — and, being below the
 * lowest authored card, they cannot overlap one.
 */

/** Matches `gridStrategy`'s spacing, so the unplaced band looks like what it is. */
const GAP = 80;

interface Bounds {
  minX: number;
  maxY: number;
}

function boundsOf(cards: readonly LayoutCard[]): Bounds | null {
  let minX = Infinity;
  let maxY = -Infinity;
  for (const card of cards) {
    if (card.x === undefined || card.y === undefined) continue;
    minX = Math.min(minX, card.x);
    maxY = Math.max(maxY, card.y + card.height);
  }
  return minX === Infinity ? null : { minX, maxY };
}

/**
 * The card→position map a laid-out graph describes: `positionedStrategy` run
 * backwards, and the crossing from computed placement to authored placement that
 * Auto-arrange is.
 *
 * Cards a strategy left unplaced are **omitted**, not defaulted to the origin —
 * absence in a Layout means *unplaced*, and collapsing that to `(0, 0)` would
 * assert a placement no strategy made.
 */
export function layoutPositions(graph: LayoutGraph): ReadonlyMap<CardId, LayoutPoint> {
  const positions = new Map<CardId, LayoutPoint>();
  for (const card of graph.cards) {
    if (card.x === undefined || card.y === undefined) continue;
    positions.set(card.id, { x: card.x, y: card.y });
  }
  return positions;
}

export function positionedStrategy(positions: ReadonlyMap<CardId, LayoutPoint>): LayoutStrategy {
  // Uniformly-async contract (ADR 0005); there is nothing to await.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (graph: LayoutGraph): Promise<LayoutGraph> => {
    const placed = graph.cards.map((card) => {
      const at = positions.get(card.id);
      return at ? { ...card, x: at.x, y: at.y } : card;
    });

    const unplaced = placed.filter((card) => card.x === undefined || card.y === undefined);
    if (unplaced.length === 0) return { cards: placed, edges: graph.edges };

    // The unplaced band: a square-ish grid starting below the authored cards.
    const bounds = boundsOf(placed);
    const originX = bounds?.minX ?? 0;
    const originY = bounds === null ? 0 : bounds.maxY + GAP;
    const columns = Math.ceil(Math.sqrt(unplaced.length));
    const cellWidth = Math.max(...unplaced.map((c) => c.width));
    const cellHeight = Math.max(...unplaced.map((c) => c.height));

    const slots = new Map(
      unplaced.map((card, index) => [
        card.id,
        {
          x: originX + (index % columns) * (cellWidth + GAP),
          y: originY + Math.floor(index / columns) * (cellHeight + GAP),
        },
      ]),
    );

    return {
      cards: placed.map((card) => {
        const slot = slots.get(card.id);
        return slot ? { ...card, x: slot.x, y: slot.y } : card;
      }),
      edges: graph.edges,
    };
  };
}
