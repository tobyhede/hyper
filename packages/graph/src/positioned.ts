import type { LayoutStrategyGraph, LayoutStrategy } from './layout';
import type { Placement } from './placement';

/**
 * The positioned strategy: the cards go where the author put them.
 *
 * The third strategy, and the only one that *reads* geometry rather than
 * computing it — placement is authored content, not an artifact of an algorithm
 * (ADR 0025). It is the one strategy with a **Diagram** behind it: the Placement
 * it takes is that Diagram's, and `Placement.fromLayoutStrategyGraph` is this same
 * conversion run backwards. The Placement is read exactly as authored — an Open
 * Card's neighbours were moved by the Edit that opened it (ADR 0084), so there
 * is no derived layer between those positions and the ones drawn, and this reads
 * an Open Card's rect off its own entry alone. Like `gridStrategy` it consumes
 * only the cards: it never looks at the edges, places no ports, and populates no
 * edge sections, leaving the render layer to spread handles evenly and draw a
 * plain curve. If this file ever needs
 * to know about ports or routing, the seam has leaked.
 *
 * Positions are deliberately **sparse**. A space can hold several positioned
 * diagrams, so a card created while one was active genuinely has no position in
 * another; that is Diagram non-membership rather than a hole to backfill. Cards
 * the map omits are therefore omitted from the projected graph and remain
 * available through the Cards drawer.
 */

export function positionedStrategy(positions: Placement): LayoutStrategy {
  // Uniformly-async contract (ADR 0005); there is nothing to await.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (strategyGraph: LayoutStrategyGraph): Promise<LayoutStrategyGraph> => {
    return {
      cards: strategyGraph.cards.flatMap((card) => {
        const at = positions.get(card.id);
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
