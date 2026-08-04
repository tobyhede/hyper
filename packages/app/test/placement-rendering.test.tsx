import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { gridStrategy, Placement, type LayoutGraph, type LayoutStrategy } from '@project/graph';
import { canvasContent, usePlacementRendering } from '../src/placement-rendering';

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

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
    let automaticCalls = 0;
    const neverResolves: LayoutStrategy = () => {
      automaticCalls += 1;
      return new Promise(() => undefined);
    };
    const authoredPositions = Placement.fromEntries([[CARD_A, { x: 80, y: 120 }]]);
    const { result } = renderHook(() =>
      usePlacementRendering(graph, neverResolves, authoredPositions),
    );

    await waitFor(() => expect(result.current.kind).toBe('ready'));
    // Not implied by the ready state: a placement that ran the automatic strategy
    // and then discarded its result would still arrive here.
    expect(automaticCalls).toBe(0);

    expect(result.current).toEqual({
      kind: 'ready',
      graph: {
        cards: [{ ...graph.cards[0]!, x: 80, y: 120 }],
        edges: [],
      },
    });
  });

  it('re-runs layout for a new graph while the authored placement keeps its identity', async () => {
    // What Edit completion relies on since it stopped forcing a new placement
    // identity to provoke a re-layout: a completed Edit replaces the working
    // snapshot, and the `LayoutGraph` derived from it re-fires this effect on
    // its own. Nothing here touches the placement — the same object is handed
    // back on every render, so only the graph half can produce the second
    // arrangement.
    const authored = Placement.fromEntries([
      [CARD_A, { x: 80, y: 120 }],
      [CARD_B, { x: 400, y: 260 }],
    ]);
    const automatic = gridStrategy();
    const gainedCard: LayoutGraph = {
      cards: [
        { id: CARD_A, width: 240, height: 140, ports: [] },
        { id: CARD_B, width: 240, height: 140, ports: [] },
      ],
      edges: [],
    };
    const { result, rerender } = renderHook(
      ({ input }) => usePlacementRendering(input, automatic, authored),
      { initialProps: { input: graph } },
    );
    await waitFor(() => expect(result.current.kind).toBe('ready'));

    rerender({ input: gainedCard });

    await waitFor(() =>
      expect(result.current).toEqual({
        kind: 'ready',
        graph: {
          cards: [
            { ...gainedCard.cards[0]!, x: 80, y: 120 },
            { ...gainedCard.cards[1]!, x: 400, y: 260 },
          ],
          edges: [],
        },
      }),
    );
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

  it('makes a placement unavailable when the same strategy is handed a different graph', async () => {
    // The strategy identity never changes here, so only the `input === graph`
    // half of the freshness guard can hold the stale arrangement back.
    const strategy = gridStrategy();
    const nextGraph: LayoutGraph = {
      cards: [
        { id: CARD_A, width: 240, height: 140, ports: [] },
        { id: CARD_B, width: 240, height: 140, ports: [] },
      ],
      edges: [],
    };
    const { result, rerender } = renderHook(
      ({ input }) => usePlacementRendering(input, strategy, null),
      { initialProps: { input: graph } },
    );
    await waitFor(() => expect(result.current.kind).toBe('ready'));

    rerender({ input: nextGraph });

    expect(result.current).toEqual({ kind: 'pending' });
    await waitFor(() => expect(result.current.kind).toBe('ready'));
    // Two 240-wide cards in a two-column grid with the default 80 gap.
    expect(result.current).toEqual({
      kind: 'ready',
      graph: {
        cards: [
          { ...nextGraph.cards[0]!, x: 0, y: 0 },
          { ...nextGraph.cards[1]!, x: 320, y: 0 },
        ],
        edges: [],
      },
    });
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
    let obsoleteCalls = 0;
    let resolveObsolete: (value: LayoutGraph) => void = () => undefined;
    const obsolete: LayoutStrategy = () => {
      obsoleteCalls += 1;
      return new Promise((resolve) => {
        resolveObsolete = resolve;
      });
    };
    const replacement: LayoutStrategy = (input) =>
      Promise.resolve({
        ...input,
        cards: input.cards.map((card) => ({ ...card, x: 40, y: 60 })),
      });
    const { result, rerender } = renderHook(
      ({ strategy }) => usePlacementRendering(graph, strategy, null),
      { initialProps: { strategy: obsolete } },
    );

    // The strategy is invoked from a microtask after the effect, so waiting for
    // the call is what guarantees this test holds a real resolver. Without it the
    // resolve below can be a no-op and the assertions pass vacuously.
    await waitFor(() => expect(obsoleteCalls).toBe(1));
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

describe('canvasContent', () => {
  const placed: LayoutGraph = { cards: [{ ...graph.cards[0]!, x: 0, y: 0 }], edges: [] };

  it('waits for the editor to take a ready placement before drawing it', () => {
    // A resolved placement is not yet an arrangement on screen: `syncProjection`
    // installs it, and drawing before that would hand React Flow a node array
    // the editor store does not own — the one thing a controlled flow must not
    // do, and the reason changes had to be filtered by ownership.
    expect(canvasContent({ kind: 'ready', graph: placed }, false)).toEqual({ kind: 'placeholder' });
  });

  it('has nothing to draw before a first placement resolves', () => {
    expect(canvasContent({ kind: 'pending' }, false)).toEqual({ kind: 'placeholder' });
  });

  it('keeps drawing the arrangement on screen while a replacement placement is pending', () => {
    // The arrangement on screen belongs to the editor, which owns its positions
    // outright — it is the current state and not a stale copy of the placement
    // being recomputed. Blanking the canvas here would throw away a live drag.
    expect(canvasContent({ kind: 'pending' }, true)).toEqual({ kind: 'arrangement' });
  });

  it('reports a failed placement even when an arrangement is on screen', () => {
    const error = new Error('Placement failed');
    expect(canvasContent({ kind: 'failed', error }, true)).toEqual({ kind: 'failure', error });
  });
});
