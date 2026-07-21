import type { Card, Manifest, Route } from '@project/core';

export function getCard(manifest: Manifest, cardId: string): Card | undefined {
  return manifest.cards.find((c) => c.id === cardId);
}

export function getRoute(manifest: Manifest, routeId: string): Route | undefined {
  return manifest.routes.find((r) => r.id === routeId);
}

/**
 * The card whose content `cardId` shows. A markdown card is its own content
 * card; an alias resolves to its target (ADR 0009). Aliasing is a single hop —
 * validation guarantees a target is never itself an alias — so this follows at
 * most one link. Returns `undefined` if the card or its target does not resolve.
 */
export function resolveContentCard(manifest: Manifest, cardId: string): Card | undefined {
  const card = getCard(manifest, cardId);
  if (card?.kind === 'alias') return getCard(manifest, card.target);
  return card;
}
