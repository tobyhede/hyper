import {
  SPACE_THING_EMBED_INSET,
  type DiagramId,
  type DiagramPosition,
  type GraphId,
  type ThingId,
} from '@project/core';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import { CANVAS_THING_DRAG_TILT_DEGREES } from '@project/ui';
import type { EmbeddedBounds } from './embedded-diagram';

/**
 * The containing Thing's box in canvas space, which bounds math reads without
 * needing the rest of a projected node.
 */
export interface EmbeddableParent {
  readonly id: string;
  readonly position: DiagramPosition;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

/**
 * What nested discovery walks: the Diagram a publication is drawing, and the
 * Things it projected — enough to enqueue another Open Space Thing without
 * taking the rest of the publication.
 */
export interface EmbeddedPublicationSnapshot {
  readonly diagramId: DiagramId;
  readonly nodes: readonly ThingFlowNode[];
}

export interface DiscoverEmbeddedOpenSpaceThingsInput<Entry extends { readonly id: ThingId }> {
  readonly nodes: readonly ThingFlowNode[];
  readonly entries: readonly Entry[];
  readonly publications: ReadonlyMap<string, EmbeddedPublicationSnapshot>;
  readonly bodyHeights: ReadonlyMap<string, number>;
  /**
   * Which Things a gesture is currently moving, from React Flow's own store
   * (`nodeLookup` in SpaceCanvas).
   *
   * **Not a projection node's `dragging` flag, and not the adapter's
   * `dragOrigins`.** The flag is wiped whenever the adapter republishes —
   * `reconcile` rebuilds each node from `canvasProjection` and splices back
   * only the live position — so it is absent for most frames of a drag.
   * `dragOrigins` is durable but is filled from the first `position` change
   * React Flow reports, which arrives a frame after React Flow has already
   * moved the Thing. SpaceCanvas reads `nodeLookup` because that is the store
   * the moving Thing is drawn from.
   */
  readonly draggingIds: ReadonlySet<string>;
}

export interface EmbeddedOpenSpaceThingRequest<Entry extends { readonly id: ThingId }> {
  readonly parent: ThingFlowNode;
  readonly spaceId: ThingId;
  readonly diagramId: DiagramId;
  readonly graphId: GraphId;
  readonly entry: Entry | undefined;
  readonly absolute: DiagramPosition;
  readonly bounds: EmbeddedBounds;
  readonly readOnly: boolean;
  /**
   * The point this embedding leans about while a Thing framing it is moved, in
   * canvas coordinates, or `undefined` when none is.
   *
   * A Thing tilts as it is dragged, and its embedded canvas is not inside it to
   * tilt with it — React Flow draws sub-flow children as siblings of their
   * parent's wrapper. So the centre of whichever ancestor is being moved is
   * carried down here, and the canvas rotates the children, their Edges and
   * this embedding's clip about it. It is the *dragged ancestor's* centre and
   * not this parent's, which is what keeps a nested embedding rigid with the
   * Thing actually under the pointer rather than leaning twice.
   */
  readonly tiltCenter: DiagramPosition | undefined;
}

interface EmbedWindow {
  readonly absolute: DiagramPosition;
  readonly intersection: EmbeddedBounds;
  readonly bounds: EmbeddedBounds;
}

/** Title-footer border, added to a measured footer in place of the reserved inset. */
const FOOTER_BORDER = 4;

const TILT_RADIANS = (CANVAS_THING_DRAG_TILT_DEGREES * Math.PI) / 180;

/**
 * The containing-relative position a nested window is built from.
 *
 * A leaned publication has already rotated this child about `tiltCenter`.
 * The nested window stays in the unleaned frame — clip and grandchildren
 * lean after that — so walk the rotation back before `embedBounds` reads
 * the position. `embedded-open-space-thing.test.ts` holds the recovery.
 */
const untiltedPosition = (
  child: ThingFlowNode,
  origin: DiagramPosition,
  tiltCenter: DiagramPosition | undefined,
): DiagramPosition => {
  if (tiltCenter === undefined || child.data.dragTilted !== true) return child.position;
  const half = { x: (child.width ?? 0) / 2, y: (child.height ?? 0) / 2 };
  const centre = { x: tiltCenter.x - origin.x, y: tiltCenter.y - origin.y };
  const from = {
    x: child.position.x + half.x - centre.x,
    y: child.position.y + half.y - centre.y,
  };
  const cos = Math.cos(TILT_RADIANS);
  const sin = Math.sin(TILT_RADIANS);
  return {
    x: centre.x + from.x * cos + from.y * sin - half.x,
    y: centre.y - from.x * sin + from.y * cos - half.y,
  };
};

/**
 * The window an Open Space Thing draws into: its box less rail/border inset,
 * the measured title footer when one exists, and every ancestor's clip.
 */
export function embedBounds(
  parent: EmbeddableParent,
  origin: DiagramPosition,
  clip: EmbeddedBounds | null,
  footerHeight: number | undefined,
): EmbedWindow {
  const absolute = { x: origin.x + parent.position.x, y: origin.y + parent.position.y };
  const bottomInset =
    footerHeight === undefined ? SPACE_THING_EMBED_INSET.bottom : footerHeight + FOOTER_BORDER;
  const intersection = {
    left: Math.max(absolute.x + SPACE_THING_EMBED_INSET.left, clip?.left ?? -Infinity),
    top: Math.max(absolute.y + SPACE_THING_EMBED_INSET.top, clip?.top ?? -Infinity),
    right: Math.min(
      absolute.x + (parent.width ?? 0) - SPACE_THING_EMBED_INSET.right,
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
 * Nested Open Space Thing embed requests from the current node tree and a
 * publication snapshot. A Diagram already on the path is skipped so a mutual
 * pair cannot deepen one level per commit.
 */
export function discoverEmbeddedOpenSpaceThings<Entry extends { readonly id: ThingId }>(
  input: DiscoverEmbeddedOpenSpaceThingsInput<Entry>,
): readonly EmbeddedOpenSpaceThingRequest<Entry>[] {
  const requests: EmbeddedOpenSpaceThingRequest<Entry>[] = [];
  const queue: {
    parent: ThingFlowNode;
    origin: DiagramPosition;
    clip: EmbeddedBounds | null;
    path: ReadonlySet<string>;
    readOnly: boolean;
    tiltCenter: DiagramPosition | undefined;
  }[] = input.nodes.map((parent) => ({
    parent,
    origin: { x: 0, y: 0 },
    clip: null,
    path: new Set<string>(),
    readOnly: false,
    tiltCenter: undefined,
  }));
  for (const item of queue) {
    const { parent, origin, clip, path } = item;
    if (parent.data.expanded !== true) continue;
    const document = parent.data.spaceContent;
    if (document === undefined) continue;
    const readOnly = item.readOnly || parent.data.kind === 'reference';
    const crossing = `${document.spaceId}:${document.diagram}`;
    if (path.has(crossing)) continue;
    const crossed = new Set(path).add(crossing);
    const window = embedBounds(parent, origin, clip, input.bodyHeights.get(parent.id));
    // A Thing being moved is the one everything below it leans about. An
    // ancestor already leaning wins, because React Flow moves one Thing at a
    // time and a descendant of the dragged Thing is carried, not dragged.
    const tiltCenter =
      item.tiltCenter ??
      (input.draggingIds.has(parent.id)
        ? {
            x: window.absolute.x + (parent.width ?? 0) / 2,
            y: window.absolute.y + (parent.height ?? 0) / 2,
          }
        : undefined);
    requests.push({
      parent,
      readOnly,
      spaceId: document.spaceId,
      diagramId: document.diagram,
      graphId: document.graph,
      entry: input.entries.find((entry) => entry.id === document.spaceId),
      absolute: window.absolute,
      bounds: window.bounds,
      tiltCenter,
    });
    const published = input.publications.get(parent.id);
    if (published?.diagramId === document.diagram) {
      for (const child of published.nodes)
        queue.push({
          parent: { ...child, position: untiltedPosition(child, window.absolute, tiltCenter) },
          origin: window.absolute,
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
  start: ThingFlowNode | undefined,
  nodesById: ReadonlyMap<string, ThingFlowNode>,
  editingPortals: ReadonlySet<ThingId>,
): ThingFlowNode | undefined {
  let current = start;
  while (current !== undefined) {
    if (current.data.kind === 'space' && editingPortals.has(current.data.thingId)) {
      return current;
    }
    current = current.parentId === undefined ? undefined : nodesById.get(current.parentId);
  }
  return undefined;
}

export function embeddingIsPortalEditing(
  parent: ThingFlowNode,
  nodesById: ReadonlyMap<string, ThingFlowNode>,
  editingPortals: ReadonlySet<ThingId>,
): boolean {
  return editingPortalAncestor(parent, nodesById, editingPortals) !== undefined;
}

export interface EmbeddedAuthoringGate {
  readonly readOnly: boolean;
  readonly portalEditing: boolean;
  readonly authorInEmbeddedDiagram: boolean;
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
    gate.authorInEmbeddedDiagram &&
    (gate.authorOnCanvas || gate.thisEmbeddingEditing) &&
    !gate.hostBodyEditing &&
    !gate.hostTitleEditing
  );
}
