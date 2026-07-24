import { describe, expect, it } from 'vitest';
import { spaceFileSchema, type SpaceFile } from '@project/core';
import { loadSpace } from '@project/graph';
import { serializeLayout } from '../src/persist';
import { cardFile } from './card-files';

const BASE: SpaceFile = {
  version: 1,
  id: 's',
  title: 'T',
  routes: [{ id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }] }],
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
    );

    expect(next.layouts).toEqual([
      {
        id: 'layout',
        title: 'Layout',
        kind: 'positioned',
        positions: { a: { x: 10, y: 20 }, b: { x: 300, y: 40 } },
      },
    ]);
    // The point of writing it: the space reopens in this Layout rather than
    // recomputing an automatic one.
    expect(next.defaultView).toBe('layout');
  });

  it('produces a file that passes the schema and re-parses through loadSpace', () => {
    // Acceptance: what the writer emits is a real space file, not a lookalike.
    const next = serializeLayout(BASE, 'layout', 'Layout', positions({ a: [10, 20] }));

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
    const next = serializeLayout(withLayout, 'layout', 'Layout', positions({ a: [99, 99] }));

    expect(next.layouts).toHaveLength(1);
    expect(next.layouts?.[0]?.positions).toEqual({ a: { x: 99, y: 99 } });
  });

  it('keeps the space id through a save and reload', () => {
    // `serializeLayout` spreads the base file, so the id rides along — worth an
    // assertion rather than an assumption, since losing it on save would make a
    // saved space anonymous.
    const next = serializeLayout(BASE, 'layout', 'Layout', positions({ a: [1, 2] }));
    expect(next.id).toBe(BASE.id);

    const reloaded = loadSpace(next, CARDS);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(reloaded.space.id).toBe(BASE.id);
  });

  it('keeps other layouts a space already had', () => {
    const withOther: SpaceFile = {
      ...BASE,
      layouts: [{ id: 'other', title: 'Other', kind: 'positioned', positions: {} }],
    };
    const next = serializeLayout(withOther, 'layout', 'Layout', positions({ a: [1, 2] }));

    expect(next.layouts?.map((l) => l.id).sort()).toEqual(['layout', 'other']);
  });
});
