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
    expect(a.ports!.map((p) => p.id)).toEqual(['a##a-s-a', 'a##a-s-b']);
    expect(a.ports![0]!.layoutOptions?.['org.eclipse.elk.port.side']).toBe('EAST');

    const b = graph.children!.find((c) => c.id === 'b')!;
    expect(b.ports![0]!.layoutOptions?.['org.eclipse.elk.port.side']).toBe('WEST');
  });

  it('namespaces edge endpoints by node id, falling back to node ids', () => {
    const graph = buildElkGraph(nodes, edges);
    expect(graph.edges).toEqual([
      { id: 'a-b', sources: ['a##a-s-a'], targets: ['b##b-t-a'] },
      { id: 'a-b-2', sources: ['a'], targets: ['b'] },
    ]);
  });
});

describe('port id collision', () => {
  // Every card on a route carries the *same* handle ids (`main::in`/`main::out`),
  // so using bare handle ids as ELK port ids left ELK unable to tell which card
  // an edge attached to — collapsing layers even for a single route.
  const CHAIN = ['A', 'B', 'C', 'D', 'E'];

  const chainNodes: Node<ElkPortData>[] = CHAIN.map((id, i) => ({
    id,
    position: { x: 0, y: 0 },
    width: 260,
    height: 300,
    data: {
      sourceHandles: i < CHAIN.length - 1 ? [{ id: 'main::out' }] : [],
      targetHandles: i > 0 ? [{ id: 'main::in' }] : [],
    },
  }));

  const chainEdges: Edge[] = CHAIN.slice(0, -1).map((id, i) => ({
    id: `main::${i}`,
    source: id,
    sourceHandle: 'main::out',
    target: CHAIN[i + 1]!,
    targetHandle: 'main::in',
  }));

  it('gives every card a distinct ELK port id', () => {
    const graph = buildElkGraph(chainNodes, chainEdges);
    const ids = graph.children!.flatMap((c) => c.ports!.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lays a single route out as a strictly left-to-right chain', async () => {
    const layout = await getElkLayout(chainNodes, chainEdges);
    const xs = CHAIN.map((id) => layout[id]!.x);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
    }
  });

  it('still exposes port offsets under the bare handle id', async () => {
    const layout = await getElkLayout(chainNodes, chainEdges);
    expect(Number.isFinite(layout.B!.ports['main::in']?.y)).toBe(true);
    expect(Number.isFinite(layout.B!.ports['main::out']?.y)).toBe(true);
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
