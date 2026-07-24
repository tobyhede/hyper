import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { layoutPositions, positionedStrategy } from '../src/index';
import type { LayoutCard, LayoutGraph } from '../src/index';

const SIZE = { width: 100, height: 50 };

function cardsOf(...ids: string[]): LayoutCard[] {
  return ids.map((id) => ({
    id,
    ...SIZE,
    ports: [
      { id: 'main::in', side: 'in' as const },
      { id: 'main::out', side: 'out' as const },
    ],
  }));
}

const graph: LayoutGraph = {
  cards: cardsOf('a', 'b', 'c'),
  edges: [
    {
      id: 'main::0',
      source: 'a',
      target: 'b',
      sourceHandle: 'main::out',
      targetHandle: 'main::in',
    },
    {
      id: 'main::1',
      source: 'b',
      target: 'c',
      sourceHandle: 'main::out',
      targetHandle: 'main::in',
    },
  ],
};

const at = (entries: Record<string, [number, number]>) =>
  new Map(Object.entries(entries).map(([id, [x, y]]) => [id, { x, y }]));

/** Do two placed cards' boxes intersect? Touching edges do not count. */
function overlaps(a: LayoutCard, b: LayoutCard): boolean {
  return (
    a.x! < b.x! + b.width &&
    b.x! < a.x! + a.width &&
    a.y! < b.y! + b.height &&
    b.y! < a.y! + a.height
  );
}

describe('positionedStrategy', () => {
  it('satisfies the uniformly-async LayoutStrategy contract', () => {
    expect(positionedStrategy(new Map())(graph)).toBeInstanceOf(Promise);
  });

  it('puts every card exactly where the map says', async () => {
    const laid = await positionedStrategy(at({ a: [10, 20], b: [300, 20], c: [-40, 500] }))(graph);
    expect(laid.cards.map((c) => [c.id, c.x, c.y])).toEqual([
      ['a', 10, 20],
      ['b', 300, 20],
      ['c', -40, 500],
    ]);
  });

  it('lays cards the map omits below everything it places', async () => {
    const laid = await positionedStrategy(at({ a: [0, 0], b: [200, 400] }))(graph);
    const c = laid.cards.find((card) => card.id === 'c')!;
    // Below the lowest authored card (b, whose box ends at 450), so an omitted
    // card reads as unplaced and cannot overlap an authored one.
    expect(c.y!).toBeGreaterThan(450);
    expect(c.x).toBe(0); // left-aligned with the authored cards
  });

  it('degrades to a grid at the origin when the map is empty', async () => {
    const laid = await positionedStrategy(new Map())(graph);
    expect(laid.cards.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [180, 0],
      [0, 130],
    ]);
  });

  it('never places ports, leaving the render layer to spread them', async () => {
    const laid = await positionedStrategy(at({ a: [0, 0] }))(graph);
    for (const card of laid.cards) {
      for (const port of card.ports) {
        expect(port.y).toBeUndefined();
      }
    }
  });

  it('ignores the edges and passes them through untouched', async () => {
    const laid = await positionedStrategy(at({ a: [0, 0] }))(graph);
    expect(laid.edges).toEqual(graph.edges);
    expect(laid.edges.every((e) => e.sections === undefined)).toBe(true);

    const withoutEdges = await positionedStrategy(at({ a: [0, 0] }))({ ...graph, edges: [] });
    expect(withoutEdges.cards).toEqual(laid.cards);
  });

  it('ignores positions for cards the view is not showing', async () => {
    const laid = await positionedStrategy(at({ a: [5, 5], zz: [999, 999] }))({
      cards: cardsOf('a'),
      edges: [],
    });
    expect(laid.cards.map((c) => [c.id, c.x, c.y])).toEqual([['a', 5, 5]]);
  });

  it('handles an empty graph', async () => {
    expect((await positionedStrategy(at({ a: [0, 0] }))({ cards: [], edges: [] })).cards).toEqual(
      [],
    );
  });
});

const idsArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), {
  minLength: 1,
  maxLength: 8,
});
const coordArb = fc.integer({ min: -1000, max: 1000 });

describe('positionedStrategy properties', () => {
  it('positions every card, whether or not the map mentions it', async () => {
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb), async (ids, coords) => {
        // Authored positions for a prefix of the cards; the rest are omitted.
        const authored = ids.slice(0, Math.floor(coords.length / 2));
        const positions = new Map(
          authored.map((id, i) => [id, { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0 }]),
        );
        const laid = await positionedStrategy(positions)({ cards: cardsOf(...ids), edges: [] });

        expect(laid.cards).toHaveLength(ids.length);
        for (const card of laid.cards) {
          expect(card.x).toBeTypeOf('number');
          expect(card.y).toBeTypeOf('number');
        }
      }),
    );
  });

  it('never overlaps a card the map omits with any other card', async () => {
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb), async (ids, coords) => {
        const authored = ids.slice(0, Math.floor(coords.length / 2));
        const positions = new Map(
          authored.map((id, i) => [id, { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0 }]),
        );
        const laid = await positionedStrategy(positions)({ cards: cardsOf(...ids), edges: [] });

        // Authored cards may overlap each other — that is the author's business.
        // A card the map omits is ours to place, and must clash with nothing.
        const omitted = laid.cards.filter((c) => !positions.has(c.id));
        for (const card of omitted) {
          for (const other of laid.cards) {
            if (other.id === card.id) continue;
            expect(overlaps(card, other)).toBe(false);
          }
        }
      }),
    );
  });
});

describe('layoutPositions', () => {
  it('reads back what a strategy placed', async () => {
    const laid = await positionedStrategy(at({ a: [10, 20], b: [300, 20], c: [600, 20] }))(graph);
    expect(Object.fromEntries(layoutPositions(laid))).toEqual({
      a: { x: 10, y: 20 },
      b: { x: 300, y: 20 },
      c: { x: 600, y: 20 },
    });
  });

  it('omits a card no strategy placed, rather than calling it the origin', () => {
    expect([...layoutPositions({ cards: cardsOf('a', 'b'), edges: [] }).keys()]).toEqual([]);
  });

  it('round-trips: replaying a laid-out graph reproduces its placement', async () => {
    // The property that makes Auto-arrange a conversion rather than a
    // reinterpretation — what the automatic strategy computed is exactly what the
    // Layout goes on to mean.
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb, { minLength: 60 }), async (ids, coords) => {
        const positions = new Map(
          ids.map((id, i) => [id, { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0 }]),
        );
        const laid = await positionedStrategy(positions)({ cards: cardsOf(...ids), edges: [] });
        const replayed = await positionedStrategy(layoutPositions(laid))({
          cards: cardsOf(...ids),
          edges: [],
        });

        expect(replayed.cards.map((c) => ({ x: c.x, y: c.y }))).toEqual(
          laid.cards.map((c) => ({ x: c.x, y: c.y })),
        );
      }),
    );
  });
});
