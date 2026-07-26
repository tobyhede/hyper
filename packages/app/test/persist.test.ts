import { describe, expect, it } from 'vitest';
import { spaceFileSchema, type SpaceFile } from '@project/core';
import { loadSpace } from '@project/graph';
import { serializeLayout } from '../src/persist';
import { cardFile } from './card-files';

const BASE: SpaceFile = {
  version: 1,
  id: 's',
  title: 'T',
  routes: [{ id: 'main', title: 'Main', edges: [{ from: 'a', to: 'b' }] }],
};

const CARDS = [cardFile('a'), cardFile('b')];

const positions = (entries: Record<string, [number, number]>) =>
  new Map(Object.entries(entries).map(([id, [x, y]]) => [id, { x, y }]));

describe('serializeLayout', () => {
  it('writes the positions as the active Layout and opens the space in it', () => {
    const next = serializeLayout(
      BASE,
      'layout',
      'Layout',
      positions({ a: [10, 20], b: [300, 40] }),
      'main',
    );

    expect(next.layouts).toEqual([
      {
        id: 'layout',
        title: 'Layout',
        kind: 'positioned',
        positions: { a: { x: 10, y: 20 }, b: { x: 300, y: 40 } },
        activeRoute: 'main',
      },
    ]);
    // The point of writing it: the space reopens in this Layout rather than
    // recomputing an automatic one.
    expect(next.defaultView).toBe('layout');
  });

  it('produces a file that passes the schema and re-parses through loadSpace', () => {
    // Acceptance: what the writer emits is a real space file, not a lookalike.
    const next = serializeLayout(BASE, 'layout', 'Layout', positions({ a: [10, 20] }), 'main');

    expect(spaceFileSchema.safeParse(next).success).toBe(true);
    const loaded = loadSpace(next, CARDS);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.space.defaultView).toBe('layout');
  });

  it('replaces a Layout of the same id rather than appending a second', () => {
    const withLayout: SpaceFile = {
      ...BASE,
      layouts: [
        { id: 'layout', title: 'Layout', kind: 'positioned', positions: { a: { x: 0, y: 0 } } },
      ],
      defaultView: 'layout',
    };
    const next = serializeLayout(
      withLayout,
      'layout',
      'Layout',
      positions({ a: [99, 99] }),
      'main',
    );

    expect(next.layouts).toHaveLength(1);
    expect(next.layouts?.[0]?.positions).toEqual({ a: { x: 99, y: 99 } });
  });

  it('keeps the space id through a save and reload', () => {
    // `serializeLayout` spreads the base file, so the id rides along — worth an
    // assertion rather than an assumption, since losing it on save would make a
    // saved space anonymous.
    const next = serializeLayout(BASE, 'layout', 'Layout', positions({ a: [1, 2] }), 'main');
    expect(next.id).toBe(BASE.id);

    const reloaded = loadSpace(next, CARDS);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(reloaded.space.id).toBe(BASE.id);
  });

  it('names the active route outright, rather than leaving it to route order', () => {
    // ADR 0028: resolving an absent `activeRoute` to the first visible route is a
    // read. What the app writes says which route it is, so reordering the space's
    // routes afterwards cannot change what reopens active.
    const twoRoutes: SpaceFile = {
      ...BASE,
      routes: [...BASE.routes, { id: 'aside', title: 'Aside', edges: [{ from: 'b', to: 'a' }] }],
    };
    const next = serializeLayout(twoRoutes, 'layout', 'Layout', positions({ a: [1, 2] }), 'aside');
    expect(next.layouts?.[0]?.activeRoute).toBe('aside');
    expect(loadSpace(next, CARDS).ok).toBe(true);
  });

  it('writes no active route for a space that has none (ADR 0015)', () => {
    const routeless: SpaceFile = { ...BASE, routes: [] };
    const next = serializeLayout(routeless, 'layout', 'Layout', positions({ a: [1, 2] }), null);
    expect(next.layouts?.[0]).not.toHaveProperty('activeRoute');
    expect(spaceFileSchema.safeParse(next).success).toBe(true);
  });

  it('carries an authored route filter through a save that never authored one', () => {
    // Positions are replaced because the store holds the whole truth of them.
    // The filter is authored and the app has no surface for writing one, so
    // replacing the layout wholesale would delete it — a save silently
    // discarding authored content.
    const filtered: SpaceFile = {
      ...BASE,
      layouts: [
        {
          id: 'layout',
          title: 'Layout',
          kind: 'positioned',
          positions: { a: { x: 0, y: 0 } },
          routes: ['main'],
        },
      ],
    };
    const next = serializeLayout(filtered, 'layout', 'Layout', positions({ a: [5, 5] }), 'main');
    expect(next.layouts?.[0]?.routes).toEqual(['main']);
    expect(next.layouts?.[0]?.positions).toEqual({ a: { x: 5, y: 5 } });
  });

  it('keeps other layouts a space already had', () => {
    const withOther: SpaceFile = {
      ...BASE,
      layouts: [{ id: 'other', title: 'Other', kind: 'positioned', positions: {} }],
    };
    const next = serializeLayout(withOther, 'layout', 'Layout', positions({ a: [1, 2] }), 'main');

    expect(next.layouts?.map((l) => l.id).sort()).toEqual(['layout', 'other']);
  });
});
