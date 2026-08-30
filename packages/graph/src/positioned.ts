import type { LayoutStrategyGraph, LayoutStrategy } from './layout';
import { Placement } from './placement';

/**
 * The positioned strategy: the cards go where the author put them.
 *
 * The third strategy, and the only one that *reads* geometry rather than
 * computing it — placement is authored content, not an artifact of an algorithm
 * (ADR 0025). It is the one strategy with a **Layout** behind it: the Placement
 * it takes is that Layout's, and `Placement.fromLayoutStrategyGraph` is this same
 * conversion run backwards. Like `gridStrategy` it consumes only the cards: it never looks at
 * the edges, places no ports, and populates no edge sections, leaving the render
 * layer to spread handles evenly and draw a plain curve. If this file ever needs
 * to know about ports or routing, the seam has leaked.
 *
 * Positions are deliberately **sparse**. A space can hold several positioned
 * layouts, so a card created while one was active genuinely has no position in
 * another; that is Layout non-membership rather than a hole to backfill. Cards
 * the map omits are therefore omitted from the projected graph and remain
 * available through the Cards drawer.
 */

export function positionedStrategy(positions: Placement): LayoutStrategy {
  // Uniformly-async contract (ADR 0005); there is nothing to await.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (strategyGraph: LayoutStrategyGraph): Promise<LayoutStrategyGraph> => {
    const drawn = Placement.drawn(positions);
    return {
      cards: strategyGraph.cards.flatMap((card) => {
        const at = drawn.get(card.id);
        return at === undefined
          ? []
          : [
              {
                ...card,
                x: at.x,
                y: at.y,
                width: at.open ? at.openSize.width : card.width,
                height: at.open ? at.openSize.height : card.height,
              },
            ];
      }),
      edges: strategyGraph.edges,
    };
  };
}
