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
const MAIN = {
  id: '00000000-0000-4000-8000-000000000004',
  title: 'Main',
  edges: [
    { from: '00000000-0000-4000-8000-000000000002', to: '00000000-0000-4000-8000-000000000003' },
  ],
};

/** A second Graph, so "every Graph" is more than one. */
const ASIDE = {
  id: '00000000-0000-4000-8000-000000000020',
  title: 'Aside',
  edges: [
    { from: '00000000-0000-4000-8000-000000000003', to: '00000000-0000-4000-8000-000000000002' },
  ],
};

const POSITIONS = {
  '00000000-0000-4000-8000-000000000002': { x: 40, y: 10 },
  '00000000-0000-4000-8000-000000000003': { x: 400, y: 250 },
};

/** The Layout under test, owning one Graph unless a case says otherwise. */
const WORKING = {
  id: '00000000-0000-4000-8000-000000000022',
  title: 'Working',
  kind: 'positioned',
  positions: POSITIONS,
  graphs: [MAIN],
};

/** The same Layout owning both Graphs. */
const WORKING_TWO = { ...WORKING, graphs: [MAIN, ASIDE] };

/** A second Layout over the same Cards, owning the other Graph. */
const SECOND = {
  id: '00000000-0000-4000-8000-000000000023',
  title: 'Second',
  kind: 'positioned',
  positions: {
    '00000000-0000-4000-8000-000000000002': { x: 0, y: 600 },
    '00000000-0000-4000-8000-000000000003': { x: 320, y: 600 },
  },
  graphs: [ASIDE],
};

function spaceWith(extra: Record<string, unknown> = {}): Space {
  const result = loadSpace(
    {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'T',
      layouts: [WORKING],
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
    const space = spaceWith({ defaultView: '00000000-0000-4000-8000-000000000022' });

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
    const space = spaceWith({ defaultView: 'grid' });

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
    const view = resolveView(spaceWith({ defaultView: '00000000-0000-4000-8000-000000000022' }));
    expect(view.id).toBe('00000000-0000-4000-8000-000000000022');
    expect(view.layout?.positions).toEqual(POSITIONS);
  });

  it('places cards where a resolved Layout says', async () => {
    expect(
      await arrange(spaceWith({ defaultView: '00000000-0000-4000-8000-000000000022' })),
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
    const view = resolveView(spaceWith());
    expect(view.id).toBe('flow');
    expect(view.layout).toBeNull();
  });

  it('shows every graph and opens on the first under an Algorithmic View', () => {
    const space = spaceWith({ layouts: [WORKING_TWO] });
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
      layouts: [WORKING_TWO],
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
      layouts: [{ ...WORKING_TWO, activeGraph: '00000000-0000-4000-8000-000000000020' }],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });
    const view = resolveView(space);
    expect(view.visibleGraphIds).toEqual([
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000020',
    ]);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000020');
  });

  it('has no active graph in a space with no Layouts (ADR 0015)', () => {
    // A Layout owns at least one Graph (ADR 0040), so "no graphs" and "no
    // Layouts" are now the same state — and it is where editing starts.
    const view = resolveView(spaceWith({ layouts: [] }));
    expect(view.visibleGraphIds).toEqual([]);
    expect(view.activeGraphId).toBeNull();
  });

  it('opens the smallest Layout an author can draw — one Card, one self-Edge', async () => {
    const space = spaceWith({
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000035',
          title: 'W',
          kind: 'positioned',
          positions: { '00000000-0000-4000-8000-000000000002': { x: 7, y: 9 } },
          graphs: [
            {
              id: '00000000-0000-4000-8000-000000000036',
              title: 'Graph 1',
              edges: [
                {
                  from: '00000000-0000-4000-8000-000000000002',
                  to: '00000000-0000-4000-8000-000000000002',
                },
              ],
            },
          ],
        },
      ],
      defaultView: '00000000-0000-4000-8000-000000000035',
    });
    expect(resolveView(space).layout?.id).toBe('00000000-0000-4000-8000-000000000035');
    expect((await arrange(space))['00000000-0000-4000-8000-000000000002']).toEqual({ x: 7, y: 9 });
  });

  it('answers a selected Layout with the Graphs it owns, not the Space flatten', () => {
    // Ownership is what a Layout's answer now means. `Aside` belongs to a
    // second Layout and is in `space.graphs`, so a resolution still reading the
    // flatten would draw it here — over Cards this Layout may not even hold.
    const space = spaceWith({
      layouts: [WORKING, SECOND],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });
    const view = resolveView(space);

    expect(view.layout?.id).toBe('00000000-0000-4000-8000-000000000022');
    expect(view.visibleGraphIds).toEqual(['00000000-0000-4000-8000-000000000004']);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000004');
  });

  it('answers an Algorithmic View with the flatten across every Layout', () => {
    // Its subject is the Space's Cards, so it draws every Graph in the Space
    // flattened across the Layouts that own them (ADR 0045) — derived, never
    // stored, and closed for free because every endpoint is a Space Card.
    const space = spaceWith({ layouts: [WORKING, SECOND] });
    const view = resolveView(space);

    expect(view.id).toBe('flow');
    expect(view.visibleGraphIds).toEqual([
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000020',
    ]);
    expect(view.activeGraphId).toBe('00000000-0000-4000-8000-000000000004');
  });

  it('opens a selected Layout on its own first Graph, not the Space’s', () => {
    // The fallback runs over what the view draws, or a Layout would open active
    // on a Graph it does not own.
    const space = spaceWith({
      layouts: [SECOND, WORKING],
      defaultView: '00000000-0000-4000-8000-000000000022',
    });

    expect(resolveView(space).activeGraphId).toBe('00000000-0000-4000-8000-000000000004');
  });
});
