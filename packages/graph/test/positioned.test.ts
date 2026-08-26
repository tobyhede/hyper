import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CardId } from '@project/core';
import { Placement, positionedStrategy } from '../src/index';
import type { LayoutStrategyCard, LayoutStrategyGraph } from '../src/index';
import { uuid } from './card-files';

const SIZE = { width: 100, height: 50 };

function cardsOf(...ids: string[]): LayoutStrategyCard[] {
  return ids.map((id) => ({
    id: uuid(id),
    ...SIZE,
    ports: [
      { id: '00000000-0000-4000-8000-000000000004::in', side: 'in' as const },
      { id: '00000000-0000-4000-8000-000000000004::out', side: 'out' as const },
    ],
  }));
}

const graph: LayoutStrategyGraph = {
  cards: cardsOf(
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000005',
  ),
  edges: [
    {
      id: '00000000-0000-4000-8000-000000000004::0',
      source: uuid('00000000-0000-4000-8000-000000000002'),
      target: uuid('00000000-0000-4000-8000-000000000003'),
      sourceHandle: '00000000-0000-4000-8000-000000000004::out',
      targetHandle: '00000000-0000-4000-8000-000000000004::in',
    },
    {
      id: '00000000-0000-4000-8000-000000000004::1',
      source: uuid('00000000-0000-4000-8000-000000000003'),
      target: uuid('00000000-0000-4000-8000-000000000005'),
      sourceHandle: '00000000-0000-4000-8000-000000000004::out',
      targetHandle: '00000000-0000-4000-8000-000000000004::in',
    },
  ],
};

const at = (entries: Record<string, [number, number]>): Placement =>
  Placement.fromEntries(Object.entries(entries).map(([id, [x, y]]) => [uuid(id), { x, y }]));

/** Do two placed cards' boxes intersect? Touching edges do not count. */
function overlaps(a: LayoutStrategyCard, b: LayoutStrategyCard): boolean {
  return (
    a.x! < b.x! + b.width &&
    b.x! < a.x! + a.width &&
    a.y! < b.y! + b.height &&
    b.y! < a.y! + a.height
  );
}

describe('positionedStrategy', () => {
  it('draws authored expansion and neighbour displacement', async () => {
    const positions = Placement.fromEntries([
      [
        uuid('00000000-0000-4000-8000-000000000002'),
        { x: 0, y: 0, expanded: { width: 360, height: 196 } },
      ],
      [uuid('00000000-0000-4000-8000-000000000003'), { x: 300, y: 200 }],
    ]);
    const laid = await positionedStrategy(positions)({
      cards: cardsOf(
        uuid('00000000-0000-4000-8000-000000000002'),
        uuid('00000000-0000-4000-8000-000000000003'),
      ),
      edges: [],
    });

    expect(laid.cards).toMatchObject([
      { x: 0, y: 0, width: 360, height: 196 },
      { x: 400, y: 250 },
    ]);
  });

  it('satisfies the uniformly-async LayoutStrategy contract', () => {
    expect(positionedStrategy(Placement.empty())(graph)).toBeInstanceOf(Promise);
  });

  it('puts every card exactly where the map says', async () => {
    const laid = await positionedStrategy(
      at({
        '00000000-0000-4000-8000-000000000002': [10, 20],
        '00000000-0000-4000-8000-000000000003': [300, 20],
        '00000000-0000-4000-8000-000000000005': [-40, 500],
      }),
    )(graph);
    expect(laid.cards.map((c) => [c.id, c.x, c.y])).toEqual([
      ['00000000-0000-4000-8000-000000000002', 10, 20],
      ['00000000-0000-4000-8000-000000000003', 300, 20],
      ['00000000-0000-4000-8000-000000000005', -40, 500],
    ]);
  });

  it('lays cards the map omits below everything it places', async () => {
    const laid = await positionedStrategy(
      at({
        '00000000-0000-4000-8000-000000000002': [0, 0],
        '00000000-0000-4000-8000-000000000003': [200, 400],
      }),
    )(graph);
    const c = laid.cards.find((card) => card.id === '00000000-0000-4000-8000-000000000005')!;
    // Below the lowest authored card (b, whose box ends at 450), so an omitted
    // card reads as unplaced and cannot overlap an authored one.
    expect(c.y!).toBeGreaterThan(450);
    expect(c.x).toBe(0); // left-aligned with the authored cards
  });

  it('degrades to a grid at the origin when the map is empty', async () => {
    const laid = await positionedStrategy(Placement.empty())(graph);
    expect(laid.cards.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [180, 0],
      [0, 130],
    ]);
  });

  it('never places ports, leaving the render layer to spread them', async () => {
    const laid = await positionedStrategy(at({ '00000000-0000-4000-8000-000000000002': [0, 0] }))(
      graph,
    );
    for (const card of laid.cards) {
      for (const port of card.ports) {
        expect(port.y).toBeUndefined();
      }
    }
  });

  it('ignores the edges and passes them through untouched', async () => {
    const laid = await positionedStrategy(at({ '00000000-0000-4000-8000-000000000002': [0, 0] }))(
      graph,
    );
    expect(laid.edges).toEqual(graph.edges);
    expect(laid.edges.every((e) => e.sections === undefined)).toBe(true);

    const withoutEdges = await positionedStrategy(
      at({ '00000000-0000-4000-8000-000000000002': [0, 0] }),
    )({ ...graph, edges: [] });
    expect(withoutEdges.cards).toEqual(laid.cards);
  });

  it('ignores positions for cards the view is not showing', async () => {
    const laid = await positionedStrategy(
      at({
        '00000000-0000-4000-8000-000000000002': [5, 5],
        '00000000-0000-4000-8000-000000000099': [999, 999],
      }),
    )({
      cards: cardsOf('00000000-0000-4000-8000-000000000002'),
      edges: [],
    });
    expect(laid.cards.map((c) => [c.id, c.x, c.y])).toEqual([
      ['00000000-0000-4000-8000-000000000002', 5, 5],
    ]);
  });

  it('handles an empty graph', async () => {
    expect(
      (
        await positionedStrategy(at({ '00000000-0000-4000-8000-000000000002': [0, 0] }))({
          cards: [],
          edges: [],
        })
      ).cards,
    ).toEqual([]);
  });
});

const idsArb = fc
  .uniqueArray(fc.uuid(), {
    minLength: 1,
    maxLength: 8,
  })
  .map((ids): CardId[] => ids.map(uuid));
const coordArb = fc.integer({ min: -1000, max: 1000 });

describe('positionedStrategy properties', () => {
  it('positions every card, whether or not the map mentions it', async () => {
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb), async (ids, coords) => {
        // Authored positions for a prefix of the cards; the rest are omitted.
        const authored = ids.slice(0, Math.floor(coords.length / 2));
        const positions = Placement.fromEntries(
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
        const positions = Placement.fromEntries(
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
