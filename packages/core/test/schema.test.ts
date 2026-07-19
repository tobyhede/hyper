import { describe, expect, it } from 'vitest';
import { parseManifest, safeParseManifest, type Manifest } from '../src/index';

const validManifest = {
  version: 1,
  title: 'Test deck',
  cards: [{ id: 'a', title: 'A', content: 'cards/a.md' }],
  nodes: [{ id: 'a-node', cardId: 'a', position: { x: 0, y: 0 } }],
  edges: [],
  paths: [{ id: 'main', title: 'Main', steps: [{ target: 'a-node' }] }],
};

describe('manifest schema', () => {
  it('parses a valid manifest', () => {
    const manifest = parseManifest(validManifest);
    expect(manifest.title).toBe('Test deck');
    expect(manifest.cards).toHaveLength(1);
  });

  it('defaults edge kind to "sequence"', () => {
    const manifest = parseManifest({
      ...validManifest,
      nodes: [
        { id: 'a-node', cardId: 'a', position: { x: 0, y: 0 } },
        { id: 'b-node', cardId: 'a', position: { x: 1, y: 1 } },
      ],
      edges: [{ id: 'e', source: 'a-node', target: 'b-node' }],
    }) satisfies Manifest;
    expect(manifest.edges[0]?.kind).toBe('sequence');
  });

  it('rejects a manifest with the wrong version literal', () => {
    const result = safeParseManifest({ ...validManifest, version: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects a manifest with no paths', () => {
    const result = safeParseManifest({ ...validManifest, paths: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a path with no steps', () => {
    const result = safeParseManifest({
      ...validManifest,
      paths: [{ id: 'main', title: 'Main', steps: [] }],
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

  it('rejects an unknown edge kind', () => {
    const result = safeParseManifest({
      ...validManifest,
      edges: [{ id: 'e', source: 'a-node', target: 'a-node', kind: 'wormhole' }],
    });
    expect(result.success).toBe(false);
  });
});
