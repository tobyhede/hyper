import { afterEach, describe, expect, it, vi } from 'vitest';
import { spaceFileSchema, type Card, type SpaceFile } from '@project/core';
import { loadSpace } from '@project/graph';
import { saveSpace, serializeLayout } from '../src/persist';
import { cardFile } from './card-files';

const BASE: SpaceFile = {
  version: 2,
  id: '00000000-0000-4000-8000-000000000001',
  title: 'T',
  routes: [
    {
      id: '00000000-0000-4000-8000-000000000004',
      title: 'Main',
      edges: [
        {
          from: '00000000-0000-4000-8000-000000000002',
          to: '00000000-0000-4000-8000-000000000003',
        },
      ],
    },
  ],
};

const CARDS = [
  cardFile('00000000-0000-4000-8000-000000000002'),
  cardFile('00000000-0000-4000-8000-000000000003'),
];

const positions = (entries: Record<string, [number, number]>) =>
  new Map(Object.entries(entries).map(([id, [x, y]]) => [id, { x, y }]));

describe('serializeLayout', () => {
  it('writes the positions as the active Layout and opens the space in it', () => {
    const next = serializeLayout(
      BASE,
      '00000000-0000-4000-8000-000000000021',
      'Layout',
      positions({
        '00000000-0000-4000-8000-000000000002': [10, 20],
        '00000000-0000-4000-8000-000000000003': [300, 40],
      }),
      '00000000-0000-4000-8000-000000000004',
    );

    expect(next.layouts).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000021',
        title: 'Layout',
        kind: 'positioned',
        positions: {
          '00000000-0000-4000-8000-000000000002': { x: 10, y: 20 },
          '00000000-0000-4000-8000-000000000003': { x: 300, y: 40 },
        },
        activeRoute: '00000000-0000-4000-8000-000000000004',
      },
    ]);
    // The point of writing it: the space reopens in this Layout rather than
    // recomputing an automatic one.
    expect(next.defaultView).toBe('00000000-0000-4000-8000-000000000021');
  });

  it('produces a file that passes the schema and re-parses through loadSpace', () => {
    // Acceptance: what the writer emits is a real space file, not a lookalike.
    const next = serializeLayout(
      BASE,
      '00000000-0000-4000-8000-000000000021',
      'Layout',
      positions({ '00000000-0000-4000-8000-000000000002': [10, 20] }),
      '00000000-0000-4000-8000-000000000004',
    );

    expect(spaceFileSchema.safeParse(next).success).toBe(true);
    const loaded = loadSpace(next, CARDS);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.space.defaultView).toBe('00000000-0000-4000-8000-000000000021');
  });

  it('replaces a Layout of the same id rather than appending a second', () => {
    const withLayout: SpaceFile = {
      ...BASE,
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000021',
          title: 'Layout',
          kind: 'positioned',
          positions: { '00000000-0000-4000-8000-000000000002': { x: 0, y: 0 } },
        },
      ],
      defaultView: '00000000-0000-4000-8000-000000000021',
    };
    const next = serializeLayout(
      withLayout,
      '00000000-0000-4000-8000-000000000021',
      'Layout',
      positions({ '00000000-0000-4000-8000-000000000002': [99, 99] }),
      '00000000-0000-4000-8000-000000000004',
    );

    expect(next.layouts).toHaveLength(1);
    expect(next.layouts?.[0]?.positions).toEqual({
      '00000000-0000-4000-8000-000000000002': { x: 99, y: 99 },
    });
  });

  it('keeps the space id through a save and reload', () => {
    // `serializeLayout` spreads the base file, so the id rides along — worth an
    // assertion rather than an assumption, since losing it on save would make a
    // saved space anonymous.
    const next = serializeLayout(
      BASE,
      '00000000-0000-4000-8000-000000000021',
      'Layout',
      positions({ '00000000-0000-4000-8000-000000000002': [1, 2] }),
      '00000000-0000-4000-8000-000000000004',
    );
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
      routes: [
        ...BASE.routes,
        {
          id: '00000000-0000-4000-8000-000000000020',
          title: 'Aside',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000003',
              to: '00000000-0000-4000-8000-000000000002',
            },
          ],
        },
      ],
    };
    const next = serializeLayout(
      twoRoutes,
      '00000000-0000-4000-8000-000000000021',
      'Layout',
      positions({ '00000000-0000-4000-8000-000000000002': [1, 2] }),
      '00000000-0000-4000-8000-000000000020',
    );
    expect(next.layouts?.[0]?.activeRoute).toBe('00000000-0000-4000-8000-000000000020');
    expect(loadSpace(next, CARDS).ok).toBe(true);
  });

  it('writes no active route for a space that has none (ADR 0015)', () => {
    const routeless: SpaceFile = { ...BASE, routes: [] };
    const next = serializeLayout(
      routeless,
      '00000000-0000-4000-8000-000000000021',
      'Layout',
      positions({ '00000000-0000-4000-8000-000000000002': [1, 2] }),
      null,
    );
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
          id: '00000000-0000-4000-8000-000000000021',
          title: 'Layout',
          kind: 'positioned',
          positions: { '00000000-0000-4000-8000-000000000002': { x: 0, y: 0 } },
          routes: ['00000000-0000-4000-8000-000000000004'],
        },
      ],
    };
    const next = serializeLayout(
      filtered,
      '00000000-0000-4000-8000-000000000021',
      'Layout',
      positions({ '00000000-0000-4000-8000-000000000002': [5, 5] }),
      '00000000-0000-4000-8000-000000000004',
    );
    expect(next.layouts?.[0]?.routes).toEqual(['00000000-0000-4000-8000-000000000004']);
    expect(next.layouts?.[0]?.positions).toEqual({
      '00000000-0000-4000-8000-000000000002': { x: 5, y: 5 },
    });
  });

  it('keeps other layouts a space already had', () => {
    const withOther: SpaceFile = {
      ...BASE,
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000036',
          title: 'Other',
          kind: 'positioned',
          positions: {},
        },
      ],
    };
    const next = serializeLayout(
      withOther,
      '00000000-0000-4000-8000-000000000021',
      'Layout',
      positions({ '00000000-0000-4000-8000-000000000002': [1, 2] }),
      '00000000-0000-4000-8000-000000000004',
    );

    expect(next.layouts?.map((l) => l.id).sort()).toEqual([
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000036',
    ]);
  });
});

describe('saveSpace: what it sends for each card', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The payload the endpoint would receive, without an endpoint. */
  function capture(): { body: () => { cards: { id: string; text: string }[] } } {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    return {
      body: () =>
        JSON.parse((fetch.mock.calls[0]?.[1] as { body: string }).body) as {
          cards: { id: string; text: string }[];
        },
    };
  }

  const card = (id: string): Card => ({ id, title: id.toUpperCase(), kind: 'markdown', body: 'B' });

  it('sends a card that came from a file as that file, byte for byte', async () => {
    // The whole point. A hand-authored card is not what `serializeCardFile`
    // would produce from its parse — this one carries a frontmatter comment and
    // leaves `kind` to the default — and the server writes whatever differs, so
    // reconstructing it would turn a save that moved a card into a rewrite of
    // every hand-authored card file in the space, comments and all.
    const authored =
      '---\nid: 00000000-0000-4000-8000-000000000002 # stable identifier\ntitle: A\n---\n\nB\n';
    const sent = capture();

    await saveSpace(
      BASE,
      [card('00000000-0000-4000-8000-000000000002')],
      new Map([['00000000-0000-4000-8000-000000000002', authored]]),
    );

    expect(sent.body().cards).toEqual([
      { id: '00000000-0000-4000-8000-000000000002', text: authored },
    ]);
  });

  it('serializes a card that has no file yet', async () => {
    // A space the app minted: its cards are described by nothing until this
    // save, so there are no bytes to preserve and serializing is the only
    // option.
    const sent = capture();

    await saveSpace(BASE, [card('00000000-0000-4000-8000-000000000002')], new Map());

    const [only] = sent.body().cards;
    expect(only?.id).toBe('00000000-0000-4000-8000-000000000002');
    expect(only?.text).toContain('id: 00000000-0000-4000-8000-000000000002');
    // And what it writes is what will load. Routeless, so the one card is the
    // whole space and nothing references the `b` this case does not send.
    const routeless: SpaceFile = { ...BASE, routes: [] };
    expect(loadSpace(routeless, [{ path: 'cards/a.md', text: only?.text ?? '' }]).ok).toBe(true);
  });
});
