import type { Edge, Node, NodeHandle } from '@xyflow/react';
import { MarkerType, Position } from '@xyflow/react';
import type {
  CanvasThingBodyEditor,
  CanvasSpaceThingSelection,
  EntityActionGroup,
} from '@project/ui';
import type { Thing, ThingId, GraphId } from '@project/core';
import { resolveContentThing } from '@project/graph';
import type {
  GraphRenderEdge,
  LayoutStrategyThing,
  LayoutStrategyGraph,
  Space,
} from '@project/graph';
import type { RoutedEdgeData } from './RoutedEdge';
import { AUTHORING_HANDLE_DIAMETER } from './authoring-handle';

const FALLBACK_COLOR = '#8a94a6';

/**
 * How strongly graphs other than the active one recede.
 *
 * A level rather than a boolean, because a view may want more than on/off — and
 * because the adapter should not know that the app has modes. It once carried a
 * third, 'strong', for dimming the graph while presenting; presenting no longer
 * draws the graph at all (ADR 0008), so that level had no caller.
 */
export type GraphEmphasis = 'equal' | 'subtle';

/** Opacity applied to graphs that are not the active one. */
export const OTHER_GRAPH_OPACITY = {
  equal: 1,
  subtle: 0.35,
} satisfies Record<GraphEmphasis, number>;

/** What ends an inline title edit. Answers a refusal reason, or `null` when the
 *  new title was accepted — the same contract `CanvasThing`'s editor reads, where
 *  `null` keeps the editor closed and a string keeps it open beside the message. */
export type ThingTitleEditor = {
  onComplete: (title: string) => string | null;
  onCancel: () => void;
};

/** Data carried by each custom thing node. Kept as a type alias so it satisfies
 *  React Flow's `Record<string, unknown>` data constraint. */
export type ThingNodeData = {
  thingId: ThingId;
  title: string;
  /** Whether the Thing's reusable component must withhold authoring affordances. */
  readOnly: boolean;
  /** An embedded Space boundary offers no connection-authoring controls. */
  connectionAuthoringEnabled?: boolean;
  /**
   * What kind of Thing this is, drawn as a persistent glyph on the Front.
   *
   * Carried rather than inferred from whether this node's content resolved
   * elsewhere: that answers the Thing's kind by proxy, which is exactly what
   * goes wrong for the next kind that resolves its content elsewhere too.
   */
  kind: Thing['kind'];
  /** Local Thing-authoring controls supplied by the application composition. */
  titleEditingEnabled?: boolean;
  /**
   * Whether Thing-level authoring is offered here: this Thing is in the working
   * Space and the canvas is authorable.
   *
   * **Not "owns content to edit"**, which is what it meant while an Alias had no
   * Open front. It gates `onEditThing`, and an Alias Opens and Closes through
   * that same operation (ADR 0070), so an Alias sets it exactly as a Markdown
   * Thing does. What separates the kinds is `onBeginBodyEditing`, which the
   * application withholds from everything but `markdown`.
   */
  thingEditingEnabled?: boolean;
  onEditThing?: (open: boolean) => 'completed' | 'retained';
  onBeginTitleEditing?: () => void;
  /**
   * The inline title editor this Thing is currently showing, absent on one that
   * is not being renamed. Its presence *is* the editing state, and it carries
   * the two operations that end the edit — so a composition cannot ask for the
   * editor without also saying what completes and cancels it.
   *
   * This is the pairing `CanvasThingProps` already makes for its own
   * `state: 'editing'`, held one layer up. Split into a boolean and two
   * independent optional callbacks, the adapter had to manufacture total
   * functions out of partial data, and an absent completion answered `null` —
   * which `CanvasThing` reads as *accepted*, closing the editor on a rename that
   * never happened.
   */
  titleEditor?: ThingTitleEditor;
  /**
   * Whether the Diagram has Opened this Thing, so it draws its content on the Thing
   * rather than its title alone (ADR 0064).
   *
   * Authored, not derived: it is a fact about the Diagram, and the Thing's rect
   * follows from it rather than the other way round. The adapter cannot read it
   * off the geometry — a Thing is not Open just because it is large.
   *
   * An Open Alias draws its immutable Target's content through the same front.
   */
  expanded?: boolean;
  /** Present only when activating the Open body may place a caret. */
  onBeginBodyEditing?: () => void;
  /**
   * The live body edit, absent on a Thing whose rendered Markdown is at rest.
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
   * Independent of `titleEditor` on purpose. Expansion is what the Diagram
   * authored and the caret is a gesture the author just made, so a Thing can be
   * Expanded while its *title* is being renamed (ADR 0064).
   */
  bodyEditor?: CanvasThingBodyEditor;
  /**
   * Resizing this Expanded Thing, absent on one that may not be resized.
   *
   * Presence is the capability and it carries its own floor, for the same reason
   * the two editors above carry their own completions: the collapsed size is
   * `THING_SIZE`, which belongs to the composition and not to this package —
   * an adapter that hardcoded a minimum would be a second opinion about a
   * constant `app` already owns.
   *
   * `onResize` previews a size and no origin. Displacement moves Things and does
   * not scale them, so a reported size needs no inversion — which is what keeps
   * this out of the family of gestures that must go back through the authored
   * placement. If a resize is ever allowed to move the Thing's top-left, it joins
   * that family.
   *
   * The lifecycle travels as one capability: the composition supplies every
   * operation together because a resize gesture begun on an
   * unselected Thing has to select it before there is anything for `onResize`
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
   * This Thing's own commands — copy an address it can be reached by, delete it
   * — drawn as one more control on the Thing's rail (ADR 0073, ADR 0082).
   *
   * Built by the composition and carried whole, exactly as the operations above
   * are: an address comes from the product destination table and a deletion
   * runs a completed Edit, neither of which this package can reach. Absent
   * means no control rather than an empty menu, which is the rule `CanvasThing`
   * already applies to the value it is handed.
   */
  entityActions?: readonly EntityActionGroup[];
  /**
   * For a space thing, what the Space it references offers its selections to be
   * chosen from.
   *
   * Not derived here, and it could not be: it describes a *second* Space, which
   * this projection has no reader for and no business loading. The composition
   * that read the target supplies it, exactly as it supplies every other
   * operation on this node (ADR 0068, ADR 0074).
   */
  spaceSelection?: CanvasSpaceThingSelection;
  active: boolean;
  /** Ordinary renderer selection, kept outside the authored Space. */
  selectedForAuthoring: boolean;
  /**
   * Draw the thing's content rather than its title. ADR 0006 deferred a "show
   * full content" view and left it a View's choice; presenting is that view (ADR
   * 0027). Set on the active thing alone, never on the whole graph.
   */
  showContent: boolean;
  /** The Markdown to draw when `showContent`, resolved through an alias to its
   *  target's body. Absent otherwise — content is not embedded in every node
   *  (ADR 0006), which is the constraint that made this per-thing.
   *
   *  **An Expanded Thing carries one too.** ADR 0064 narrows ADR 0006 rather
   *  than lifting it — an Expanded Thing carries its source because the author
   *  asked for that one, not because every Thing does. `openThingIds` is what
   *  tells this projection which Things the Diagram Expanded, and `body` is
   *  resolved for them in the same pass: `ThingNode` reads `data.body ?? ''`, so
   *  a Thing resolved into one set and not the other would draw an empty
   *  document over a working editor rather than fail. */
  body?: string;
  /** The graph being emphasised, if any. Drives handle dimming. */
  activeGraphId: GraphId | null;
  /** The active Graph's colour, used by graph-independent authoring handles. */
  activeGraphColor: string;
  emphasis: GraphEmphasis;
};

export type ThingFlowNode = Node<ThingNodeData, 'thing'>;

export type ColorByGraphId = Readonly<Partial<Record<GraphId, string>>>;

export interface ProjectThingNodesOptions {
  /** Draw Things without any Thing-owned authoring controls. The four anchors of
   *  each role are declared and rendered either way — an Edge attaches to one,
   *  and React Flow draws no Edge at all for a Thing whose handles it cannot
   *  resolve (ADR 0087) — so this withholds the affordance, not the anchor. */
  readOnly?: boolean;
  /** Thing id reached during traversal, if any, to flag as active. */
  activeThingId?: ThingId | null;
  /** Ordinary renderer selection used to expose continued-authoring handles. */
  selectedThingId?: ThingId | null;
  /**
   * Draw the active thing's content instead of its title — what presenting does
   * (ADR 0027). Only the active thing is affected, so this costs one thing's body
   * in the projection rather than every thing's.
   */
  showActiveThingContent?: boolean;
  /** The graph to emphasise, if any. */
  activeGraphId?: GraphId | null;
  /** The active Graph's resolved colour for graph authoring controls. */
  activeGraphColor?: string;
  emphasis?: GraphEmphasis;
  /** The laid-out graph; the things' positions come from here when present. */
  strategyGraph?: LayoutStrategyGraph;
  /** Restrict the projection to these thing ids (e.g. one graph's things). */
  thingIds?: readonly ThingId[];
  /** Diagram-authored Expanded Things whose Markdown body is drawn in place. */
  openThingIds?: ReadonlySet<ThingId>;
}

/**
 * The four anchors a Thing declares on each role, one per side.
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
 * DOM draws. `ThingNode` records the same rule from the other side.
 */
function declaredHandles(thing: LayoutStrategyThing): NodeHandle[] {
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
    anchor(type, Position.Top, thing.width / 2 - radius, -radius),
    anchor(type, Position.Right, thing.width - radius, thing.height / 2 - radius),
    anchor(type, Position.Bottom, thing.width / 2 - radius, thing.height - radius),
    anchor(type, Position.Left, -radius, thing.height / 2 - radius),
  ]);
}

/**
 * Map things → React Flow thing nodes, each declaring the four anchors an Edge
 * may attach to on every side. The thing id is the React Flow node id.
 *
 * It took the Space's Graph colours too until ADR 0087, for the per-Graph
 * anchors it coloured one by one. A Thing's anchors are Graph-independent, and
 * the one colour left on a Thing is the Active Graph's, which the composition
 * resolves and passes as `activeGraphColor`.
 *
 * A node carries its thing's *title*, not its content (ADR 0006) — the content is
 * loaded when a thing is opened or presented, not embedded in every node.
 */
export function projectThingNodes(
  space: Space,
  options: ProjectThingNodesOptions = {},
): ThingFlowNode[] {
  const activeThingId = options.activeThingId ?? null;
  const showActiveThingContent = options.showActiveThingContent ?? false;
  const activeGraphId = options.activeGraphId ?? null;
  const emphasis = options.emphasis ?? 'equal';
  const visible = options.thingIds ? new Set(options.thingIds) : null;
  const laidOut = new Map((options.strategyGraph?.things ?? []).map((t) => [t.id, t]));

  const source = visible ? space.things.filter((t) => visible.has(t.id)) : space.things;

  return source.map((thing) => {
    const placedThing = laidOut.get(thing.id);
    const active = thing.id === activeThingId;
    const showContent = active && showActiveThingContent;
    // Every Thing kind Opens, so the Diagram's Open set is the whole answer and
    // there is no kind guard beside it. The guard this replaced named the two
    // kinds that had a front to draw when Open; a Space Thing gained one with
    // `entity-url-addressability/07` (ADR 0068), which left the third arm the
    // only thing standing between a stored Open state and the Thing that state
    // is about.
    const open = options.openThingIds?.has(thing.id) === true;
    // An alias shows its target's content under its own title (ADR 0009).
    const body =
      showContent || open ? (resolveContentThing(space, thing.id)?.body ?? '') : undefined;
    const node: ThingFlowNode = {
      id: thing.id,
      type: 'thing',
      position: { x: placedThing?.x ?? 0, y: placedThing?.y ?? 0 },
      data: {
        thingId: thing.id,
        title: thing.title,
        readOnly: options.readOnly ?? false,
        kind: thing.kind,
        active,
        selectedForAuthoring: thing.id === (options.selectedThingId ?? null),
        showContent,
        activeGraphId,
        activeGraphColor: options.activeGraphColor ?? FALLBACK_COLOR,
        emphasis,
      },
      className: active ? 'rf-thing-node rf-thing-node--active' : 'rf-thing-node',
    };
    // Carry the diagram's dimensions through when it has placed the thing. Every
    // strategy works at a fixed `THING_SIZE`, so declaring width/height
    // here means React Flow renders the node at exactly the size the diagram
    // reasoned about — no measure-then-reflow, and a centred `nodeOrigin` (if a
    // view chooses one) resolves correctly on first paint. Absent before the
    // layout resolves, so React Flow falls back to measuring, as before.
    //
    // `measured` is deliberately *not* set alongside them. React Flow documents
    // it as an output it writes after measuring, and it is redundant as an
    // input: `nodeHasDimensions` reads `measured?.width ?? width ?? initialWidth`,
    // so width/height already answer it, and a Thing counts as initialized on
    // those plus its declared `handles`. What supplying it would change is that
    // React Flow preserves cached `handleBounds` instead of resetting them for
    // re-measure — a distinction with no meaning here, because the bounds come
    // from `declaredHandles` either way.
    if (placedThing) {
      node.width = placedThing.width;
      node.height = placedThing.height;
      node.handles = declaredHandles(placedThing);
    }
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
  /** How strongly the other graphs recede. */
  emphasis?: GraphEmphasis;
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
): Edge[] {
  const activeGraphId = options.activeGraphId ?? null;
  const emphasis = options.emphasis ?? 'equal';

  return graphRenderEdges.map((edge) => {
    const color = colors[edge.graphId] ?? FALLBACK_COLOR;
    const isActiveGraph = edge.graphId === activeGraphId;
    const emphasized = isActiveGraph || emphasis === 'equal';

    const data: RoutedEdgeData = { graphId: edge.graphId };

    return {
      id: edge.id,
      // A custom edge, drawing a bezier between the handles React Flow resolved.
      type: 'routed',
      source: edge.source,
      target: edge.target,
      className: `rf-graph-edge rf-graph-edge--${edge.graphId}`,
      animated: emphasized,
      style: {
        stroke: color,
        strokeWidth: isActiveGraph ? 3 : 2,
        opacity: emphasized ? 1 : OTHER_GRAPH_OPACITY[emphasis],
      },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      data,
    };
  });
}
