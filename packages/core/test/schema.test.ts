import { describe, expect, it } from 'vitest';
import { spaceFileSchema } from '../src/index';

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

  it('rejects a space file with no routes', () => {
    const result = spaceFileSchema.safeParse({ ...validSpaceFile, routes: [] });
    expect(result.success).toBe(false);
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

  it('rejects an alias card that carries content instead of a target', () => {
    const result = spaceFileSchema.safeParse({
      ...validSpaceFile,
      cards: [{ id: 'a', title: 'A', kind: 'alias', content: 'cards/a.md' }],
    });
    expect(result.success).toBe(false);
  });
});
