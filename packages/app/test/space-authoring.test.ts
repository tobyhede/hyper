import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession, type SpaceBackend } from '@project/persistence';
import { createNavigation } from '../src/navigation';
import { createSpaceAuthoring } from '../src/space-authoring';
import type { RendererSelection } from '../src/view';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const MINTED_ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const CREATED_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

const automaticSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Space',
    routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

function openAuthoring(
  snapshot: SpaceSnapshot = automaticSnapshot,
  renderer: RendererSelection = { kind: 'view', view: 'graph' },
) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const backend = new MemorySpaceBackend([loaded]);
  const session = openSpaceSession(backend, loaded);
  const currentSpace = () => {
    const result = loadSpaceSnapshot(session.getState().working);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
    return result.space;
  };
  const navigation = createNavigation(currentSpace, renderer);
  return { backend, session, navigation, authoring: createSpaceAuthoring({ session, navigation }) };
}

describe('Space Authoring', () => {
  afterEach(() => vi.restoreAllMocks());

  it('converts an Algorithmic View from the completed on-screen placement', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const { authoring, session, navigation } = openAuthoring();
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(authoring.complete({ kind: 'settled-card-movement' })).toEqual({ kind: 'completed' });

    expect(session.getState().working.document.layouts).toEqual([
      {
        id: LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 10, y: 20 },
          [CARD_B]: { x: 300, y: 40 },
        },
        activeRoute: ROUTE_ID,
      },
    ]);
    expect(session.getState().working.document.defaultView).toBe(LAYOUT_ID);
    expect(navigation.getState().selectedRenderer).toEqual({ kind: 'layout', layoutId: LAYOUT_ID });
  });

  it('uses one eligibility policy for preview and completion of an existing-Card Edge', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const { authoring, session } = openAuthoring();
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(authoring.canConnect(CARD_B, CARD_A)).toBe(true);
    expect(authoring.complete({ kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'completed',
    });
    expect(session.getState().working.document.routes[0]?.edges).toEqual([
      { from: CARD_A, to: CARD_B },
      { from: CARD_B, to: CARD_A },
    ]);

    expect(authoring.canConnect(CARD_B, CARD_A)).toBe(false);
    expect(authoring.complete({ kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'no-edit',
    });
  });

  it('mints and activates Route 1 only when the first connection completes', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      MINTED_ROUTE_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const routeLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 2,
        title: 'New space',
        routes: [],
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 10, y: 20 } },
            routes: [],
          },
        ],
        defaultView: LAYOUT_ID,
      },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const { authoring, session, navigation } = openAuthoring(routeLess, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    authoring.installPlacement(new Map([[CARD_A, { x: 10, y: 20 }]]));

    expect(session.getState().working.document.routes).toEqual([]);
    expect(authoring.complete({ kind: 'connected-cards', from: CARD_A, to: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(session.getState().working.document.routes).toEqual([
      {
        id: MINTED_ROUTE_ID,
        title: 'Route 1',
        edges: [{ from: CARD_A, to: CARD_A }],
      },
    ]);
    expect(session.getState().working.document.layouts?.[0]).toMatchObject({
      routes: [MINTED_ROUTE_ID],
      activeRoute: MINTED_ROUTE_ID,
    });
    expect(navigation.getState().activeRouteId).toBe(MINTED_ROUTE_ID);
  });

  it('creates the Card, first Route, Edge and Layout as one Edit with internal identities', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(CREATED_CARD_ID as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce(MINTED_ROUTE_ID as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce(LAYOUT_ID as ReturnType<typeof crypto.randomUUID>);
    const routeLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 2, title: 'New space', routes: [] },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const { authoring, session } = openAuthoring(routeLess);
    authoring.installPlacement(new Map([[CARD_A, { x: 120, y: 240 }]]));

    expect(authoring.canCreateConnectedCard(CARD_A)).toBe(true);
    expect(
      authoring.complete({
        kind: 'create-and-connect',
        from: CARD_A,
        position: { x: 420, y: 360 },
      }),
    ).toEqual({ kind: 'completed', createdCardId: CREATED_CARD_ID });

    expect(session.getState().working).toEqual({
      ...routeLess,
      document: {
        ...routeLess.document,
        routes: [
          {
            id: MINTED_ROUTE_ID,
            title: 'Route 1',
            edges: [{ from: CARD_A, to: CREATED_CARD_ID }],
          },
        ],
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: {
              [CARD_A]: { x: 120, y: 240 },
              [CREATED_CARD_ID]: { x: 420, y: 360 },
            },
            activeRoute: MINTED_ROUTE_ID,
          },
        ],
        defaultView: LAYOUT_ID,
      },
      cards: [
        ...routeLess.cards,
        {
          id: CREATED_CARD_ID,
          document: { title: 'Card 2', kind: 'markdown', body: '' },
        },
      ],
    });
    expect(authoring.canConnect(CREATED_CARD_ID, CARD_A)).toBe(true);
    expect(
      authoring.complete({ kind: 'connected-cards', from: CREATED_CARD_ID, to: CARD_A }),
    ).toEqual({ kind: 'completed' });
    expect(session.getState().working.document.routes[0]?.edges).toHaveLength(2);
  });

  it('queues a reentrant completion behind publication of the fully installed Edit', () => {
    const positioned: SpaceSnapshot = {
      ...automaticSnapshot,
      document: {
        ...automaticSnapshot.document,
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: {
              [CARD_A]: { x: 10, y: 20 },
              [CARD_B]: { x: 300, y: 40 },
            },
          },
        ],
        defaultView: LAYOUT_ID,
      },
    };
    const { authoring } = openAuthoring(positioned, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    let reentered = false;
    authoring.subscribe(() => {
      if (reentered) return;
      reentered = true;
      authoring.installPlacement(
        new Map([
          [CARD_A, { x: 10, y: 20 }],
          [CARD_B, { x: 500, y: 400 }],
        ]),
      );
      authoring.complete({ kind: 'settled-card-movement' });
    });
    const observed: number[] = [];
    authoring.subscribe(() => {
      const layout = authoring.getState().session.working.document.layouts?.[0];
      observed.push(layout?.positions[CARD_B]?.x ?? -1);
    });

    authoring.complete({ kind: 'connected-cards', from: CARD_B, to: CARD_A });

    expect(observed).toEqual([300, 500]);
  });

  it('publishes once after the optimistic Space and navigation consequences are installed', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const { authoring } = openAuthoring();
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    const observed: { readonly defaultView: string | undefined; readonly renderer: string }[] = [];
    authoring.subscribe(() => {
      const state = authoring.getState();
      observed.push({
        defaultView: state.session.working.document.defaultView,
        renderer:
          state.navigation.selectedRenderer.kind === 'layout'
            ? state.navigation.selectedRenderer.layoutId
            : state.navigation.selectedRenderer.view,
      });
    });

    authoring.complete({ kind: 'connected-cards', from: CARD_B, to: CARD_A });

    expect(observed).toEqual([{ defaultView: LAYOUT_ID, renderer: LAYOUT_ID }]);
  });

  it('treats unavailable placement, duplicate Edges and stale Card identities as no Edit', () => {
    const { authoring, session } = openAuthoring();
    const staleCard = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

    expect(() => authoring.complete({ kind: 'settled-card-movement' })).not.toThrow();
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    expect(authoring.canConnect(CARD_A, CARD_B)).toBe(false);
    expect(authoring.complete({ kind: 'connected-cards', from: CARD_A, to: CARD_B })).toEqual({
      kind: 'no-edit',
    });
    expect(authoring.canConnect(CARD_A, staleCard)).toBe(false);
    expect(authoring.complete({ kind: 'connected-cards', from: CARD_A, to: staleCard })).toEqual({
      kind: 'no-edit',
    });
    expect(session.getState().working).toEqual(automaticSnapshot);
  });

  it('keeps persistence failure visible, accepts another Edit, and retries the latest Space', async () => {
    const positioned: SpaceSnapshot = {
      ...automaticSnapshot,
      document: {
        ...automaticSnapshot.document,
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: {
              [CARD_A]: { x: 10, y: 20 },
              [CARD_B]: { x: 300, y: 40 },
            },
          },
        ],
        defaultView: LAYOUT_ID,
      },
    };
    const loaded = { snapshot: positioned, revision: 0n, exportedRevision: null };
    const committed: SpaceSnapshot[] = [];
    let attempt = 0;
    const backend: SpaceBackend = {
      listSpaces: () => Promise.resolve([{ id: SPACE_ID, title: positioned.document.title }]),
      loadSpace: () => Promise.resolve(loaded),
      commitSpace: (snapshot) => {
        attempt += 1;
        if (attempt === 1) {
          return Promise.resolve({
            kind: 'retryable-failure',
            code: 'network',
            message: 'Offline',
          });
        }
        committed.push(snapshot);
        return Promise.resolve({ kind: 'committed', revision: 1n });
      },
    };
    const session = openSpaceSession(backend, loaded);
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
    const navigation = createNavigation(currentSpace, { kind: 'layout', layoutId: LAYOUT_ID });
    const authoring = createSpaceAuthoring({ session, navigation });
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 100, y: 200 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    authoring.complete({ kind: 'settled-card-movement' });
    await vi.waitFor(() => expect(authoring.getState().session.persistence.kind).toBe('failed'));

    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 500, y: 600 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    expect(authoring.complete({ kind: 'settled-card-movement' })).toEqual({ kind: 'completed' });
    expect(authoring.getState().session.persistence.kind).toBe('failed');

    authoring.retryPersistence();
    await vi.waitFor(() => expect(authoring.getState().session.persistence.kind).toBe('settled'));
    expect(committed[0]?.document.layouts?.[0]?.positions[CARD_A]).toEqual({ x: 500, y: 600 });
  });
});
