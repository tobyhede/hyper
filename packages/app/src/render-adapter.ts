import {
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type NodePositionChange,
} from '@xyflow/react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { CardId, LayoutPosition } from '@project/core';
import { Placement } from '@project/graph';
import type { CardFlowNode } from '@project/react-flow-adapter';
import type { SpaceAuthoring } from './space-authoring';

/**
 * The render adapter owns React Flow's transient projection. Space Authoring
 * owns the completed on-screen placement.
 *
 * Live nodes absorb every intermediate React Flow change so controlled dragging
 * follows the pointer, and they are published together with the Route Edges
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
  /** The ordinary React Flow selection used for continued Route authoring. */
  selectedCardId: CardId | null;
  /** Publish projected Card nodes, their declared handles and Route Edges together. */
  syncProjection: (nodes: readonly CardFlowNode[], edges: readonly Edge[]) => void;
  /**
   * Navigate to another renderer. The replacement arrangement will arrive via
   * `syncProjection`; renderer selection itself is not an edit.
   */
  selectRenderer: (placement: Placement | null) => void;
  /** Apply React Flow's own changes (drag, measure, select). */
  changeNodes: (changes: NodeChange<CardFlowNode>[]) => void;
  /** Install and notify one directed Edge between existing Cards, when it is a real Edit. */
  connectCards: (from: CardId, to: CardId, projected: readonly CardFlowNode[]) => boolean;
  /** Install and notify an atomic create-and-connect Edit without adding a transient node. */
  createConnectedCard: (from: CardId, position: LayoutPosition) => CardId | null;
  /** Select one Card after a completed connection. */
  selectCard: (cardId: CardId) => void;
}

export type RenderAdapter = UseBoundStore<StoreApi<RenderAdapterState>>;

/**
 * Report what React Flow is drawing, and let Placement decide how much of it is
 * authorship. The adapter's whole part is reducing nodes to positions and naming
 * the Cards a completed gesture placed; the sparse rule is `Placement.next`'s.
 */
function reportRenderedPlacement(
  authoring: SpaceAuthoring,
  nodes: readonly CardFlowNode[],
  placed: readonly CardId[] = [],
): void {
  // A node id is the Card id it was projected from, widened to `string` by React
  // Flow's `Node` type — the same erasure `consumeSettledMovedIds` repairs below.
  const rendered = Placement.fromEntries(nodes.map((node) => [node.id as CardId, node.position]));
  authoring.installPlacement(Placement.next(authoring.authoredPlacement(), rendered, placed));
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
  // The same `Node.id` erasure `reportRenderedPlacement` repairs above.
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
    // from the declaration rather than measuring the DOM (AGENTS.md), so a live
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

export function createRenderAdapter(authoring: SpaceAuthoring): RenderAdapter {
  const adapter = create<RenderAdapterState>((set, get) => ({
    projection: null,
    dragOrigins: new Map(),
    moved: false,
    selectedCardId: null,

    // Compute, publish, then tell Authoring where the cards ended up — the same
    // order as `changeNodes` and `connectCards` below. Installing from inside
    // the `set` updater put the cross-store write before the state it describes
    // was committed, so this store still held the previous projection at the
    // moment anything downstream was told about the new one.
    syncProjection: (nodes, edges) => {
      const current = get().projection;
      const reconciled = current === null ? [...nodes] : reconcile(current.nodes, nodes);
      set({ projection: { nodes: reconciled, edges: [...edges] } });
      // Reporting geometry, not authoring it: a Card the selected Layout omits is
      // drawn in the fallback band and must stay unplaced.
      reportRenderedPlacement(authoring, reconciled);
    },

    selectRenderer: (placement) => {
      set({
        projection: null,
        dragOrigins: new Map(),
        moved: false,
        selectedCardId: null,
      });
      authoring.installPlacement(placement);
    },

    selectCard: (cardId) =>
      set((state) => ({
        selectedCardId: cardId,
        projection:
          state.projection === null
            ? null
            : {
                ...state.projection,
                nodes: state.projection.nodes.map((node) => ({
                  ...node,
                  selected: node.id === cardId,
                })),
              },
      })),

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
      const nodes = applyNodeChanges(relevant, projection.nodes);
      const selectedNode = nodes.find((node) => node.selected);
      // The same erasure again, read the same way. Parsing here instead would
      // put a throw on the per-pointer-frame path for a failure the other two
      // readings agree cannot happen — and `App` already uses `safeParse` at its
      // own React Flow boundary precisely so a mid-drag throw is impossible.
      const selectedCardId = selectedNode ? (selectedNode.id as CardId) : null;
      const afterById = new Map(nodes.map((node) => [node.id, node.position]));
      const positionChanges = relevant.filter(
        (change): change is NodePositionChange => change.type === 'position',
      );
      const dragOrigins = new Map(state.dragOrigins);
      trackDragOrigins(dragOrigins, positionChanges, beforeById);

      const settled = positionChanges.filter((change) => change.dragging === false);
      if (settled.length === 0) {
        set({ projection: { ...projection, nodes }, dragOrigins, selectedCardId });
        return;
      }

      const movedIds = consumeSettledMovedIds(settled, dragOrigins, beforeById, afterById);

      if (movedIds.length === 0) {
        set({ projection: { ...projection, nodes }, dragOrigins, selectedCardId });
        return;
      }

      set({
        projection: { ...projection, nodes },
        dragOrigins,
        moved: true,
        selectedCardId,
      });
      // The gesture placed exactly `movedIds`; every other Card keeps whatever
      // authorship it already had.
      reportRenderedPlacement(authoring, nodes, movedIds);
      authoring.complete({ kind: 'settled-card-movement' });
    },

    connectCards: (from, to, projected) => {
      const state = get();
      const projection = state.projection;
      if (projection === null || !authoring.canConnect(from, to)) {
        return false;
      }
      // Report the placement from the live nodes, and publish the reconciled
      // ones below — deliberately two different lists. `reportRenderedPlacement`
      // reads positions only, and `reconcile` takes every surviving Card's
      // position from its live node, so the two agree on every Card already on
      // screen. They diverge only for a Card the projection has gained and the
      // live list has not, which `App` makes reachable by withholding
      // `syncProjection` until a strategy resolves. That Card has no resolved
      // position yet, and authoring the origin it is standing on is exactly
      // what a sparse Layout exists to avoid.
      reportRenderedPlacement(authoring, projection.nodes);
      // Complete first. A completion that has not happened — refused, queued
      // behind another Edit, or thrown on an invalid Space — must not leave a
      // connection drawn for an Edge the Space never gained. Only `completed`
      // says it did: a queued Edit runs against whatever Space the Edit ahead of
      // it installs and can still answer `no-edit` there, and if it does land the
      // projection that follows it draws the Edge anyway.
      if (authoring.complete({ kind: 'connected-cards', from, to }).kind !== 'completed') {
        return false;
      }
      // Re-read: completing published, and a listener may have replaced the
      // projection — accepting a stored Space drops it outright.
      const committed = get().projection;
      if (committed !== null) {
        set({ projection: { ...committed, nodes: reconcile(committed.nodes, projected) } });
      }
      return true;
    },

    createConnectedCard: (from, position) => {
      const state = get();
      const projection = state.projection;
      if (projection === null || !authoring.canCreateConnectedCard(from)) return null;
      // The dropped Card is placed by `position` inside the completion itself.
      reportRenderedPlacement(authoring, projection.nodes);
      const result = authoring.complete({
        kind: 'create-and-connect',
        from,
        position,
      });
      return result.kind === 'completed' ? (result.createdCardId ?? null) : null;
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
  let opening = authoring.getState().opening;
  authoring.subscribe(() => {
    const nextOpening = authoring.getState().opening;
    if (nextOpening === opening) return;
    opening = nextOpening;
    adapter.setState({
      projection: null,
      dragOrigins: new Map(),
      moved: false,
      selectedCardId: null,
    });
  });
  return adapter;
}
