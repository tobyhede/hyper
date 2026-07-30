import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LayoutPoint } from '@project/graph';
import { createEditorStore } from '../src/editor';
import { completeDrag, moving, node, settled } from './editor-fixtures';

function authoredPositions(
  store: ReturnType<typeof createEditorStore>,
): ReadonlyMap<string, LayoutPoint> {
  const positions = store.getState().positions;
  if (positions === null) throw new Error('Expected authored positions');
  return positions;
}

const PROJECTED = [
  node('00000000-0000-4000-8000-000000000002', 10, 20),
  node('00000000-0000-4000-8000-000000000003', 300, 20),
];

describe('editor store', () => {
  it('notifies once after installing a completed Edit', () => {
    const observed: (ReadonlyMap<string, LayoutPoint> | null)[] = [];
    const store = createEditorStore(null, () => {
      observed.push(store.getState().positions);
    });
    store.getState().syncNodes(PROJECTED);

    completeDrag(store, '00000000-0000-4000-8000-000000000002', 500, 400);

    expect(observed).toEqual([
      new Map([
        ['00000000-0000-4000-8000-000000000002', { x: 500, y: 400 }],
        ['00000000-0000-4000-8000-000000000003', { x: 300, y: 20 }],
      ]),
    ]);
  });

  it('does not notify for intermediate frames, no-op settlement, or renderer navigation', () => {
    let notifications = 0;
    const store = createEditorStore(null, () => {
      notifications += 1;
    });
    store.getState().syncNodes(PROJECTED);

    store.getState().changeNodes(moving('00000000-0000-4000-8000-000000000002', 500, 400));
    store.getState().changeNodes(settled('00000000-0000-4000-8000-000000000002', 10, 20));
    store
      .getState()
      .selectRenderer(new Map([['00000000-0000-4000-8000-000000000002', { x: 700, y: 300 }]]));

    expect(notifications).toBe(0);
  });

  it('owns no nodes until the first layout resolves', () => {
    const store = createEditorStore();
    expect(store.getState().nodes).toBeNull();
    expect(store.getState().positions).toBeNull();
    expect(store.getState().dragOrigins.size).toBe(0);
  });

  it('keeps the first automatic arrangement runtime-only', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);

    expect(store.getState().nodes?.map((n) => n.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
    expect(store.getState().positions).toBeNull();
    expect(store.getState().dragOrigins.size).toBe(0);
    expect(store.getState().moved).toBe(false);
  });

  it('converts when settlement repeats the last moving frame', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);

    store.getState().changeNodes(moving('00000000-0000-4000-8000-000000000002', 500, 400));
    expect(store.getState().positions).toBeNull();
    expect(store.getState().dragOrigins.get('00000000-0000-4000-8000-000000000002')).toEqual({
      x: 10,
      y: 20,
    });

    store.getState().changeNodes(settled('00000000-0000-4000-8000-000000000002', 500, 400));
    expect(authoredPositions(store)).toEqual(
      new Map([
        ['00000000-0000-4000-8000-000000000002', { x: 500, y: 400 }],
        ['00000000-0000-4000-8000-000000000003', { x: 300, y: 20 }],
      ]),
    );
    expect(store.getState().dragOrigins.size).toBe(0);
  });

  it('does not convert when a drag returns to its gesture origin', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes(moving('00000000-0000-4000-8000-000000000002', 500, 400));
    store.getState().changeNodes(settled('00000000-0000-4000-8000-000000000002', 10, 20));

    expect(store.getState().positions).toBeNull();
    expect(store.getState().dragOrigins.size).toBe(0);
    expect(store.getState().moved).toBe(false);
  });

  it('uses the pre-callback position for a settled-only change', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes(settled('00000000-0000-4000-8000-000000000002', 500, 400));

    expect(authoredPositions(store).get('00000000-0000-4000-8000-000000000002')).toEqual({
      x: 500,
      y: 400,
    });
  });

  it('records where a drag ends, and moves nothing else', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    completeDrag(store, '00000000-0000-4000-8000-000000000002', 500, 400);

    expect(authoredPositions(store).get('00000000-0000-4000-8000-000000000002')).toEqual({
      x: 500,
      y: 400,
    });
    expect(authoredPositions(store).get('00000000-0000-4000-8000-000000000003')).toEqual({
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
    store.getState().changeNodes(moving('00000000-0000-4000-8000-000000000002', 77, 88));

    expect(
      store.getState().nodes?.find((n) => n.id === '00000000-0000-4000-8000-000000000002')
        ?.position,
    ).toEqual({ x: 77, y: 88 });
    expect(store.getState().positions).toBeNull();
    expect(store.getState().moved).toBe(false);
  });

  it('records a subsequent drag against its own origin after conversion', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    completeDrag(store, '00000000-0000-4000-8000-000000000002', 500, 400);
    completeDrag(store, '00000000-0000-4000-8000-000000000003', 700, 450);

    expect(authoredPositions(store)).toEqual(
      new Map([
        ['00000000-0000-4000-8000-000000000002', { x: 500, y: 400 }],
        ['00000000-0000-4000-8000-000000000003', { x: 700, y: 450 }],
      ]),
    );
  });

  it('keeps a dragged position when the projection is re-synced', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    completeDrag(store, '00000000-0000-4000-8000-000000000002', 500, 400);
    store.getState().syncNodes(PROJECTED);

    expect(
      store.getState().nodes?.find((n) => n.id === '00000000-0000-4000-8000-000000000002')
        ?.position,
    ).toEqual({ x: 500, y: 400 });
    expect(authoredPositions(store).get('00000000-0000-4000-8000-000000000002')).toEqual({
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

  it('converts exactly the current projection after cards were added and removed', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store
      .getState()
      .syncNodes([
        node('00000000-0000-4000-8000-000000000003', 300, 20),
        node('00000000-0000-4000-8000-000000000004', 600, 20),
      ]);

    completeDrag(store, '00000000-0000-4000-8000-000000000003', 350, 90);

    expect(authoredPositions(store)).toEqual(
      new Map([
        ['00000000-0000-4000-8000-000000000003', { x: 350, y: 90 }],
        ['00000000-0000-4000-8000-000000000004', { x: 600, y: 20 }],
      ]),
    );
  });

  it('starts a positioned view from its existing sparse authored placement', () => {
    const initial = new Map([['00000000-0000-4000-8000-000000000002', { x: 10, y: 20 }]]);
    const store = createEditorStore(initial);
    store.getState().syncNodes(PROJECTED);

    expect(authoredPositions(store)).toEqual(initial);
    expect(authoredPositions(store).has('00000000-0000-4000-8000-000000000003')).toBe(false);
  });

  it('navigates to another renderer without recording an edit', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes(moving('00000000-0000-4000-8000-000000000002', 90, 80));
    const positioned = new Map([['00000000-0000-4000-8000-000000000002', { x: 700, y: 300 }]]);

    store.getState().selectRenderer(positioned);

    expect(store.getState().nodes).toBeNull();
    expect(store.getState().positions).toEqual(positioned);
    expect(store.getState().dragOrigins.size).toBe(0);
    expect(store.getState().moved).toBe(false);

    store.getState().selectRenderer(null);
    expect(store.getState().positions).toBeNull();
  });

  it('ignores changes for nodes it does not own, and keeps the array stable', () => {
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
    store.getState().changeNodes(moving('00000000-0000-4000-8000-000000000002', 500, 400));
    store.getState().changeNodes(settled('00000000-0000-4000-8000-000000000002', 500, 400));
    expect(store.getState().nodes).toBeNull();
    expect(store.getState().positions).toBeNull();
    expect(store.getState().moved).toBe(false);
  });

  it('does not call a drag that ends where it started a move', () => {
    const store = createEditorStore();
    store.getState().syncNodes(PROJECTED);
    store.getState().changeNodes(settled('00000000-0000-4000-8000-000000000002', 10, 20));
    expect(store.getState().positions).toBeNull();
    expect(store.getState().moved).toBe(false);
  });
});

const coordinateArb = fc.integer({ min: -10_000, max: 10_000 });
const liveNodesArb = fc.uniqueArray(
  fc.record({ id: fc.uuid(), x: coordinateArb, y: coordinateArb }),
  { selector: ({ id }) => id, minLength: 1, maxLength: 12 },
);

describe('editor conversion properties', () => {
  it('promotes every current live node and overlays the first completed movement', () => {
    fc.assert(
      fc.property(
        liveNodesArb,
        fc.nat(),
        fc.integer({ min: 1, max: 1000 }),
        (rows, rawIndex, delta) => {
          const projected = rows.map(({ id, x, y }) => node(id, x, y));
          const target = projected[rawIndex % projected.length]!;
          const destination = { x: target.position.x + delta, y: target.position.y - delta };
          const store = createEditorStore();
          store.getState().syncNodes(projected);

          store.getState().changeNodes(moving(target.id, destination.x, destination.y));
          expect(store.getState().positions).toBeNull();
          store.getState().changeNodes(settled(target.id, destination.x, destination.y));

          const expected = new Map<string, LayoutPoint>(
            projected.map((candidate): [string, LayoutPoint] => [
              candidate.id,
              candidate.id === target.id ? destination : { ...candidate.position },
            ]),
          );
          expect(authoredPositions(store)).toEqual(expected);
          expect(store.getState().dragOrigins.size).toBe(0);
        },
      ),
    );
  });

  it('never converts a drag that returns to its generated origin', () => {
    fc.assert(
      fc.property(
        liveNodesArb,
        fc.nat(),
        fc.integer({ min: 1, max: 1000 }),
        (rows, rawIndex, delta) => {
          const projected = rows.map(({ id, x, y }) => node(id, x, y));
          const target = projected[rawIndex % projected.length]!;
          const store = createEditorStore();
          store.getState().syncNodes(projected);

          store
            .getState()
            .changeNodes(moving(target.id, target.position.x + delta, target.position.y));
          store.getState().changeNodes(settled(target.id, target.position.x, target.position.y));

          expect(store.getState().positions).toBeNull();
          expect(store.getState().dragOrigins.size).toBe(0);
        },
      ),
    );
  });
});
