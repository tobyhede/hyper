import { urKind, type ResourceShape, type UrContent } from '@project/core';
import { UrIcon } from '../icons';
import type { KindView } from './kind-view';

/** What an Ur Resource offers beyond its Title. */
export interface UrOperations {
  readonly kind: typeof urKind.id;
  /**
   * Draw this Resource in another Shape on its Map (ADR 0121), chosen from
   * its rail Open and Closed alike. Absent where the Map may not be authored.
   */
  readonly onResourceShapeChange?: (resourceShape: ResourceShape) => void;
}

/**
 * The view half of the Ur kind (ADR 0120): what an Ur Resource is
 * called and drawn as, and the one operation it offers beyond the shared
 * Title. It draws no content, having none (ADR 0113), so it has no content
 * view. Its frame is `ur-canvas.css` and `ur-stage.css`, which `CanvasResource`
 * and `Stage` import after their own stylesheets
 * (`test/unit/kind-stylesheet-order.test.ts`).
 */
export const urView: KindView<UrOperations, UrContent> = {
  name: 'Ur Resource',
  listName: 'Ur Resources',
  referenceName: 'Reference to an Ur Resource',
  Glyph: UrIcon,
  bareOperations: { kind: urKind.id },
};

/** Whether these operations are an Ur Resource's. */
export const isUrOperations = (operations: { readonly kind: string }): operations is UrOperations =>
  operations.kind === urKind.id;
