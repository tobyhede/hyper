import type { referenceKind } from '@project/core';

/**
 * The view half of the Reference kind (ADR 0070, ADR 0128): what a Reference
 * Resource is called. It shows its Target's content read-only, so it offers
 * nothing beyond the shared Title. Its frame is `reference-canvas.css`, which `CanvasResource` imports.
 */
export const referenceView = {
  name: 'Reference Resource',
} as const;

/** What a Reference Resource offers beyond its Title: nothing. */
export interface ReferenceOperations {
  readonly kind: typeof referenceKind.id;
}
