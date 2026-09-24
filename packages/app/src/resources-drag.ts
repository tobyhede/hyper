import type { MapId, ResourceId, UUID } from '@project/core';

/**
 * A row being dragged out of the Resources list: what it carries, and the Map
 * selected when the drag began.
 *
 * **Discriminated by kind rather than by which id is present**, because the
 * list offers Spaces beside Resources and both are identified by a UUID — a
 * record holding a bare id could not say which the id names, so a Space drag
 * would be read as a Resource one. No row starts a `space` drag yet; the arm is
 * here so one has somewhere to be recorded.
 */
export type ResourcesDrag =
  | { readonly kind: 'resource'; readonly resourceId: ResourceId; readonly mapId: MapId }
  | { readonly kind: 'space'; readonly spaceId: UUID; readonly mapId: MapId };

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
