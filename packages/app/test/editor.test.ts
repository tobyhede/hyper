import { describe, expect, it } from 'vitest';
import type { NodeChange } from '@xyflow/react';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { createEditorStore } from '../src/editor';

function node(id: string, x: number, y: number, title = id): CardFlowNode {
  return {
    id,
    type: 'card',
    position: { x, y },
    className: 'rf-card-node',
    data: {
      cardId: id,
      title,
      sourceHandles: [],
      targetHandles: [],
      active: false,
      activeRouteId: null,
      emphasis: 'equal',
    },
  };
}

/** A drag: React Flow reports intermediate frames, then one with `dragging: false`. */
function drag(id: string, x: number, y: number): NodeChange<CardFlowNode>[] {
  return [
    { type: 'position', id, position: { x: x - 5, y: y - 5 }, dragging: true },
    { type: 'position', id, position: { x, y }, dragging: false },
  ];
}

const PROJECTED = [node('a', 10, 20), node('b', 300, 20)];

describe('editor store', () => {
  it('owns no nodes until the first layout resolves', () => {
    const store = createEditorStore();
    expect(store.getState().nodes).toBeNull();
    expect(store.getState().positions.size).toBe(0);
  });

  it('takes the first resolved layout as the Layout (ADR 0017)', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);

    expect(store.getState().nodes?.map((n) => n.id)).toEqual(['a', 'b']);
    expect(store.getState().positions.get('a')).toEqual({ x: 10, y: 20 });
    expect(store.getState().positions.get('b')).toEqual({ x: 300, y: 20 });
    // Created on open, before any gesture — nothing has moved yet.
    expect(store.getState().moved).toBe(false);
  });

  it('records where a drag ends, and moves nothing else', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes(drag('a', 500, 400));

    expect(store.getState().positions.get('a')).toEqual({ x: 500, y: 400 });
    expect(store.getState().positions.get('b')).toEqual({ x: 300, y: 20 });
    expect(store.getState().nodes?.find((n) => n.id === 'a')?.position).toEqual({ x: 500, y: 400 });
    expect(store.getState().moved).toBe(true);
  });

  it('follows the cursor mid-drag without recording it', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store
      .getState()
      .changeNodes([{ type: 'position', id: 'a', position: { x: 77, y: 88 }, dragging: true }]);

    // The node moves, so the card tracks the pointer in a controlled flow...
    expect(store.getState().nodes?.find((n) => n.id === 'a')?.position).toEqual({ x: 77, y: 88 });
    // ...but a gesture in flight is not a placement.
    expect(store.getState().positions.get('a')).toEqual({ x: 10, y: 20 });
    expect(store.getState().moved).toBe(false);
  });

  it('keeps a dragged position when the projection is re-synced', () => {
    // The regression this guards: `App` re-projects on every selection or
    // emphasis change, and a naive assignment would stamp the drag away.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes(drag('a', 500, 400));
    store.getState().syncNodes(PROJECTED);

    expect(store.getState().nodes?.find((n) => n.id === 'a')?.position).toEqual({ x: 500, y: 400 });
    expect(store.getState().positions.get('a')).toEqual({ x: 500, y: 400 });
  });

  it('takes fresh data and styling from the projection', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    const restyled = [{ ...node('a', 10, 20, 'A renamed'), className: 'rf-card-node--active' }];
    store.getState().syncNodes(restyled);

    const a = store.getState().nodes?.[0];
    expect(a?.data.title).toBe('A renamed');
    expect(a?.className).toBe('rf-card-node--active');
  });

  it('drops a node whose card the projection no longer has', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().syncNodes([node('a', 10, 20)]);
    expect(store.getState().nodes?.map((n) => n.id)).toEqual(['a']);
  });

  it('ignores changes for nodes it does not own, and keeps the array stable', () => {
    // The runtime loop: React Flow measures anything it renders and reports a
    // `dimensions` change for it. `applyNodeChanges` always returns a fresh
    // array, so an unowned node's change re-syncs and re-measures forever.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    const before = store.getState().nodes;

    store
      .getState()
      .changeNodes([{ type: 'dimensions', id: 'ghost', dimensions: { width: 10, height: 10 } }]);

    expect(store.getState().nodes).toBe(before);
  });

  it('ignores changes that arrive before the first layout', () => {
    const store = createEditorStore();
    store.getState().changeNodes(drag('a', 500, 400));
    expect(store.getState().nodes).toBeNull();
    expect(store.getState().moved).toBe(false);
  });

  it('does not call a drag that ends where it started a move', () => {
    // A click registers as a position change; it must not invalidate the
    // layout's routed edge geometry.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store
      .getState()
      .changeNodes([{ type: 'position', id: 'a', position: { x: 10, y: 20 }, dragging: false }]);
    expect(store.getState().moved).toBe(false);
  });
});
