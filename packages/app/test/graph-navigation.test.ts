import { describe, expect, it } from 'vitest';
import { nextTabStop, stepAlongGraph, type TabRun } from '../src/graph-navigation';

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

describe('a run of Tab presses', () => {
  /** Every Resource a run of presses from `from` reaches, until the key is the browser's. */
  const run = (
    graph: readonly { source: string; target: string }[],
    from: string,
    direction: 'forward' | 'back',
    state: TabRun | null = null,
  ): string[] => {
    const next = nextTabStop(state, graph, from, direction);
    return next === undefined ? [] : [next.to, ...run(graph, next.to, direction, next.run)];
  };

  it('follows the Graph to its end', () => {
    expect(run(edges, 'a', 'forward')).toEqual(['b', 'c']);
    expect(run(edges, 'd', 'back')).toEqual(['b', 'a']);
  });

  it('leaves a cycle after one lap, either way', () => {
    const loop = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' },
    ];
    expect(run(loop, 'a', 'forward')).toEqual(['b', 'c']);
    expect(run(loop, 'a', 'back')).toEqual(['c', 'b']);
  });

  it('leaves a Resource whose only Edge returns to it', () => {
    expect(run([{ source: 'a', target: 'a' }], 'a', 'forward')).toEqual([]);
  });

  it('starts again when a press turns back, or starts somewhere else', () => {
    const loop = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ];
    const first = nextTabStop(null, loop, 'a', 'forward');
    expect(first?.to).toBe('b');
    if (first === undefined) return;
    // Turning back from b starts a new run there, so a, already visited going forward, is reached.
    expect(nextTabStop(first.run, loop, 'b', 'back')?.to).toBe('a');
    // A press from a Resource the run did not end at starts a new run too.
    expect(nextTabStop(first.run, loop, 'a', 'forward')?.to).toBe('b');
  });
});
