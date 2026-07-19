import { describe, expect, it } from 'vitest';
import type { Manifest } from '@project/core';
import { isValidGraph, validateReferences } from '../src/index';

function baseManifest(): Manifest {
  return {
    version: 1,
    title: 'Test',
    cards: [
      { id: 'a', title: 'A', content: 'cards/a.md' },
      { id: 'b', title: 'B', content: 'cards/b.md' },
    ],
    nodes: [
      { id: 'a-node', cardId: 'a', position: { x: 0, y: 0 } },
      { id: 'b-node', cardId: 'b', position: { x: 1, y: 1 } },
    ],
    edges: [{ id: 'a-b', source: 'a-node', target: 'b-node', kind: 'sequence' }],
    paths: [{ id: 'main', title: 'Main', steps: [{ target: 'a-node' }, { target: 'b-node' }] }],
  };
}

describe('validateReferences', () => {
  it('reports no errors for a consistent manifest', () => {
    expect(validateReferences(baseManifest())).toEqual([]);
    expect(isValidGraph(baseManifest())).toBe(true);
  });

  it('detects an unresolved card reference on a node', () => {
    const m = baseManifest();
    m.nodes[0]!.cardId = 'missing';
    const errors = validateReferences(m);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.kind).toBe('unresolved-node-card');
    expect(errors[0]!.ref).toBe('missing');
  });

  it('detects an unresolved edge source', () => {
    const m = baseManifest();
    m.edges[0]!.source = 'ghost-node';
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'unresolved-edge-source' && e.ref === 'ghost-node')).toBe(
      true,
    );
  });

  it('detects an unresolved edge target', () => {
    const m = baseManifest();
    m.edges[0]!.target = 'ghost-node';
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'unresolved-edge-target')).toBe(true);
  });

  it('detects an unresolved path step target', () => {
    const m = baseManifest();
    m.paths[0]!.steps[1]!.target = 'nowhere';
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'unresolved-path-step' && e.ref === 'nowhere')).toBe(true);
  });

  it('detects duplicate node ids', () => {
    const m = baseManifest();
    m.nodes.push({ id: 'a-node', cardId: 'b', position: { x: 5, y: 5 } });
    const errors = validateReferences(m);
    expect(errors.some((e) => e.kind === 'duplicate-node-id')).toBe(true);
  });
});
