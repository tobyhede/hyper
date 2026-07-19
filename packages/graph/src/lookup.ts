import type { Card, GraphNode, Manifest, PresentationPath } from '@project/core';

export function getCard(manifest: Manifest, cardId: string): Card | undefined {
  return manifest.cards.find((c) => c.id === cardId);
}

export function getNode(manifest: Manifest, nodeId: string): GraphNode | undefined {
  return manifest.nodes.find((n) => n.id === nodeId);
}

export function getPath(manifest: Manifest, pathId: string): PresentationPath | undefined {
  return manifest.paths.find((p) => p.id === pathId);
}

/** Resolve the card rendered by a given graph node, if any. */
export function getCardForNode(manifest: Manifest, nodeId: string): Card | undefined {
  const node = getNode(manifest, nodeId);
  if (!node) return undefined;
  return getCard(manifest, node.cardId);
}
