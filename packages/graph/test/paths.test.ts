import { describe, expect, it } from 'vitest';
import type { Manifest } from '@project/core';
import { buildNodeHandles, buildPathEdges, filterHandlesByPath, pathNodeIds } from '../src/index';

// a → b → c  (main),  a → c  (quick): c is shared, a fans out.
const manifest: Manifest = {
  version: 1,
  title: 'Test',
  cards: [
    { id: 'ca', title: 'A', content: 'a.md' },
    { id: 'cb', title: 'B', content: 'b.md' },
    { id: 'cc', title: 'C', content: 'c.md' },
  ],
  nodes: [
    { id: 'a', cardId: 'ca', position: { x: 0, y: 0 } },
    { id: 'b', cardId: 'cb', position: { x: 0, y: 0 } },
    { id: 'c', cardId: 'cc', position: { x: 0, y: 0 } },
  ],
  edges: [],
  paths: [
    { id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }, { target: 'c' }] },
    { id: 'quick', title: 'Quick', steps: [{ target: 'a' }, { target: 'c' }] },
  ],
};

describe('buildNodeHandles', () => {
  const handles = buildNodeHandles(manifest);

  it('gives the first node only outbound ports, one per path leaving it', () => {
    const a = handles.get('a')!;
    expect(a.targetHandles).toEqual([]);
    expect(a.sourceHandles.map((h) => h.id)).toEqual(['main::out', 'quick::out']);
  });

  it('gives an interior node both in and out ports for its path', () => {
    const b = handles.get('b')!;
    expect(b.targetHandles.map((h) => h.id)).toEqual(['main::in']);
    expect(b.sourceHandles.map((h) => h.id)).toEqual(['main::out']);
  });

  it('gives a shared terminal node one inbound port per path arriving', () => {
    const c = handles.get('c')!;
    expect(c.sourceHandles).toEqual([]);
    expect(c.targetHandles.map((h) => h.id)).toEqual(['main::in', 'quick::in']);
  });
});

describe('pathNodeIds', () => {
  it('lists a path’s distinct nodes in first-visit order', () => {
    expect(pathNodeIds(manifest, 'main')).toEqual(['a', 'b', 'c']);
    expect(pathNodeIds(manifest, 'quick')).toEqual(['a', 'c']);
    expect(pathNodeIds(manifest, 'nope')).toEqual([]);
  });
});

describe('filterHandlesByPath', () => {
  it('keeps only the selected path’s handles', () => {
    const quick = filterHandlesByPath(buildNodeHandles(manifest), 'quick');
    // c is shared, but only its quick inbound port survives the filter.
    expect(quick.get('c')!.targetHandles.map((h) => h.id)).toEqual(['quick::in']);
    expect(quick.get('b')).toBeUndefined(); // b is only on main
  });
});

describe('buildPathEdges', () => {
  const edges = buildPathEdges(manifest);

  it('produces one edge per adjacent step, connected via path ports', () => {
    expect(edges).toHaveLength(3);
    expect(edges).toContainEqual({
      id: 'main::0',
      pathId: 'main',
      source: 'a',
      target: 'b',
      sourceHandle: 'main::out',
      targetHandle: 'main::in',
      stepIndex: 0,
    });
    expect(edges).toContainEqual({
      id: 'quick::0',
      pathId: 'quick',
      source: 'a',
      target: 'c',
      sourceHandle: 'quick::out',
      targetHandle: 'quick::in',
      stepIndex: 0,
    });
  });
});
