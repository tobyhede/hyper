import { describe, expect, it } from 'vitest';
import { buildLayoutGraph, loadSpace, type Space } from '@project/graph';
import { CARD_SIZE } from '../src/card';
import { resolveView } from '../src/view';

const CARDS = [
  { id: 'a', title: 'A', kind: 'markdown', content: 'a.md' },
  { id: 'b', title: 'B', kind: 'markdown', content: 'b.md' },
];
const ROUTES = [{ id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }] }];

const WORKING = {
  id: 'working',
  title: 'Working',
  kind: 'positioned',
  positions: { a: { x: 40, y: 10 }, b: { x: 400, y: 250 } },
};

function spaceWith(extra: Record<string, unknown> = {}): Space {
  const result = loadSpace({ version: 1, title: 'T', cards: CARDS, routes: ROUTES, ...extra });
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(', '));
  return result.space;
}

/** Run a resolved view's strategy over its space, so we test what it *does*. */
async function arrange(space: Space) {
  const view = resolveView(space);
  const graph = buildLayoutGraph(
    space.cards.map((c) => c.id),
    new Map(),
    [],
    CARD_SIZE,
  );
  const laid = await view.strategy(graph);
  return Object.fromEntries(laid.cards.map((c) => [c.id, { x: c.x, y: c.y }]));
}

describe('resolveView', () => {
  it('falls back to the route-driven graph when a space names no view', () => {
    const view = resolveView(spaceWith());
    expect(view.id).toBe('graph');
    expect(view.layout).toBeNull();
  });

  it('resolves a declared Layout, and carries it as the permission to edit', () => {
    const view = resolveView(spaceWith({ layouts: [WORKING], defaultView: 'working' }));
    expect(view.id).toBe('working');
    expect(view.layout?.positions).toEqual(WORKING.positions);
  });

  it('places cards where a resolved Layout says', async () => {
    expect(await arrange(spaceWith({ layouts: [WORKING], defaultView: 'working' }))).toEqual({
      a: { x: 40, y: 10 },
      b: { x: 400, y: 250 },
    });
  });

  it('resolves the built-in grid, which is automatic and so read-only', async () => {
    const space = spaceWith({ defaultView: 'grid' });
    expect(resolveView(space).layout).toBeNull();
    // The grid's own arithmetic, not ELK's: first card at the origin.
    expect((await arrange(space))['a']).toEqual({ x: 0, y: 0 });
  });

  it('ignores a declared Layout the space does not open in', () => {
    const view = resolveView(spaceWith({ layouts: [WORKING] }));
    expect(view.id).toBe('graph');
    expect(view.layout).toBeNull();
  });

  it('lets a declared Layout shadow a built-in of the same name', () => {
    // `loadSpace` permits the collision; which one wins is a resolution
    // decision, and the space's own data outranks a reserved word.
    const shadow = { ...WORKING, id: 'grid' };
    const view = resolveView(spaceWith({ layouts: [shadow], defaultView: 'grid' }));
    expect(view.layout?.id).toBe('grid');
  });

  it('opens a space with no routes, which is where editing starts (ADR 0015)', async () => {
    const space = spaceWith({
      routes: [],
      layouts: [{ id: 'w', title: 'W', kind: 'positioned', positions: { a: { x: 7, y: 9 } } }],
      defaultView: 'w',
    });
    expect(resolveView(space).layout?.id).toBe('w');
    expect((await arrange(space))['a']).toEqual({ x: 7, y: 9 });
  });
});
