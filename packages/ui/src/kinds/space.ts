import type { ReactNode } from 'react';
import type { spaceKind } from '@project/core';

/**
 * The view half of the Space kind (ADR 0068, ADR 0128): what a Space Resource
 * is called, and what it offers beyond the shared Title. Its content view is
 * the embedded Map the application draws, and its frame is `space-canvas.css`,
 * which `CanvasResource` imports.
 */
export const spaceView = {
  name: 'Space Resource',
  referenceName: 'Reference to a Space Resource',
} as const;

/** What a Space Resource offers beyond its Title. */
export interface SpaceOperations {
  readonly kind: typeof spaceKind.id;
  /**
   * Map and Graph clusters, assembled by the application and inserted
   * at the head of this Resource's rail. Absent while the Resource is closed, the
   * surface is read-only, or the target Space has not been read yet.
   */
  readonly spaceRail?: ReactNode;
  /**
   * The Read/Edit boundary for the embedded target canvas.
   *
   * Absent means this surface does not offer one — a Closed Resource, an unread
   * target, or a composition that has not wired the portal. Present on an Open
   * Space Resource: Read leaves the embedding inert so dragging moves this Resource;
   * Edit activates the target canvas and replaces the control with Done.
   */
  readonly portal?: {
    readonly editing: boolean;
    readonly onEditingChange: (editing: boolean) => void;
  };
}
