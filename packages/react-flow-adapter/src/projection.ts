import type { Node, NodeHandle } from '@xyflow/react';
import { MarkerType, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import type {
  CanvasResourceBodyEditor,
  CanvasSpaceResourceSelection,
  EntityActionGroup,
} from '@project/ui';
import type { Resource, ResourceId, GraphId } from '@project/core';
import { resolveContentResource } from '@project/graph';
import type {
  GraphRenderEdge,
  LayoutStrategyResource,
  LayoutStrategyGraph,
  Space,
} from '@project/graph';
import type { RoutedEdgeData, RoutedFlowEdge } from './RoutedEdge';
import { AUTHORING_HANDLE_DIAMETER } from './authoring-handle';
import { DETACHED_END_TRIM, graphLanes } from './edge-lanes';

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
  /** Reports rendered title geometry by placement, including embedded placements. */
  onBodyHeightChange?: (id: string, height: number | null) => void;
  resourceId: ResourceId;
  title: string;
  /** Whether the Resource's reusable component must withhold authoring affordances. */
  readOnly: boolean;
  /** False withholds hover-reveal; omitted or true offers the host-canvas handles. */
  connectionAuthoringEnabled?: boolean;
  /**
   * What kind of Resource this is, drawn as a persistent glyph on the Front.
   *
   * Carried rather than inferred from whether this node's content resolved
   * elsewhere: that answers the Resource's kind by proxy, which is exactly what
   * goes wrong for the next kind that resolves its content elsewhere too.
   */
  kind: Resource['kind'];
  /** Local Resource-authoring controls supplied by the application composition. */
  titleEditingEnabled?: boolean;
  /**
   * Whether Resource-level authoring is offered here: this Resource is in the working
   * Space and the canvas is authorable.
   *
   * **Not "owns content to edit"**, which is what it meant while a Reference Resource had no
   * Open front. It gates `onEditResource`, and a Reference Resource Opens and Closes through
   * that same operation (ADR 0070), so a Reference Resource sets it exactly as a Markdown
   * Resource does. What separates the kinds is `onBeginBodyEditing`, which the
   * application withholds from everything but `markdown`.
   */
  resourceEditingEnabled?: boolean;
  onEditResource?: (open: boolean) => 'completed' | 'retained';
  onBeginTitleEditing?: () => void;
  /**
   * The inline title editor this Resource is currently showing, absent on one that
   * is not being renamed. Its presence *is* the editing state, and it carries
   * the two operations that end the edit — so a composition cannot ask for the
   * editor without also saying what completes and cancels it.
   *
   * This is the pairing `CanvasResourceProps` already makes for its own
   * `state: 'editing'`, held one layer up. Split into a boolean and two
   * independent optional callbacks, the adapter had to manufacture total
   * functions out of partial data, and an absent completion answered `null` —
   * which `CanvasResource` reads as *accepted*, closing the editor on a rename that
   * never happened.
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
   * An Open Reference Resource draws its immutable Target's content through the same front.
   */
  expanded?: boolean;
  /** Present only when activating the Open body may place a caret. */
  onBeginBodyEditing?: () => void;
  /**
   * The live body edit, absent on a Resource whose rendered Markdown is at rest.
   *
   * Its presence *is* the caret, carrying the two operations that end the edit —
   * the same pairing `titleEditor` above makes, for the same reason: a
   * composition cannot ask for the caret without saying what commits it and what
   * takes the caret back.
   *
   * The second of those is `onEnd`, **not** `titleEditor`'s `onCancel`. A body
   * edit ends the same way whichever accepted exit it took, so `onEnd` fires
   * after an accepted commit as well as after `Escape`; a retained commit keeps
   * the editor mounted. A composition that gave `onEnd` the abandon meaning
   * would undo every accepted save.
   *
   * Independent of `titleEditor` on purpose. Expansion is what the Map
   * authored and the caret is a gesture the author just made, so a Resource can be
   * Expanded while its *title* is being renamed (ADR 0064).
   */
  bodyEditor?: CanvasResourceBodyEditor;
  /**
   * Resizing this Expanded Resource, absent on one that may not be resized.
   *
   * Presence is the capability and it carries its own floor, for the same reason
   * the two editors above carry their own completions: the collapsed size is
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
   * Edit (ADR 0066).
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
   * For a space resource, what the Space it references offers its selections to be
   * chosen from.
   *
   * Not derived here, and it could not be: it describes a *second* Space, which
   * this projection has no reader for and no business loading. The composition
   * that read the target supplies it, exactly as it supplies every other
   * operation on this node (ADR 0068, ADR 0074).
   */
  spaceSelection?: CanvasSpaceResourceSelection;
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
  /** The resolved content kind, including a Space Resource reached through a Reference Resource. */
  spaceContent?: Extract<Resource, { kind: 'space' }>;
  active: boolean;
  /** Ordinary renderer selection, kept outside the authored Space. */
  selectedForAuthoring: boolean;
  /**
   * Draw the resource's content rather than its title. ADR 0006 deferred a "show
   * full content" view and left it a View's choice; presenting is that view (ADR
   * 0027). Set on the active resource alone, never on the whole graph.
   */
  showContent: boolean;
  /** The Markdown to draw when `showContent`, resolved through a reference resource to its
   *  target's body. Absent otherwise — content is not embedded in every node
   *  (ADR 0006), which is the constraint that made this per-resource.
   *
   *  **An Expanded Resource carries one too.** ADR 0064 narrows ADR 0006 rather
   *  than lifting it — an Expanded Resource carries its source because the author
   *  asked for that one, not because every Resource does. `openResourceIds` is what
   *  tells this projection which Resources the Map Expanded, and `body` is
   *  resolved for them in the same pass: `ResourceNode` reads `data.body ?? ''`, so
   *  a Resource resolved into one set and not the other would draw an empty
   *  document over a working editor rather than fail. */
  body?: string;
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

export interface ProjectResourceNodesOptions {
  /** Draw Resources without any Resource-owned authoring controls. The four anchors of
   *  each role are declared and rendered either way — an Edge attaches to one,
   *  and React Flow draws no Edge at all for a Resource whose handles it cannot
   *  resolve (ADR 0087) — so this withholds the affordance, not the anchor. */
  readOnly?: boolean;
  /** Resource id reached during traversal, if any, to flag as active. */
  activeResourceId?: ResourceId | null;
  /** Ordinary renderer selection used to expose continued-authoring handles. */
  selectedResourceId?: ResourceId | null;
  /**
   * Draw the active resource's content instead of its title — what presenting does
   * (ADR 0027). Only the active resource is affected, so this costs one resource's body
   * in the projection rather than every resource's.
   */
  showActiveResourceContent?: boolean;
  /** The graph to emphasise, if any. */
  activeGraphId?: GraphId | null;
  /** The active Graph's resolved colour for graph authoring controls. */
  activeGraphColor?: string;
  /** The laid-out graph; the resources' positions come from here when present. */
  strategyGraph?: LayoutStrategyGraph;
  /** Restrict the projection to these resource ids (e.g. one graph's resources). */
  resourceIds?: readonly ResourceId[];
  /** Map-authored Expanded Resources whose Markdown body is drawn in place. */
  openResourceIds?: ReadonlySet<ResourceId>;
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
 * to anything in the DOM, and nothing may force a remeasure: the forced path
 * rebuilds the bounds from `getHandleBounds`, which reads only the elements the
 * DOM draws. `ResourceNode` records the same rule from the other side.
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
 * It took the Space's Graph colours too until ADR 0087, for the per-Graph
 * anchors it coloured one by one. A Resource's anchors are Graph-independent, and
 * the one colour left on a Resource is the Active Graph's, which the composition
 * resolves and passes as `activeGraphColor`.
 *
 * A node carries its resource's *title*, not its content (ADR 0006) — the content is
 * loaded when a resource is opened or presented, not embedded in every node.
 */
export function projectResourceNodes(
  space: Space,
  options: ProjectResourceNodesOptions = {},
): ResourceFlowNode[] {
  const activeResourceId = options.activeResourceId ?? null;
  const showActiveResourceContent = options.showActiveResourceContent ?? false;
  const activeGraphId = options.activeGraphId ?? null;
  const visible = options.resourceIds ? new Set(options.resourceIds) : null;
  const laidOut = new Map((options.strategyGraph?.resources ?? []).map((r) => [r.id, r]));

  const source = visible ? space.resources.filter((r) => visible.has(r.id)) : space.resources;

  return source.map((resource) => {
    const placedResource = laidOut.get(resource.id);
    const active = resource.id === activeResourceId;
    const showContent = active && showActiveResourceContent;
    // Every Resource kind Opens, so the Map's Open set is the whole answer and
    // there is no kind guard beside it. The guard this replaced named the two
    // kinds that had a front to draw when Open; a Space Resource gained one with
    // `entity-url-addressability/07` (ADR 0068), which left the third arm the
    // only condition standing between a stored Open state and the Resource that state
    // is about.
    const open = options.openResourceIds?.has(resource.id) === true;
    // A reference resource shows its target's content under its own title (ADR 0009).
    const content = resolveContentResource(space, resource.id);
    const body =
      showContent || open ? (content?.kind === 'markdown' ? content.body : '') : undefined;
    const node: ResourceFlowNode = {
      id: resource.id,
      type: 'resource',
      position: { x: placedResource?.x ?? 0, y: placedResource?.y ?? 0 },
      data: {
        resourceId: resource.id,
        title: resource.title,
        readOnly: options.readOnly ?? false,
        kind: resource.kind,
        active,
        selectedForAuthoring: resource.id === (options.selectedResourceId ?? null),
        showContent,
        activeGraphId,
        activeGraphColor: options.activeGraphColor ?? FALLBACK_COLOR,
      },
      className: active ? 'rf-resource-node rf-resource-node--active' : 'rf-resource-node',
    };
    // Carry the map's dimensions through when it has placed the resource. Every
    // strategy works at a fixed `RESOURCE_SIZE`, so declaring width/height
    // here means React Flow renders the node at exactly the size the map
    // reasoned about — no measure-then-reflow, and a centred `nodeOrigin` (if a
    // view chooses one) resolves correctly on first paint. Absent before the
    // layout resolves, so React Flow falls back to measuring, as before.
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
    if (content?.kind === 'space') node.data.spaceContent = content;
    if (body !== undefined) node.data.body = body;
    if (open) {
      node.data.expanded = true;
      node.zIndex = 10;
    }
    return node;
  });
}

export interface ProjectGraphEdgesOptions {
  /** The graph to emphasise, if any. */
  activeGraphId?: GraphId | null;
}

/**
 * Map graph-derived edges → coloured React Flow edges.
 *
 * It took the laid-out graph too until ADR 0086, for the waypoints a routing
 * strategy might have placed on an edge. Nothing ever placed one, so the option
 * only ever carried a value nobody read.
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
    const lane = lanes.get(edge.id) ?? { offset: 0, connects: true };

    const data: RoutedEdgeData = {
      graphId: edge.graphId,
      laneOffset: lane.offset,
      endTrim: lane.connects ? 0 : DETACHED_END_TRIM,
    };

    const flowEdge: RoutedFlowEdge = {
      id: edge.id,
      // A custom edge, drawing a bezier between the handles React Flow resolved.
      type: 'routed',
      source: edge.source,
      target: edge.target,
      className: `rf-graph-edge rf-graph-edge--${edge.graphId}${isActiveGraph ? ' rf-graph-edge--active' : ''}`,
      animated: emphasized,
      style: {
        stroke: color,
        strokeWidth: isActiveGraph ? 3 : 2,
        opacity: emphasized ? 1 : OTHER_GRAPH_OPACITY,
      },
      data,
    };
    // The arrowhead says where the Graph goes, so it is the connecting Edge's
    // alone: a Graph running beside the active one stops short and carries none.
    if (lane.connects) flowEdge.markerEnd = { type: MarkerType.ArrowClosed, color };
    return { flowEdge, onTop: isActiveGraph };
  });
  return [
    ...drawn.filter(({ onTop }) => !onTop).map(({ flowEdge }) => flowEdge),
    ...drawn.filter(({ onTop }) => onTop).map(({ flowEdge }) => flowEdge),
  ];
}
