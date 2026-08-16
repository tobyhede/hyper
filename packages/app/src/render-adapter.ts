import {
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type NodePositionChange,
} from '@xyflow/react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { CardId, GraphEdge, GraphId, LayoutPosition } from '@project/core';
import { Placement } from '@project/graph';
import type { CardFlowNode, RoutedEdgeData } from '@project/react-flow-adapter';
import type { SpaceAuthoring } from './space-authoring';

/**
 * The render adapter owns React Flow's transient projection. Space Authoring
 * owns the completed on-screen placement.
 *
 * Live nodes absorb every intermediate React Flow change so controlled dragging
 * follows the pointer, and they are published together with the Graph Edges
 * drawn against them. `dragOrigins` retains gesture starts across React Flow's
 * separate moving and settled callbacks.
 */

/**
 * One render's worth of React Flow input. The nodes carry the declared handles
 * an Edge attaches to, so the two are published as a single value rather than as
 * two fields written in step: an Edge can then never be on screen in a frame
 * whose nodes do not yet declare its handles, and no partial write exists to
 * make it so.
 */
export interface Projection {
  readonly nodes: CardFlowNode[];
  readonly edges: Edge[];
}

/**
 * One Edge, named the way everything that acts on an Edge has to name it.
 *
 * A Graph and an Edge travel together through every Edge operation — selecting,
 * reconnecting, deleting, opening an editor, offering endpoint choices — because
 * neither identifies an Edge alone: an Edge is `{ from, to }` and says nothing
 * about which Graph draws it, and a Graph holds many. Passing them as two
 * arguments meant every callee re-paired what its caller had just split.
 *
 * It is the **domain** Edge and its owning Graph, never the React Flow edge id.
 * That id is `<graphId>::<index>` and re-indexes whenever a Graph loses an Edge,
 * so a subject held by id would survive a deletion pointing at whichever Edge
 * slid into the vacated slot. A Graph cannot hold the same pair twice (ADR
 * 0032), so this names exactly one Edge for as long as that Edge exists — and
 * names nothing, harmlessly, once it does not.
 */
export interface EdgeSubject {
  readonly graphId: GraphId;
  readonly edge: GraphEdge;
}

/**
 * What the canvas has selected — one subject of one kind, never two.
 *
 * Discriminated rather than a pair of nullable fields, because "a Card and an
 * Edge are both selected" is not a state React Flow produces once modifier
 * multi-selection and the selection rectangle are off, and a shape that can
 * express it invites a second mutual-exclusion policy beside React Flow's own.
 */
export type CanvasSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'card'; readonly cardId: CardId }
  | ({ readonly kind: 'edge' } & EdgeSubject);

export const NO_SELECTION: CanvasSelection = { kind: 'none' };

/** Whether two subjects name the same Edge of the same Graph. */
export const sameEdgeSubject = (left: EdgeSubject, right: EdgeSubject): boolean =>
  left.graphId === right.graphId &&
  left.edge.from === right.edge.from &&
  left.edge.to === right.edge.to;

/** Whether two selections name the same subject. */
export function sameSelection(left: CanvasSelection, right: CanvasSelection): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'card') return left.cardId === (right as { cardId: CardId }).cardId;
  if (left.kind === 'edge') return sameEdgeSubject(left, right as EdgeSelection);
  return true;
}

/** The selected Card, for the projection's own emphasis. */
export const selectedCardOf = (selection: CanvasSelection): CardId | null =>
  selection.kind === 'card' ? selection.cardId : null;

/** The Edge subject alone, so a caller that only handles Edges need not narrow. */
export type EdgeSelection = Extract<CanvasSelection, { kind: 'edge' }>;

/**
 * The domain Edge behind a projected React Flow Edge, or `null` for one carrying
 * no Graph — which is any Edge this projection did not draw.
 *
 * The **one** place that translation happens. Every surface that acts on an Edge
 * needs it — the selection mirror here, the decoration and callbacks in Edge
 * Authoring, the toolbar inside the Edge itself — and three hand-rolled copies
 * would be three chances to widen `source` and `target` differently.
 *
 * They are `CardId`s widened to `string` by React Flow's `Edge` type, the same
 * erasure `placementFromNodes` repairs for a node id below.
 */
export function edgeSelectionOf(edge: Edge): EdgeSelection | null {
  const graphId = (edge.data as RoutedEdgeData | undefined)?.graphId;
  if (graphId === undefined) return null;
  return {
    kind: 'edge',
    graphId,
    edge: { from: edge.source as CardId, to: edge.target as CardId },
  };
}

/**
 * Mark exactly the selected Card's node, and only when that is what is selected.
 *
 * The union is authoritative for React Flow's own node selection, not merely a
 * mirror of it. Selecting an Edge has to clear the Card React Flow still holds
 * selected — otherwise the Delete key, which reads `nodes.filter(selected)` from
 * the controlled arrays, would delete a Card the author never named.
 */
function withSelection(nodes: readonly CardFlowNode[], selection: CanvasSelection): CardFlowNode[] {
  const selectedCardId = selectedCardOf(selection);
  return nodes.map((node) =>
    node.selected === (node.id === selectedCardId)
      ? node
      : { ...node, selected: node.id === selectedCardId },
  );
}

export interface RenderAdapterState {
  /**
   * The published projection, or `null` before the first layout resolves. Until
   * then there is nothing worth owning — every projected card sits at the origin
   * — and a space is correspondingly not editable for that frame.
   */
  projection: Projection | null;
  /** Gesture starts retained until each node receives a settled callback. */
  dragOrigins: ReadonlyMap<string, LayoutPosition>;
  /**
   * Set once a card has actually moved. A layout's routed edge geometry
   * describes the arrangement it computed, so it stops being true the moment a
   * card leaves the place that routing assumed; from then on edges are drawn as
   * plain curves between wherever the cards now are.
   */
  moved: boolean;
  /** The ordinary React Flow selection used for continued authoring. */
  selection: CanvasSelection;
  /** Publish projected Card nodes, their declared handles and Graph Edges together. */
  syncProjection: (nodes: readonly CardFlowNode[], edges: readonly Edge[]) => void;
  /**
   * Navigate to another renderer. The replacement arrangement will arrive via
   * `syncProjection`; renderer selection itself is not an edit.
   */
  selectRenderer: (placement: Placement | null) => void;
  /** Apply React Flow's own changes (drag, measure, select). */
  changeNodes: (changes: NodeChange<CardFlowNode>[]) => void;
  /**
   * Apply React Flow's Edge changes — selection, and nothing else.
   *
   * Every structural Edge change is a completed Space Edit that arrives through
   * the next projection, so a `remove` or `replace` reaching here would be React
   * Flow proposing a local mutation with no Edit behind it. Selection is the one
   * kind this store owns.
   */
  changeEdges: (changes: EdgeChange<Edge>[]) => void;
  /** Select one Card after a completed connection. */
  selectCard: (cardId: CardId) => void;
  /**
   * Select one Edge — the focus-to-selection bridge React Flow does not supply.
   *
   * Focusing an Edge does not select it in React Flow, so a keyboard author who
   * Tabs to an Edge and presses Delete would act on whatever was selected
   * before. Installing the focused Edge here is what makes the two agree.
   */
  selectEdge: (subject: EdgeSubject) => void;
  /** Drop the selection when its subject is no longer worth naming. */
  clearSelection: () => void;
  /**
   * The Placement the live nodes are currently drawn at, or `null` before the
   * first arrangement resolves.
   *
   * What a pointer gesture reports to Authoring: a completion is the only thing
   * that knows where React Flow has actually put the Cards, and this is that
   * reading. It is a report and not an authorship claim — `Placement.next`
   * decides which of these positions become authored.
   */
  renderedPlacement: () => Placement | null;
  /**
   * Fold a freshly projected node list into the live one, so an Edit's own Edge
   * draws without waiting for a strategy to resolve.
   *
   * Separate from `syncProjection` because it reports nothing back to Authoring:
   * the completion that calls it has already installed the placement it wrote,
   * and a second report of the same geometry could only disagree with it.
   */
  mergeProjected: (projected: readonly CardFlowNode[]) => void;
}

export type RenderAdapter = UseBoundStore<StoreApi<RenderAdapterState>>;

/**
 * Reduce React Flow's widened node ids and positions to the Placement Authoring
 * owns. Whether that geometry is a rendered report or part of a completed
 * authoring fact is decided at each call site below.
 */
function placementFromNodes(nodes: readonly CardFlowNode[]): Placement {
  // A node id is the Card id it was projected from, widened to `string` by React
  // Flow's `Node` type — the same erasure `consumeSettledMovedIds` repairs below.
  return Placement.fromEntries(nodes.map((node) => [node.id as CardId, node.position]));
}

function trackDragOrigins(
  dragOrigins: Map<string, LayoutPosition>,
  positionChanges: readonly NodePositionChange[],
  beforeById: ReadonlyMap<string, LayoutPosition>,
): void {
  for (const change of positionChanges) {
    if (change.dragging !== true || dragOrigins.has(change.id)) continue;
    const origin = beforeById.get(change.id);
    if (origin !== undefined) dragOrigins.set(change.id, { x: origin.x, y: origin.y });
  }
}

function consumeSettledMovedIds(
  settled: readonly NodePositionChange[],
  dragOrigins: Map<string, LayoutPosition>,
  beforeById: ReadonlyMap<string, LayoutPosition>,
  afterById: ReadonlyMap<string, LayoutPosition>,
): CardId[] {
  // The same `Node.id` erasure `placementFromNodes` repairs above.
  const movedIds: CardId[] = [];
  for (const change of settled) {
    const origin = dragOrigins.get(change.id) ?? beforeById.get(change.id);
    const after = afterById.get(change.id);
    dragOrigins.delete(change.id);
    if (
      origin !== undefined &&
      after !== undefined &&
      (origin.x !== after.x || origin.y !== after.y)
    ) {
      movedIds.push(change.id as CardId);
    }
  }
  return movedIds;
}

/**
 * Fold the freshly projected nodes into the live list. A card that survives
 * keeps its live node — position, measured size, drag, selection — and refreshes
 * only the parts the projection owns, so a drag in flight is never interrupted
 * and a measured size is never thrown away. Mapping over `projected` also drops
 * nodes whose card no longer exists.
 */
function reconcile(
  current: readonly CardFlowNode[],
  projected: readonly CardFlowNode[],
): CardFlowNode[] {
  const byId = new Map(current.map((node) => [node.id, node]));
  return projected.map((node) => {
    const live = byId.get(node.id);
    if (!live) return node;
    // `data`, `className` and `handles` are the projection's to own — they carry
    // the title, the description, the active/emphasis styling and the declared
    // handle geometry. Everything else is React Flow's runtime and belongs to the
    // live node. `handles` must come through: React Flow builds `handleBounds`
    // from the declaration rather than measuring the DOM (docs/agents/rendering.md), so a live
    // node that kept a stale set would resolve a new Edge against the handles the
    // Card had before it gained one. The conditional spreads are for
    // `exactOptionalPropertyTypes`; the projection always sets a className.
    return {
      ...live,
      data: node.data,
      ...(node.handles !== undefined ? { handles: node.handles } : {}),
      ...(node.className !== undefined ? { className: node.className } : {}),
    };
  });
}

/** A React Flow selection change, whichever element kind reported it. */
type SelectChange = { readonly id: string; readonly selected: boolean };

function selectChanges(
  changes: readonly (NodeChange<CardFlowNode> | EdgeChange<Edge>)[],
): SelectChange[] {
  return changes.filter(
    (change): change is SelectChange & { type: 'select' } => change.type === 'select',
  );
}

/**
 * Fold React Flow's selection changes into the union, additively.
 *
 * **One selection action produces two batches**, and the order is the whole
 * reason this is not `changes.find(selected) ?? none`. React Flow first selects
 * the new subject and then deselects the other kind, so reading the last change
 * would answer `none` for a click that plainly selected something. Additively:
 * a `selected: true` change installs its subject, and a `selected: false` change
 * clears the union only when it names the subject *currently* stored. The
 * cross-kind deselection then finds a union that has already moved on, and
 * leaves it alone.
 */
function additiveSelection(
  current: CanvasSelection,
  changes: readonly { readonly subject: CanvasSelection; readonly selected: boolean }[],
): CanvasSelection {
  let selection = current;
  for (const change of changes) {
    if (change.selected) selection = change.subject;
    else if (sameSelection(selection, change.subject)) selection = NO_SELECTION;
  }
  return selection;
}

/** Install a selection made outside React Flow's change stream. */
function selecting(
  state: RenderAdapterState,
  selection: CanvasSelection,
): Pick<RenderAdapterState, 'selection' | 'projection'> {
  return {
    selection,
    projection:
      state.projection === null
        ? null
        : { ...state.projection, nodes: withSelection(state.projection.nodes, selection) },
  };
}

export function createRenderAdapter(authoring: SpaceAuthoring): RenderAdapter {
  const adapter = create<RenderAdapterState>((set, get) => ({
    projection: null,
    dragOrigins: new Map(),
    moved: false,
    selection: NO_SELECTION,

    // Compute, publish, then tell Authoring where the cards ended up — the same
    // order as `changeNodes` and `connectCards` below. Installing from inside
    // the `set` updater put the cross-store write before the state it describes
    // was committed, so this store still held the previous projection at the
    // moment anything downstream was told about the new one.
    syncProjection: (nodes, edges) => {
      const current = get().projection;
      // The empty list rather than a separate branch for the first projection:
      // it too may be the one that first draws a Card already selected, since
      // `selectRenderer` clears the projection and a selection can be made
      // before the next one lands.
      //
      // `withSelection` over the reconciled list is what seeds a Card the live
      // list has never seen. A projection carries no selection of its own —
      // `projectCardNodes` sets `data.selectedForAuthoring` and never the node's
      // `selected` — and `reconcile` has nothing to preserve for a Card that is
      // new, so without this the union and React Flow disagree from the first
      // frame. Authoring selects a Card in the same tick it creates it, one
      // render *before* the projection that first draws it: `selectCard` maps
      // over the nodes it can see and the new one is not among them yet. The
      // Card then reads as selected on screen, since `selectedForAuthoring` is
      // right, while React Flow holds no selected node at all — and `F2` asks
      // React Flow, so `F2` is what stops working until a click repairs it.
      // Add Card, Add Alias and create-and-connect all land here.
      const reconciled = withSelection(reconcile(current?.nodes ?? [], nodes), get().selection);
      set({ projection: { nodes: reconciled, edges: [...edges] } });
      // Reporting geometry, not authoring it: a Card the selected Layout omits is
      // drawn in the fallback band and must stay unplaced.
      authoring.reportRendered(placementFromNodes(reconciled));
    },

    selectRenderer: (placement) => {
      set({
        projection: null,
        dragOrigins: new Map(),
        moved: false,
        selection: NO_SELECTION,
      });
      authoring.replacePlacement(placement);
    },

    selectCard: (cardId) => set((state) => selecting(state, { kind: 'card', cardId })),

    selectEdge: ({ graphId, edge }) =>
      set((state) => selecting(state, { kind: 'edge', graphId, edge })),

    clearSelection: () => set((state) => selecting(state, NO_SELECTION)),

    renderedPlacement: () => {
      const projection = get().projection;
      return projection === null ? null : placementFromNodes(projection.nodes);
    },

    mergeProjected: (projected) => {
      const state = get();
      const projection = state.projection;
      if (projection === null) return;
      // Seeded for the same reason as `syncProjection`, and this is the path a
      // create-and-connect takes: the completed Edit publishes, Authoring
      // selects the Card it has just minted, and the projection carrying that
      // Card arrives here.
      set({
        projection: {
          ...projection,
          nodes: withSelection(reconcile(projection.nodes, projected), state.selection),
        },
      });
    },

    changeNodes: (changes) => {
      const state = get();
      const projection = state.projection;
      if (projection === null) return;

      // Drop changes aimed at nodes this store does not own. React Flow
      // measures anything it renders and reports a `dimensions` change for it,
      // and `applyNodeChanges` always returns a fresh array — so an unowned
      // node's change round-trips into a re-sync and re-measures forever.
      // Returning no update when nothing real changed keeps the array
      // reference stable and is what breaks that loop.
      const owned = new Set(projection.nodes.map((node) => node.id));
      const relevant = changes.filter((change) => !('id' in change) || owned.has(change.id));
      if (relevant.length === 0) return;

      const beforeById = new Map(projection.nodes.map((node) => [node.id, node.position]));
      const applied = applyNodeChanges(relevant, projection.nodes);
      // Additive, from the change stream rather than from the resulting array.
      // One React Flow selection produces two batches — the new subject
      // selected, then the other kind deselected — and reading the array would
      // let the second batch answer `none` for a Card that was never the
      // subject. See `changeEdges` for the other half of the same rule.
      const selection = additiveSelection(
        state.selection,
        selectChanges(relevant).map((change) => ({
          // The same erasure again, read the same way. Parsing here instead
          // would put a throw on the per-pointer-frame path for a failure the
          // other readings agree cannot happen.
          subject: { kind: 'card', cardId: change.id as CardId } as const,
          selected: change.selected,
        })),
      );
      const nodes = withSelection(applied, selection);
      const afterById = new Map(nodes.map((node) => [node.id, node.position]));
      const positionChanges = relevant.filter(
        (change): change is NodePositionChange => change.type === 'position',
      );
      const dragOrigins = new Map(state.dragOrigins);
      trackDragOrigins(dragOrigins, positionChanges, beforeById);

      const settled = positionChanges.filter((change) => change.dragging === false);
      if (settled.length === 0) {
        set({ projection: { ...projection, nodes }, dragOrigins, selection });
        return;
      }

      const movedIds = consumeSettledMovedIds(settled, dragOrigins, beforeById, afterById);

      if (movedIds.length === 0) {
        set({ projection: { ...projection, nodes }, dragOrigins, selection });
        return;
      }

      set({
        projection: { ...projection, nodes },
        dragOrigins,
        moved: true,
        selection,
      });
      authoring.complete({
        kind: 'settled-card-movement',
        rendered: placementFromNodes(nodes),
        // The gesture placed exactly `movedIds`; every other Card keeps
        // whatever authorship it already had.
        placed: movedIds,
      });
    },

    changeEdges: (changes) => {
      const state = get();
      const projection = state.projection;
      if (projection === null) return;
      const selections = selectChanges(changes);
      if (selections.length === 0) return;
      const selection = additiveSelection(
        state.selection,
        selections.flatMap((change) => {
          const drawn = projection.edges.find((edge) => edge.id === change.id);
          const subject = drawn === undefined ? null : edgeSelectionOf(drawn);
          // An Edge this projection does not draw. React Flow reports the
          // deselection of an Edge the previous projection held, and there is
          // no subject to compare — dropping it is what stops that stale
          // report clearing the selection the author has just made.
          return subject === null ? [] : [{ subject, selected: change.selected }];
        }),
      );
      if (sameSelection(selection, state.selection)) return;
      set({
        projection: { ...projection, nodes: withSelection(projection.nodes, selection) },
        selection,
      });
    },
  }));
  // A replacement Space arrives without unmounting anything, so the projection
  // this store is holding describes Cards that may no longer exist and drag
  // bookkeeping for a gesture made against the Space that is gone. Dropping it
  // is the same reset `selectRenderer` performs, for the same reason: what is on
  // screen no longer describes what is being rendered.
  //
  // The unsubscribe is deliberately dropped: this store's lifetime is the
  // composition's, and `authoring.dispose` clears the listener set that holds
  // this. Give the adapter its own teardown if it ever outlives one Authoring.
  let replacementEpoch = authoring.getState().replacementEpoch;
  authoring.subscribe(() => {
    const nextEpoch = authoring.getState().replacementEpoch;
    if (nextEpoch === replacementEpoch) return;
    replacementEpoch = nextEpoch;
    adapter.setState({
      projection: null,
      dragOrigins: new Map(),
      moved: false,
      selection: NO_SELECTION,
    });
  });
  return adapter;
}
