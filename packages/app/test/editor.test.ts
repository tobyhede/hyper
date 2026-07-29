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
      showContent: false,
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

const PROJECTED = [
  node('00000000-0000-4000-8000-000000000002', 10, 20),
  node('00000000-0000-4000-8000-000000000003', 300, 20),
];

describe('editor store', () => {
  it('owns no nodes until the first layout resolves', () => {
    const store = createEditorStore();
    expect(store.getState().nodes).toBeNull();
    expect(store.getState().positions.size).toBe(0);
  });

  it('stages the first resolved arrangement for conversion (ADR 0025)', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);

    expect(store.getState().nodes?.map((n) => n.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
    expect(store.getState().positions.get('00000000-0000-4000-8000-000000000002')).toEqual({
      x: 10,
      y: 20,
    });
    expect(store.getState().positions.get('00000000-0000-4000-8000-000000000003')).toEqual({
      x: 300,
      y: 20,
    });
    // Staged before any gesture — nothing has moved or been edited yet.
    expect(store.getState().moved).toBe(false);
  });

  it('records where a drag ends, and moves nothing else', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes(drag('00000000-0000-4000-8000-000000000002', 500, 400));

    expect(store.getState().positions.get('00000000-0000-4000-8000-000000000002')).toEqual({
      x: 500,
      y: 400,
    });
    expect(store.getState().positions.get('00000000-0000-4000-8000-000000000003')).toEqual({
      x: 300,
      y: 20,
    });
    expect(
      store.getState().nodes?.find((n) => n.id === '00000000-0000-4000-8000-000000000002')
        ?.position,
    ).toEqual({ x: 500, y: 400 });
    expect(store.getState().moved).toBe(true);
  });

  it('follows the cursor mid-drag without recording it', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes([
      {
        type: 'position',
        id: '00000000-0000-4000-8000-000000000002',
        position: { x: 77, y: 88 },
        dragging: true,
      },
    ]);

    // The node moves, so the card tracks the pointer in a controlled flow...
    expect(
      store.getState().nodes?.find((n) => n.id === '00000000-0000-4000-8000-000000000002')
        ?.position,
    ).toEqual({ x: 77, y: 88 });
    // ...but a gesture in flight is not a placement.
    expect(store.getState().positions.get('00000000-0000-4000-8000-000000000002')).toEqual({
      x: 10,
      y: 20,
    });
    expect(store.getState().moved).toBe(false);
  });

  it('keeps a dragged position when the projection is re-synced', () => {
    // The regression this guards: `App` re-projects on every selection or
    // emphasis change, and a naive assignment would stamp the drag away.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes(drag('00000000-0000-4000-8000-000000000002', 500, 400));
    store.getState().syncNodes(PROJECTED);

    expect(
      store.getState().nodes?.find((n) => n.id === '00000000-0000-4000-8000-000000000002')
        ?.position,
    ).toEqual({ x: 500, y: 400 });
    expect(store.getState().positions.get('00000000-0000-4000-8000-000000000002')).toEqual({
      x: 500,
      y: 400,
    });
  });

  it('takes fresh data and styling from the projection', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    const restyled = [
      {
        ...node('00000000-0000-4000-8000-000000000002', 10, 20, 'A renamed'),
        className: 'rf-card-node--active',
      },
    ];
    store.getState().syncNodes(restyled);

    const a = store.getState().nodes?.[0];
    expect(a?.data.title).toBe('A renamed');
    expect(a?.className).toBe('rf-card-node--active');
  });

  it('drops a node whose card the projection no longer has', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().syncNodes([node('00000000-0000-4000-8000-000000000002', 10, 20)]);
    expect(store.getState().nodes?.map((n) => n.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
    ]);
  });

  it('ignores changes for nodes it does not own, and keeps the array stable', () => {
    // The runtime loop: React Flow measures anything it renders and reports a
    // `dimensions` change for it. `applyNodeChanges` always returns a fresh
    // array, so an unowned node's change re-syncs and re-measures forever.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    const before = store.getState().nodes;

    store.getState().changeNodes([
      {
        type: 'dimensions',
        id: '00000000-0000-4000-8000-000000000099',
        dimensions: { width: 10, height: 10 },
      },
    ]);

    expect(store.getState().nodes).toBe(before);
  });

  it('ignores changes that arrive before the first layout', () => {
    const store = createEditorStore();
    store.getState().changeNodes(drag('00000000-0000-4000-8000-000000000002', 500, 400));
    expect(store.getState().nodes).toBeNull();
    expect(store.getState().moved).toBe(false);
  });

  it('replaces the whole map when arranging, rather than merging into it', () => {
    // The point of pressing Auto-arrange is that a card dragged out of the way
    // comes back. A merge would leave it exactly where it was.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes(drag('00000000-0000-4000-8000-000000000002', 900, 900));

    store.getState().arrange(
      new Map([
        ['00000000-0000-4000-8000-000000000002', { x: 0, y: 0 }],
        ['00000000-0000-4000-8000-000000000003', { x: 400, y: 0 }],
      ]),
    );

    expect(store.getState().positions.get('00000000-0000-4000-8000-000000000002')).toEqual({
      x: 0,
      y: 0,
    });
    expect(
      store.getState().nodes?.find((n) => n.id === '00000000-0000-4000-8000-000000000002')
        ?.position,
    ).toEqual({ x: 0, y: 0 });
    expect(store.getState().positions.get('00000000-0000-4000-8000-000000000003')).toEqual({
      x: 400,
      y: 0,
    });
  });

  it('drops a position the arrangement does not name', () => {
    // A Layout's map is sparse, and arranging replaces it wholesale — so a card
    // the strategy left unplaced is unplaced, not left holding a stale entry.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().arrange(new Map([['00000000-0000-4000-8000-000000000002', { x: 0, y: 0 }]]));

    expect(store.getState().positions.has('00000000-0000-4000-8000-000000000003')).toBe(false);
    expect([...store.getState().positions.keys()]).toEqual([
      '00000000-0000-4000-8000-000000000002',
    ]);
  });

  it('trusts the layout again after arranging', () => {
    // The routing that arrives with an arrangement describes that arrangement, so
    // the cards are back where it assumed they were.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes(drag('00000000-0000-4000-8000-000000000002', 900, 900));
    expect(store.getState().moved).toBe(true);

    store.getState().arrange(new Map([['00000000-0000-4000-8000-000000000002', { x: 10, y: 20 }]]));
    expect(store.getState().moved).toBe(false);
  });

  it('ignores an arrangement that arrives before the first layout', () => {
    const store = createEditorStore();
    store.getState().arrange(new Map([['00000000-0000-4000-8000-000000000002', { x: 0, y: 0 }]]));
    expect(store.getState().nodes).toBeNull();
    expect(store.getState().positions.size).toBe(0);
  });

  it('does not call a drag that ends where it started a move', () => {
    // A click registers as a position change; it must not invalidate the
    // layout's routed edge geometry.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes([
      {
        type: 'position',
        id: '00000000-0000-4000-8000-000000000002',
        position: { x: 10, y: 20 },
        dragging: false,
      },
    ]);
    expect(store.getState().moved).toBe(false);
  });

  it('counts a real edit but not the initial arrangement sync', () => {
    // `revision` triggers persistence. It must stay 0 through the initial sync —
    // a load is not an edit — and tick on a moving drag.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    expect(store.getState().revision).toBe(0);

    store.getState().changeNodes(drag('00000000-0000-4000-8000-000000000002', 500, 400));
    expect(store.getState().revision).toBe(1);

    store.getState().arrange(new Map([['00000000-0000-4000-8000-000000000002', { x: 0, y: 0 }]]));
    expect(store.getState().revision).toBe(2);
  });

  it('does not count a settled change that moved nothing', () => {
    // A click ends where it began; there is nothing to persist.
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes([
      {
        type: 'position',
        id: '00000000-0000-4000-8000-000000000002',
        position: { x: 10, y: 20 },
        dragging: false,
      },
    ]);
    expect(store.getState().revision).toBe(0);
  });
});
