import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type SpaceSession,
} from '@project/persistence';
import { createNavigation, type Navigation, type NavigationState } from '../src/navigation';
import { createSpaceAuthoring, type AuthoringResult } from '../src/space-authoring';
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
  reportObserverError?: (error: unknown) => void,
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
  return {
    backend,
    session,
    navigation,
    authoring: createSpaceAuthoring({
      session,
      navigation,
      ...(reportObserverError !== undefined ? { reportObserverError } : {}),
    }),
  };
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
    let reentrantResult: AuthoringResult | null = null;
    authoring.subscribe(() => {
      if (reentered) return;
      reentered = true;
      authoring.installPlacement(
        new Map([
          [CARD_A, { x: 10, y: 20 }],
          [CARD_B, { x: 500, y: 400 }],
        ]),
      );
      reentrantResult = authoring.complete({ kind: 'settled-card-movement' });
    });
    const observed: number[] = [];
    authoring.subscribe(() => {
      const layout = authoring.getState().session.working.document.layouts?.[0];
      observed.push(layout?.positions[CARD_B]?.x ?? -1);
    });

    authoring.complete({ kind: 'connected-cards', from: CARD_B, to: CARD_A });

    expect(observed).toEqual([300, 500]);
    // The answer the reentrant caller got, not just its effect: a completion
    // made from inside publication is queued rather than run there.
    expect(reentrantResult).toEqual({ kind: 'queued' });
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
    // The real adapter, with only the first commit's outcome injected, so the
    // retry path is exercised against actual backend commit behavior rather than
    // a stand-in that always succeeds.
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({ kind: 'retryable-failure', code: 'network', message: 'Offline' });
    const backend = new MemorySpaceBackend([loaded], control);
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
    expect(control.attempts.at(-1)?.snapshot.document.layouts?.[0]?.positions[CARD_A]).toEqual({
      x: 500,
      y: 600,
    });
  });

  it('answers the installed placement from one accessor, and keeps identity for an equal one', () => {
    const positioned: SpaceSnapshot = {
      ...automaticSnapshot,
      document: {
        ...automaticSnapshot.document,
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 10, y: 20 } },
          },
        ],
        defaultView: LAYOUT_ID,
      },
    };
    const { authoring, navigation } = openAuthoring(positioned, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });

    authoring.installPlacement(new Map([[CARD_A, { x: 10, y: 20 }]]));

    // One accessor, answering the value that is actually installed. A second
    // copy carried on the published state could only disagree with this, since
    // installing a placement is not a publication.
    const installed = authoring.authoredPlacement();
    expect(installed).toEqual(new Map([[CARD_A, { x: 10, y: 20 }]]));

    // An equal placement is not a change, and must keep its identity:
    // `usePlacementRendering` rebuilds the positioned strategy whenever this map
    // changes identity and re-runs layout, so a fresh copy would re-arrange a
    // settled graph on every projection.
    authoring.installPlacement(new Map([[CARD_A, { x: 10, y: 20 }]]));
    expect(authoring.authoredPlacement()).toBe(installed);

    // Only an authored Layout supplies positions; an Algorithmic View computes
    // its own, so it must answer null however much placement is installed.
    navigation.selectRenderer({ kind: 'view', view: 'graph' });
    expect(authoring.authoredPlacement()).toBeNull();
  });

  it('releases its session and navigation subscriptions when disposed', () => {
    const { authoring, session, navigation } = openAuthoring();
    let published = 0;
    authoring.subscribe(() => {
      published += 1;
    });

    navigation.activateRoute(ROUTE_ID);
    expect(published).toBe(1);

    // Accepting a remote Space remounts the workspace against the *same*
    // long-lived session, so an Authoring that never unsubscribes leaves a
    // listener and its closure behind on every conflict resolution.
    authoring.dispose();
    navigation.activateRoute(ROUTE_ID);
    session.submit({
      ...automaticSnapshot,
      document: { ...automaticSnapshot.document, title: 'Renamed' },
    });

    expect(published).toBe(1);
  });

  it('treats a value-equal Layout written in another key order as no Edit', () => {
    const positioned: SpaceSnapshot = {
      ...automaticSnapshot,
      document: {
        ...automaticSnapshot.document,
        layouts: [
          // Value-identical to what a completed Edit writes, but with the keys
          // and the position entries in another order. Nothing promises that a
          // stored or imported Space agrees with the writer's key order, and
          // ordering is not a difference an author made.
          {
            kind: 'positioned',
            positions: { [CARD_B]: { x: 300, y: 40 }, [CARD_A]: { x: 10, y: 20 } },
            activeRoute: ROUTE_ID,
            title: 'Layout 1',
            id: LAYOUT_ID,
          },
        ],
        defaultView: LAYOUT_ID,
      },
    };
    const { authoring, session } = openAuthoring(positioned, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    const before = session.getState().working;
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(authoring.complete({ kind: 'settled-card-movement' })).toEqual({ kind: 'no-edit' });
    expect(session.getState().working).toBe(before);
  });

  it('numbers a new Layout and Card above the highest existing number', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(CREATED_CARD_ID as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce(LAYOUT_ID as ReturnType<typeof crypto.randomUUID>);
    const numbered: SpaceSnapshot = {
      ...automaticSnapshot,
      document: {
        ...automaticSnapshot.document,
        // 'Notes' is not a numbered title and contributes nothing; 'Layout 7' is
        // the highest, so the next is 8 rather than one past the count.
        layouts: [
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000022'),
            title: 'Notes',
            kind: 'positioned',
            positions: {},
          },
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000023'),
            title: 'Layout 7',
            kind: 'positioned',
            positions: {},
          },
        ],
      },
      cards: [
        { id: CARD_A, document: { title: 'Card 9', kind: 'markdown', body: '' } },
        { id: CARD_B, document: { title: 'Intro', kind: 'markdown', body: '' } },
      ],
    };
    const { authoring, session } = openAuthoring(numbered);
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(
      authoring.complete({ kind: 'create-and-connect', from: CARD_A, position: { x: 5, y: 6 } }),
    ).toEqual({ kind: 'completed', createdCardId: CREATED_CARD_ID });

    expect(session.getState().working.cards.at(-1)?.document.title).toBe('Card 10');
    expect(session.getState().working.document.layouts?.at(-1)?.title).toBe('Layout 8');
  });

  it('refuses to connect with no active Route while the Space already holds Routes', () => {
    // A Layout filtering every Route away resolves to no active Route. Minting
    // is reserved for a Space that has none at all, so this is refused rather
    // than quietly adding a second Route the filter would then hide. It is also
    // why a minted Route is always the first one, and `nextRouteTitle` only
    // ever numbers against an empty set.
    const filtered: SpaceSnapshot = {
      ...automaticSnapshot,
      document: {
        ...automaticSnapshot.document,
        routes: [{ id: ROUTE_ID, title: 'Route 3', edges: [{ from: CARD_A, to: CARD_B }] }],
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 10, y: 20 }, [CARD_B]: { x: 300, y: 40 } },
            routes: [],
          },
        ],
        defaultView: LAYOUT_ID,
      },
    };
    const { authoring, session, navigation } = openAuthoring(filtered, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    expect(navigation.getState().activeRouteId).toBeNull();
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    const before = session.getState().working;

    expect(authoring.canConnect(CARD_B, CARD_A)).toBe(false);
    expect(authoring.complete({ kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'no-edit',
    });
    expect(session.getState().working).toBe(before);
  });

  it('reports the completions a failed drain discards', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const real = openSpaceSession(backend, loaded);
    let submits = 0;
    const session: SpaceSession = {
      ...real,
      submit: (snapshot) => {
        submits += 1;
        if (submits === 2) throw new Error('submit failed');
        real.submit(snapshot);
      },
    };
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
    const navigation = createNavigation(currentSpace, { kind: 'view', view: 'graph' });
    const reported: unknown[] = [];
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      reportObserverError: (error) => reported.push(error),
    });
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    // Two observers each completing one further Edit, so the drain still holds
    // one when the other throws.
    for (const edge of [
      { from: CARD_A, to: CARD_A },
      { from: CARD_B, to: CARD_B },
    ] as const) {
      let done = false;
      authoring.subscribe(() => {
        if (done) return;
        done = true;
        authoring.complete({ kind: 'connected-cards', ...edge });
      });
    }

    expect(() => authoring.complete({ kind: 'connected-cards', from: CARD_B, to: CARD_A })).toThrow(
      'submit failed',
    );

    // Abandoning them silently is what makes the failure unreadable: the Edits
    // are gone and nothing said so.
    expect(reported).toHaveLength(1);
    expect(String(reported[0])).toMatch(/discarded 1 queued completion/);
  });

  it('contains a rejected asynchronous observer instead of letting it escape', async () => {
    const reported: unknown[] = [];
    const { authoring, navigation } = openAuthoring(automaticSnapshot, undefined, (error) =>
      reported.push(error),
    );
    // `subscribe` takes `() => void`, and TypeScript's void-return bivariance
    // lets an async listener through without complaint. Its rejection never
    // reaches the try/catch around the call, and Node answers an unhandled
    // rejection by killing the process.
    // Deliberately the shape lint rejects: the rule is the first line of
    // defence and this asserts the second, for a listener that reaches the same
    // shape indirectly and never trips it.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    authoring.subscribe(() => Promise.reject(new Error('observer rejected')));
    navigation.activateRoute(ROUTE_ID);

    await vi.waitFor(() => expect(reported.map(String)).toEqual(['Error: observer rejected']));
  });

  it('treats a selected Layout the Space no longer holds as no Edit', () => {
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    // Navigation refuses a renderer the Space does not hold, so this state is
    // only reachable by the Space losing the Layout under a selection that was
    // valid when it was made — an accepted remote Space that dropped it, say.
    // Authoring may not resurrect it, so the Edit is refused rather than
    // written to a fresh Layout under the missing id.
    const navigation = {
      getState: () =>
        ({
          selectedRenderer: { kind: 'layout', layoutId: LAYOUT_ID },
          activeRouteId: ROUTE_ID,
        }) as NavigationState,
      subscribe: () => () => undefined,
      continueInRenderer: () => undefined,
      activateRoute: () => undefined,
    } as unknown as Navigation;
    const authoring = createSpaceAuthoring({ session, navigation });
    authoring.installPlacement(
      new Map([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'settled-card-movement' })).toEqual({ kind: 'no-edit' });
    expect(session.getState().working).toBe(before);
  });
});
