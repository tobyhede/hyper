import type { Edge, Node, NodeHandle } from '@xyflow/react';
import { MarkerType, Position } from '@xyflow/react';
import type { MarkdownCardBodyEditor } from '@project/ui';
import type { Card, CardId, LayoutPosition, GraphId } from '@project/core';
import { inHandleId, outHandleId, resolveContentCard } from '@project/graph';
import type {
  CardHandleSet,
  LayoutStrategyCard,
  LayoutStrategyEdge,
  LayoutStrategyGraph,
  GraphRenderEdge,
  GraphRenderHandleRef,
  Space,
} from '@project/graph';
import type { RoutedEdgeData } from './RoutedEdge';
import { AUTHORING_HANDLE_DIAMETER, GRAPH_PORT_DIAMETER } from './authoring-handle';

const FALLBACK_COLOR = '#8a94a6';
const DEFAULT_NODE_HEIGHT = 300;

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

/** A graph handle resolved for rendering: a color and a vertical offset (px from
 *  the node's top) matching where ELK placed the port. */
export type CardHandle = {
  id: string;
  graphId: GraphId;
  color: string;
  offsetY: number;
};

/** What ends an inline title edit. Answers a refusal reason, or `null` when the
 *  new title was accepted — the same contract `CanvasCard`'s editor reads, where
 *  `null` keeps the editor closed and a string keeps it open beside the message. */
export type CardTitleEditor = {
  onComplete: (title: string) => string | null;
  onCancel: () => void;
};

/** Data carried by each custom card node. Kept as a type alias so it satisfies
 *  React Flow's `Record<string, unknown>` data constraint, and it includes the
 *  handle arrays the ELK layout needs. */
export type CardNodeData = {
  cardId: CardId;
  title: string;
  /**
   * What kind of Card this is, drawn as a persistent glyph on the Front.
   *
   * Carried rather than derived from `aliasOf` below. The two answer different
   * questions — one is the Card's kind, the other is the title of the Card an
   * occurrence redraws — and reading the first off the second answers by proxy,
   * which is exactly what goes wrong for the next kind that resolves its
   * content elsewhere.
   */
  kind: Card['kind'];
  /** Local Card-authoring controls supplied by the application composition. */
  titleEditingEnabled?: boolean;
  /** Whether this Card owns content to edit — an Alias does not. */
  cardEditingEnabled?: boolean;
  /**
   * Whether this Card offers the one tab-stop control that begins an Edge from
   * the keyboard. The four spatial handles are a pointer affordance and reach no
   * keyboard author, so a Card that can be connected from needs a real control.
   */
  connectingEnabled?: boolean;
  onBeginConnect?: () => void;
  onEditCard?: () => void;
  onBeginTitleEditing?: () => void;
  /**
   * The inline title editor this Card is currently showing, absent on one that
   * is not being renamed. Its presence *is* the editing state, and it carries
   * the two operations that end the edit — so a composition cannot ask for the
   * editor without also saying what completes and cancels it.
   *
   * This is the pairing `CanvasCardProps` already makes for its own
   * `state: 'editing'`, held one layer up. Split into a boolean and two
   * independent optional callbacks, the adapter had to manufacture total
   * functions out of partial data, and an absent completion answered `null` —
   * which `CanvasCard` reads as *accepted*, closing the editor on a rename that
   * never happened.
   */
  titleEditor?: CardTitleEditor;
  /**
   * Whether the Layout has Expanded this Card, so it draws its content on the
   * Card rather than its title alone (ADR 0064).
   *
   * Authored, not derived: it is a fact about the Layout, and the Card's rect
   * follows from it rather than the other way round. The adapter cannot read it
   * off the geometry — a Card is not Expanded because it is large.
   *
   * The Alias kind has no Expanded front yet (ADR 0064 leaves it open), so
   * nothing sets this for one.
   */
  expanded?: boolean;
  /** Present only when activating the Expanded body may place a caret. */
  onBeginBodyEditing?: () => void;
  /**
   * The live body edit, absent on a Card whose rendered Markdown is at rest.
   *
   * Its presence *is* the caret, carrying the two operations that end the edit —
   * the same pairing `titleEditor` above makes, for the same reason: a
   * composition cannot ask for the caret without saying what commits and what
   * abandons it.
   *
   * Independent of `titleEditor` on purpose. Expansion is what the Layout
   * authored and the caret is a gesture the author just made, so a Card can be
   * Expanded while its *title* is being renamed (ADR 0064).
   */
  bodyEditor?: MarkdownCardBodyEditor;
  /**
   * Resizing this Expanded Card, absent on one that may not be resized.
   *
   * Presence is the capability and it carries its own floor, for the same reason
   * the two editors above carry their own completions: the collapsed size is
   * `CARD_SIZE`, which belongs to the composition and not to this package —
   * an adapter that hardcoded a minimum would be a second opinion about a
   * constant `app` already owns.
   *
   * `onResize` answers a size and no origin. Displacement moves Cards and does
   * not scale them, so a reported size needs no inversion — which is what keeps
   * this out of the family of gestures that must go back through the authored
   * placement. If a resize is ever allowed to move the Card's top-left, it joins
   * that family.
   */
  resize?: {
    readonly minWidth: number;
    readonly minHeight: number;
    onResize: (size: { width: number; height: number }) => void;
  };
  /** For an alias, the title of the card it shows — so the node can name what it
   *  redraws. Absent on non-alias cards. */
  aliasOf?: string;
  active: boolean;
  /** Ordinary renderer selection, kept outside the authored Space. */
  selectedForAuthoring: boolean;
  /**
   * Draw the card's content rather than its title. ADR 0006 deferred a "show
   * full content" view and left it a View's choice; presenting is that view (ADR
   * 0027). Set on the active card alone, never on the whole graph.
   */
  showContent: boolean;
  /** The Markdown to draw when `showContent` or `expanded`, resolved through an
   *  alias to its target's body. Absent otherwise — content is not embedded in
   *  every node (ADR 0006), which is the constraint that made this per-card, and
   *  which ADR 0064 narrows rather than lifts: an Expanded Card carries its
   *  source because the author asked for that one, not because every Card does. */
  body?: string;
  /** The graph being emphasised, if any. Drives handle dimming. */
  activeGraphId: GraphId | null;
  /** The active Graph's colour, used by graph-independent authoring handles. */
  activeGraphColor: string;
  emphasis: GraphEmphasis;
  sourceHandles: CardHandle[];
  targetHandles: CardHandle[];
};

export type CardFlowNode = Node<CardNodeData, 'card'>;

export type ColorByGraphId = Readonly<Partial<Record<GraphId, string>>>;

const EMPTY_HANDLES: CardHandleSet = { sourceHandles: [], targetHandles: [] };

export interface ProjectCardNodesOptions {
  /** Card id reached during traversal, if any, to flag as active. */
  activeCardId?: CardId | null;
  /** Ordinary renderer selection used to expose continued-authoring handles. */
  selectedCardId?: CardId | null;
  /**
   * Draw the active card's content instead of its title — what presenting does
   * (ADR 0027). Only the active card is affected, so this costs one card's body
   * in the projection rather than every card's.
   */
  showActiveCardContent?: boolean;
  /** The graph to emphasise, if any. */
  activeGraphId?: GraphId | null;
  /** The active Graph's resolved colour for graph authoring controls. */
  activeGraphColor?: string;
  emphasis?: GraphEmphasis;
  /** The laid-out graph; positions and port offsets come from here when present. */
  strategyGraph?: LayoutStrategyGraph;
  /** Node height used to evenly distribute handles before the layout resolves. */
  nodeHeight?: number;
  /** Restrict the projection to these card ids (e.g. one graph's cards). */
  cardIds?: readonly CardId[];
}

function resolveHandles(
  refs: GraphRenderHandleRef[],
  colors: ColorByGraphId,
  portsById: ReadonlyMap<string, LayoutStrategyCard['ports'][number]>,
  nodeHeight: number,
): CardHandle[] {
  const count = refs.length;
  return refs.map((ref, index) => {
    const port = portsById.get(ref.id);
    // Not every layout places ports — a grid has no opinion about them, and ELK
    // has not run yet on first paint. Fall back to an even spread.
    const offsetY = port?.y ?? ((index + 1) / (count + 1)) * nodeHeight;
    return {
      id: ref.id,
      graphId: ref.graphId,
      color: colors[ref.graphId] ?? FALLBACK_COLOR,
      offsetY,
    };
  });
}

function declaredHandles(
  sourceHandles: readonly CardHandle[],
  targetHandles: readonly CardHandle[],
  graphIds: readonly GraphId[],
  card: LayoutStrategyCard,
): NodeHandle[] {
  const radius = AUTHORING_HANDLE_DIAMETER / 2;
  const portRadius = GRAPH_PORT_DIAMETER / 2;
  const authoring = (
    type: 'source' | 'target',
    side: Position,
    x: number,
    y: number,
  ): NodeHandle => ({
    id: `authoring-${type}-${side}`,
    type,
    position: side,
    x,
    y,
    width: AUTHORING_HANDLE_DIAMETER,
    height: AUTHORING_HANDLE_DIAMETER,
  });
  const targetByGraph = new Map(targetHandles.map((handle) => [handle.graphId, handle]));
  const sourceByGraph = new Map(sourceHandles.map((handle) => [handle.graphId, handle]));
  const fallbackOffset = (index: number) => ((index + 1) / (graphIds.length + 1)) * card.height;
  // The DOM renders only incident overview anchors. Declaring every existing
  // Graph id keeps a completed connection resolvable in the same render that
  // first makes its target incident, without exposing another visible control.
  //
  // This is also why nothing may force a React Flow remeasure of a placed Card:
  // `parseHandles` prefers what is declared here, but a forced update rebuilds
  // the bounds from `getHandleBounds`, which sees only the anchors the DOM draws
  // — and the not-yet-incident declarations, the whole point of the loop below,
  // are gone. `CardNode` records the same rule from the other side.
  //
  // Order matters, and the authoring handles come first. React Flow picks the
  // closest declared handle within its connection radius and resolves an exact
  // distance tie by array order. A non-incident anchor's fallback offset can land
  // exactly on an authoring handle — with one Graph it always does, since the
  // lone anchor sits at half the Card's height and so do the Left and Right
  // handles. The authoring handle is the one with a DOM element behind it, and a
  // release that resolves to an anchor with none is refused, so the tie has to
  // fall the other way.
  return [
    authoring('source', Position.Top, card.width / 2 - radius, -radius),
    authoring('source', Position.Right, card.width - radius, card.height / 2 - radius),
    authoring('source', Position.Bottom, card.width / 2 - radius, card.height - radius),
    authoring('source', Position.Left, -radius, card.height / 2 - radius),
    authoring('target', Position.Top, card.width / 2 - radius, -radius),
    authoring('target', Position.Right, card.width - radius, card.height / 2 - radius),
    authoring('target', Position.Bottom, card.width / 2 - radius, card.height - radius),
    authoring('target', Position.Left, -radius, card.height / 2 - radius),
    ...graphIds.map((graphId, index): NodeHandle => {
      const handle = targetByGraph.get(graphId);
      return {
        id: handle?.id ?? inHandleId(graphId),
        type: 'target',
        position: Position.Left,
        x: -portRadius,
        y: (handle?.offsetY ?? fallbackOffset(index)) - portRadius,
        width: GRAPH_PORT_DIAMETER,
        height: GRAPH_PORT_DIAMETER,
      };
    }),
    ...graphIds.map((graphId, index): NodeHandle => {
      const handle = sourceByGraph.get(graphId);
      return {
        id: handle?.id ?? outHandleId(graphId),
        type: 'source',
        position: Position.Right,
        x: card.width - portRadius,
        y: (handle?.offsetY ?? fallbackOffset(index)) - portRadius,
        width: GRAPH_PORT_DIAMETER,
        height: GRAPH_PORT_DIAMETER,
      };
    }),
  ];
}

/**
 * Map cards → React Flow card nodes, attaching per-graph handles positioned at
 * their ELK port offsets. The card id is the React Flow node id.
 *
 * A node carries its card's *title*, not its content (ADR 0006) — the content is
 * loaded when a card is opened or presented, not embedded in every node.
 */
export function projectCardNodes(
  space: Space,
  handlesByCard: ReadonlyMap<CardId, CardHandleSet>,
  colors: ColorByGraphId,
  options: ProjectCardNodesOptions = {},
): CardFlowNode[] {
  const activeCardId = options.activeCardId ?? null;
  const showActiveCardContent = options.showActiveCardContent ?? false;
  const activeGraphId = options.activeGraphId ?? null;
  const emphasis = options.emphasis ?? 'equal';
  const nodeHeight = options.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const visible = options.cardIds ? new Set(options.cardIds) : null;
  const laidOut = new Map((options.strategyGraph?.cards ?? []).map((c) => [c.id, c]));

  const source = visible ? space.cards.filter((c) => visible.has(c.id)) : space.cards;

  return source.map((card) => {
    const handles = handlesByCard.get(card.id) ?? EMPTY_HANDLES;
    const cardLayout = laidOut.get(card.id);
    const active = card.id === activeCardId;
    const showContent = active && showActiveCardContent;
    // An alias names the card it redraws; a markdown card names nothing (ADR 0009).
    const aliasOf = card.kind === 'alias' ? resolveContentCard(space, card.id)?.title : undefined;
    // An alias shows its target's content under its own title (ADR 0009).
    const body = showContent ? (resolveContentCard(space, card.id)?.body ?? '') : undefined;
    const portsById = new Map((cardLayout?.ports ?? []).map((port) => [port.id, port]));
    // The Card's own height once a layout has placed it, and the constant only
    // before one has. The two agree for every collapsed Card — the strategies
    // arrange at `CARD_SIZE` — and differ exactly for an Expanded one, whose
    // anchors have to spread down the box it actually occupies (ADR 0064).
    // Read from the same rect `declaredHandles` reasons about below, so a
    // Graph's drawn anchor and its declared one cannot land in different places.
    const spread = cardLayout?.height ?? nodeHeight;
    const sourceHandles = resolveHandles(handles.sourceHandles, colors, portsById, spread);
    const targetHandles = resolveHandles(handles.targetHandles, colors, portsById, spread);

    const node: CardFlowNode = {
      id: card.id,
      type: 'card',
      position: { x: cardLayout?.x ?? 0, y: cardLayout?.y ?? 0 },
      data: {
        cardId: card.id,
        title: card.title,
        kind: card.kind,
        active,
        selectedForAuthoring: card.id === (options.selectedCardId ?? null),
        showContent,
        activeGraphId,
        activeGraphColor: options.activeGraphColor ?? FALLBACK_COLOR,
        emphasis,
        sourceHandles,
        targetHandles,
      },
      className: active ? 'rf-card-node rf-card-node--active' : 'rf-card-node',
    };
    // Carry the layout's dimensions through when it has placed the card. ELK
    // (and the grid) work at a fixed `CARD_SIZE`, so declaring width/height
    // here means React Flow renders the node at exactly the size the layout
    // reasoned about — no measure-then-reflow, and a centred `nodeOrigin` (if a
    // view chooses one) resolves correctly on first paint. Absent before the
    // layout resolves, so React Flow falls back to measuring, as before.
    //
    // `measured` is deliberately *not* set alongside them. React Flow documents
    // it as an output it writes after measuring, and it is redundant as an
    // input: `nodeHasDimensions` reads `measured?.width ?? width ?? initialWidth`,
    // so width/height already answer it, and a Card counts as initialized on
    // those plus its declared `handles`. What supplying it would change is that
    // React Flow preserves cached `handleBounds` instead of resetting them for
    // re-measure — a distinction with no meaning here, because the bounds come
    // from `declaredHandles` either way.
    if (cardLayout) {
      node.width = cardLayout.width;
      node.height = cardLayout.height;
      node.handles = declaredHandles(
        sourceHandles,
        targetHandles,
        space.graphs.map((graph) => graph.id),
        cardLayout,
      );
    }
    // Omit rather than set undefined: absent means "not an alias" (ADR 0009).
    if (aliasOf !== undefined) node.data.aliasOf = aliasOf;
    if (body !== undefined) node.data.body = body;
    return node;
  });
}

export interface ProjectGraphEdgesOptions {
  /** The graph to emphasise, if any. */
  activeGraphId?: GraphId | null;
  /** How strongly the other graphs recede. */
  emphasis?: GraphEmphasis;
  /** The laid-out graph; ELK's routed edge geometry comes from here when present. */
  strategyGraph?: LayoutStrategyGraph;
}

/** Flatten an edge's routed sections into one point list: start → bends → end. */
function routedPoints(edge: LayoutStrategyEdge | undefined): LayoutPosition[] | undefined {
  if (!edge?.sections?.length) return undefined;
  const points: LayoutPosition[] = [];
  for (const section of edge.sections) {
    points.push(section.startPoint, ...(section.bendPoints ?? []), section.endPoint);
  }
  return points;
}

/** Map graph-derived edges → colored React Flow edges drawn along ELK's routing. */
export function projectGraphEdges(
  graphRenderEdges: readonly GraphRenderEdge[],
  colors: ColorByGraphId,
  options: ProjectGraphEdgesOptions = {},
): Edge[] {
  const activeGraphId = options.activeGraphId ?? null;
  const emphasis = options.emphasis ?? 'equal';
  const laidEdges = new Map((options.strategyGraph?.edges ?? []).map((e) => [e.id, e]));

  return graphRenderEdges.map((edge) => {
    const color = colors[edge.graphId] ?? FALLBACK_COLOR;
    const isActiveGraph = edge.graphId === activeGraphId;
    const emphasized = isActiveGraph || emphasis === 'equal';
    const points = routedPoints(laidEdges.get(edge.id));

    const data: RoutedEdgeData = { graphId: edge.graphId };
    if (points !== undefined) data.points = points;

    return {
      id: edge.id,
      // A custom edge that draws ELK's routed polyline (issue 03); it falls back
      // to a bezier between the handles when no routing has been placed yet.
      type: 'routed',
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
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
