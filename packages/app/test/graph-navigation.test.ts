import { describe, expect, it } from 'vitest';
import { graphNeighbours, neighbourToward, stepAlongGraph } from '../src/graph-navigation';

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

describe('the neighbours of a Resource', () => {
  it('joins Edges either way, once each, in Edge order', () => {
    expect(graphNeighbours(edges, 'b')).toEqual(['a', 'c', 'd']);
    expect(graphNeighbours([...edges, { source: 'c', target: 'b' }], 'b')).toEqual(['a', 'c', 'd']);
  });

  it('leaves out a self-Edge', () => {
    expect(graphNeighbours([{ source: 'a', target: 'a' }], 'a')).toEqual([]);
  });
});

describe('the neighbour toward a direction', () => {
  const origin = { x: 0, y: 0 };
  const at = (id: string, x: number, y: number) => ({ id, centre: { x, y } });

  it('takes the candidate that lies that way, with y growing downward', () => {
    const candidates = [at('east', 100, 0), at('north', 0, -100), at('south', 0, 100)];
    expect(neighbourToward(origin, candidates, 'right')).toBe('east');
    expect(neighbourToward(origin, candidates, 'up')).toBe('north');
    expect(neighbourToward(origin, candidates, 'down')).toBe('south');
    expect(neighbourToward(origin, candidates, 'left')).toBeUndefined();
  });

  it('prefers the candidate nearest the axis over a nearer one off it', () => {
    expect(neighbourToward(origin, [at('near', 50, 40), at('far', 300, 10)], 'right')).toBe('far');
  });

  it('breaks a tie on the axis by distance', () => {
    expect(neighbourToward(origin, [at('far', 300, 0), at('near', 100, 0)], 'right')).toBe('near');
  });

  it('reaches a diagonal candidate from both arrows it sits between', () => {
    expect(neighbourToward(origin, [at('corner', 100, 100)], 'right')).toBe('corner');
    expect(neighbourToward(origin, [at('corner', 100, 100)], 'down')).toBe('corner');
    expect(neighbourToward(origin, [at('corner', 100, 100)], 'up')).toBeUndefined();
  });

  it('ignores a candidate at the same centre', () => {
    expect(neighbourToward(origin, [at('same', 0, 0)], 'right')).toBeUndefined();
  });
});
