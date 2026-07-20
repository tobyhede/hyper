import type { Card, Manifest, Route } from '@project/core';

export function getCard(manifest: Manifest, cardId: string): Card | undefined {
  return manifest.cards.find((c) => c.id === cardId);
}

export function getRoute(manifest: Manifest, routeId: string): Route | undefined {
  return manifest.routes.find((r) => r.id === routeId);
}
