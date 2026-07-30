import type { RouteId, SpaceSnapshot, UUID } from '@project/core';
import type { LayoutPoint } from '@project/graph';
import { updatePositionedLayout } from './snapshot';

export interface CompletedPlacementEdit {
  readonly revision: number;
  readonly positions: ReadonlyMap<string, LayoutPoint> | null;
}

export type PlacementTarget =
  | {
      readonly kind: 'view';
      readonly layoutId: UUID;
      readonly activeRouteId: RouteId | null;
    }
  | {
      readonly kind: 'layout';
      readonly layoutId: UUID;
      readonly activeRouteId: RouteId | null;
    };

export interface PlacementSubmission {
  readonly revision: number;
  readonly snapshot: SpaceSnapshot;
}

function nextLayoutTitle(base: SpaceSnapshot): string {
  let highest = 0n;
  for (const layout of base.document.layouts ?? []) {
    const match = /^Layout ([1-9]\d*)$/.exec(layout.title);
    if (match?.[1] !== undefined) {
      const number = BigInt(match[1]);
      if (number > highest) highest = number;
    }
  }
  return `Layout ${highest + 1n}`;
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
  const existing = (base.document.layouts ?? []).find((layout) => layout.id === target.layoutId);
  let layoutTitle: string;
  if (target.kind === 'layout') {
    if (existing === undefined) {
      throw new Error(`The selected Layout ${target.layoutId} does not exist.`);
    }
    layoutTitle = existing.title;
  } else {
    layoutTitle = nextLayoutTitle(base);
  }
  return {
    revision: edit.revision,
    snapshot: updatePositionedLayout(
      base,
      target.layoutId,
      layoutTitle,
      edit.positions,
      target.activeRouteId,
    ),
  };
}
