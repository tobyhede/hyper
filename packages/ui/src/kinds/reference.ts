import { referenceKind } from '@project/core';
import { BADGED_TARGET_GLYPH, type KindView } from './kind-view';

/** What a Reference Resource offers beyond its Title: nothing. */
export interface ReferenceOperations {
  readonly kind: typeof referenceKind.id;
}

/**
 * The view half of the Reference kind (ADR 0070): what a Reference
 * Resource is called. It shows its Target's content read-only, so it offers
 * nothing beyond the shared Title, and it draws no silhouette of its own but
 * its Target's with a badge. Its frame is `reference-canvas.css`, which
 * `CanvasResource` imports.
 */
export const referenceView: KindView<ReferenceOperations> = {
  name: 'Reference Resource',
  listName: 'Reference Resources',
  referenceName: null,
  Glyph: BADGED_TARGET_GLYPH,
  bareOperations: { kind: referenceKind.id },
};
