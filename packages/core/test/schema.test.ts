import { describe, expect, it } from 'vitest';
import { parseManifest, safeParseManifest, type Manifest } from '../src/index';

const validManifest = {
  version: 1,
  title: 'Test deck',
  cards: [
    { id: 'a', title: 'A', content: 'cards/a.md' },
    { id: 'b', title: 'B', content: 'cards/b.md' },
  ],
  routes: [{ id: 'main', title: 'Main', steps: [{ target: 'a' }] }],
};

describe('manifest schema', () => {
  it('parses a valid manifest', () => {
    const manifest = parseManifest(validManifest) satisfies Manifest;
    expect(manifest.title).toBe('Test deck');
    expect(manifest.cards).toHaveLength(2);
  });

  it('rejects a manifest with the wrong version literal', () => {
    const result = safeParseManifest({ ...validManifest, version: 2 });
    expect(result.success).toBe(false);
  });

  it('drops authored edges, which are no longer part of the model', () => {
    // ADR 0007 deleted them. An older manifest still parses; the array is ignored.
    const result = safeParseManifest({
      ...validManifest,
      edges: [{ id: 'e', source: 'a', target: 'b' }],
    });
    expect(result.success).toBe(true);
    expect(result.success && 'edges' in result.data).toBe(false);
  });

  it('rejects a manifest with no routes', () => {
    const result = safeParseManifest({ ...validManifest, routes: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a route with no steps', () => {
    const result = safeParseManifest({
      ...validManifest,
      routes: [{ id: 'main', title: 'Main', steps: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty card id', () => {
    const result = safeParseManifest({
      ...validManifest,
      cards: [{ id: '', title: 'A', content: 'cards/a.md' }],
    });
    expect(result.success).toBe(false);
  });
});
