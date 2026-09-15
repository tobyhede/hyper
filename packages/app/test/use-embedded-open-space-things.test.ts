// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Thing } from '@project/core';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import type { OpenSpace } from '../src/open-spaces';
import type { SpaceThingFraming } from '../src/space-thing-framing';
import {
  useEmbeddedOpenSpaceThings,
  type EmbeddedTargetReader,
} from '../src/use-embedded-open-space-things';

const id = (value: number) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`);

const HOST = id(1);
const TARGET = id(2);
const DIAGRAM = id(3);
const GRAPH = id(4);
const OTHER_DIAGRAM = id(6);

const spaceThing = (thingId: typeof HOST, diagram: typeof DIAGRAM): ThingFlowNode => ({
  id: thingId,
  type: 'thing',
  position: { x: 100, y: 200 },
  width: 700,
  height: 500,
  data: {
    thingId,
    title: 'Elsewhere',
    readOnly: false,
    kind: 'space',
    expanded: true,
    spaceContent: {
      id: thingId,
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET,
      diagram,
      graph: GRAPH,
    } satisfies Extract<Thing, { kind: 'space' }>,
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
    emphasis: 'equal',
  },
});

const reader = (
  embed: (spaceId: typeof TARGET) => Promise<OpenSpace | undefined>,
  entries: readonly OpenSpace[] = [],
): EmbeddedTargetReader => ({
  getState: () => ({ entries }),
  subscribe: () => () => undefined,
  embed,
});

describe('useEmbeddedOpenSpaceThings', () => {
  it('asks for each visible embedding once, and again only when the Diagram changes', async () => {
    const asked: (typeof TARGET)[] = [];
    const spaces = reader((spaceId) => {
      asked.push(spaceId);
      return Promise.resolve(undefined);
    });
    const { rerender } = renderHook(({ nodes }) => useEmbeddedOpenSpaceThings(nodes, spaces), {
      initialProps: { nodes: [spaceThing(HOST, DIAGRAM)] },
    });
    await waitFor(() => expect(asked).toEqual([TARGET]));
    rerender({ nodes: [spaceThing(HOST, DIAGRAM)] });
    await act(async () => {
      await Promise.resolve();
    });
    expect(asked).toEqual([TARGET]);
    rerender({ nodes: [spaceThing(HOST, OTHER_DIAGRAM)] });
    await waitFor(() => expect(asked).toEqual([TARGET, TARGET]));
  });

  it('surfaces a failed read keyed by the target Space and clears it on resume', async () => {
    let fail = true;
    const spaces = reader(() => {
      if (fail) return Promise.reject(new Error('Target missing'));
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() =>
      useEmbeddedOpenSpaceThings([spaceThing(HOST, DIAGRAM)], spaces),
    );
    await waitFor(() => expect(result.current.embeddedFailures.get(TARGET)).toBe('Target missing'));
    fail = false;
    await act(async () => {
      await result.current.resumeEmbedded(TARGET);
    });
    expect(result.current.embeddedFailures.has(TARGET)).toBe(false);
  });

  it('drops a failure whose embedding is no longer standing', async () => {
    const spaces = reader(() => Promise.reject(new Error('Target missing')));
    const { result, rerender } = renderHook(
      ({ nodes }) => useEmbeddedOpenSpaceThings(nodes, spaces),
      { initialProps: { nodes: [spaceThing(HOST, DIAGRAM)] } },
    );
    await waitFor(() => expect(result.current.embeddedFailures.get(TARGET)).toBe('Target missing'));
    rerender({ nodes: [] });
    expect(result.current.embeddedFailures.has(TARGET)).toBe(false);
  });

  it('measures the title footer into embed bounds', async () => {
    const spaces = reader(() => Promise.resolve(undefined));
    const { result } = renderHook(() =>
      useEmbeddedOpenSpaceThings([spaceThing(HOST, DIAGRAM)], spaces),
    );
    await waitFor(() => expect(result.current.embeddedRequests).toHaveLength(1));
    expect(result.current.embeddedRequests[0]?.bounds.bottom).toBe(396);
    act(() => {
      result.current.reportBodyHeight(HOST, 40);
    });
    expect(result.current.embeddedRequests[0]?.bounds.bottom).toBe(456);
  });

  it('owns portal Edit membership and the in-flight framing draft', async () => {
    const spaces = reader(() => Promise.resolve(undefined));
    const { result } = renderHook(() =>
      useEmbeddedOpenSpaceThings([spaceThing(HOST, DIAGRAM)], spaces),
    );
    await waitFor(() => expect(result.current.embeddedRequests).toHaveLength(1));
    const framing: SpaceThingFraming = { centreX: 200, centreY: 100, zoom: 2 };
    act(() => {
      result.current.onPortalEditingChange(HOST, true);
      result.current.setPortalDraft(new Map([[HOST, framing]]));
    });
    expect(result.current.editingPortals.has(HOST)).toBe(true);
    expect(result.current.portalDraft.get(HOST)).toEqual(framing);
    act(() => {
      result.current.onPortalEditingChange(HOST, false);
    });
    expect(result.current.editingPortals.has(HOST)).toBe(false);
  });
});
