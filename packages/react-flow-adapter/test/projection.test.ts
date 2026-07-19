import { describe, expect, it } from 'vitest';
import type { Manifest } from '@project/core';
import { buildCardHandles, buildPathEdges } from '@project/graph';
import { projectCardNodes, projectPathEdges } from '../src/index';

const manifest: Manifest = {
  version: 1,
  title: 'Test',
  cards: [
    { id: 'a', title: 'Card A', content: 'cards/a.md' },
    { id: 'b', title: 'Card B', content: 'cards/b.md' },
  ],
  edges: [],
  paths: [
    { id: 'main', title: 'Main', steps: [{ target: 'a' }, { target: 'b' }] },
    { id: 'alt', title: 'Alt', steps: [{ target: 'b' }, { target: 'a' }] },
  ],
};

const markdown = { a: '# A body', b: '# B body' };
const colors = { main: '#111111', alt: '#222222' };
const handles = buildCardHandles(manifest);

describe('projectCardNodes', () => {
  it('maps cards to card nodes with resolved markdown and title', () => {
    const nodes = projectCardNodes(manifest, markdown, handles, colors);
    const a = nodes.find((n) => n.id === 'a')!;
    expect(a.type).toBe('card');
    expect(a.data.title).toBe('Card A');
    expect(a.data.markdown).toBe('# A body');
    expect(a.data.active).toBe(false);
  });

  it('attaches per-path handles colored by path', () => {
    const nodes = projectCardNodes(manifest, markdown, handles, colors);
    const a = nodes.find((n) => n.id === 'a')!;
    // main leaves card a (out); alt ends at card a (in).
    expect(a.data.sourceHandles).toMatchObject([
      { id: 'main::out', pathId: 'main', color: '#111111' },
    ]);
    expect(a.data.targetHandles).toMatchObject([
      { id: 'alt::in', pathId: 'alt', color: '#222222' },
    ]);
    // A vertical offset is always assigned (even spread before ELK runs).
    expect(typeof a.data.sourceHandles[0]!.offsetY).toBe('number');
  });

  it('uses ELK port offsets and positions when a layout is supplied', () => {
    const nodes = projectCardNodes(manifest, markdown, handles, colors, {
      layout: {
        a: {
          x: 500,
          y: 600,
          width: 260,
          height: 300,
          ports: { 'main::out': { x: 260, y: 42 } },
        },
      },
    });
    const a = nodes.find((n) => n.id === 'a')!;
    expect(a.position).toEqual({ x: 500, y: 600 });
    expect(a.data.sourceHandles[0]!.offsetY).toBe(42);
    // card b is absent from the layout → falls back to the origin (no authored position).
    expect(nodes.find((n) => n.id === 'b')!.position).toEqual({ x: 0, y: 0 });
  });

  it('flags the active card', () => {
    const nodes = projectCardNodes(manifest, markdown, handles, colors, { activeCardId: 'b' });
    expect(nodes.find((n) => n.id === 'b')!.data.active).toBe(true);
    expect(nodes.find((n) => n.id === 'b')!.className).toContain('rf-card-node--active');
  });
});

describe('projectPathEdges', () => {
  const pathEdges = buildPathEdges(manifest);

  it('maps path edges to colored, port-connected React Flow edges', () => {
    const edges = projectPathEdges(pathEdges, colors);
    expect(edges).toHaveLength(2);
    const mainEdge = edges.find((e) => e.id === 'main::0')!;
    expect(mainEdge).toMatchObject({
      source: 'a',
      target: 'b',
      sourceHandle: 'main::out',
      targetHandle: 'main::in',
    });
    expect(mainEdge.style?.stroke).toBe('#111111');
  });

  it('dims non-active paths while presenting', () => {
    const edges = projectPathEdges(pathEdges, colors, { presenting: true, activePathId: 'main' });
    const mainEdge = edges.find((e) => e.id === 'main::0')!;
    const altEdge = edges.find((e) => e.id === 'alt::0')!;
    expect(mainEdge.style?.opacity).toBe(1);
    expect(mainEdge.animated).toBe(true);
    expect(altEdge.style?.opacity).toBeLessThan(1);
    expect(altEdge.animated).toBe(false);
  });
});
