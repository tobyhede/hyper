import type { Card, CardId, Layout, Graph, GraphId, UUID } from '@project/core';
import type { Space } from './space';

/** A card that owns content rather than pointing at another card's content. */
export type ResolvedContentCard = Exclude<Card, { kind: 'alias' }>;

export function getCard(space: Space, cardId: CardId): Card | undefined {
  return space.cardsById.get(cardId);
}

export function getGraph(space: Space, graphId: GraphId): Graph | undefined {
  return space.graphsById.get(graphId);
}

/**
 * The layout that owns a graph (ADR 0040).
 *
 * `space.graphs` is a flatten across every layout, so a caller holding a graph
 * id off it has lost the one thing ownership adds — which layout's cards its
 * edges are closed over, and which layout an edit to it belongs in. This
 * answers that in O(1) rather than by scanning the layouts.
 */
export function getGraphOwner(space: Space, graphId: GraphId): Layout | undefined {
  return space.layoutByGraphId.get(graphId);
}

/**
 * A layout the space declares, by id. Only positioned layouts are declared;
 * a built-in automatic view's name resolves to no layout here (ADR 0025).
 */
export function getLayout(space: Space, layoutId: UUID): Layout | undefined {
  return space.layoutsById.get(layoutId);
}

/**
 * The card whose content `cardId` shows. A markdown card is its own content
 * card; an alias resolves to its target (ADR 0009). Aliasing is a single hop —
 * validation guarantees a target is never itself an alias — so this follows at
 * most one link. Returns `undefined` if the card or its target does not resolve.
 */
export function resolveContentCard(space: Space, cardId: CardId): ResolvedContentCard | undefined {
  const card = getCard(space, cardId);
  if (card?.kind !== 'alias') return card;

  const target = getCard(space, card.target);
  return target === undefined || target.kind === 'alias' ? undefined : target;
}
