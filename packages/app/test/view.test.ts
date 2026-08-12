import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { buildLayoutStrategyGraph, loadSpace, type Space } from '@project/graph';
import { CARD_SIZE } from '../src/card';
import { resolveView } from '../src/view';
import { cardFile } from './card-files';

const CARDS = [
  cardFile('00000000-0000-4000-8000-000000000002'),
  cardFile('00000000-0000-4000-8000-000000000003'),
];
const GRAPHS = [
  {
    id: '00000000-0000-4000-8000-000000000004',
    title: 'Main',
    edges: [
      { from: '00000000-0000-4000-8000-000000000002', to: '00000000-0000-4000-8000-000000000003' },
    ],
  },
];

/** A second Graph, so "every Graph" is more than one. */
const TWO_GRAPHS = [
  ...GRAPHS,
  {
    id: '00000000-0000-4000-8000-000000000020',
    title: 'Aside',
    edges: [
      { from: '00000000-0000-4000-8000-000000000003', to: '00000000-0000-4000-8000-000000000002' },
    ],
  },
];

const WORKING = {
  id: '00000000-0000-4000-8000-000000000022',
  title: 'Working',
  kind: 'positioned',
  positions: {
    '00000000-0000-4000-8000-000000000002': { x: 40, y: 10 },
    '00000000-0000-4000-8000-000000000003': { x: 400, y: 250 },
  },
};

function spaceWith(extra: Record<string, unknown> = {}): Space {
  const result = loadSpace(
    {
      version: 2,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'T',
      graphs: GRAPHS,
      ...extra,
    },
    CARDS,
  );
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(', '));
  return result.space;
}

/** Run a resolved view's strategy over its space, so we test what it *does*. */
async function arrange(space: Space) {
  const view = resolveView(space);
  const graph = buildLayoutStrategyGraph(
    space.cards.map((c) => c.id),
    new Map(),
    [],
    CARD_SIZE,
  );
  const laid = await view.strategy(graph);
  return Object.fromEntries(laid.cards.map((c) => [c.id, { x: c.x, y: c.y }]));
}

describe('resolveView', () => {
  it('resolves an explicitly selected Algorithmic View without changing the Space default', async () => {
    const space = spaceWith({
      layouts: [WORKING],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });

    const view = resolveView(space, { kind: 'view', view: 'grid' });

    expect(view.id).toBe('grid');
    expect(view.layout).toBeNull();
    expect(view).not.toHaveProperty('automatic');
    expect(space.defaultView).toBe('00000000-0000-4000-8000-000000000022');
    const graph = buildLayoutStrategyGraph(
      space.cards.map((card) => card.id),
      new Map(),
      [],
      CARD_SIZE,
    );
    const laid = await view.strategy(graph);
    expect(laid.cards[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('resolves an explicitly selected Positioned Layout without changing the Space default', async () => {
    const space = spaceWith({ layouts: [WORKING], defaultView: 'grid' });

    const view = resolveView(space, {
      kind: 'layout',
      layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000022'),
    });

    expect(view.id).toBe('00000000-0000-4000-8000-000000000022');
    expect(view.layout?.title).toBe('Working');
    expect(space.defaultView).toBe('grid');
    const graph = buildLayoutStrategyGraph(
      space.cards.map((card) => card.id),
      new Map(),
      [],
      CARD_SIZE,
    );
    const laid = await view.strategy(graph);
    expect(laid.cards.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 40, y: 10 },
      { x: 400, y: 250 },
    ]);
  });

  it('rejects a selected Layout that the Space does not own', () => {
    expect(() =>
      resolveView(spaceWith(), {
        kind: 'layout',
        layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000099'),
      }),
    ).toThrow('The selected Layout 00000000-0000-4000-8000-000000000099 does not exist.');
  });

  it('falls back to the graph-driven Flow View when a Space names no View', () => {
    const view = resolveView(spaceWith());
    expect(view.id).toBe('flow');
    expect(view.layout).toBeNull();
  });

  it('resolves a declared Layout and carries its authored placement', () => {
    const view = resolveView(
      spaceWith({ layouts: [WORKING], defaultView: '00000000-0000-4000-8000-000000000022' }),
    );
    expect(view.id).toBe('00000000-0000-4000-8000-000000000022');
    expect(view.layout?.positions).toEqual(WORKING.positions);
  });

  it('places cards where a resolved Layout says', async () => {
    expect(
      await arrange(
        spaceWith({ layouts: [WORKING], defaultView: '00000000-0000-4000-8000-000000000022' }),
      ),
    ).toEqual({
      '00000000-0000-4000-8000-000000000002': { x: 40, y: 10 },
      '00000000-0000-4000-8000-000000000003': { x: 400, y: 250 },
    });
  });

  it('resolves the built-in grid, which is automatic and so carries no Layout', async () => {
    const space = spaceWith({ defaultView: 'grid' });
    expect(resolveView(space).layout).toBeNull();
    // The grid's own arithmetic, not ELK's: first card at the origin.
    expect((await arrange(space))['00000000-0000-4000-8000-000000000002']).toEqual({ x: 0, y: 0 });
  });

  it('ignores a declared Layout the space does not open in', () => {
    const view = resolveView(spaceWith({ layouts: [WORKING] }));
    expect(view.id).toBe('flow');
    expect(view.layout).toBeNull();
  });

  it('shows every graph and opens on the first under an Algorithmic View', () => {
    const space = spaceWith({ graphs: TWO_GRAPHS });
    const view = resolveView(space);
    expect(view.visibleGraphIds).toEqual([
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000020',
    ]);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000004');
  });

  it('shows every graph under a selected Layout too', () => {
    // A Layout draws every Graph the Space holds. It once named a subset, and
    // the answer is now the same one an Algorithmic View gives.
    const space = spaceWith({
      graphs: TWO_GRAPHS,
      layouts: [WORKING],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });
    const view = resolveView(space);
    expect(view.layout?.id).toBe('00000000-0000-4000-8000-000000000022');
    expect(view.visibleGraphIds).toEqual([
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000020',
    ]);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000004');
  });

  it('honours a Layout’s named activeGraph over the first', () => {
    const space = spaceWith({
      graphs: TWO_GRAPHS,
      layouts: [{ ...WORKING, activeGraph: '00000000-0000-4000-8000-000000000020' }],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });
    const view = resolveView(space);
    expect(view.visibleGraphIds).toEqual([
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000020',
    ]);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000020');
  });

  it('has no active graph in a space with none (ADR 0015)', () => {
    const view = resolveView(spaceWith({ graphs: [] }));
    expect(view.visibleGraphIds).toEqual([]);
    expect(view.activeGraphId).toBeNull();
  });

  it('opens a space with no graphs, which is where editing starts (ADR 0015)', async () => {
    const space = spaceWith({
      graphs: [],
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000035',
          title: 'W',
          kind: 'positioned',
          positions: { '00000000-0000-4000-8000-000000000002': { x: 7, y: 9 } },
        },
      ],
      defaultView: '00000000-0000-4000-8000-000000000035',
    });
    expect(resolveView(space).layout?.id).toBe('00000000-0000-4000-8000-000000000035');
    expect((await arrange(space))['00000000-0000-4000-8000-000000000002']).toEqual({ x: 7, y: 9 });
  });
});
