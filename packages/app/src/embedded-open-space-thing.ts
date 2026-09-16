import {
  SPACE_THING_EMBED_INSET,
  type DiagramId,
  type DiagramPosition,
  type GraphId,
  type ThingId,
} from '@project/core';
import type { ThingFlowNode } from '@project/react-flow-adapter';
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
}

interface EmbedWindow {
  readonly absolute: DiagramPosition;
  readonly intersection: EmbeddedBounds;
  readonly bounds: EmbeddedBounds;
}

/** Title-footer border, added to a measured footer in place of the reserved inset. */
const FOOTER_BORDER = 4;

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
  }[] = input.nodes.map((parent) => ({
    parent,
    origin: { x: 0, y: 0 },
    clip: null,
    path: new Set<string>(),
    readOnly: false,
  }));
  for (const item of queue) {
    const { parent, origin, clip, path } = item;
    if (parent.data.expanded !== true) continue;
    const document = parent.data.spaceContent;
    if (document === undefined) continue;
    const readOnly = item.readOnly || parent.data.kind === 'alias';
    const crossing = `${document.spaceId}:${document.diagram}`;
    if (path.has(crossing)) continue;
    const crossed = new Set(path).add(crossing);
    const window = embedBounds(parent, origin, clip, input.bodyHeights.get(parent.id));
    requests.push({
      parent,
      readOnly,
      spaceId: document.spaceId,
      diagramId: document.diagram,
      graphId: document.graph,
      entry: input.entries.find((entry) => entry.id === document.spaceId),
      absolute: window.absolute,
      bounds: window.bounds,
    });
    const published = input.publications.get(parent.id);
    if (published?.diagramId === document.diagram) {
      for (const child of published.nodes)
        queue.push({
          parent: child,
          origin: window.absolute,
          clip: window.intersection,
          path: crossed,
          readOnly,
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
