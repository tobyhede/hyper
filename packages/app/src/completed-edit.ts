import type { SpaceSnapshot, UUID } from '@project/core';
import type { LayoutPoint } from '@project/graph';
import { updatePositionedLayout } from './snapshot';

export interface CompletedPlacementEdit {
  readonly revision: number;
  readonly positions: ReadonlyMap<string, LayoutPoint> | null;
}

export interface PlacementTarget {
  readonly layoutId: UUID;
  readonly layoutTitle: string;
  readonly activeRouteId: string | null;
}

export interface PlacementSubmission {
  readonly revision: number;
  readonly snapshot: SpaceSnapshot;
}

export function preparePlacementSubmission(
  base: SpaceSnapshot,
  submittedRevision: number,
  edit: CompletedPlacementEdit,
  target: PlacementTarget,
): PlacementSubmission | null {
  if (edit.revision === 0 || edit.revision === submittedRevision) return null;
  if (edit.positions === null) {
    throw new Error('A completed editor revision must carry authored positions.');
  }
  return {
    revision: edit.revision,
    snapshot: updatePositionedLayout(
      base,
      target.layoutId,
      target.layoutTitle,
      edit.positions,
      target.activeRouteId,
    ),
  };
}
