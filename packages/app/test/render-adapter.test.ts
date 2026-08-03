import { afterEach, describe, expect, it, vi } from 'vitest';
import { Position, type Edge } from '@xyflow/react';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot, type LayoutPoint } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { createNavigation } from '../src/navigation';
import { createRenderAdapter, type RenderAdapter } from '../src/render-adapter';
import {
  createSpaceAuthoring,
  type AuthoringResult,
  type SpaceAuthoring,
} from '../src/space-authoring';
import { completeDrag, node } from './render-adapter-fixtures';

const CARD_A = '00000000-0000-4000-8000-000000000002';
const CARD_B = '00000000-0000-4000-8000-000000000003';
const CARD_C = '00000000-0000-4000-8000-000000000005';
const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const CREATED_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const PROJECTED = [node(CARD_A, 10, 20), node(CARD_B, 300, 20)];
const SPARSE_PROJECTED = [...PROJECTED, node(CARD_C, 600, 20)];

const EDGE: Edge = {
  id: '00000000-0000-4000-8000-000000000004:A->B',
  source: CARD_A,
  target: CARD_B,
};

interface InstallRecord {
  readonly placement: ReadonlyMap<string, LayoutPoint> | null;
  /** What the adapter's own state held at the moment the effect ran. */
  readonly nodesAtCall: readonly CardFlowNode[] | null;
}

/** A Space Authoring that records what it was told, without a session behind it. */
function authoringSpy() {
  const installs: InstallRecord[] = [];
  const completions: unknown[] = [];
  let adapter: RenderAdapter | null = null;
  const authoring = {
    getState: () => ({}) as never,
    authoredPlacement: () => null,
    subscribe: () => () => undefined,
    installPlacement: (placement: ReadonlyMap<string, LayoutPoint> | null) => {
      installs.push({ placement, nodesAtCall: adapter?.getState().projection?.nodes ?? null });
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
  return {
    authoring,
    installs,
    completions,
    attach: (store: RenderAdapter) => {
      adapter = store;
    },
  };
}

function adapter(): RenderAdapter {
  return createRenderAdapter(authoringSpy().authoring);
}

function sparsePositionedAdapter() {
  const snapshot: SpaceSnapshot = {
    id: SPACE_ID,
    document: {
      version: 2,
      title: 'Space',
      routes: [
        {
          id: ROUTE_ID,
          title: 'Main',
          edges: [{ from: uuidSchema.parse(CARD_A), to: uuidSchema.parse(CARD_B) }],
        },
      ],
      layouts: [
        {
          id: LAYOUT_ID,
          title: 'Layout 1',
          kind: 'positioned',
          positions: { [uuidSchema.parse(CARD_A)]: { x: 10, y: 20 } },
        },
      ],
      defaultView: LAYOUT_ID,
    },
    cards: [
      {
        id: uuidSchema.parse(CARD_A),
        document: { title: 'A', kind: 'markdown', body: 'A' },
      },
      {
        id: uuidSchema.parse(CARD_B),
        document: { title: 'B', kind: 'markdown', body: 'B' },
      },
      {
        id: uuidSchema.parse(CARD_C),
        document: { title: 'C', kind: 'markdown', body: 'C' },
      },
    ],
  };
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
  const currentSpace = () => {
    const result = loadSpaceSnapshot(session.getState().working);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
    return result.space;
  };
  const navigation = createNavigation(currentSpace, { kind: 'layout', layoutId: LAYOUT_ID });
  const authoring = createSpaceAuthoring({
    session,
    navigation,
    initialPlacement: new Map([[CARD_A, { x: 10, y: 20 }]]),
  });
  return { session, store: createRenderAdapter(authoring) };
}

describe('render adapter', () => {
  afterEach(() => vi.restoreAllMocks());

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

  it('publishes the projection before installing the placement it produced', () => {
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);

    store.getState().syncProjection(PROJECTED, []);

    // Computing inside the `set` updater made the cross-store write land while
    // the adapter still held its previous state, so anything the effect
    // notified read the projection from before the one it was told about.
    expect(spy.installs).toHaveLength(1);
    expect(spy.installs[0]?.nodesAtCall?.map((entry) => entry.id)).toEqual([CARD_A, CARD_B]);
    expect(spy.installs[0]?.placement).toEqual(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 20 }],
      ]),
    );
    expect(store.getState().projection?.nodes.map((entry) => entry.id)).toEqual([CARD_A, CARD_B]);
  });

  it('preserves unplaced Cards when an existing Layout is edited', () => {
    const { session, store } = sparsePositionedAdapter();

    store.getState().syncProjection(SPARSE_PROJECTED, []);
    expect(
      store
        .getState()
        .connectCards(uuidSchema.parse(CARD_B), uuidSchema.parse(CARD_A), SPARSE_PROJECTED),
    ).toBe(true);

    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
    });
  });

  it('captures every projected Card when an Algorithmic View converts', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const snapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 2,
        title: 'Space',
        routes: [
          {
            id: ROUTE_ID,
            title: 'Main',
            edges: [{ from: uuidSchema.parse(CARD_A), to: uuidSchema.parse(CARD_B) }],
          },
        ],
      },
      cards: [
        {
          id: uuidSchema.parse(CARD_A),
          document: { title: 'A', kind: 'markdown', body: 'A' },
        },
        {
          id: uuidSchema.parse(CARD_B),
          document: { title: 'B', kind: 'markdown', body: 'B' },
        },
      ],
    };
    const loaded = { snapshot, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
    const navigation = createNavigation(currentSpace, { kind: 'view', view: 'graph' });
    const store = createRenderAdapter(createSpaceAuthoring({ session, navigation }));

    store.getState().syncProjection(PROJECTED, []);
    expect(
      store.getState().connectCards(uuidSchema.parse(CARD_B), uuidSchema.parse(CARD_A), PROJECTED),
    ).toBe(true);

    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 300, y: 20 },
    });
  });

  it('authors only the previously unplaced Card that the author moves', () => {
    const { session, store } = sparsePositionedAdapter();
    store.getState().syncProjection(SPARSE_PROJECTED, []);

    completeDrag(store, CARD_B, 400, 120);

    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 400, y: 120 },
    });
  });

  it('adds a newly created Card without placing other omitted Cards', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      CREATED_CARD_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const { session, store } = sparsePositionedAdapter();
    store.getState().syncProjection(SPARSE_PROJECTED, []);

    expect(store.getState().createConnectedCard(uuidSchema.parse(CARD_A), { x: 420, y: 360 })).toBe(
      CREATED_CARD_ID,
    );

    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CREATED_CARD_ID]: { x: 420, y: 360 },
    });
  });

  it('keeps a live node position across a reprojection', () => {
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);

    store.getState().syncProjection([node(CARD_A, 10, 20)], []);
    completeDrag(store, CARD_A, 111, 222);

    // A projection carries the title and handles, never the position — the live
    // node owns that. Re-projecting at the origin must not move a dragged card.
    store.getState().syncProjection([node(CARD_A, 0, 0)], []);

    expect(store.getState().projection?.nodes[0]?.position).toEqual({ x: 111, y: 222 });
    expect(spy.installs.at(-1)?.placement).toEqual(new Map([[CARD_A, { x: 111, y: 222 }]]));
  });
});
