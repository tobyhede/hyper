import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_VIEW_IDS,
  CARD_DESCRIPTION_MAX_LENGTH,
  cardFrontmatterSchema,
  cardSchema,
  isBuiltInViewId,
  spaceFileSchema,
} from '../src/index';

const validSpaceFile = {
  version: 1,
  id: 's',
  title: 'Test deck',
  routes: [{ id: 'main', title: 'Main', edges: [{ from: 'a', to: 'b' }] }],
};

describe('space file schema', () => {
  it('requires the space to name itself', () => {
    // Required today; ADR 0019 makes ids optional and generated on load, and
    // this is the assertion that will change when it does.
    const { id: _id, ...withoutId } = validSpaceFile;
    const result = spaceFileSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['id']);
  });

  it('rejects an empty space id', () => {
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, id: '' }).success).toBe(false);
  });

  it('parses a valid space file', () => {
    const file = spaceFileSchema.parse(validSpaceFile);
    expect(file.title).toBe('Test deck');
    expect(file.routes).toHaveLength(1);
  });

  it('holds no cards — a card exists because its file does (ADR 0020)', () => {
    // The same treatment a top-level `edges` array gets: an older file still
    // parses, and the array is dropped rather than honoured, so nothing can
    // half-load from it.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      cards: [{ id: 'a', title: 'A', content: 'cards/a.md' }],
    });
    expect(result.success).toBe(true);
    expect(result.success && 'cards' in result.data).toBe(false);
  });

  it('rejects a wrong version literal', () => {
    const result = spaceFileSchema.safeParse({ ...validSpaceFile, version: 2 });
    expect(result.success).toBe(false);
  });

  it('drops a top-level edges array, which routes replaced', () => {
    // ADR 0007 deleted the structural layer beside routes; a route's own `edges`
    // (ADR 0023) are a different thing that happens to share the word. An older
    // file carrying the old array still parses, and the array is ignored.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      edges: [{ id: 'e', source: 'a', target: 'b' }],
    });
    expect(result.success).toBe(true);
    expect(result.success && 'edges' in result.data).toBe(false);
  });

  it('accepts a space file with no routes — a new space has no structure yet', () => {
    // ADR 0015. It renders; it cannot be presented. The `min(1)` this replaces
    // was inherited from `paths.min(1)` in the Route rename, never decided.
    const result = spaceFileSchema.safeParse({ ...validSpaceFile, routes: [] });
    expect(result.success).toBe(true);
  });

  it('still requires the routes key itself, so a dropped array is a shape error', () => {
    const { routes: _routes, ...withoutRoutes } = validSpaceFile;
    expect(spaceFileSchema.safeParse(withoutRoutes).success).toBe(false);
  });

  it('rejects a route with no edges — a route is its connections (ADR 0023)', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      routes: [{ id: 'main', title: 'Main', edges: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a route that forks and merges — shape puts no limit on either', () => {
    // Acyclicity is the only structural rule and it needs the whole route in
    // view, so it lives in `@project/graph`; nothing here should reject a graph.
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      routes: [
        {
          id: 'main',
          title: 'Main',
          edges: [
            { from: 'a', to: 'b' },
            { from: 'a', to: 'c' },
            { from: 'b', to: 'd' },
            { from: 'c', to: 'd' },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an edge missing an endpoint', () => {
    for (const edge of [{ from: 'a' }, { to: 'b' }, { from: 'a', to: '' }]) {
      const result = spaceFileSchema.safeParse({
        ...validSpaceFile,
        routes: [{ id: 'main', title: 'Main', edges: [edge] }],
      });
      expect(result.success).toBe(false);
    }
  });
});

describe('card frontmatter schema', () => {
  it('rejects an empty card id', () => {
    expect(cardFrontmatterSchema.safeParse({ id: '', title: 'A' }).success).toBe(false);
  });

  it('defaults a card with no kind to markdown, so the common card declares neither', () => {
    const card = cardFrontmatterSchema.parse({ id: 'a', title: 'A' });
    expect(card.kind).toBe('markdown');
  });

  it('holds no content key — the file the frontmatter sits in is the content', () => {
    const card = cardFrontmatterSchema.parse({ id: 'a', title: 'A', content: 'cards/a.md' });
    expect('content' in card).toBe(false);
  });

  it('parses an alias card, which points at a target instead of holding content', () => {
    const alias = cardFrontmatterSchema.parse({
      id: 'a-again',
      title: 'A, again',
      kind: 'alias',
      target: 'a',
    });
    expect(alias.kind).toBe('alias');
    expect(alias.kind === 'alias' && alias.target).toBe('a');
  });

  it('gives an alias no body field at all', () => {
    const alias = cardSchema.parse({
      id: 'a-again',
      title: 'A, again',
      kind: 'alias',
      target: 'a',
    });

    expect('body' in alias).toBe(false);
  });

  it('rejects an alias with no target', () => {
    expect(cardFrontmatterSchema.safeParse({ id: 'a', title: 'A', kind: 'alias' }).success).toBe(
      false,
    );
  });

  it('accepts an optional single-line card description', () => {
    const card = cardFrontmatterSchema.parse({ id: 'a', title: 'A', description: 'What A is' });
    expect(card.description).toBe('What A is');
  });

  it('rejects a description longer than the cap', () => {
    const result = cardFrontmatterSchema.safeParse({
      id: 'a',
      title: 'A',
      description: 'x'.repeat(CARD_DESCRIPTION_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a multi-line description — a caption, not a body', () => {
    const result = cardFrontmatterSchema.safeParse({
      id: 'a',
      title: 'A',
      description: 'line one\nline two',
    });
    expect(result.success).toBe(false);
  });
});

describe('space file layouts', () => {
  const working = {
    id: 'working',
    title: 'Working',
    kind: 'positioned',
    positions: { a: { x: 0, y: 0 }, b: { x: 320, y: -40 } },
  };

  it('parses a file that declares no layouts — the hand-authored case', () => {
    const file = spaceFileSchema.parse(validSpaceFile);
    expect(file.layouts).toBeUndefined();
    expect(file.defaultView).toBeUndefined();
  });

  it('parses a positioned layout and its positions', () => {
    const file = spaceFileSchema.parse({ ...validSpaceFile, layouts: [working] });
    const layout = file.layouts?.[0];
    expect(layout?.kind).toBe('positioned');
    expect(layout?.positions).toEqual({ a: { x: 0, y: 0 }, b: { x: 320, y: -40 } });
  });

  it('defaults a layout with no kind to positioned, so one can be hand-written', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [{ id: 'working', title: 'Working', positions: {} }],
    });
    expect(file.layouts?.[0]?.kind).toBe('positioned');
  });

  it('accepts an empty position map — positions are sparse, and none is the limit', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [{ ...working, positions: {} }],
    });
    expect(file.layouts?.[0]?.positions).toEqual({});
  });

  it('rejects a position that is not a point', () => {
    for (const positions of [{ a: { x: 0 } }, { a: [0, 0] }, { a: { x: '0', y: '0' } }]) {
      expect(
        spaceFileSchema.safeParse({ ...validSpaceFile, layouts: [{ ...working, positions }] })
          .success,
      ).toBe(false);
    }
  });

  it('rejects a position keyed by an empty card id', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      layouts: [{ ...working, positions: { '': { x: 0, y: 0 } } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a layout kind it does not know', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      layouts: [{ id: 'auto', title: 'Auto', kind: 'elk', positions: {} }],
    });
    expect(result.success).toBe(false);
  });

  it('parses the routes a layout shows and the one it opens active', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [{ ...working, routes: ['long', 'short'], activeRoute: 'short' }],
    });
    expect(file.layouts?.[0]?.routes).toEqual(['long', 'short']);
    expect(file.layouts?.[0]?.activeRoute).toBe('short');
  });

  it('leaves both absent — every route shown, the first of them active', () => {
    // Absent is the meaningful case, not a missing field to be filled in: it is
    // how a layout says "all of them" and defers the active one (ADR 0026).
    const file = spaceFileSchema.parse({ ...validSpaceFile, layouts: [working] });
    expect(file.layouts?.[0]?.routes).toBeUndefined();
    expect(file.layouts?.[0]?.activeRoute).toBeUndefined();
  });

  it('takes either without the other — the two are independent', () => {
    const filtered = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [{ ...working, routes: ['long'] }],
    });
    expect(filtered.layouts?.[0]?.activeRoute).toBeUndefined();

    const named = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [{ ...working, activeRoute: 'long' }],
    });
    expect(named.layouts?.[0]?.routes).toBeUndefined();
  });

  it('accepts an empty routes list — a layout that shows none', () => {
    // Not the same as absent, which means all. Shape allows it; whether it is
    // sensible is the author's business.
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [{ ...working, routes: [] }],
    });
    expect(file.layouts?.[0]?.routes).toEqual([]);
  });

  it('rejects route references that are not ids', () => {
    for (const layout of [
      { ...working, routes: [''] },
      { ...working, routes: 'long' },
      { ...working, activeRoute: '' },
    ]) {
      expect(spaceFileSchema.safeParse({ ...validSpaceFile, layouts: [layout] }).success).toBe(
        false,
      );
    }
  });

  it('accepts an activeRoute no route has — resolution is a reference check', () => {
    // Shape only, as everywhere here. That it names a real route, and one this
    // layout shows, needs the whole space in view (@project/graph).
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      layouts: [{ ...working, routes: ['long'], activeRoute: 'nope' }],
    });
    expect(file.layouts?.[0]?.activeRoute).toBe('nope');
  });

  it('accepts defaultView as a plain name, resolved elsewhere', () => {
    // Shape only: whether the name resolves is a reference check, since it needs
    // the declared layouts in view.
    const file = spaceFileSchema.parse({ ...validSpaceFile, defaultView: 'working' });
    expect(file.defaultView).toBe('working');
    expect(spaceFileSchema.safeParse({ ...validSpaceFile, defaultView: '' }).success).toBe(false);
  });
});

describe('built-in view ids', () => {
  it('names the automatic views a space can open in without declaring one', () => {
    expect([...BUILT_IN_VIEW_IDS]).toEqual(['graph', 'grid']);
  });

  it('recognises exactly those names', () => {
    expect(isBuiltInViewId('graph')).toBe(true);
    expect(isBuiltInViewId('grid')).toBe(true);
    expect(isBuiltInViewId('working')).toBe(false);
    expect(isBuiltInViewId('')).toBe(false);
  });
});
