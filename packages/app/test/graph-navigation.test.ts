import { describe, expect, it } from 'vitest';
import { stepAlongGraph } from '../src/graph-navigation';

const edges = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
  { source: 'b', target: 'd' },
];

describe('stepping along a Graph', () => {
  it('goes forward along the first outgoing Edge the author drew', () => {
    expect(stepAlongGraph(edges, 'a', 'forward')).toBe('b');
    expect(stepAlongGraph(edges, 'b', 'forward')).toBe('c');
  });

  it('goes back along the first incoming Edge', () => {
    expect(stepAlongGraph(edges, 'd', 'back')).toBe('b');
    expect(stepAlongGraph(edges, 'b', 'back')).toBe('a');
  });

  it('has nowhere to go past either end, or from a Resource the Graph does not reach', () => {
    expect(stepAlongGraph(edges, 'c', 'forward')).toBeUndefined();
    expect(stepAlongGraph(edges, 'a', 'back')).toBeUndefined();
    expect(stepAlongGraph(edges, 'z', 'forward')).toBeUndefined();
  });

  it('steps round a cycle without end', () => {
    const loop = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ];
    expect(stepAlongGraph(loop, 'b', 'forward')).toBe('a');
    expect(stepAlongGraph(loop, 'a', 'back')).toBe('b');
  });
});
