import type { SpaceThingSelectorsProps } from '@project/ui';

export type {
  CanvasSpaceThingChoice,
  CanvasSpaceThingCommands,
  CanvasSpaceThingGraphCommands,
} from '@project/ui';

/**
 * What {@link SpaceThingRailClusters} needs to draw Diagram and Graph on a
 * Space Thing rail, minus portal Read/Edit which stays on the Thing front.
 *
 * The same shape `@project/ui`'s `SpaceThingSelectors` takes — the Space Thing
 * rail mounts that one shared component rather than a second copy of it
 * (`docs/agents/ui.md`, `command-surface-sharing.test.ts`).
 */
export type SpaceThingRailClustersProps = SpaceThingSelectorsProps;
