import { urKind, type ResourceShape } from '@project/core';

/**
 * The view half of the Ur kind (ADR 0120, ADR 0128): what an Ur Resource is
 * called, and the one operation it offers beyond the shared Title. It draws no
 * content, having none (ADR 0113), so it has no content view. Its frame is
 * `ur-canvas.css` and `ur-stage.css`, which `CanvasResource` and `Stage` import.
 */
export const urView = {
  name: 'Ur Resource',
  referenceName: 'Reference to an Ur Resource',
} as const;

/** What an Ur Resource offers beyond its Title. */
export interface UrOperations {
  readonly kind: typeof urKind.id;
  /**
   * Draw this Resource in another Shape on its Map (ADR 0121), chosen from
   * its rail Open and Closed alike. Absent where the Map may not be authored.
   */
  readonly onResourceShapeChange?: (resourceShape: ResourceShape) => void;
}

/** Whether these operations are an Ur Resource's. */
export const isUrOperations = (operations: { readonly kind: string }): operations is UrOperations =>
  operations.kind === urKind.id;
