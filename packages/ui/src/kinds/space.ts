import type { ReactNode } from 'react';
import { spaceKind, type ContentVia, type SpaceContent, type SpaceView } from '@project/core';
import type { ResourceDisplay } from '../resource-display';
import { SpaceResourceIcon } from '../icons';
import type { KindView } from './kind-view';

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

/**
 * The view half of the Space kind (ADR 0068): what a Space Resource
 * is called and drawn as, and what it offers beyond the shared Title. Its
 * content view is the embedded Map the application draws, and its frame is
 * `space-canvas.css`, which `CanvasResource` imports.
 */
export const spaceView: KindView<SpaceOperations, SpaceContent> = {
  name: 'Space Resource',
  listName: 'Space Resources in this Space',
  referenceName: 'Reference to a Space Resource',
  Glyph: SpaceResourceIcon,
  bareOperations: { kind: spaceKind.id },
};

/** Whether these operations are a Space Resource's. */
export const isSpaceOperations = (operations: {
  readonly kind: string;
}): operations is SpaceOperations => operations.kind === spaceKind.id;

/**
 * The Space view an Open Resource shows, and whether it is the
 * Resource's own or its Target's. A Space reached through a Reference Resource
 * is drawn read-only (ADR 0070). A Closed display shows no Space.
 */
export function spaceViewOf(
  display: ResourceDisplay,
): { readonly view: SpaceView; readonly via: ContentVia } | undefined {
  switch (display.shown) {
    case 'open':
      return display.content.kind === spaceKind.id
        ? { view: display.content.view, via: display.content.via }
        : undefined;
    case 'closed':
    case 'editing':
      return undefined;
  }
}
