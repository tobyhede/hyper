import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { buildElkGraph, getElkLayout, type ElkPortData } from '../src/index';

const nodes: Node<ElkPortData>[] = [
  {
    id: 'a',
    position: { x: 0, y: 0 },
    width: 150,
    height: 50,
    data: { sourceHandles: [{ id: 'a-s-a' }, { id: 'a-s-b' }], targetHandles: [] },
  },
  {
    id: 'b',
    position: { x: 0, y: 0 },
    width: 150,
    height: 50,
    data: { sourceHandles: [], targetHandles: [{ id: 'b-t-a' }] },
  },
];

const edges: Edge[] = [
  { id: 'a-b', source: 'a', sourceHandle: 'a-s-a', target: 'b', targetHandle: 'b-t-a' },
  // An edge with no explicit handles falls back to the node ids.
  { id: 'a-b-2', source: 'a', target: 'b' },
];

describe('buildElkGraph', () => {
  it('builds a layered root graph with default options', () => {
    const graph = buildElkGraph(nodes, edges);
    expect(graph.id).toBe('root');
    expect(graph.layoutOptions?.['elk.algorithm']).toBe('layered');
    expect(graph.children).toHaveLength(2);
  });

  it('fixes port order and assigns sides (targets WEST, sources EAST)', () => {
    const graph = buildElkGraph(nodes, edges);
    const a = graph.children!.find((c) => c.id === 'a')!;
    expect(a.layoutOptions?.['org.eclipse.elk.portConstraints']).toBe('FIXED_ORDER');
    expect(a.ports!.map((p) => p.id)).toEqual(['a-s-a', 'a-s-b']);
    expect(a.ports![0]!.layoutOptions?.['org.eclipse.elk.port.side']).toBe('EAST');

    const b = graph.children!.find((c) => c.id === 'b')!;
    expect(b.ports![0]!.layoutOptions?.['org.eclipse.elk.port.side']).toBe('WEST');
  });

  it('maps edges to handle ids, falling back to node ids', () => {
    const graph = buildElkGraph(nodes, edges);
    expect(graph.edges).toEqual([
      { id: 'a-b', sources: ['a-s-a'], targets: ['b-t-a'] },
      { id: 'a-b-2', sources: ['a'], targets: ['b'] },
    ]);
  });
});

describe('getElkLayout', () => {
  it('returns positions and per-port offsets for every node', async () => {
    const layout = await getElkLayout(nodes, edges);
    expect(Object.keys(layout).sort()).toEqual(['a', 'b']);

    for (const geom of Object.values(layout)) {
      expect(Number.isFinite(geom.x)).toBe(true);
      expect(Number.isFinite(geom.y)).toBe(true);
    }

    // Direction RIGHT: b lands to the right of a.
    expect(layout.b!.x).toBeGreaterThan(layout.a!.x);

    // Port offsets are exposed for the handles we declared.
    expect(Number.isFinite(layout.a!.ports['a-s-a']?.y)).toBe(true);
    expect(Number.isFinite(layout.b!.ports['b-t-a']?.y)).toBe(true);
  });
});
