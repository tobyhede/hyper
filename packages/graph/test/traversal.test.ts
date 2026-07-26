import { describe, expect, it } from 'vitest';
import type { Route } from '@project/core';
import { incomingEdges, outgoingEdges, routeEntryCards, routeStartCard } from '../src/index';

const route = (edges: [string, string][]): Route => ({
  id: 'r',
  title: 'R',
  edges: edges.map(([from, to]) => ({ from, to })),
});

// a forks to b and c, which merge back into d. Every move a walk can make is in
// here: a choice, a single step, and an arrival by two paths.
const diamond = route([
  ['a', 'b'],
  ['a', 'c'],
  ['b', 'd'],
  ['c', 'd'],
]);

describe('outgoingEdges', () => {
  it('lists a fork’s edges in the order they were authored', () => {
    expect(outgoingEdges(diamond, 'a').map((e) => e.to)).toEqual(['b', 'c']);
  });

  it('gives a card on a line exactly one — the degenerate fork', () => {
    expect(outgoingEdges(diamond, 'b').map((e) => e.to)).toEqual(['d']);
  });

  it('gives a sink none, which is how a walk ends', () => {
    expect(outgoingEdges(diamond, 'd')).toEqual([]);
  });

  it('gives a card the route does not touch none', () => {
    expect(outgoingEdges(diamond, 'nowhere')).toEqual([]);
  });
});

describe('incomingEdges', () => {
  it('lists every edge arriving at a merge', () => {
    expect(incomingEdges(diamond, 'd').map((e) => e.from)).toEqual(['b', 'c']);
  });
});

describe('routeEntryCards', () => {
  it('finds the card nothing arrives at', () => {
    expect(routeEntryCards(diamond)).toEqual(['a']);
  });

  it('finds one per component — a route need not be connected (ADR 0023)', () => {
    expect(
      routeEntryCards(
        route([
          ['a', 'b'],
          ['x', 'y'],
        ]),
      ),
    ).toEqual(['a', 'x']);
  });

  it('lists each entry once however many edges leave it', () => {
    expect(routeEntryCards(diamond)).toEqual(['a']);
  });
});

describe('routeStartCard', () => {
  it('starts a walk at the first entry', () => {
    expect(routeStartCard(diamond)).toBe('a');
  });

  it('is undefined only for a route with no edges, which the schema forbids', () => {
    expect(routeStartCard(route([]))).toBeUndefined();
  });

  it('does not depend on which card the first edge happens to mention', () => {
    // The authored order runs b → c before a → b, so the first `from` is not the
    // entry. Reading "the first edge's source" would start the walk mid-route.
    expect(
      routeStartCard(
        route([
          ['b', 'c'],
          ['a', 'b'],
        ]),
      ),
    ).toBe('a');
  });
});
