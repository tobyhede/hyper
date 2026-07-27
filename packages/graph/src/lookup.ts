import type { Card, Layout, Route } from '@project/core';
import type { Space } from './space';

/** A card that owns content rather than pointing at another card's content. */
export type ResolvedContentCard = Exclude<Card, { kind: 'alias' }>;

export function getCard(space: Space, cardId: string): Card | undefined {
  return space.cardsById.get(cardId);
}

export function getRoute(space: Space, routeId: string): Route | undefined {
  return space.routesById.get(routeId);
}

/**
 * A layout the space declares, by id. Only positioned layouts are declared;
 * a built-in automatic view's name resolves to no layout here (ADR 0025).
 */
export function getLayout(space: Space, layoutId: string): Layout | undefined {
  return space.layoutsById.get(layoutId);
}

/**
 * The card whose content `cardId` shows. A markdown card is its own content
 * card; an alias resolves to its target (ADR 0009). Aliasing is a single hop —
 * validation guarantees a target is never itself an alias — so this follows at
 * most one link. Returns `undefined` if the card or its target does not resolve.
 */
export function resolveContentCard(space: Space, cardId: string): ResolvedContentCard | undefined {
  const card = getCard(space, cardId);
  if (card?.kind !== 'alias') return card;

  const target = getCard(space, card.target);
  return target === undefined || target.kind === 'alias' ? undefined : target;
}
