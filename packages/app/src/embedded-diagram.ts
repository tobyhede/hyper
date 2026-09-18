import type { Edge } from '@xyflow/react';
import {
  SPACE_THING_EMBED_INSET,
  uuidSchema,
  type DiagramPosition,
  type ThingId,
} from '@project/core';
import { AUTHORING_HANDLE_DIAMETER, type ThingFlowNode } from '@project/react-flow-adapter';
import { CANVAS_THING_DRAG_TILT_DEGREES } from '@project/ui';
import type { CanvasNodesAndEdges } from './canvas-projection';

/** A placement identity: the same target Thing can appear through several Space Things. */
export const embeddedNodeId = (parentId: string, thingId: string): string =>
  `embedded:${parentId}:${thingId}`;
export const embeddedClipId = (parentId: string): string => `embedded-clip-${parentId}`;

const EMBEDDED_PREFIX = 'embedded:';

/**
 * Inverse of {@link embeddedNodeId}: the containing placement and the Thing it
 * draws. The Thing is the last UUID; the parent may itself be a placement id.
 */
export function parseEmbeddedNodeId(
  id: string,
): { readonly parentId: string; readonly thingId: ThingId } | undefined {
  if (!id.startsWith(EMBEDDED_PREFIX)) return undefined;
  const rest = id.slice(EMBEDDED_PREFIX.length);
  const separator = rest.lastIndexOf(':');
  if (separator <= 0) return undefined;
  const thingId = uuidSchema.safeParse(rest.slice(separator + 1));
  if (!thingId.success) return undefined;
  return { parentId: rest.slice(0, separator), thingId: thingId.data };
}

export type CanvasNodeConnection =
  | { readonly kind: 'host'; readonly from: ThingId; readonly to: ThingId }
  | {
      readonly kind: 'embedded';
      readonly parentId: string;
      readonly from: ThingId;
      readonly to: ThingId;
    }
  | { readonly kind: 'invalid' };

/**
 * Which Space a pair of React Flow node ids may author an Edge in.
 *
 * Host Things keep UUID ids. Embedded Things share a parent. A mixed pair, or
 * two embeddings of different Space Things, is a cross-Space Edge (ADR 0040).
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
    from: fromEmbedded.thingId,
    to: toEmbedded.thingId,
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
 * The lean an embedded canvas is carried through while a Thing framing it moves.
 *
 * Both points are canvas coordinates. `center` is the dragged Thing's centre —
 * the one point every rotation turns about — and `parentAbsolute` is the
 * containing Thing's own top-left, which is what turns a child's position here
 * (relative to that Thing) into the offset a `transform-origin` in the child's
 * own box needs.
 */
export interface EmbeddedTilt {
  readonly center: DiagramPosition;
  readonly parentAbsolute: DiagramPosition;
}

export interface EmbeddedDiagramRequest {
  readonly parent: EmbeddedParentProjection;
  readonly projection: CanvasNodesAndEdges;
  readonly offset: DiagramPosition;
  readonly zoom?: number;
  readonly enabled: boolean;
  readonly bounds?: EmbeddedBounds;
  readonly tilt?: EmbeddedTilt | undefined;
}

/**
 * How much of a proposed Thing stays inside the drawn region, so a gesture can
 * always take it back out. The proposal is held by its top-left corner and the
 * Thing's own extent is not known here, so the sliver is what the corner keeps
 * clear of the right and bottom edges.
 */
const EMBEDDED_GRAB_SLIVER = 24;

/**
 * Hold a gesture proposal inside the region the Thing is actually drawn in.
 *
 * That region is the request's {@link EmbeddedBounds} — what `SpaceCanvas`
 * intersects from the containing Thing's box less {@link SPACE_THING_EMBED_INSET}
 * and every ancestor's clip — and not the containing Thing's own box: a proposal
 * accepted outside it is clipped by `clipEmbeddedNode` rather than drawn, and
 * taken to the corner it is clipped away entirely while the move is still
 * committed to the target Space's Diagram. Taking the bounds rather than the
 * node is what makes a nested embedding hold to the region an ancestor leaves
 * it, which its containing Thing's box alone does not know about.
 *
 * Deliberately *not* React Flow's `extent`. A numeric extent is applied by
 * `adoptUserNodes`, which runs on every render and not only on a drag, so an
 * extent narrower than the authored placement redraws the Diagram: a Thing
 * authored beyond the containing bounds would be moved to the edge while
 * `clipEmbeddedNode` still clips from where it was authored, and shrinking the
 * containing Thing would shift its children rather than reveal less of them. A
 * Thing that no longer fits is clipped (ADR 0068); only what a pointer or key
 * *proposes* is constrained, and that is this function's job.
 */
export function constrainEmbeddedPosition(
  position: DiagramPosition,
  bounds: EmbeddedBounds,
): DiagramPosition {
  const hold = (value: number, least: number, most: number): number =>
    Math.min(Math.max(value, least), Math.max(least, most));
  return {
    x: hold(position.x, bounds.left, bounds.right - EMBEDDED_GRAB_SLIVER),
    y: hold(position.y, bounds.top, bounds.bottom - EMBEDDED_GRAB_SLIVER),
  };
}

/** Reclip a retained read as its containing Thing changes size, without opening a session. */
/**
 * How far a handle's centre sits outside the Thing box.
 *
 * `inset(0)` clips that centre — React Flow parks each handle on the rim — so a
 * side that does not overflow the window keeps this outset. A side that does
 * overflow keeps the overflow: the handle there is already outside the window.
 * `embedded-diagram.test.ts` holds the inset.
 */
const EMBEDDED_HANDLE_OUTSET = AUTHORING_HANDLE_DIAMETER / 2;

const clipSide = (overflow: number): number => (overflow > 0 ? overflow : -EMBEDDED_HANDLE_OUTSET);

interface ClipSides {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

function clipSides(node: ThingFlowNode, bounds: EmbeddedBounds): ClipSides {
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

export function clipEmbeddedNode(node: ThingFlowNode, bounds: EmbeddedBounds): ThingFlowNode {
  return {
    ...node,
    style: { ...node.style, clipPath: insetClipPath(clipSides(node, bounds)) },
  };
}

const TILT_RADIANS = (CANVAS_THING_DRAG_TILT_DEGREES * Math.PI) / 180;

const rotateAbout = (point: DiagramPosition, origin: DiagramPosition): DiagramPosition => {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const cos = Math.cos(TILT_RADIANS);
  const sin = Math.sin(TILT_RADIANS);
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
};

/**
 * Where a Thing is drawn once the Thing framing it has leaned.
 *
 * Turning a rect about a distant point is the same rigid motion as moving its
 * centre along that rotation and turning it in place, and this is the first
 * half — `ThingNode` draws the second. Splitting it this way is what lets React
 * Flow keep drawing the Edges: an endpoint is its node's `positionAbsolute`
 * plus a handle offset measured once (`@xyflow/system`'s `getEdgePosition`), so
 * an Edge follows a moved position exactly and would ignore a CSS rotation
 * entirely.
 *
 * Positions here are relative to the containing Thing, so the centre is brought
 * into that frame first. A Thing React Flow has not measured has no size to
 * find a centre in and turns about its top-left, which is where it is drawn
 * until the first measurement anyway.
 */
const tiltedPosition = (
  tilt: EmbeddedTilt,
  position: DiagramPosition,
  size: { readonly width?: number | undefined; readonly height?: number | undefined },
): DiagramPosition => {
  const half = { x: (size.width ?? 0) / 2, y: (size.height ?? 0) / 2 };
  const centre = {
    x: tilt.center.x - tilt.parentAbsolute.x,
    y: tilt.center.y - tilt.parentAbsolute.y,
  };
  const turned = rotateAbout({ x: position.x + half.x, y: position.y + half.y }, centre);
  return { x: turned.x - half.x, y: turned.y - half.y };
};

/**
 * The overflowing cut, turned in place about the Thing's centre.
 *
 * The inset is computed against unleaned geometry and then this polygon takes
 * the same in-place turn `.canvas-thing` does. Together with `tiltedPosition`
 * that is the rigid motion the window's SVG clip already performs about the
 * dragged centre, so the cut stays on the window. The React Flow node itself
 * never rotates — a transform there would pollute handle bounds — which is why
 * an `inset(...)` left on it would stay upright.
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
      const turned = rotateAbout(corner, origin);
      return `${turned.x}px ${turned.y}px`;
    })
    .join(', ')})`;
};

/** Reparent the production projection, clipping partial Things instead of dropping them. */
export function embeddedDiagram({
  parent,
  projection,
  offset,
  zoom = 1,
  enabled,
  bounds,
  tilt,
}: EmbeddedDiagramRequest): CanvasNodesAndEdges {
  const nodes = projection.nodes.map((node): ThingFlowNode => {
    const position = { x: node.position.x * zoom + offset.x, y: node.position.y * zoom + offset.y };
    const next: ThingFlowNode = {
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
      top: SPACE_THING_EMBED_INSET.top,
      left: SPACE_THING_EMBED_INSET.left,
      right: (parent.width ?? 0) - SPACE_THING_EMBED_INSET.right,
      bottom: (parent.height ?? 0) - SPACE_THING_EMBED_INSET.bottom,
    };
    const clipped = clipEmbeddedNode(next, clipBounds);
    // Leaned *after* clipping, never before: the inset is the one the unleaned
    // geometry gives, then the overflowing cut turns in place about the Thing
    // so it stays on the window the SVG clip has already turned. Clipping
    // against a leaned position would still be an upright inset on a line the
    // frame has left.
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
  // Nothing here leans. React Flow derives each endpoint from its node's
  // position, which `tiltedPosition` has already moved, so the Edges follow the
  // Things they connect without this module drawing anything.
  const edges = projection.edges.flatMap((edge): Edge[] => {
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    return source === undefined || target === undefined
      ? []
      : [
          {
            ...edge,
            id: `${parent.id}:${edge.id}`,
            source,
            target,
            selectable: false,
            focusable: false,
            reconnectable: false,
            deletable: false,
            interactionWidth: 0,
            zIndex: (parent.zIndex ?? 10) + 1,
            style: { ...edge.style, clipPath: `url("#${embeddedClipId(parent.id)}")` },
          },
        ];
  });
  return { nodes, edges };
}
