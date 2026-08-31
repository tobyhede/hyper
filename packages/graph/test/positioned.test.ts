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

describe('positionedStrategy', () => {
  it('draws authored expansion and neighbour displacement', async () => {
    const positions = Placement.fromEntries([
      [
        uuid('00000000-0000-4000-8000-000000000002'),
        { x: 0, y: 0, open: true, openSize: { width: 360, height: 196 } },
      ],
      [uuid('00000000-0000-4000-8000-000000000003'), { x: 300, y: 200, open: false }],
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

  it('omits cards the authored placement omits', async () => {
    const laid = await positionedStrategy(
      at({
        '00000000-0000-4000-8000-000000000002': [0, 0],
        '00000000-0000-4000-8000-000000000003': [200, 400],
      }),
    )(graph);
    expect(laid.cards.map((card) => card.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
  });

  it('draws no cards when the authored placement is empty', async () => {
    const laid = await positionedStrategy(Placement.empty())(graph);
    expect(laid.cards).toEqual([]);
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
  it('positions exactly the cards the authored placement mentions', async () => {
    await fc.assert(
      fc.asyncProperty(idsArb, fc.array(coordArb), async (ids, coords) => {
        // Authored positions for a prefix of the cards; the rest are omitted.
        const authored = ids.slice(0, Math.floor(coords.length / 2));
        const positions = Placement.fromEntries(
          authored.map((id, i) => [
            id,
            { x: coords[i * 2] ?? 0, y: coords[i * 2 + 1] ?? 0, open: false },
          ]),
        );
        const laid = await positionedStrategy(positions)({ cards: cardsOf(...ids), edges: [] });

        expect(laid.cards.map((card) => card.id)).toEqual(authored);
        for (const card of laid.cards) {
          expect(card.x).toBeTypeOf('number');
          expect(card.y).toBeTypeOf('number');
        }
      }),
    );
  });
});
