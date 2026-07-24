import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_VIEW_IDS,
  CARD_DESCRIPTION_MAX_LENGTH,
  isBuiltInViewId,
  spaceFileSchema,
} from '../src/index';

const validSpaceFile = {
  version: 1,
  title: 'Test deck',
  cards: [
    { id: 'a', title: 'A', content: 'cards/a.md' },
    { id: 'b', title: 'B', content: 'cards/b.md' },
  ],
  routes: [{ id: 'main', title: 'Main', steps: [{ target: 'a' }] }],
};

describe('space file schema', () => {
  it('parses a valid space file', () => {
    const file = spaceFileSchema.parse(validSpaceFile);
    expect(file.title).toBe('Test deck');
    expect(file.cards).toHaveLength(2);
  });

  it('rejects a wrong version literal', () => {
    const result = spaceFileSchema.safeParse({ ...validSpaceFile, version: 2 });
    expect(result.success).toBe(false);
  });

  it('drops authored edges, which are no longer part of the model', () => {
    // ADR 0007 deleted them. An older file still parses; the array is ignored.
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

  it('rejects a route with no steps', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      routes: [{ id: 'main', title: 'Main', steps: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty card id', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      cards: [{ id: '', title: 'A', content: 'cards/a.md' }],
    });
    expect(result.success).toBe(false);
  });

  it('defaults a card with no kind to markdown, so pre-kind files still parse', () => {
    const file = spaceFileSchema.parse(validSpaceFile);
    expect(file.cards[0]!.kind).toBe('markdown');
  });

  it('parses an alias card, which points at a target instead of holding content', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      cards: [
        { id: 'a', title: 'A', content: 'cards/a.md' },
        { id: 'a-again', title: 'A, again', kind: 'alias', target: 'a' },
      ],
    });
    const alias = file.cards[1]!;
    expect(alias.kind).toBe('alias');
    expect(alias.kind === 'alias' && alias.target).toBe('a');
  });

  it('accepts an optional single-line card description', () => {
    const file = spaceFileSchema.parse({
      ...validSpaceFile,
      cards: [{ id: 'a', title: 'A', description: 'What A is', content: 'cards/a.md' }],
    });
    expect(file.cards[0]!.description).toBe('What A is');
  });

  it('rejects a description longer than the cap', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      cards: [
        {
          id: 'a',
          title: 'A',
          description: 'x'.repeat(CARD_DESCRIPTION_MAX_LENGTH + 1),
          content: 'cards/a.md',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a multi-line description — a caption, not a body', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      cards: [{ id: 'a', title: 'A', description: 'line one\nline two', content: 'cards/a.md' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an alias card that carries content instead of a target', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      cards: [{ id: 'a', title: 'A', kind: 'alias', content: 'cards/a.md' }],
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
