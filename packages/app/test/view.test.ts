import { describe, expect, it } from 'vitest';
import { buildLayoutGraph, loadSpace, type Space } from '@project/graph';
import { CARD_SIZE } from '../src/card';
import { resolveView } from '../src/view';
import { cardFile } from './card-files';

const CARDS = [cardFile('a'), cardFile('b')];
const ROUTES = [{ id: 'main', title: 'Main', edges: [{ from: 'a', to: 'b' }] }];

const WORKING = {
  id: 'working',
  title: 'Working',
  kind: 'positioned',
  positions: { a: { x: 40, y: 10 }, b: { x: 400, y: 250 } },
};

function spaceWith(extra: Record<string, unknown> = {}): Space {
  const result = loadSpace(
    {
      version: 1,
      id: 's',
      title: 'T',
      routes: ROUTES,
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

  it('gives a positioned view an automatic strategy to Auto-arrange with', async () => {
    // A Layout says where the cards are, not how they got there — so recomputing
    // falls back to the view a space opens in when it names none.
    const view = resolveView(spaceWith({ layouts: [WORKING], defaultView: 'working' }));
    const graph = buildLayoutGraph(['a', 'b'], new Map(), [], CARD_SIZE);

    const laid = await view.automatic(graph);
    expect(laid.cards.map((c) => ({ x: c.x, y: c.y }))).not.toEqual([
      { x: 40, y: 10 },
      { x: 400, y: 250 },
    ]);
  });

  it('re-arranges an automatic view by the strategy it already uses', () => {
    // A grid view Auto-arranges by the grid, not by ELK.
    const view = resolveView(spaceWith({ defaultView: 'grid' }));
    expect(view.automatic).toBe(view.strategy);
  });

  it('shows every route and opens on the first when no Layout filters', () => {
    const space = spaceWith({
      routes: [...ROUTES, { id: 'aside', title: 'Aside', edges: [{ from: 'b', to: 'a' }] }],
    });
    const view = resolveView(space);
    expect(view.visibleRouteIds).toEqual(['main', 'aside']);
    expect(view.activeRouteId).toBe('main');
  });

  it('shows only the routes its Layout names', () => {
    const space = spaceWith({
      routes: [...ROUTES, { id: 'aside', title: 'Aside', edges: [{ from: 'b', to: 'a' }] }],
      layouts: [{ ...WORKING, routes: ['aside'] }],
      defaultView: 'working',
    });
    const view = resolveView(space);
    expect(view.visibleRouteIds).toEqual(['aside']);
  });

  it('opens on the first *visible* route, not the space’s first', () => {
    // The filter is what the fallback runs over. Reading it off the space would
    // open active on a route the Layout does not draw.
    const space = spaceWith({
      routes: [...ROUTES, { id: 'aside', title: 'Aside', edges: [{ from: 'b', to: 'a' }] }],
      layouts: [{ ...WORKING, routes: ['aside'] }],
      defaultView: 'working',
    });
    expect(resolveView(space).activeRouteId).toBe('aside');
  });

  it('honours a Layout’s named activeRoute over the first', () => {
    const space = spaceWith({
      routes: [...ROUTES, { id: 'aside', title: 'Aside', edges: [{ from: 'b', to: 'a' }] }],
      layouts: [{ ...WORKING, activeRoute: 'aside' }],
      defaultView: 'working',
    });
    const view = resolveView(space);
    expect(view.visibleRouteIds).toEqual(['main', 'aside']);
    expect(view.activeRouteId).toBe('aside');
  });

  it('has no active route in a space with none (ADR 0015)', () => {
    const view = resolveView(spaceWith({ routes: [] }));
    expect(view.visibleRouteIds).toEqual([]);
    expect(view.activeRouteId).toBeNull();
  });

  it('has no active route when a Layout shows none', () => {
    // Empty is not absent: absent means every route, empty means this layout
    // draws no routes at all, and there is then nothing to be active.
    const space = spaceWith({
      layouts: [{ ...WORKING, routes: [] }],
      defaultView: 'working',
    });
    expect(resolveView(space).activeRouteId).toBeNull();
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
