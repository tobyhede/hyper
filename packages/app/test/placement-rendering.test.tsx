import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { Placement, type LayoutStrategyGraph } from '@project/graph';
import { usePlacementRendering } from '../src/placement-rendering';

const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

const strategyGraph: LayoutStrategyGraph = {
  resources: [{ id: RESOURCE_A, width: 240, height: 140 }],
  edges: [],
};

/** A `Placement` over the resource/point pairs given, all Closed. */
const placementOf = (
  entries: readonly (readonly [typeof RESOURCE_A, { readonly x: number; readonly y: number }])[],
): Placement => Placement.fromEntries(entries.map(([id, at]) => [id, { ...at, open: false }]));

describe('usePlacementRendering', () => {
  it('is pending until the placement resolves the current strategyGraph', async () => {
    const placement = placementOf([[RESOURCE_A, { x: 80, y: 120 }]]);
    const { result } = renderHook(() => usePlacementRendering(strategyGraph, placement));

    expect(result.current).toEqual({ kind: 'pending' });
    await waitFor(() => expect(result.current.kind).toBe('ready'));

    expect(result.current).toEqual({
      kind: 'ready',
      strategyGraph: {
        resources: [{ ...strategyGraph.resources[0]!, x: 80, y: 120 }],
        edges: [],
      },
    });
  });

  it('re-runs layout for a new strategyGraph while the placement keeps its identity', async () => {
    // What Edit completion relies on since it stopped forcing a new placement
    // identity to provoke a re-layout: a completed Edit replaces the working
    // snapshot, and the `LayoutStrategyGraph` derived from it re-fires this
    // effect on its own. Nothing here touches the placement — the same object
    // is handed back on every render, so only the strategyGraph half can
    // produce the second layout run.
    const placement = placementOf([
      [RESOURCE_A, { x: 80, y: 120 }],
      [RESOURCE_B, { x: 400, y: 260 }],
    ]);
    const gainedResource: LayoutStrategyGraph = {
      resources: [
        { id: RESOURCE_A, width: 240, height: 140 },
        { id: RESOURCE_B, width: 240, height: 140 },
      ],
      edges: [],
    };
    const { result, rerender } = renderHook(
      ({ input }) => usePlacementRendering(input, placement),
      {
        initialProps: { input: strategyGraph },
      },
    );
    await waitFor(() => expect(result.current.kind).toBe('ready'));

    rerender({ input: gainedResource });

    await waitFor(() =>
      expect(result.current).toEqual({
        kind: 'ready',
        strategyGraph: {
          resources: [
            { ...gainedResource.resources[0]!, x: 80, y: 120 },
            { ...gainedResource.resources[1]!, x: 400, y: 260 },
          ],
          edges: [],
        },
      }),
    );
  });

  it('makes the previous result unavailable the instant the placement changes identity', async () => {
    const first = placementOf([[RESOURCE_A, { x: 0, y: 0 }]]);
    const second = placementOf([[RESOURCE_A, { x: 500, y: 500 }]]);
    const { result, rerender } = renderHook(
      ({ placement }) => usePlacementRendering(strategyGraph, placement),
      { initialProps: { placement: first } },
    );
    await waitFor(() => expect(result.current.kind).toBe('ready'));

    rerender({ placement: second });

    expect(result.current).toEqual({ kind: 'pending' });
    await waitFor(() => expect(result.current.kind).toBe('ready'));
    expect(result.current).toEqual({
      kind: 'ready',
      strategyGraph: { resources: [{ ...strategyGraph.resources[0]!, x: 500, y: 500 }], edges: [] },
    });
  });

  it('makes a result unavailable when the same placement is handed a different strategyGraph', async () => {
    // The placement identity never changes here, so only the
    // `input === strategyGraph` half of the freshness guard can hold the
    // stale result back.
    const placement = placementOf([
      [RESOURCE_A, { x: 0, y: 0 }],
      [RESOURCE_B, { x: 320, y: 0 }],
    ]);
    const nextGraph: LayoutStrategyGraph = {
      resources: [
        { id: RESOURCE_A, width: 240, height: 140 },
        { id: RESOURCE_B, width: 240, height: 140 },
      ],
      edges: [],
    };
    const { result, rerender } = renderHook(
      ({ input }) => usePlacementRendering(input, placement),
      {
        initialProps: { input: strategyGraph },
      },
    );
    await waitFor(() => expect(result.current.kind).toBe('ready'));

    rerender({ input: nextGraph });

    expect(result.current).toEqual({ kind: 'pending' });
    await waitFor(() => expect(result.current.kind).toBe('ready'));
    expect(result.current).toEqual({
      kind: 'ready',
      strategyGraph: {
        resources: [
          { ...nextGraph.resources[0]!, x: 0, y: 0 },
          { ...nextGraph.resources[1]!, x: 320, y: 0 },
        ],
        edges: [],
      },
    });
  });
});
