import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { gridStrategy, type LayoutGraph, type LayoutStrategy } from '@project/graph';
import { usePlacementRendering } from '../src/placement-rendering';

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');

const graph: LayoutGraph = {
  cards: [{ id: CARD_A, width: 240, height: 140, ports: [] }],
  edges: [],
};

describe('usePlacementRendering', () => {
  it('is pending until the selected strategy produces the current placement', async () => {
    const strategy = gridStrategy();
    const { result } = renderHook(() => usePlacementRendering(graph, strategy, null));

    expect(result.current).toEqual({ kind: 'pending' });
    await waitFor(() => expect(result.current.kind).toBe('ready'));

    expect(result.current).toEqual({
      kind: 'ready',
      graph: {
        cards: [{ ...graph.cards[0]!, x: 0, y: 0 }],
        edges: [],
      },
    });
  });

  it('renders authored positions instead of running the selected automatic strategy', async () => {
    const neverResolves: LayoutStrategy = () => new Promise(() => undefined);
    const authoredPositions = new Map([[CARD_A, { x: 80, y: 120 }]]);
    const { result } = renderHook(() =>
      usePlacementRendering(graph, neverResolves, authoredPositions),
    );

    await waitFor(() => expect(result.current.kind).toBe('ready'));

    expect(result.current).toEqual({
      kind: 'ready',
      graph: {
        cards: [{ ...graph.cards[0]!, x: 80, y: 120 }],
        edges: [],
      },
    });
  });

  it('makes the previous placement unavailable while its replacement is pending', async () => {
    const ready = gridStrategy();
    const pending: LayoutStrategy = () => new Promise(() => undefined);
    const { result, rerender } = renderHook(
      ({ strategy }) => usePlacementRendering(graph, strategy, null),
      { initialProps: { strategy: ready } },
    );
    await waitFor(() => expect(result.current.kind).toBe('ready'));

    rerender({ strategy: pending });

    expect(result.current).toEqual({ kind: 'pending' });
  });

  it('reports a rejected strategy as a visible failure state', async () => {
    const failure = new Error('Placement failed');
    const rejected: LayoutStrategy = () => Promise.reject(failure);
    const { result } = renderHook(() => usePlacementRendering(graph, rejected, null));

    await waitFor(() => expect(result.current.kind).toBe('failed'));

    expect(result.current).toEqual({ kind: 'failed', error: failure });
  });

  it('reports a strategy that throws before returning its promise', async () => {
    const failure = new Error('Placement threw');
    const throws: LayoutStrategy = () => {
      throw failure;
    };
    const { result } = renderHook(() => usePlacementRendering(graph, throws, null));

    await waitFor(() => expect(result.current.kind).toBe('failed'));

    expect(result.current).toEqual({ kind: 'failed', error: failure });
  });

  it('ignores an obsolete result that resolves after a replacement', async () => {
    let resolveObsolete: (value: LayoutGraph) => void = () => undefined;
    const obsolete: LayoutStrategy = () =>
      new Promise((resolve) => {
        resolveObsolete = resolve;
      });
    const replacement: LayoutStrategy = (input) =>
      Promise.resolve({
        ...input,
        cards: input.cards.map((card) => ({ ...card, x: 40, y: 60 })),
      });
    const { result, rerender } = renderHook(
      ({ strategy }) => usePlacementRendering(graph, strategy, null),
      { initialProps: { strategy: obsolete } },
    );

    rerender({ strategy: replacement });
    await waitFor(() => expect(result.current.kind).toBe('ready'));
    expect(result.current).toEqual({
      kind: 'ready',
      graph: { ...graph, cards: [{ ...graph.cards[0]!, x: 40, y: 60 }] },
    });

    await act(async () => {
      resolveObsolete({
        ...graph,
        cards: [{ ...graph.cards[0]!, x: 900, y: 1000 }],
      });
      await Promise.resolve();
    });

    expect(result.current).toEqual({
      kind: 'ready',
      graph: { ...graph, cards: [{ ...graph.cards[0]!, x: 40, y: 60 }] },
    });
  });

  it('recovers when a different strategy replaces a failed one', async () => {
    const failed: LayoutStrategy = () => Promise.reject(new Error('Placement failed'));
    const replacement = gridStrategy();
    const { result, rerender } = renderHook(
      ({ strategy }) => usePlacementRendering(graph, strategy, null),
      { initialProps: { strategy: failed } },
    );
    await waitFor(() => expect(result.current.kind).toBe('failed'));

    rerender({ strategy: replacement });
    expect(result.current).toEqual({ kind: 'pending' });
    await waitFor(() => expect(result.current.kind).toBe('ready'));
  });
});
