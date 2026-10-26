import { describe, expect, it } from 'vitest';
import { walkGraph } from '../src/graph-walk';

const edges = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
  { source: 'b', target: 'd' },
];

describe('walking a Graph', () => {
  it('goes forward along the first outgoing Edge the author drew', () => {
    expect(walkGraph(edges, 'a', 'forward')).toBe('b');
    expect(walkGraph(edges, 'b', 'forward')).toBe('c');
  });

  it('goes back along the first incoming Edge', () => {
    expect(walkGraph(edges, 'd', 'back')).toBe('b');
    expect(walkGraph(edges, 'b', 'back')).toBe('a');
  });

  it('has nowhere to go past either end, or from a Resource the Graph does not reach', () => {
    expect(walkGraph(edges, 'c', 'forward')).toBeUndefined();
    expect(walkGraph(edges, 'a', 'back')).toBeUndefined();
    expect(walkGraph(edges, 'z', 'forward')).toBeUndefined();
  });

  it('walks a cycle without end', () => {
    const loop = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ];
    expect(walkGraph(loop, 'b', 'forward')).toBe('a');
    expect(walkGraph(loop, 'a', 'back')).toBe('b');
  });
});
