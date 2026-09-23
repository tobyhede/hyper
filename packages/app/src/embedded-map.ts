import type { Edge, EdgeTypes } from '@xyflow/react';
import {
  SPACE_RESOURCE_EMBED_INSET,
  uuidSchema,
  type MapPosition,
  type ResourceId,
} from '@project/core';
import {
  AUTHORING_HANDLE_DIAMETER,
  RoutedEdge,
  type ResourceFlowNode,
} from '@project/react-flow-adapter';

import type { CanvasNodesAndEdges } from './canvas-projection';
import { DRAG_TILT_RADIANS, rotateAbout, tiltResourcePosition } from './drag-tilt';

/** A placement identity: the same target Resource can appear through several Space Resources. */
export const embeddedNodeId = (parentId: string, resourceId: string): string =>
  `embedded:${parentId}:${resourceId}`;
export const embeddedClipId = (parentId: string): string => `embedded-clip-${parentId}`;

/**
 * The React Flow Edge type an embedded Map's Edges are minted with.
 *
 * An embedded Edge copies an Edge of another Space's Map — Space Resource
 * references never cycle, so a Space never embeds itself (ADR 0068) — and its
 * endpoints are placement ids rather than Resource ids. Minting it under its own
 * type is what keeps it from ever reading as an Edge of the Map on the canvas:
 * `edgeSelectionOf` answers only for the routed type the canvas projection writes
 * (`embedded-map.test.ts`, 'mints its Edges as its own type, which never converts
 * to an Edge selection').
 */
export const EMBEDDED_EDGE_TYPE = 'embedded';

/**
 * The canvas's Edge type table with the embedded type added, drawn by the plain
 * routed Edge — the same curve, lane offset, trim and attachment, without the
 * authoring controls. The embedding owns this registration so Edge Authoring
 * learns nothing about embedded Maps.
 */
export const withEmbeddedEdgeTypes = (edgeTypes: EdgeTypes): EdgeTypes => ({
  ...edgeTypes,
  [EMBEDDED_EDGE_TYPE]: RoutedEdge,
});

const EMBEDDED_PREFIX = 'embedded:';

/**
 * Inverse of {@link embeddedNodeId}: the containing placement and the Resource it
 * draws. The Resource is the last UUID; the parent may itself be a placement id.
 */
export function parseEmbeddedNodeId(
  id: string,
): { readonly parentId: string; readonly resourceId: ResourceId } | undefined {
  if (!id.startsWith(EMBEDDED_PREFIX)) return undefined;
  const rest = id.slice(EMBEDDED_PREFIX.length);
  const separator = rest.lastIndexOf(':');
  if (separator <= 0) return undefined;
  const resourceId = uuidSchema.safeParse(rest.slice(separator + 1));
  if (!resourceId.success) return undefined;
  return { parentId: rest.slice(0, separator), resourceId: resourceId.data };
}

export type CanvasNodeConnection =
  | { readonly kind: 'host'; readonly from: ResourceId; readonly to: ResourceId }
  | {
      readonly kind: 'embedded';
      readonly parentId: string;
      readonly from: ResourceId;
      readonly to: ResourceId;
    }
  | { readonly kind: 'invalid' };

/**
 * Which Space a pair of React Flow node ids may author an Edge in.
 *
 * Host Resources keep UUID ids. Embedded Resources share a parent. A mixed pair, or
 * two embeddings of different Space Resources, is a cross-Space Edge (ADR 0040).
 */
export function canvasNodeConnection(source: string, target: string): CanvasNodeConnection {
  const fromHost = uuidSchema.safeParse(source);
  const toHost = uuidSchema.safeParse(target);
  if (fromHost.success && toHost.success) {
    return { kind: 'host', from: fromHost.data, to: toHost.data };
  }
  const fromEmbedded = parseEmbeddedNodeId(source);
  const toEmbedded = parseEmbeddedNodeId(target);
  if (fromEmbedded === undefined || toEmbedded === undefined) return { kind: 'invalid' };
  if (fromEmbedded.parentId !== toEmbedded.parentId) return { kind: 'invalid' };
  return {
    kind: 'embedded',
    parentId: fromEmbedded.parentId,
    from: fromEmbedded.resourceId,
    to: toEmbedded.resourceId,
  };
}

export interface EmbeddedBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface EmbeddedParentProjection {
  readonly id: string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly zIndex?: number | undefined;
}

/**
 * The lean an embedded canvas is carried through while a Resource framing it moves.
 *
 * All three points are canvas coordinates. `center` is the dragged Resource's
 * centre — the one point every rotation turns about. Children's positions here
 * are relative to `parentAbsolute`, the containing Resource's authored top-left.
 * React Flow then parents those children to the containing node as it is
 * drawn, which a leaned publication has already moved, so `parentDrawn` is
 * that drawn top-left. `tiltedPosition` converts into it.
 * `places Resources inside a nested window relative to where that window is drawn`
 * in `embedded-open-space-resource.test.ts` holds the conversion; when the
 * containing Resource has not been moved the two top-lefts are the same point
 * and `moves each embedded Resource rigidly about the dragged Resource rather than
 * turning it in place` in `embedded-map.test.ts` still holds.
 */
export interface EmbeddedTilt {
  readonly center: MapPosition;
  readonly parentAbsolute: MapPosition;
  readonly parentDrawn: MapPosition;
}

export interface EmbeddedMapRequest {
  readonly parent: EmbeddedParentProjection;
  readonly projection: CanvasNodesAndEdges;
  readonly offset: MapPosition;
  readonly zoom?: number;
  readonly enabled: boolean;
  readonly bounds?: EmbeddedBounds;
  readonly tilt?: EmbeddedTilt | undefined;
}

/**
 * How much of a proposed Resource stays inside the drawn region, so a gesture can
 * always take it back out. The proposal is held by its top-left corner and the
 * Resource's own extent is not known here, so the sliver is what the corner keeps
 * clear of the right and bottom edges.
 */
const EMBEDDED_GRAB_SLIVER = 24;

/**
 * Hold a gesture proposal inside the region the Resource is actually drawn in.
 *
 * That region is the request's {@link EmbeddedBounds} — what `SpaceCanvas`
 * intersects from the containing Resource's box less {@link SPACE_RESOURCE_EMBED_INSET}
 * and every ancestor's clip — and not the containing Resource's own box: a proposal
 * accepted outside it is clipped by `clipEmbeddedNode` rather than drawn, and
 * taken to the corner it is clipped away entirely while the move is still
 * committed to the target Space's Map. Taking the bounds rather than the
 * node is what makes a nested embedding hold to the region an ancestor leaves
 * it, which its containing Resource's box alone does not know about.
 *
 * Deliberately *not* React Flow's `extent`. A numeric extent is applied by
 * `adoptUserNodes`, which runs on every render and not only on a drag, so an
 * extent narrower than the authored placement redraws the Map: a Resource
 * authored beyond the containing bounds would be moved to the edge while
 * `clipEmbeddedNode` still clips from where it was authored, and shrinking the
 * containing Resource would shift its children rather than reveal less of them. A
 * Resource that no longer fits is clipped (ADR 0068); only what a pointer or key
 * *proposes* is constrained, and that is this function's job.
 */
export function constrainEmbeddedPosition(
  position: MapPosition,
  bounds: EmbeddedBounds,
): MapPosition {
  const hold = (value: number, least: number, most: number): number =>
    Math.min(Math.max(value, least), Math.max(least, most));
  return {
    x: hold(position.x, bounds.left, bounds.right - EMBEDDED_GRAB_SLIVER),
    y: hold(position.y, bounds.top, bounds.bottom - EMBEDDED_GRAB_SLIVER),
  };
}

/** Reclip a retained read as its containing Resource changes size, without opening a session. */
/**
 * How far a handle's centre sits outside the Resource box.
 *
 * `inset(0)` clips that centre — React Flow parks each handle on the rim — so a
 * side that does not overflow the window keeps this outset. A side that does
 * overflow keeps the overflow: the handle there is already outside the window.
 * `embedded-map.test.ts` holds the inset.
 */
const EMBEDDED_HANDLE_OUTSET = AUTHORING_HANDLE_DIAMETER / 2;

const clipSide = (overflow: number): number => (overflow > 0 ? overflow : -EMBEDDED_HANDLE_OUTSET);

interface ClipSides {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

function clipSides(node: ResourceFlowNode, bounds: EmbeddedBounds): ClipSides {
  return {
    top: clipSide(Math.max(0, bounds.top - node.position.y)),
    left: clipSide(Math.max(0, bounds.left - node.position.x)),
    right: clipSide(Math.max(0, node.position.x + (node.width ?? 0) - bounds.right)),
    bottom: clipSide(Math.max(0, node.position.y + (node.height ?? 0) - bounds.bottom)),
  };
}

function insetClipPath(sides: ClipSides): string {
  return `inset(${sides.top}px ${sides.right}px ${sides.bottom}px ${sides.left}px)`;
}

export function clipEmbeddedNode(node: ResourceFlowNode, bounds: EmbeddedBounds): ResourceFlowNode {
  return {
    ...node,
    style: { ...node.style, clipPath: insetClipPath(clipSides(node, bounds)) },
  };
}

/**
 * Where a Resource is drawn once the Resource framing it has leaned.
 *
 * Turning a rect about a distant point is the same rigid motion as moving its
 * centre along that rotation and turning it in place, and this is the first
 * half — `styles.css` turns the Resource in place off `data-drag-tilted`.
 * `embedded-map.test.ts` holds the motion as a rigid one, and `leaves the
 * Edges to React Flow, which draws them from the positions that moved` holds
 * that nothing here transforms an Edge.
 *
 * Positions here are relative to the containing Resource's authored top-left, so
 * the centre is brought into that frame first. React Flow then adds the
 * containing node's drawn position, which `parentDrawn` names.
 * A Resource React Flow has not measured has no size to find a centre in and
 * turns about its top-left, which is where it is drawn until the first
 * measurement anyway.
 */
const tiltedPosition = (
  tilt: EmbeddedTilt,
  position: MapPosition,
  size: { readonly width?: number | undefined; readonly height?: number | undefined },
): MapPosition => {
  const leaned = tiltResourcePosition(
    position,
    size,
    {
      x: tilt.center.x - tilt.parentAbsolute.x,
      y: tilt.center.y - tilt.parentAbsolute.y,
    },
    DRAG_TILT_RADIANS,
  );
  return {
    x: leaned.x + tilt.parentAbsolute.x - tilt.parentDrawn.x,
    y: leaned.y + tilt.parentAbsolute.y - tilt.parentDrawn.y,
  };
};

/**
 * The overflowing cut, turned in place about the Resource's centre.
 *
 * The inset is computed against unleaned geometry and then this polygon takes
 * the same in-place turn `.canvas-resource` does. Together with `tiltedPosition`
 * that is the rigid motion the window's SVG clip already performs about the
 * dragged centre. `turns an overflowing cut about the Resource so it leans with
 * the window` in `embedded-map.test.ts` pins the unleaned inset.
 */
const leanedClipPath = (
  sides: ClipSides,
  size: { readonly width?: number | undefined; readonly height?: number | undefined },
): string => {
  const width = size.width ?? 0;
  const height = size.height ?? 0;
  const origin = { x: width / 2, y: height / 2 };
  const corners = [
    { x: sides.left, y: sides.top },
    { x: width - sides.right, y: sides.top },
    { x: width - sides.right, y: height - sides.bottom },
    { x: sides.left, y: height - sides.bottom },
  ];
  return `polygon(${corners
    .map((corner) => {
      const turned = rotateAbout(corner, origin, DRAG_TILT_RADIANS);
      return `${turned.x}px ${turned.y}px`;
    })
    .join(', ')})`;
};

/** Reparent the production projection, clipping partial Resources instead of dropping them. */
export function embeddedMap({
  parent,
  projection,
  offset,
  zoom = 1,
  enabled,
  bounds,
  tilt,
}: EmbeddedMapRequest): CanvasNodesAndEdges {
  const nodes = projection.nodes.map((node): ResourceFlowNode => {
    const position = { x: node.position.x * zoom + offset.x, y: node.position.y * zoom + offset.y };
    const next: ResourceFlowNode = {
      ...node,
      id: embeddedNodeId(parent.id, node.id),
      parentId: parent.id,
      position,
      connectable: enabled,
      data: { ...node.data, connectionAuthoringEnabled: enabled, dragTilted: tilt !== undefined },
      draggable: enabled,
      selectable: enabled,
      focusable: enabled,
      deletable: false,
      zIndex: (parent.zIndex ?? 10) + (node.data.expanded === true ? 2 : 1),
    };
    if (!enabled) next.className = 'nopan nowheel nodrag';
    const clipBounds = bounds ?? {
      top: SPACE_RESOURCE_EMBED_INSET.top,
      left: SPACE_RESOURCE_EMBED_INSET.left,
      right: (parent.width ?? 0) - SPACE_RESOURCE_EMBED_INSET.right,
      bottom: (parent.height ?? 0) - SPACE_RESOURCE_EMBED_INSET.bottom,
    };
    const clipped = clipEmbeddedNode(next, clipBounds);
    // After clipping. `turns an overflowing cut about the Resource so it leans
    // with the window` in `embedded-map.test.ts` pins the unleaned inset
    // (`-12` / `132`) and fails if `clipSides` runs on a leaned position.
    const placed =
      tilt === undefined
        ? clipped
        : {
            ...clipped,
            position: tiltedPosition(tilt, position, clipped),
            style: {
              ...clipped.style,
              clipPath: leanedClipPath(clipSides(next, clipBounds), clipped),
            },
          };
    const style = { ...placed.style, transition: 'none' };
    return enabled
      ? { ...placed, style }
      : {
          ...placed,
          style: { ...style, pointerEvents: 'none' },
        };
  });
  const ids = new Map(
    projection.nodes.map((node) => [node.id, embeddedNodeId(parent.id, node.id)]),
  );
  // Nothing here leans. `leaves the Edges to React Flow, which draws them from
  // the positions that moved` in `embedded-map.test.ts` holds that the Edge
  // list carries no transform.
  const edges = projection.edges.flatMap((edge): Edge[] => {
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    return source === undefined || target === undefined
      ? []
      : [
          {
            ...edge,
            id: `${parent.id}:${edge.id}`,
            type: EMBEDDED_EDGE_TYPE,
            source,
            target,
            selectable: false,
            focusable: false,
            reconnectable: false,
            deletable: false,
            zIndex: (parent.zIndex ?? 10) + 1,
            style: { ...edge.style, clipPath: `url("#${embeddedClipId(parent.id)}")` },
          },
        ];
  });
  return { nodes, edges };
}
