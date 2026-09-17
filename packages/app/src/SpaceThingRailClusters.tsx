import { SpaceThingSelectors } from '@project/ui';
import type { SpaceThingRailClustersProps } from './space-thing-rail';

/**
 * The Space Thing rail's Diagram and Graph clusters.
 *
 * `@project/ui`'s `SpaceThingSelectors` is the one implementation — the labelled
 * list, the Rename/Create/Delete/Copy menus and the shared `ChoiceMenu` all live
 * there, alongside the identical rail an embedded canvas Thing draws for itself
 * (`CanvasThing`'s own Open Space Thing front). This module only supplies this
 * rail's own commands and choices; it must not grow a second copy of the
 * selector (`command-surface-sharing.test.ts` holds that).
 */
export function SpaceThingRailClusters(props: SpaceThingRailClustersProps) {
  return <SpaceThingSelectors {...props} />;
}
