import { applyNodeChanges, type NodeChange, type NodePositionChange } from '@xyflow/react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { LayoutPoint } from '@project/graph';
import type { CardFlowNode } from '@project/react-flow-adapter';

/**
 * The editor store: the single owner of React Flow's `nodes` array *and* of the
 * active Layout's placement map.
 *
 * Two representations of where a card is, deliberately. The node array is React
 * Flow's runtime — it also carries measured size, selection and drag state, and
 * it has to absorb every intermediate change during a drag or the card will not
 * follow the cursor in a controlled flow. The map is the domain value: the
 * Layout an author is editing (ADR 0013), written at the *end* of a drag rather
 * than on every frame, so the thing that persists is a placement rather than a
 * gesture.
 *
 * The pattern is the one React Flow's own state-management guide prescribes and
 * the layout-feel spike arrived at independently: one store, interaction in
 * through `changeNodes`, no second reconciled list, no effect copying one source
 * of positions to another.
 */

export interface EditorState {
  /**
   * React Flow's node array, or `null` before the first layout resolves. Until
   * then there is nothing worth owning — every projected card sits at the origin
   * — and a space is correspondingly not editable for that frame (ADR 0017).
   */
  nodes: CardFlowNode[] | null;
  /** The active Layout's placement map: card id → where the author put it. */
  positions: ReadonlyMap<string, LayoutPoint>;
  /**
   * Set once a card has actually moved. A layout's routed edge geometry
   * describes the arrangement it computed, so it stops being true the moment a
   * card leaves the place that routing assumed; from then on edges are drawn as
   * plain curves between wherever the cards now are.
   */
  moved: boolean;
  /** Fold a freshly projected node list into the live one. */
  syncNodes: (projected: readonly CardFlowNode[]) => void;
  /**
   * Auto-arrange: take an automatic strategy's placement as the Layout's.
   *
   * A **replacement**, not a merge — the point of pressing it is that a card
   * dragged out of the way comes back, so a position surviving the arrangement
   * that was meant to supersede it is the bug this signature rules out.
   */
  arrange: (positions: ReadonlyMap<string, LayoutPoint>) => void;
  /** Apply React Flow's own changes (drag, measure, select). */
  changeNodes: (changes: NodeChange<CardFlowNode>[]) => void;
}

export type EditorStore = UseBoundStore<StoreApi<EditorState>>;

function positionsOf(nodes: readonly CardFlowNode[]): ReadonlyMap<string, LayoutPoint> {
  return new Map(nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]));
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
    // `data` and `className` are the projection's to own — they carry the title,
    // the description and the active/emphasis styling. Everything else is React
    // Flow's runtime and belongs to the live node. The conditional spread is for
    // `exactOptionalPropertyTypes`; the projection always sets a className.
    return {
      ...live,
      data: node.data,
      ...(node.className !== undefined ? { className: node.className } : {}),
    };
  });
}

export function createEditorStore(): EditorStore {
  return create<EditorState>((set) => ({
    nodes: null,
    positions: new Map(),
    moved: false,

    syncNodes: (projected) =>
      set((state) => {
        if (state.nodes === null) {
          // First resolved layout. Its positions become the Layout a space that
          // carried none now has (ADR 0017) — created on open, before any
          // gesture, so no edit is ever what brings it into being.
          const nodes = [...projected];
          return { nodes, positions: positionsOf(nodes) };
        }
        return { nodes: reconcile(state.nodes, projected) };
      }),

    arrange: (positions) =>
      set((state) => {
        if (state.nodes === null) return {};
        const nodes = state.nodes.map((node) => {
          const at = positions.get(node.id);
          return at ? { ...node, position: { x: at.x, y: at.y } } : node;
        });
        // `moved` goes back to false because the routed edge geometry that comes
        // with this arrangement describes *this* arrangement — the cards are back
        // where the routing assumed they were, so it is true again.
        //
        // A card the map omits keeps the node position it happens to have. That
        // is not a merge sneaking back in: the strategy places every card it is
        // handed, and a card genuinely absent from a Layout is an unplaced one,
        // which is a state Layouts are allowed to be in.
        return { nodes, positions: new Map(positions), moved: false };
      }),

    changeNodes: (changes) =>
      set((state) => {
        if (state.nodes === null) return {};

        // Drop changes aimed at nodes this store does not own. React Flow
        // measures anything it renders and reports a `dimensions` change for it,
        // and `applyNodeChanges` always returns a fresh array — so an unowned
        // node's change round-trips into a re-sync and re-measures forever.
        // Returning no update when nothing real changed keeps the array
        // reference stable and is what breaks that loop.
        const owned = new Set(state.nodes.map((node) => node.id));
        const relevant = changes.filter((change) => !('id' in change) || owned.has(change.id));
        if (relevant.length === 0) return {};

        const nodes = applyNodeChanges(relevant, state.nodes);

        // A drag ends with a position change carrying `dragging: false`. That is
        // the placement worth recording; the frames before it are a gesture.
        const settled = relevant.filter(
          (c): c is NodePositionChange => c.type === 'position' && c.dragging === false,
        );
        if (settled.length === 0) return { nodes };

        const positions = new Map(state.positions);
        let moved = state.moved;
        for (const change of settled) {
          const node = nodes.find((n) => n.id === change.id);
          if (!node) continue;
          const was = positions.get(node.id);
          if (was?.x === node.position.x && was.y === node.position.y) continue;
          positions.set(node.id, { x: node.position.x, y: node.position.y });
          moved = true;
        }
        return { nodes, positions, moved };
      }),
  }));
}
