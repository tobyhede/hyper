import {
  SPACE_RESOURCE_EMBED_INSET,
  type MapId,
  type MapPosition,
  type GraphId,
  type ResourceId,
} from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';

import { DRAG_TILT_RADIANS, tiltResourcePosition } from './drag-tilt';
import type { EmbeddedBounds } from './embedded-map';

/**
 * The containing Resource's box in canvas space, which bounds math reads without
 * needing the rest of a projected node.
 */
export interface EmbeddableParent {
  readonly id: string;
  readonly position: MapPosition;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

/**
 * What nested discovery walks: the Map a publication is drawing, and the
 * Resources it projected — enough to enqueue another Open Space Resource without
 * taking the rest of the publication.
 */
export interface EmbeddedPublicationSnapshot {
  readonly mapId: MapId;
  readonly nodes: readonly ResourceFlowNode[];
}

export interface DiscoverEmbeddedOpenSpaceResourcesInput<
  Entry extends { readonly id: ResourceId },
> {
  readonly nodes: readonly ResourceFlowNode[];
  readonly entries: readonly Entry[];
  readonly publications: ReadonlyMap<string, EmbeddedPublicationSnapshot>;
  readonly bodyHeights: ReadonlyMap<string, number>;
  /**
   * Which Resources a gesture is currently moving, from React Flow's own store
   * (`nodeLookup` in SpaceCanvas).
   *
   * `leans every embedding under a dragged Resource about that Resource, not about
   * its own parent` in `embedded-open-space-resource.test.ts` holds that the ids
   * named here are the Resources everything below them leans about.
   */
  readonly draggingIds: ReadonlySet<string>;
}

export interface EmbeddedOpenSpaceResourceRequest<Entry extends { readonly id: ResourceId }> {
  readonly parent: ResourceFlowNode;
  readonly spaceId: ResourceId;
  readonly mapId: MapId;
  readonly graphId: GraphId;
  readonly entry: Entry | undefined;
  readonly absolute: MapPosition;
  /**
   * The containing Resource's top-left as React Flow draws it.
   *
   * `absolute` is the authored window origin the clip is built from. A leaned
   * publication has already moved this Resource, and its children are parented
   * to that drawn node, so the lean is measured from here rather than from
   * `absolute`. They are the same point when the containing Resource has not
   * been moved. `places Resources inside a nested window relative to where that
   * window is drawn` in `embedded-open-space-resource.test.ts` holds the split;
   * `builds a nested window from the authored origin when the publication has
   * already leaned` holds that `absolute` stays the authored origin.
   */
  readonly drawnAbsolute: MapPosition;
  readonly bounds: EmbeddedBounds;
  readonly readOnly: boolean;
  /**
   * The point this embedding leans about while a Resource framing it is moved, in
   * canvas coordinates, or `undefined` when none is.
   *
   * A Resource tilts as it is dragged, and its embedded canvas is not inside it to
   * tilt with it — React Flow draws sub-flow children as siblings of their
   * parent's wrapper. So the centre of whichever ancestor is being moved is
   * carried down here, and the canvas moves the children and this embedding's
   * clip about it. It is the *dragged ancestor's* centre and not this parent's,
   * which is what keeps a nested embedding rigid with the Resource actually under
   * the pointer rather than leaning twice.
   * `leans every embedding under a dragged Resource about that Resource, not about
   * its own parent` in `embedded-open-space-resource.test.ts` holds that.
   */
  readonly tiltCenter: MapPosition | undefined;
}

interface EmbedWindow {
  readonly absolute: MapPosition;
  readonly intersection: EmbeddedBounds;
  readonly bounds: EmbeddedBounds;
}

/** Title-footer border, added to a measured footer in place of the reserved inset. */
const FOOTER_BORDER = 4;

/**
 * The containing-relative position a nested window is built from.
 *
 * A leaned publication has already rotated this child about `tiltCenter`, and
 * `embeddedMap` then expresses that position relative to the containing
 * node as it is drawn. Bring the position back into the authored frame and
 * reverse the rotation before `embedBounds` reads it.
 * `builds a nested window from the authored origin when the publication has
 * already leaned` in `embedded-open-space-resource.test.ts` holds the recovery.
 */
const untiltedPosition = (
  child: ResourceFlowNode,
  origin: MapPosition,
  containingDrawn: MapPosition,
  tiltCenter: MapPosition | undefined,
): MapPosition => {
  if (tiltCenter === undefined || child.data.dragTilted !== true) return child.position;
  return tiltResourcePosition(
    {
      x: child.position.x + origin.x - containingDrawn.x,
      y: child.position.y + origin.y - containingDrawn.y,
    },
    child,
    { x: tiltCenter.x - origin.x, y: tiltCenter.y - origin.y },
    -DRAG_TILT_RADIANS,
  );
};

/**
 * The window an Open Space Resource draws into: its box less rail/border inset,
 * the measured title footer when one exists, and every ancestor's clip.
 */
export function embedBounds(
  parent: EmbeddableParent,
  origin: MapPosition,
  clip: EmbeddedBounds | null,
  footerHeight: number | undefined,
): EmbedWindow {
  const absolute = { x: origin.x + parent.position.x, y: origin.y + parent.position.y };
  const bottomInset =
    footerHeight === undefined ? SPACE_RESOURCE_EMBED_INSET.bottom : footerHeight + FOOTER_BORDER;
  const intersection = {
    left: Math.max(absolute.x + SPACE_RESOURCE_EMBED_INSET.left, clip?.left ?? -Infinity),
    top: Math.max(absolute.y + SPACE_RESOURCE_EMBED_INSET.top, clip?.top ?? -Infinity),
    right: Math.min(
      absolute.x + (parent.width ?? 0) - SPACE_RESOURCE_EMBED_INSET.right,
      clip?.right ?? Infinity,
    ),
    bottom: Math.min(absolute.y + (parent.height ?? 0) - bottomInset, clip?.bottom ?? Infinity),
  };
  return {
    absolute,
    intersection,
    bounds: {
      left: intersection.left - absolute.x,
      top: intersection.top - absolute.y,
      right: intersection.right - absolute.x,
      bottom: intersection.bottom - absolute.y,
    },
  };
}

/**
 * Nested Open Space Resource embed requests from the current node tree and a
 * publication snapshot. A Map already on the path is skipped so a mutual
 * pair cannot deepen one level per commit.
 */
export function discoverEmbeddedOpenSpaceResources<Entry extends { readonly id: ResourceId }>(
  input: DiscoverEmbeddedOpenSpaceResourcesInput<Entry>,
): readonly EmbeddedOpenSpaceResourceRequest<Entry>[] {
  const requests: EmbeddedOpenSpaceResourceRequest<Entry>[] = [];
  const queue: {
    parent: ResourceFlowNode;
    origin: MapPosition;
    containingDrawn: MapPosition;
    clip: EmbeddedBounds | null;
    path: ReadonlySet<string>;
    readOnly: boolean;
    tiltCenter: MapPosition | undefined;
  }[] = input.nodes.map((parent) => ({
    parent,
    origin: { x: 0, y: 0 },
    containingDrawn: { x: 0, y: 0 },
    clip: null,
    path: new Set<string>(),
    readOnly: false,
    tiltCenter: undefined,
  }));
  for (const item of queue) {
    const { parent, origin, containingDrawn, clip, path } = item;
    if (parent.data.expanded !== true) continue;
    const document = parent.data.spaceContent;
    if (document === undefined) continue;
    const readOnly = item.readOnly || parent.data.kind === 'reference';
    const crossing = `${document.spaceId}:${document.map}`;
    if (path.has(crossing)) continue;
    const crossed = new Set(path).add(crossing);
    const authoredPosition = untiltedPosition(parent, origin, containingDrawn, item.tiltCenter);
    const window = embedBounds(
      { ...parent, position: authoredPosition },
      origin,
      clip,
      input.bodyHeights.get(parent.id),
    );
    const drawnAbsolute = {
      x: containingDrawn.x + parent.position.x,
      y: containingDrawn.y + parent.position.y,
    };
    // A Resource being moved is the one everything below it leans about. An
    // ancestor already leaning wins, because React Flow moves one Resource at a
    // time and a descendant of the dragged Resource is carried, not dragged.
    const tiltCenter =
      item.tiltCenter ??
      (input.draggingIds.has(parent.id)
        ? {
            x: window.absolute.x + (parent.width ?? 0) / 2,
            y: window.absolute.y + (parent.height ?? 0) / 2,
          }
        : undefined);
    requests.push({
      parent: { ...parent, position: authoredPosition },
      readOnly,
      spaceId: document.spaceId,
      mapId: document.map,
      graphId: document.graph,
      entry: input.entries.find((entry) => entry.id === document.spaceId),
      absolute: window.absolute,
      drawnAbsolute,
      bounds: window.bounds,
      tiltCenter,
    });
    const published = input.publications.get(parent.id);
    if (published?.mapId === document.map) {
      for (const child of published.nodes)
        queue.push({
          parent: child,
          origin: window.absolute,
          containingDrawn: drawnAbsolute,
          clip: window.intersection,
          path: crossed,
          readOnly,
          tiltCenter,
        });
    }
  }
  return requests;
}

export function editingPortalAncestor(
  start: ResourceFlowNode | undefined,
  nodesById: ReadonlyMap<string, ResourceFlowNode>,
  editingPortals: ReadonlySet<ResourceId>,
): ResourceFlowNode | undefined {
  let current = start;
  while (current !== undefined) {
    if (current.data.kind === 'space' && editingPortals.has(current.data.resourceId)) {
      return current;
    }
    current = current.parentId === undefined ? undefined : nodesById.get(current.parentId);
  }
  return undefined;
}

export function embeddingIsPortalEditing(
  parent: ResourceFlowNode,
  nodesById: ReadonlyMap<string, ResourceFlowNode>,
  editingPortals: ReadonlySet<ResourceId>,
): boolean {
  return editingPortalAncestor(parent, nodesById, editingPortals) !== undefined;
}

export interface EmbeddedAuthoringGate {
  readonly readOnly: boolean;
  readonly portalEditing: boolean;
  readonly authorInEmbeddedMap: boolean;
  readonly authorOnCanvas: boolean;
  readonly thisEmbeddingEditing: boolean;
  readonly hostBodyEditing: boolean;
  readonly hostTitleEditing: boolean;
}

/** Read/Edit for an embedding: portal Edit, host availability, and the one live nested edit. */
export function embeddedAuthoringEnabled(gate: EmbeddedAuthoringGate): boolean {
  return (
    !gate.readOnly &&
    gate.portalEditing &&
    gate.authorInEmbeddedMap &&
    (gate.authorOnCanvas || gate.thisEmbeddingEditing) &&
    !gate.hostBodyEditing &&
    !gate.hostTitleEditing
  );
}
