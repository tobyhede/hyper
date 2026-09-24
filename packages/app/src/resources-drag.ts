import type { MapId, ResourceId, UUID } from '@project/core';

/**
 * Hands a Resource drop's answer back to the Resources list: a refusal sentence
 * to draw on its alert, or `null` for a completed placement.
 *
 * Built by the list at dragstart and bound to the opening that started the
 * drag, so an answer arriving after that opening has closed is dropped exactly
 * as a press's would be (`StandingRefusal` in `ResourcesPopover`). A Resource's
 * answer is synchronous, so it settles immediately.
 */
export type SettleResource = (answer: string | null) => void;

/**
 * {@link SettleResource} for a Space drop, whose answer is a promise because
 * placing a Space is a coordinated Edit across Spaces.
 */
export type SettlePlacement = (answer: Promise<string | null>) => void;

/** A Resource being dragged out of the Resources list. */
export interface ResourceDrag {
  readonly kind: 'resource';
  readonly resourceId: ResourceId;
  readonly mapId: MapId;
  /** Where the drop's answer goes — see {@link SettleResource}. */
  readonly settle: SettleResource;
}

/**
 * One Space this Meta Space holds, as the Resources list offers it — the row a
 * press places and a drag carries.
 */
export interface ResourcesPopoverSpace {
  readonly id: UUID;
  readonly title: string;
}

/** A Space being dragged out of the Resources list. */
export interface SpaceDrag {
  readonly kind: 'space';
  /** The whole row rather than its id: placing it titles the Space Resource with the Space's title. */
  readonly space: ResourcesPopoverSpace;
  readonly mapId: MapId;
  /** Where the drop's answer goes — see {@link SettlePlacement}. */
  readonly settle: SettlePlacement;
}

/**
 * A row being dragged out of the Resources list: what it carries, and the Map
 * selected when the drag began.
 *
 * **Discriminated by kind rather than by which id is present**, because the
 * list offers Spaces beside Resources and both are identified by a UUID — a
 * record holding a bare id could not say which the id names, so a Space drag
 * would be read as a Resource one.
 */
export type ResourcesDrag = ResourceDrag | SpaceDrag;

/**
 * The Resource drag a canvas drop of `resourceId`, over `mapId`, completes, or
 * `null`.
 *
 * The drop has to be the one the list started: the same Resource, over the Map
 * that was selected when it left the list. Anything else — no drag, a Space
 * drag, another Resource, a Map changed mid-drag — completes nothing.
 *
 * It answers the drag rather than a type predicate over it, because the check
 * reads the id and the Map as well as the kind: a predicate's `false` would
 * narrow a Resource drag that merely named another Resource out of being one.
 */
export const completedResourceDrag = (
  drag: ResourcesDrag | null,
  resourceId: ResourceId,
  mapId: MapId,
): ResourceDrag | null =>
  drag?.kind === 'resource' && drag.resourceId === resourceId && drag.mapId === mapId ? drag : null;

/**
 * The Space drag a canvas drop of `spaceId`, over `mapId`, completes, or `null`.
 *
 * The same check as {@link completedResourceDrag}, for a Space: the drop spends
 * what the drag carries, the Space's title and the settlement bound to the list
 * that started it.
 */
export const completedSpaceDrag = (
  drag: ResourcesDrag | null,
  spaceId: UUID,
  mapId: MapId,
): SpaceDrag | null =>
  drag?.kind === 'space' && drag.space.id === spaceId && drag.mapId === mapId ? drag : null;
