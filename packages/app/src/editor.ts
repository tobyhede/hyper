import { applyNodeChanges, type NodeChange, type NodePositionChange } from '@xyflow/react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { uuidSchema, type CardId } from '@project/core';
import type { LayoutPoint } from '@project/graph';
import type { CardFlowNode } from '@project/react-flow-adapter';

/**
 * The editor store is the single owner of React Flow's live node array and the
 * authoritative authored placement, when one exists.
 *
 * Live nodes absorb every intermediate React Flow change so controlled dragging
 * follows the pointer. `positions` is different: it is null while an automatic
 * arrangement remains runtime-only, or a possibly sparse Layout map after an
 * existing Layout is opened or an edit authors one. `dragOrigins` retains
 * gesture starts across React Flow's separate moving and settled callbacks.
 */

export interface EditorState {
  /**
   * React Flow's node array, or `null` before the first layout resolves. Until
   * then there is nothing worth owning — every projected card sits at the origin
   * — and a space is correspondingly not editable for that frame.
   */
  nodes: CardFlowNode[] | null;
  /** Authoritative, possibly sparse Layout placement; null before conversion. */
  positions: ReadonlyMap<string, LayoutPoint> | null;
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
  /** Fold a freshly projected node list into the live one. */
  syncNodes: (projected: readonly CardFlowNode[]) => void;
  /**
   * Navigate to another renderer. The replacement arrangement will arrive via
   * `syncNodes`; renderer selection itself is not an edit.
   */
  selectRenderer: (positions: ReadonlyMap<string, LayoutPoint> | null) => void;
  /** Apply React Flow's own changes (drag, measure, select). */
  changeNodes: (changes: NodeChange<CardFlowNode>[]) => void;
  /**
   * Freeze a resolved automatic arrangement after a completed structural Edit,
   * reinstalling its declared handle geometry before the new Edges are exposed.
   */
  authorPositions: (
    positions: ReadonlyMap<string, LayoutPoint>,
    projected: readonly CardFlowNode[],
  ) => void;
  /** Select one Card after a completed connection. */
  selectCard: (cardId: CardId) => void;
}

export type EditorStore = UseBoundStore<StoreApi<EditorState>>;

function positionsOf(nodes: readonly CardFlowNode[]): ReadonlyMap<string, LayoutPoint> {
  return new Map(nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]));
}

function positionsForEdit(
  nodes: readonly CardFlowNode[],
  positions: ReadonlyMap<string, LayoutPoint> | null,
): Map<string, LayoutPoint> {
  return new Map(positions ?? positionsOf(nodes));
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

export function createEditorStore(
  initialPositions: ReadonlyMap<string, LayoutPoint> | null = null,
  editCompleted: () => void = () => undefined,
): EditorStore {
  return create<EditorState>((set, get) => ({
    nodes: null,
    positions: initialPositions === null ? null : new Map(initialPositions),
    dragOrigins: new Map(),
    moved: false,
    selectedCardId: null,

    syncNodes: (projected) =>
      set((state) => {
        if (state.nodes === null) {
          return { nodes: [...projected] };
        }
        return { nodes: reconcile(state.nodes, projected) };
      }),

    selectRenderer: (positions) =>
      set({
        nodes: null,
        positions: positions === null ? null : new Map(positions),
        dragOrigins: new Map(),
        moved: false,
        selectedCardId: null,
      }),

    authorPositions: (positions, projected) =>
      set((state) => ({
        positions: new Map(positions),
        nodes: state.nodes === null ? [...projected] : reconcile(state.nodes, projected),
      })),

    selectCard: (cardId) =>
      set((state) => ({
        selectedCardId: cardId,
        nodes:
          state.nodes?.map((node) => ({ ...node, selected: node.id === cardId })) ?? state.nodes,
      })),

    changeNodes: (changes) => {
      const state = get();
      if (state.nodes === null) return;

      // Drop changes aimed at nodes this store does not own. React Flow
      // measures anything it renders and reports a `dimensions` change for it,
      // and `applyNodeChanges` always returns a fresh array — so an unowned
      // node's change round-trips into a re-sync and re-measures forever.
      // Returning no update when nothing real changed keeps the array
      // reference stable and is what breaks that loop.
      const owned = new Set(state.nodes.map((node) => node.id));
      const relevant = changes.filter((change) => !('id' in change) || owned.has(change.id));
      if (relevant.length === 0) return;

      const beforeById = new Map(state.nodes.map((node) => [node.id, node.position]));
      const nodes = applyNodeChanges(relevant, state.nodes);
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
        set({ nodes, dragOrigins, selectedCardId });
        return;
      }

      const movedIds = consumeSettledMovedIds(settled, dragOrigins, beforeById, afterById);

      if (movedIds.length === 0) {
        set({ nodes, dragOrigins, selectedCardId });
        return;
      }

      const positions = positionsForEdit(nodes, state.positions);
      for (const id of movedIds) {
        const after = afterById.get(id);
        if (after !== undefined) positions.set(id, { x: after.x, y: after.y });
      }
      set({
        nodes,
        positions,
        dragOrigins,
        moved: true,
        selectedCardId,
      });
      editCompleted();
    },
  }));
}
