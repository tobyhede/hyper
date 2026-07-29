import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type CardId } from '@project/core';
import { gridStrategy, type LayoutGraph, type LayoutStrategy } from '@project/graph';
import { strategyForRendering, useLayoutRendering } from '../src/App';

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

function graphWith(...cardIds: CardId[]): LayoutGraph {
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
  it('uses the automatic strategy until conversion, then renders a changed graph from the Layout', async () => {
    const automaticStrategy = gridStrategy({ columns: 1, gap: 10 });

    const beforeConversion = await strategyForRendering(
      automaticStrategy,
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
      automaticStrategy,
      authoredPositions,
    )(graphWith(CARD_A, CARD_B, CARD_C));

    expect(cardPositions(afterConversion)).toEqual({
      [CARD_A]: { x: 40, y: 70 },
      [CARD_B]: { x: 510, y: 260 },
      [CARD_C]: { x: 900, y: 420 },
    });
  });
});

describe('useLayoutRendering', () => {
  it('keeps adopted automatic routing until the graph changes, then renders from authored positions', async () => {
    const initialGraph: LayoutGraph = {
      cards: [
        { id: CARD_A, width: 240, height: 140, ports: [{ id: 'out', side: 'out' }] },
        { id: CARD_B, width: 240, height: 140, ports: [{ id: 'in', side: 'in' }] },
      ],
      edges: [
        {
          id: 'edge',
          source: CARD_A,
          target: CARD_B,
          sourceHandle: 'out',
          targetHandle: 'in',
        },
      ],
    };
    const routedResult: LayoutGraph = {
      cards: [
        {
          ...initialGraph.cards[0]!,
          x: 20,
          y: 30,
          ports: [{ id: 'out', side: 'out', x: 240, y: 70 }],
        },
        {
          ...initialGraph.cards[1]!,
          x: 400,
          y: 180,
          ports: [{ id: 'in', side: 'in', x: 0, y: 70 }],
        },
      ],
      edges: [
        {
          ...initialGraph.edges[0]!,
          sections: [
            {
              startPoint: { x: 260, y: 100 },
              endPoint: { x: 400, y: 250 },
              bendPoints: [{ x: 320, y: 100 }],
            },
          ],
        },
      ],
    };
    const automaticStrategy = gridStrategy();
    const initialPositions = new Map([
      [CARD_A, { x: 20, y: 30 }],
      [CARD_B, { x: 400, y: 180 }],
    ]);
    const changedPositions = new Map([...initialPositions, [CARD_C, { x: 800, y: 450 }]]);

    const { result, rerender } = renderHook(
      ({ graph, strategy }) => useLayoutRendering(graph, strategy),
      {
        initialProps: {
          graph: initialGraph,
          strategy: strategyForRendering(automaticStrategy, null),
        },
      },
    );

    await waitFor(() => expect(result.current.laidOut).not.toBeNull());
    act(() => result.current.adopt(routedResult));
    rerender({
      graph: initialGraph,
      strategy: strategyForRendering(automaticStrategy, initialPositions),
    });
    await act(async () => Promise.resolve());

    expect(result.current.laidOut?.edges[0]?.sections).toEqual(routedResult.edges[0]?.sections);
    expect(result.current.laidOut?.cards[0]?.ports[0]).toEqual({
      id: 'out',
      side: 'out',
      x: 240,
      y: 70,
    });

    rerender({
      graph: graphWith(CARD_A, CARD_B, CARD_C),
      strategy: strategyForRendering(automaticStrategy, changedPositions),
    });

    await waitFor(() => {
      expect(cardPositions(result.current.laidOut!)).toEqual({
        [CARD_A]: { x: 20, y: 30 },
        [CARD_B]: { x: 400, y: 180 },
        [CARD_C]: { x: 800, y: 450 },
      });
    });
    expect(result.current.laidOut?.edges[0]?.sections).toBeUndefined();
  });

  it('does not render an in-flight automatic result that resolves after conversion', async () => {
    const graph = graphWith(CARD_A, CARD_B);
    const staleAutomaticResult: LayoutGraph = {
      ...graph,
      cards: graph.cards.map((card, index) => ({
        ...card,
        x: 1000 + index * 200,
        y: 900,
      })),
    };
    let resolveAutomatic: (result: LayoutGraph) => void = () => undefined;
    const automaticStrategy: LayoutStrategy = () =>
      new Promise((resolve) => {
        resolveAutomatic = resolve;
      });
    const authoredPositions = new Map([
      [CARD_A, { x: 40, y: 70 }],
      [CARD_B, { x: 510, y: 260 }],
    ]);
    const positionedRendering = strategyForRendering(automaticStrategy, authoredPositions);

    const { result, rerender } = renderHook(({ strategy }) => useLayoutRendering(graph, strategy), {
      initialProps: { strategy: automaticStrategy },
    });
    expect(result.current.laidOut).toBeNull();

    rerender({ strategy: positionedRendering });
    await waitFor(() => {
      expect(cardPositions(result.current.laidOut!)).toEqual({
        [CARD_A]: { x: 40, y: 70 },
        [CARD_B]: { x: 510, y: 260 },
      });
    });

    await act(async () => {
      resolveAutomatic(staleAutomaticResult);
      await Promise.resolve();
    });

    expect(cardPositions(result.current.laidOut!)).toEqual({
      [CARD_A]: { x: 40, y: 70 },
      [CARD_B]: { x: 510, y: 260 },
    });
  });

  it('hides a rendered result immediately while its replacement strategy is pending', async () => {
    const graph = graphWith(CARD_A, CARD_B);
    const automaticStrategy = gridStrategy();
    const pendingStrategy: LayoutStrategy = () => new Promise(() => undefined);

    const { result, rerender } = renderHook(({ strategy }) => useLayoutRendering(graph, strategy), {
      initialProps: { strategy: automaticStrategy },
    });
    await waitFor(() => expect(result.current.laidOut).not.toBeNull());

    rerender({ strategy: pendingStrategy });

    expect(result.current.laidOut).toBeNull();
  });
});
