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
  ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'],
  ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005'],
  ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000006'],
  ['00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006'],
]);

describe('outgoingEdges', () => {
  it('lists a fork’s edges in the order they were authored', () => {
    expect(outgoingEdges(diamond, '00000000-0000-4000-8000-000000000002').map((e) => e.to)).toEqual(
      ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000005'],
    );
  });

  it('gives a card on a line exactly one — the degenerate fork', () => {
    expect(outgoingEdges(diamond, '00000000-0000-4000-8000-000000000003').map((e) => e.to)).toEqual(
      ['00000000-0000-4000-8000-000000000006'],
    );
  });

  it('gives a sink none, which is how a walk ends', () => {
    expect(outgoingEdges(diamond, '00000000-0000-4000-8000-000000000006')).toEqual([]);
  });

  it('gives a card the route does not touch none', () => {
    expect(outgoingEdges(diamond, '00000000-0000-4000-8000-000000000098')).toEqual([]);
  });
});

describe('incomingEdges', () => {
  it('lists every edge arriving at a merge', () => {
    expect(
      incomingEdges(diamond, '00000000-0000-4000-8000-000000000006').map((e) => e.from),
    ).toEqual(['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000005']);
  });
});

describe('routeEntryCards', () => {
  it('finds the card nothing arrives at', () => {
    expect(routeEntryCards(diamond)).toEqual(['00000000-0000-4000-8000-000000000002']);
  });

  it('finds one per component — a route need not be connected (ADR 0023)', () => {
    expect(
      routeEntryCards(
        route([
          ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'],
          ['x', 'y'],
        ]),
      ),
    ).toEqual(['00000000-0000-4000-8000-000000000002', 'x']);
  });

  it('lists each entry once however many edges leave it', () => {
    expect(routeEntryCards(diamond)).toEqual(['00000000-0000-4000-8000-000000000002']);
  });
});

describe('routeStartCard', () => {
  it('starts a walk at the first entry', () => {
    expect(routeStartCard(diamond)).toBe('00000000-0000-4000-8000-000000000002');
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
          ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000005'],
          ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'],
        ]),
      ),
    ).toBe('00000000-0000-4000-8000-000000000002');
  });
});
