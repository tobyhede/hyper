import {
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type NodePositionChange,
} from '@xyflow/react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { uuidSchema, type CardId } from '@project/core';
import type { LayoutPoint } from '@project/graph';
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
  dragOrigins: ReadonlyMap<string, LayoutPoint>;
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
  selectRenderer: (positions: ReadonlyMap<string, LayoutPoint> | null) => void;
  /** Apply React Flow's own changes (drag, measure, select). */
  changeNodes: (changes: NodeChange<CardFlowNode>[]) => void;
  /** Install and notify one directed Edge between existing Cards, when it is a real Edit. */
  connectCards: (from: CardId, to: CardId, projected: readonly CardFlowNode[]) => boolean;
  /** Install and notify an atomic create-and-connect Edit without adding a transient node. */
  createConnectedCard: (from: CardId, position: LayoutPoint) => CardId | null;
  /** Select one Card after a completed connection. */
  selectCard: (cardId: CardId) => void;
}

export type RenderAdapter = UseBoundStore<StoreApi<RenderAdapterState>>;

function positionsOf(nodes: readonly CardFlowNode[]): ReadonlyMap<string, LayoutPoint> {
  return new Map(nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]));
}

function trackDragOrigins(
  dragOrigins: Map<string, LayoutPoint>,
  positionChanges: readonly NodePositionChange[],
  beforeById: ReadonlyMap<string, LayoutPoint>,
): void {
  for (const change of positionChanges) {
    if (change.dragging !== true || dragOrigins.has(change.id)) continue;
    const origin = beforeById.get(change.id);
    if (origin !== undefined) dragOrigins.set(change.id, { x: origin.x, y: origin.y });
  }
}

function consumeSettledMovedIds(
  settled: readonly NodePositionChange[],
  dragOrigins: Map<string, LayoutPoint>,
  beforeById: ReadonlyMap<string, LayoutPoint>,
  afterById: ReadonlyMap<string, LayoutPoint>,
): string[] {
  const movedIds: string[] = [];
  for (const change of settled) {
    const origin = dragOrigins.get(change.id) ?? beforeById.get(change.id);
    const after = afterById.get(change.id);
    dragOrigins.delete(change.id);
    if (
      origin !== undefined &&
      after !== undefined &&
      (origin.x !== after.x || origin.y !== after.y)
    ) {
      movedIds.push(change.id);
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
  return create<RenderAdapterState>((set, get) => ({
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
      authoring.installPlacement(positionsOf(reconciled));
    },

    selectRenderer: (positions) => {
      set({
        projection: null,
        dragOrigins: new Map(),
        moved: false,
        selectedCardId: null,
      });
      authoring.installPlacement(positions);
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
      const selectedCardId = selectedNode ? uuidSchema.parse(selectedNode.id) : null;
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

      const positions = positionsOf(nodes);
      set({
        projection: { ...projection, nodes },
        dragOrigins,
        moved: true,
        selectedCardId,
      });
      authoring.installPlacement(positions);
      authoring.complete({ kind: 'settled-card-movement' });
    },

    connectCards: (from, to, projected) => {
      const state = get();
      const projection = state.projection;
      if (projection === null || !authoring.canConnect(from, to)) {
        return false;
      }
      const positions = positionsOf(projection.nodes);
      set({
        projection: { ...projection, nodes: reconcile(projection.nodes, projected) },
      });
      authoring.installPlacement(positions);
      return authoring.complete({ kind: 'connected-cards', from, to }).kind !== 'no-edit';
    },

    createConnectedCard: (from, position) => {
      const state = get();
      const projection = state.projection;
      if (projection === null || !authoring.canCreateConnectedCard(from)) return null;
      authoring.installPlacement(positionsOf(projection.nodes));
      const result = authoring.complete({
        kind: 'create-and-connect',
        from,
        position,
      });
      return result.kind === 'completed' ? (result.createdCardId ?? null) : null;
    },
  }));
}
