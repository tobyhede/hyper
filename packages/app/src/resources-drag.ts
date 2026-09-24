import type { MapId, ResourceId, UUID } from '@project/core';

/**
 * Hands the answer of a placement the Resources list started back to the list:
 * a refusal sentence to draw on its alert, or `null` for a completed placement.
 *
 * Built by the list at dragstart and bound to the opening that started the
 * drag, so an answer arriving after that opening has closed is dropped exactly
 * as a press's would be (`StandingRefusal` in `ResourcesPopover`).
 */
export type SettlePlacement = (answer: Promise<string | null>) => void;

/** A Space the Resources list offers, as a drag carries it. */
export interface DraggedSpace {
  readonly id: UUID;
  readonly title: string;
}

/** A Space being dragged out of the Resources list. */
export interface SpaceDrag {
  readonly kind: 'space';
  /** The whole row rather than its id: placing it titles the Space Resource with the Space's title. */
  readonly space: DraggedSpace;
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
export type ResourcesDrag =
  { readonly kind: 'resource'; readonly resourceId: ResourceId; readonly mapId: MapId } | SpaceDrag;

/**
 * Whether a canvas drop of `resourceId`, over `mapId`, completes `drag`.
 *
 * The drop has to be the one the list started: the same Resource, over the Map
 * that was selected when it left the list. Anything else — no drag, a Space
 * drag, another Resource, a Map changed mid-drag — completes nothing.
 */
export const completesResourceDrop = (
  drag: ResourcesDrag | null,
  resourceId: ResourceId,
  mapId: MapId,
): boolean => drag?.kind === 'resource' && drag.resourceId === resourceId && drag.mapId === mapId;

/**
 * The Space drag a canvas drop of `spaceId`, over `mapId`, completes, or `null`.
 *
 * The same check as {@link completesResourceDrop}, answering the drag itself
 * because the drop spends what it carries: the Space's title and the
 * settlement bound to the list that started it.
 */
export const completedSpaceDrag = (
  drag: ResourcesDrag | null,
  spaceId: UUID,
  mapId: MapId,
): SpaceDrag | null =>
  drag?.kind === 'space' && drag.space.id === spaceId && drag.mapId === mapId ? drag : null;
