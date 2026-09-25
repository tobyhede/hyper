// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Resource } from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { OpenSpace } from '../src/open-spaces';
import type { SpaceResourceFraming } from '../src/space-resource-framing';
import {
  useEmbeddedOpenSpaceResources,
  type EmbeddedTargetReader,
} from '../src/use-embedded-open-space-resources';

/** No gesture in flight: the lean is a drag's, and these tests run none. */
const NO_DRAG: ReadonlySet<string> = new Set();

const id = (value: number) =>
  uuidSchema.parse(`00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`);

const HOST = id(1);
const TARGET = id(2);
const MAP = id(3);
const GRAPH = id(4);
const OTHER_MAP = id(6);

const spaceResource = (resourceId: typeof HOST, map: typeof MAP): ResourceFlowNode => ({
  id: resourceId,
  type: 'resource',
  position: { x: 100, y: 200 },
  width: 700,
  height: 500,
  data: {
    resourceId,
    title: 'Elsewhere',
    readOnly: false,
    kind: 'space',
    open: true,
    spaceContent: {
      id: resourceId,
      title: 'Elsewhere',
      kind: 'space',
      spaceId: TARGET,
      map,
      graph: GRAPH,
    } satisfies Extract<Resource, { kind: 'space' }>,
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
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

describe('useEmbeddedOpenSpaceResources', () => {
  it('asks for each visible embedding once, and again only when the Map changes', async () => {
    const asked: (typeof TARGET)[] = [];
    const spaces = reader((spaceId) => {
      asked.push(spaceId);
      return Promise.resolve(undefined);
    });
    const { rerender } = renderHook(
      ({ nodes }) => useEmbeddedOpenSpaceResources(nodes, spaces, NO_DRAG),
      {
        initialProps: { nodes: [spaceResource(HOST, MAP)] },
      },
    );
    await waitFor(() => expect(asked).toEqual([TARGET]));
    rerender({ nodes: [spaceResource(HOST, MAP)] });
    await act(async () => {
      await Promise.resolve();
    });
    expect(asked).toEqual([TARGET]);
    rerender({ nodes: [spaceResource(HOST, OTHER_MAP)] });
    await waitFor(() => expect(asked).toEqual([TARGET, TARGET]));
  });

  it('surfaces a failed read keyed by the target Space and clears it on resume', async () => {
    let fail = true;
    const spaces = reader(() => {
      if (fail) return Promise.reject(new Error('Target missing'));
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() =>
      useEmbeddedOpenSpaceResources([spaceResource(HOST, MAP)], spaces, NO_DRAG),
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
      ({ nodes }) => useEmbeddedOpenSpaceResources(nodes, spaces, NO_DRAG),
      { initialProps: { nodes: [spaceResource(HOST, MAP)] } },
    );
    await waitFor(() => expect(result.current.embeddedFailures.get(TARGET)).toBe('Target missing'));
    rerender({ nodes: [] });
    expect(result.current.embeddedFailures.has(TARGET)).toBe(false);
  });

  it('measures the title footer into embed bounds', async () => {
    const spaces = reader(() => Promise.resolve(undefined));
    const { result } = renderHook(() =>
      useEmbeddedOpenSpaceResources([spaceResource(HOST, MAP)], spaces, NO_DRAG),
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
      useEmbeddedOpenSpaceResources([spaceResource(HOST, MAP)], spaces, NO_DRAG),
    );
    await waitFor(() => expect(result.current.embeddedRequests).toHaveLength(1));
    const framing: SpaceResourceFraming = { centreX: 200, centreY: 100, zoom: 2 };
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
