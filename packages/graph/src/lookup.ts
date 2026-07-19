import type { Card, Manifest, PresentationPath } from '@project/core';

export function getCard(manifest: Manifest, cardId: string): Card | undefined {
  return manifest.cards.find((c) => c.id === cardId);
}

export function getPath(manifest: Manifest, pathId: string): PresentationPath | undefined {
  return manifest.paths.find((p) => p.id === pathId);
}
