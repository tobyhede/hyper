import type { Node, NodeHandle } from '@xyflow/react';
import { Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import { CLOSED_DISPLAY } from '@project/ui';
import type { EntityActionGroup, ResourceDisplay } from '@project/ui';
import {
  DEFAULT_GRAPH_HEAD_SHAPE,
  DEFAULT_RESOURCE_SHAPE,
  contentAction,
  embedsMap,
  type Resource,
  type ResourceId,
  type ResourceShape,
  type GraphHeadShape,
  type GraphId,
} from '@project/core';
import { resolveResourceContent } from '@project/graph';
import type {
  GraphRenderEdge,
  LayoutStrategyResource,
  LayoutStrategyGraph,
  Space,
} from '@project/graph';
import { ROUTED_EDGE_TYPE, type RoutedEdgeData, type RoutedFlowEdge } from './RoutedEdge';
import { AUTHORING_HANDLE_DIAMETER } from './authoring-handle';
import { DETACHED_END_TRIM, graphLanes } from './edge-lanes';
import { graphHeadMarkerId } from './GraphHeadMarkers';

const FALLBACK_COLOR = '#8a94a6';

/**
 * Opacity of the Graphs that are not the active one, while one is. With no
 * Graph active every Graph is drawn at full strength; activating one recedes
 * the rest rather than hiding them.
 */
export const OTHER_GRAPH_OPACITY = 0.35;

/** What ends an inline title edit. Answers a refusal reason, or `null` when the
 *  new title was accepted — the same contract `CanvasResource`'s editor reads, where
 *  `null` keeps the editor closed and a string keeps it open beside the message. */
export type ResourceTitleEditor = {
  onComplete: (title: string) => string | null;
  onCancel: () => void;
};

/** Data carried by each custom resource node. Kept as a type alias so it satisfies
 *  React Flow's `Record<string, unknown>` data constraint. */
export type ResourceNodeData = {
  /**
   * The Resource's own kind, drawn as a persistent glyph on the Resource. A
   * Reference Resource is `reference` whatever its Target is; what it draws is
   * its `display`.
   */
  kind: Resource['kind'];
  /** Resolved content facts remain available while the display is Closed. */
  contentAction: ReturnType<typeof contentAction>;
  embedsMap: boolean;
  /** Reports rendered title geometry by placement, including embedded placements. */
  onBodyHeightChange?: (id: string, height: number | null) => void;
  resourceId: ResourceId;
  title: string;
  /** Whether the Resource's reusable component must withhold authoring affordances. */
  readOnly: boolean;
  /** False withholds hover-reveal; omitted or true offers the host-canvas handles. */
  connectionAuthoringEnabled?: boolean;
  /**
   * Opens or Closes this Resource, absent where Resource-level authoring is
   * withheld: this Resource is outside the working Space, or the canvas is not
   * authorable. Presence is the whole capability — there is no separate flag
   * to disagree with it.
   *
   * **Not "owns content to edit".** A Reference Resource Opens and
   * Closes through this same operation (ADR 0070), so a Reference Resource is
   * offered it exactly as a Markdown Resource is. What separates the kinds is
   * `onBeginBodyEditing`, which the application withholds from everything but
   * `markdown` and `image`.
   */
  onEditResource?: (open: boolean) => 'completed' | 'retained';
  /**
   * Draw this Ur Resource in another Shape on its Map (ADR 0121). Absent on
   * every other kind, and wherever the Map may not be authored.
   */
  onResourceShapeChange?: (resourceShape: ResourceShape) => void;
  onBeginTitleEditing?: () => void;
  /**
   * The inline title editor this Resource is currently showing, absent on one that
   * is not being renamed. Its presence *is* the editing state, and it carries
   * the two operations that end the edit — so a composition cannot ask for the
   * editor without also saying what completes and cancels it.
   *
   * This is the pairing `CanvasResourceProps` already makes for its own
   * `state: 'editing'`, held one layer up. Do not split it into a boolean and
   * two independent optional callbacks: the adapter would have to manufacture
   * total functions out of partial data, and an absent completion answering
   * `null` — which `CanvasResource` reads as *accepted* — would close the editor
   * on a rename that never happened.
   */
  titleEditor?: ResourceTitleEditor;
  /**
   * Whether the Map has Opened this Resource, so it draws its content on the Resource
   * rather than its title alone (ADR 0064).
   *
   * Authored, not derived: it is a fact about the Map, and the Resource's rect
   * follows from it rather than the other way round. The adapter cannot read it
   * off the geometry — a Resource is not Open just because it is large.
   *
   * An Open Reference Resource draws its immutable Target's content as its own would be drawn.
   */
  open?: boolean;
  /**
   * Present only when the Open content may be edited: a Markdown Resource's
   * body, or an Image Resource's image, which is replaced rather than edited.
   */
  onBeginBodyEditing?: () => void;
  /**
   * Resizing this Open Resource, absent on one that may not be resized.
   *
   * Presence is the capability and it carries its own floor, for the same reason
   * `titleEditor` above carries its own completions: the collapsed size is
   * `RESOURCE_SIZE`, which belongs to the composition and not to this package —
   * an adapter that hardcoded a minimum would be a second opinion about a
   * constant `app` already owns.
   *
   * `onResize` previews a size and no origin. Displacement moves Resources and does
   * not scale them, so a reported size needs no inversion — which is what keeps
   * this out of the family of gestures that must go back through the authored
   * placement. If a resize is ever allowed to move the Resource's top-left, it joins
   * that family.
   *
   * The lifecycle travels as one capability: the composition supplies every
   * operation together because a resize gesture begun on an
   * unselected Resource has to select it before there is anything for `onResize`
   * to complete against — one control, one drag, and Selection is not a second
   * Edit (ADR 0122).
   */
  resize?: {
    readonly minWidth: number;
    readonly minHeight: number;
    onResizeStart: () => void;
    onResize: (size: { width: number; height: number }) => void;
    onResizeEnd: () => void;
    onResizeCancel: () => void;
  };
  /**
   * This Resource's own commands — copy an address it can be reached by, delete it
   * — drawn as one more control on the Resource's rail (ADR 0073, ADR 0082).
   *
   * Built by the composition and carried whole, exactly as the operations above
   * are: an address comes from the product destination table and a deletion
   * runs a completed Edit, neither of which this package can reach. Absent
   * means no control rather than an empty menu, which is the rule `CanvasResource`
   * already applies to the value it is handed.
   */
  entityActions?: readonly EntityActionGroup[];
  /**
   * Map and Graph clusters for an Open Space Resource, assembled by the
   * application and inserted at the head of the Resource rail.
   *
   * Not derived here: it describes a second Space's choices, which this
   * projection has no reader for. Absent while the Resource is closed, the surface
   * is read-only, or the target has not been read yet (ADR 0068, ADR 0074).
   */
  spaceRail?: ReactNode;
  /**
   * The Read/Edit boundary for an Open Space Resource's embedded target canvas.
   *
   * Presence is the capability. The containing canvas owns which Resources are in
   * Edit because the embedding is sibling nodes, not markup inside the Resource.
   */
  portal?: {
    readonly editing: boolean;
    readonly onEditingChange: (editing: boolean) => void;
  };
  /**
   * A refusal or busy notice from this Resource's context commands. Absent or null
   * leaves the alert region unmounted.
   */
  contextNotice?: string | null;
  /**
   * What this Resource shows now: Closed with no content, or Open with its
   * resolved content, its own or its Target's.
   */
  display: ResourceDisplay;
  /**
   * The Shape the Map draws this Resource in, resolved — the rectangle where
   * its entry stores none — and drawn Open and Closed alike (ADR 0121).
   */
  shape: ResourceShape;
  /** Ordinary renderer selection, kept outside the authored Space. */
  selectedForAuthoring: boolean;
  /** The graph being emphasised, if any. Drives handle dimming. */
  activeGraphId: GraphId | null;
  /** The active Graph's colour, used by graph-independent authoring handles. */
  activeGraphColor: string;
  /**
   * Whether this Resource leans because a Resource framing it is being dragged.
   *
   * Only an *embedded* Resource carries it; a Resource dragged directly leans from its
   * own `state`. The lean is about this Resource's own centre and says nothing
   * about where the frame is, because the application has already rotated this
   * Resource's *position* about the dragged Resource's centre (`embedded-map.ts`)
   * — translating a rect along a rotation and then turning it in place is the
   * same rigid motion as turning it about that distant point, and expressing it
   * that way is what lets React Flow draw the Edges itself.
   */
  dragTilted?: boolean;
};

export type ResourceFlowNode = Node<ResourceNodeData, 'resource'>;

export type ColorByGraphId = Readonly<Partial<Record<GraphId, string>>>;

/** Each Graph's head shape; a Graph missing here draws as `DEFAULT_GRAPH_HEAD_SHAPE`. */
export type HeadShapeByGraphId = Readonly<Partial<Record<GraphId, GraphHeadShape>>>;

export interface ProjectResourceNodesOptions {
  /** Draw Resources without any Resource-owned authoring controls. The four anchors of
   *  each role are declared and rendered either way — an Edge attaches to one,
   *  and React Flow draws no Edge at all for a Resource whose handles it cannot
   *  resolve (ADR 0087) — so this withholds the affordance, not the anchor. */
  readOnly?: boolean;
  /** Ordinary renderer selection used to expose continued-authoring handles. */
  selectedResourceId?: ResourceId | null;
  /** The graph to emphasise, if any. */
  activeGraphId?: GraphId | null;
  /** The active Graph's resolved colour for graph authoring controls. */
  activeGraphColor?: string;
  /** The laid-out graph; the resources' positions come from here when present. */
  strategyGraph?: LayoutStrategyGraph;
  /** Restrict the projection to these resource ids (e.g. one graph's resources). */
  resourceIds?: readonly ResourceId[];
  /** Map-authored Open Resources whose Markdown body is drawn in place. */
  openResourceIds?: ReadonlySet<ResourceId>;
  /** The Shape the Map draws each projected Resource in; absent, every one is the rectangle. */
  resourceShape?: (resourceId: ResourceId) => ResourceShape;
}

/**
 * The four anchors a Resource declares on each role, one per side.
 *
 * An Edge attaches to whichever of them faces its neighbour, chosen while it is
 * drawn (ADR 0087) — so what is declared here is every side an Edge could ever
 * take, and never which one it took. Both roles are declared on all four sides
 * because an authoring gesture may begin or end anywhere, and because React Flow
 * resolves an Edge that names no handle to the first bound of that kind.
 *
 * Declared rather than measured. `parseHandles` prefers what is on `node.handles`
 * to anything in the DOM, so a Resource's anchors are known on the render that
 * first places it. React Flow still re-reads them from the DOM with
 * `getHandleBounds` whenever a node's element changes size, and finds the same
 * four sides, which `ResourceNode` renders on every Resource; each projection
 * then declares them again.
 */
function declaredHandles(resource: LayoutStrategyResource): NodeHandle[] {
  const radius = AUTHORING_HANDLE_DIAMETER / 2;
  const anchor = (type: 'source' | 'target', side: Position, x: number, y: number): NodeHandle => ({
    id: `authoring-${type}-${side}`,
    type,
    position: side,
    x,
    y,
    width: AUTHORING_HANDLE_DIAMETER,
    height: AUTHORING_HANDLE_DIAMETER,
  });
  return (['source', 'target'] as const).flatMap((type) => [
    anchor(type, Position.Top, resource.width / 2 - radius, -radius),
    anchor(type, Position.Right, resource.width - radius, resource.height / 2 - radius),
    anchor(type, Position.Bottom, resource.width / 2 - radius, resource.height - radius),
    anchor(type, Position.Left, -radius, resource.height / 2 - radius),
  ]);
}

/**
 * Map resources → React Flow resource nodes, each declaring the four anchors an Edge
 * may attach to on every side. The resource id is the React Flow node id.
 *
 * A Resource's anchors are Graph-independent, and the one colour on a Resource
 * is the Active Graph's, which the composition resolves and passes as
 * `activeGraphColor`.
 *
 * A node carries its resource's *title*, not its content (ADR 0064) — a Closed
 * node's display carries none; resolved content supplies only the facts the
 * canvas needs while Closed.
 */
export function projectResourceNodes(
  space: Space,
  options: ProjectResourceNodesOptions = {},
): ResourceFlowNode[] {
  const activeGraphId = options.activeGraphId ?? null;
  const visible = options.resourceIds ? new Set(options.resourceIds) : null;
  const laidOut = new Map((options.strategyGraph?.resources ?? []).map((r) => [r.id, r]));

  const source = visible ? space.resources.filter((r) => visible.has(r.id)) : space.resources;

  return source.map((resource) => {
    const placedResource = laidOut.get(resource.id);
    // Every Resource kind Opens, so the Map's Open set is the whole answer and
    // there is no kind guard beside it.
    const open = options.openResourceIds?.has(resource.id) === true;
    const content = resolveResourceContent(space, resource);
    const display: ResourceDisplay = open ? { shown: 'open', content } : CLOSED_DISPLAY;
    const node: ResourceFlowNode = {
      id: resource.id,
      type: 'resource',
      position: { x: placedResource?.x ?? 0, y: placedResource?.y ?? 0 },
      data: {
        resourceId: resource.id,
        title: resource.title,
        readOnly: options.readOnly ?? false,
        kind: resource.kind,
        contentAction: contentAction(content),
        embedsMap: embedsMap(content),
        selectedForAuthoring: resource.id === (options.selectedResourceId ?? null),
        display,
        shape: options.resourceShape?.(resource.id) ?? DEFAULT_RESOURCE_SHAPE,
        activeGraphId,
        activeGraphColor: options.activeGraphColor ?? FALLBACK_COLOR,
      },
      className: 'rf-resource-node',
    };
    // Carry the map's dimensions through when it has placed the resource. Every
    // strategy works at a fixed `RESOURCE_SIZE`, so declaring width/height
    // here means React Flow renders the node at exactly the size the map
    // reasoned about — no measure-then-reflow, and a centred `nodeOrigin` (if a
    // view chooses one) resolves correctly on first paint. Absent before the
    // layout resolves, so React Flow falls back to measuring.
    //
    // `measured` is deliberately *not* set alongside them. React Flow documents
    // it as an output it writes after measuring, and it is redundant as an
    // input: `nodeHasDimensions` reads `measured?.width ?? width ?? initialWidth`,
    // so width/height already answer it, and a Resource counts as initialized on
    // those plus its declared `handles`. What supplying it would change is that
    // React Flow preserves cached `handleBounds` instead of resetting them for
    // re-measure — a distinction with no meaning here, because the bounds come
    // from `declaredHandles` either way.
    if (placedResource) {
      node.width = placedResource.width;
      node.height = placedResource.height;
      node.handles = declaredHandles(placedResource);
    }
    if (open) {
      node.data.open = true;
      node.zIndex = 10;
    }
    return node;
  });
}

export interface ProjectGraphEdgesOptions {
  /** The graph to emphasise, if any. */
  activeGraphId?: GraphId | null;
  /** What each Graph's Edges end in (ADR 0105). */
  headShapes?: HeadShapeByGraphId;
}

/**
 * Map graph-derived edges → coloured React Flow edges.
 */
export function projectGraphEdges(
  graphRenderEdges: readonly GraphRenderEdge[],
  colors: ColorByGraphId,
  options: ProjectGraphEdgesOptions = {},
): RoutedFlowEdge[] {
  const activeGraphId = options.activeGraphId ?? null;

  const lanes = graphLanes(graphRenderEdges, activeGraphId);

  // React Flow paints Edges in the order it is given them, so the Active Graph
  // goes last: wherever it crosses another Graph's Edge, its stroke is the one
  // on top.
  const drawn = graphRenderEdges.map((edge) => {
    const color = colors[edge.graphId] ?? FALLBACK_COLOR;
    const isActiveGraph = edge.graphId === activeGraphId;
    const emphasized = isActiveGraph || activeGraphId === null;
    const lane = lanes.get(edge.id) ?? { offset: 0, reach: 0, connects: true };

    const data: RoutedEdgeData = {
      graphId: edge.graphId,
      laneOffset: lane.offset,
      laneReach: lane.reach,
      endTrim: lane.connects ? 0 : DETACHED_END_TRIM,
      headShape: options.headShapes?.[edge.graphId] ?? DEFAULT_GRAPH_HEAD_SHAPE,
    };
    if (edge.title !== undefined) data.title = edge.title;
    if (edge.titleHidden === true) data.titleHidden = true;

    const flowEdge: RoutedFlowEdge = {
      id: edge.id,
      // A custom edge, drawing a bezier between the handles React Flow resolved.
      type: ROUTED_EDGE_TYPE,
      source: edge.source,
      target: edge.target,
      className: `rf-graph-edge rf-graph-edge--${edge.graphId}${isActiveGraph ? ' rf-graph-edge--active' : ''}`,
      // Never `animated`: React Flow's marching dash draws the emphasised Graph in
      // constant motion, which competes with every Resource on the canvas for
      // attention. Emphasis is the stroke's width, opacity and paint order.
      animated: false,
      // Its Graph's one head marker, which `GraphHeadMarkers` draws once for
      // the canvas and React Flow hands the Edge as `url('#…')`.
      markerEnd: graphHeadMarkerId(edge.graphId),
      style: {
        stroke: color,
        strokeWidth: isActiveGraph ? 3 : 2,
        opacity: emphasized ? 1 : OTHER_GRAPH_OPACITY,
      },
      data,
    };
    return { flowEdge, onTop: isActiveGraph };
  });
  return [
    ...drawn.filter(({ onTop }) => !onTop).map(({ flowEdge }) => flowEdge),
    ...drawn.filter(({ onTop }) => onTop).map(({ flowEdge }) => flowEdge),
  ];
}
