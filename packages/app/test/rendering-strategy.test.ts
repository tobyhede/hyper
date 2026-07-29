import { describe, expect, it } from 'vitest';
import { gridStrategy, type LayoutGraph } from '@project/graph';
import { strategyForRendering } from '../src/App';

const CARD_A = '00000000-0000-4000-8000-000000000002';
const CARD_B = '00000000-0000-4000-8000-000000000003';
const CARD_C = '00000000-0000-4000-8000-000000000004';

function graphWith(...cardIds: string[]): LayoutGraph {
  return {
    cards: cardIds.map((id) => ({ id, width: 240, height: 140, ports: [] })),
    edges: [],
  };
}

function cardPositions(graph: LayoutGraph): Record<string, { x: number; y: number }> {
  return Object.fromEntries(
    graph.cards.map((card) => {
      if (card.x === undefined || card.y === undefined) {
        throw new Error(`Expected strategy to position card ${card.id}`);
      }
      return [card.id, { x: card.x, y: card.y }];
    }),
  );
}

describe('strategyForRendering', () => {
  it('uses the Algorithmic View until conversion, then renders a changed graph from the Layout', async () => {
    const algorithmicView = gridStrategy({ columns: 1, gap: 10 });

    const beforeConversion = await strategyForRendering(
      algorithmicView,
      null,
    )(graphWith(CARD_A, CARD_B));
    expect(cardPositions(beforeConversion)).toEqual({
      [CARD_A]: { x: 0, y: 0 },
      [CARD_B]: { x: 0, y: 150 },
    });

    const authoredPositions = new Map([
      [CARD_A, { x: 40, y: 70 }],
      [CARD_B, { x: 510, y: 260 }],
      [CARD_C, { x: 900, y: 420 }],
    ]);
    const afterConversion = await strategyForRendering(
      algorithmicView,
      authoredPositions,
    )(graphWith(CARD_A, CARD_B, CARD_C));

    expect(cardPositions(afterConversion)).toEqual({
      [CARD_A]: { x: 40, y: 70 },
      [CARD_B]: { x: 510, y: 260 },
      [CARD_C]: { x: 900, y: 420 },
    });
  });
});
