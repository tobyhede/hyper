import { describe, expect, it } from 'vitest';
import { Position, type Edge } from '@xyflow/react';
import { uuidSchema } from '@project/core';
import type { LayoutPoint } from '@project/graph';
import { createRenderAdapter, type RenderAdapter } from '../src/render-adapter';
import type { AuthoringResult, SpaceAuthoring } from '../src/space-authoring';
import { completeDrag, node } from './render-adapter-fixtures';

const CARD_A = '00000000-0000-4000-8000-000000000002';
const CARD_B = '00000000-0000-4000-8000-000000000003';

const PROJECTED = [node(CARD_A, 10, 20), node(CARD_B, 300, 20)];

const EDGE: Edge = {
  id: '00000000-0000-4000-8000-000000000004:A->B',
  source: CARD_A,
  target: CARD_B,
};

/** A Space Authoring that records what it was told, without a session behind it. */
function authoringSpy() {
  const installs: (ReadonlyMap<string, LayoutPoint> | null)[] = [];
  const completions: unknown[] = [];
  const authoring = {
    getState: () => ({}) as never,
    authoredPlacement: () => null,
    subscribe: () => () => undefined,
    installPlacement: (placement: ReadonlyMap<string, LayoutPoint> | null) => {
      installs.push(placement);
    },
    canConnect: () => true,
    canCreateConnectedCard: () => true,
    complete: (completion: unknown): AuthoringResult => {
      completions.push(completion);
      return { kind: 'completed' };
    },
    retryPersistence: () => undefined,
    dispose: () => undefined,
  } as unknown as SpaceAuthoring;
  return { authoring, installs, completions };
}

function adapter(): RenderAdapter {
  return createRenderAdapter(authoringSpy().authoring);
}

describe('render adapter', () => {
  /*
   * Nodes and their Route Edges are one published value, not two fields that
   * happen to be written together. The tests below pin the states that
   * separation allowed: Edges surviving without the nodes declaring their
   * handles, and Edges being dropped by a change that concerns only nodes.
   */
  it('has published no projection at all before the first arrangement resolves', () => {
    expect(adapter().getState().projection).toBeNull();
  });

  it('drops the published Route Edges with their nodes when the renderer changes', () => {
    const store = adapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);
    expect(store.getState().projection?.edges).toEqual([EDGE]);

    store.getState().selectRenderer(null);

    expect(store.getState().projection).toBeNull();
  });

  it('keeps the published Route Edges through a change that concerns only nodes', () => {
    const store = adapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);

    completeDrag(store, CARD_A, 500, 400);
    store.getState().selectCard(uuidSchema.parse(CARD_A));

    expect(store.getState().projection?.edges).toEqual([EDGE]);
    expect(store.getState().projection?.nodes[0]?.position).toEqual({ x: 500, y: 400 });
  });

  it('publishes a new Route Edge only with both endpoint handle declarations', () => {
    const store = adapter();
    store.getState().syncProjection(PROJECTED, []);
    const routeId = '00000000-0000-4000-8000-000000000004';
    const sourceHandle = `${routeId}::out`;
    const targetHandle = `${routeId}::in`;
    const edge: Edge = {
      id: `${routeId}:A->B`,
      source: CARD_A,
      target: CARD_B,
      sourceHandle,
      targetHandle,
    };
    const nextNodes = PROJECTED.map((projected, index) => ({
      ...projected,
      handles: [
        {
          id: index === 0 ? sourceHandle : targetHandle,
          type: index === 0 ? ('source' as const) : ('target' as const),
          position: index === 0 ? Position.Right : Position.Left,
          x: index === 0 ? 300 : 0,
          y: 100,
          width: 8,
          height: 8,
        },
      ],
    }));
    const observed: ReturnType<typeof store.getState>[] = [];
    const unsubscribe = store.subscribe((state) => observed.push(state));

    store.getState().syncProjection(nextNodes, [edge]);
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]?.projection?.edges).toEqual([edge]);
    expect(observed[0]?.projection?.nodes[0]?.handles?.map((handle) => handle.id)).toContain(
      sourceHandle,
    );
    expect(observed[0]?.projection?.nodes[1]?.handles?.map((handle) => handle.id)).toContain(
      targetHandle,
    );
  });

  it('keeps a live node position across a reprojection', () => {
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    store.getState().syncProjection([node(CARD_A, 10, 20)], []);
    completeDrag(store, CARD_A, 111, 222);

    // A projection carries the title and handles, never the position — the live
    // node owns that. Re-projecting at the origin must not move a dragged card.
    store.getState().syncProjection([node(CARD_A, 0, 0)], []);

    expect(store.getState().projection?.nodes[0]?.position).toEqual({ x: 111, y: 222 });
    expect(spy.installs.at(-1)).toEqual(new Map([[CARD_A, { x: 111, y: 222 }]]));
  });
});
