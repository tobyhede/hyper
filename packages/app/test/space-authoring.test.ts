import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type SpaceBackend,
  type SpaceSession,
} from '@project/persistence';
import { createNavigation, type Navigation, type NavigationState } from '../src/navigation';
import {
  createSpaceAuthoring,
  type AuthoringResult,
  type SpaceAuthoring,
} from '../src/space-authoring';
import { resolveView, type RendererSelection } from '../src/view';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
/** A third Card that owns its content, so an Alias may legally target it. */
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const STORED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const MINTED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const CREATED_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

/** A Card identity no fixture Space holds, so any Layout naming it fails intake. */
const UNKNOWN_CARD = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const automaticSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Space',
    graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

/** A Layout that places every Card the Space holds. */
const positionedSnapshot: SpaceSnapshot = {
  ...automaticSnapshot,
  document: {
    ...automaticSnapshot.document,
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [CARD_A]: { x: 10, y: 20 }, [CARD_B]: { x: 300, y: 40 } },
      },
    ],
    defaultView: LAYOUT_ID,
  },
};

interface LoadedFixture {
  snapshot: SpaceSnapshot;
  revision: bigint;
  exportedRevision: bigint | null;
}

type CompletionWithoutGeometry =
  | { readonly kind: 'settled-card-movement' }
  | { readonly kind: 'connected-cards'; readonly from: typeof CARD_A; readonly to: typeof CARD_A }
  | { readonly kind: 'edited-card'; readonly cardId: typeof CARD_A }
  | {
      readonly kind: 'create-and-connect';
      readonly from: typeof CARD_A;
      readonly position: { readonly x: number; readonly y: number };
    };

const renderedByAuthoring = new WeakMap<SpaceAuthoring, Placement>();

/** Install setup geometry while remembering what a later completion reports. */
function replacePlacementForTest(authoring: SpaceAuthoring, rendered: Placement): void {
  renderedByAuthoring.set(authoring, rendered);
  authoring.replacePlacement(rendered);
}

/**
 * Keep the existing cases focused on their Edit outcome while the geometry
 * each completed authoring fact now requires travels through the real interface.
 */
function complete(
  authoring: SpaceAuthoring,
  completion: CompletionWithoutGeometry,
): AuthoringResult {
  if (completion.kind === 'edited-card') return authoring.complete(completion);
  const rendered = renderedByAuthoring.get(authoring) ?? authoring.authoredPlacement();
  if (rendered === null) {
    throw new Error('Test completion needs rendered placement');
  }
  if (completion.kind === 'settled-card-movement') {
    return authoring.complete({
      ...completion,
      rendered,
      placed: [...rendered.keys()],
    });
  }
  return authoring.complete({ ...completion, rendered });
}

/**
 * Compose one workspace exactly as `createApp` does, so a test never sees a seam
 * production does not have — in particular the Layout's own map as the opening
 * placement. `openAuthoring` below leaves that null on purpose, for the tests
 * that install one themselves.
 */
function attachAuthoring(
  backend: SpaceBackend,
  loaded: LoadedFixture,
  renderer: RendererSelection,
  reportObserverError?: (error: unknown) => void,
) {
  const session = openSpaceSession(backend, loaded);
  const currentSpace = () => {
    const result = loadSpaceSnapshot(session.getState().working);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
    return result.space;
  };
  const navigation = createNavigation(currentSpace, renderer);
  const resolved = resolveView(currentSpace(), renderer);
  const authoring = createSpaceAuthoring({
    session,
    navigation,
    initialPlacement: resolved.layout === null ? null : Placement.fromLayout(resolved.layout),
    ...(reportObserverError !== undefined ? { reportObserverError } : {}),
  });
  return { backend, session, navigation, authoring };
}

function openAuthoring(
  snapshot: SpaceSnapshot = automaticSnapshot,
  renderer: RendererSelection = { kind: 'view', view: 'flow' },
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

/**
 * `CARD_B` aliases `CARD_A`, and `CARD_C` is a third Card that owns its content.
 *
 * The separate target is what lets the refusal tests below name their reason:
 * every Alias edit they attempt produces a Space that *loads*, so the only thing
 * that can answer `no-edit` is the guard each one is about. Aimed at the Alias
 * instead, a guard removed would leave `loadSpaceSnapshot` to reject the chain
 * and the test to fail by throwing — still red, but red about the validator
 * rather than about the refusal it is named for.
 */
const openRefusalFixture = () => {
  const aliased: SpaceSnapshot = {
    ...positionedSnapshot,
    cards: [
      positionedSnapshot.cards[0]!,
      { id: CARD_B, document: { title: 'A again', kind: 'alias', target: CARD_A } },
      { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
    ],
  };
  const opened = openAuthoring(aliased, { kind: 'layout', layoutId: LAYOUT_ID });
  replacePlacementForTest(
    opened.authoring,
    Placement.fromEntries([
      [CARD_A, { x: 10, y: 20 }],
      [CARD_B, { x: 300, y: 40 }],
      [CARD_C, { x: 600, y: 40 }],
    ]),
  );
  return opened;
};

/**
 * A workspace held in conflict against a stored Space that differs from local
 * work in the positions it carries.
 *
 * Both replacement-epoch tests start here and diverge only in what their
 * observers do from the publication that follows. The stored positions are what
 * makes either one able to fail: a drained completion writes the local drag over
 * `{900, 700}`, so the harm shows up in the resulting Space rather than having
 * to be inferred from a counter.
 */
const openConflictedAgainstStoredSpace = async () => {
  const remote: SpaceSnapshot = {
    ...positionedSnapshot,
    document: {
      ...positionedSnapshot.document,
      title: 'Stored',
      layouts: [
        {
          id: LAYOUT_ID,
          title: 'Stored Layout',
          kind: 'positioned',
          positions: { [CARD_A]: { x: 900, y: 700 }, [CARD_B]: { x: 600, y: 500 } },
        },
      ],
    },
  };
  const backend = new MemorySpaceBackend([
    { snapshot: remote, revision: 4n, exportedRevision: null },
  ]);
  const reported: unknown[] = [];
  const { authoring } = attachAuthoring(
    backend,
    { snapshot: positionedSnapshot, revision: 3n, exportedRevision: null },
    { kind: 'layout', layoutId: LAYOUT_ID },
    (error) => reported.push(error),
  );
  replacePlacementForTest(
    authoring,
    Placement.fromEntries([
      [CARD_A, { x: 500, y: 600 }],
      [CARD_B, { x: 300, y: 40 }],
    ]),
  );
  complete(authoring, { kind: 'settled-card-movement' });
  await vi.waitFor(() => expect(authoring.getState().session.persistence.kind).toBe('conflicted'));
  return { authoring, remote, reported };
};

describe('Space Authoring', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renames a Card and converts the Algorithmic View from the completed placement', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const { authoring, session, navigation } = openAuthoring();
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    authoring.installCardDocument(CARD_A, {
      title: 'Renamed A',
      kind: 'markdown',
      body: 'A',
    });

    expect(complete(authoring, { kind: 'edited-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(session.getState().working.cards).toEqual([
      { id: CARD_A, document: { title: 'Renamed A', kind: 'markdown', body: 'A' } },
      { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
    ]);
    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 300, y: 40 },
    });
    // Written *and* selected. A conversion that stored the Layout without
    // repointing the renderer leaves the graph drawing the Algorithmic View it
    // just replaced, so the next placement would be computed rather than read
    // back from the Layout this Edit created.
    expect(navigation.getState().selectedRenderer).toEqual({ kind: 'layout', layoutId: LAYOUT_ID });
  });

  /**
   * An installed Card value is one hand-off, not a standing entry. An editor
   * installs its authoritative value *before* it reports the Edit, so the value
   * belongs to that report and to nothing after it. Left behind by a completion
   * that produced no Edit, it becomes state waiting to be applied by whatever
   * `edited-card` arrives next — a rename the author had abandoned, landing on a
   * Space they have since changed.
   */
  it('does not leave a Card value behind for the next completion to apply', () => {
    const { authoring, session } = openAuthoring();
    authoring.installCardDocument(CARD_A, {
      title: 'Abandoned rename',
      kind: 'markdown',
      body: 'A',
    });
    // No placement: an Algorithmic View has nothing to write the Edit into yet.
    expect(complete(authoring, { kind: 'edited-card', cardId: CARD_A })).toEqual({
      kind: 'no-edit',
    });

    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(complete(authoring, { kind: 'edited-card', cardId: CARD_A })).toEqual({
      kind: 'no-edit',
    });
    expect(session.getState().working.cards).toEqual(automaticSnapshot.cards);
  });

  it('treats an unchanged Card as no Edit before converting or submitting', () => {
    const minted = vi.spyOn(crypto, 'randomUUID');
    const control = new MemorySpaceBackendTestControl();
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const { authoring, session } = attachAuthoring(
      new MemorySpaceBackend([loaded], control),
      loaded,
      { kind: 'view', view: 'flow' },
    );
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    const before = session.getState().working;
    authoring.installCardDocument(CARD_A, automaticSnapshot.cards[0]!.document);

    expect(complete(authoring, { kind: 'edited-card', cardId: CARD_A })).toEqual({
      kind: 'no-edit',
    });
    expect(session.getState().working).toBe(before);
    expect(control.attempts).toEqual([]);
    expect(minted).not.toHaveBeenCalled();
  });

  it('submits one complete Markdown Card Edit without changing Space structure', () => {
    const control = new MemorySpaceBackendTestControl();
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    const { authoring, session } = attachAuthoring(
      new MemorySpaceBackend([loaded], control),
      loaded,
      { kind: 'layout', layoutId: LAYOUT_ID },
    );
    authoring.installCardDocument(CARD_A, {
      title: 'A',
      description: 'Edited in place',
      kind: 'markdown',
      body: '# Edited',
    });

    expect(complete(authoring, { kind: 'edited-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(control.attempts).toHaveLength(1);
    expect(control.attempts[0]?.snapshot.cards[0]?.document).toEqual({
      title: 'A',
      description: 'Edited in place',
      kind: 'markdown',
      body: '# Edited',
    });
    expect(session.getState().working.document.graphs).toEqual(positionedSnapshot.document.graphs);
    expect(session.getState().working.document.layouts).toEqual([
      {
        ...positionedSnapshot.document.layouts![0]!,
        activeGraph: GRAPH_ID,
      },
    ]);
  });

  it("renames an Alias without changing the target Card's content", () => {
    const aliased: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        positionedSnapshot.cards[0]!,
        { id: CARD_B, document: { title: 'A again', kind: 'alias', target: CARD_A } },
      ],
    };
    const { authoring, session } = openAuthoring(aliased, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    authoring.installCardDocument(CARD_B, {
      title: 'Reframed A',
      kind: 'alias',
      target: CARD_A,
    });

    expect(complete(authoring, { kind: 'edited-card', cardId: CARD_B })).toEqual({
      kind: 'completed',
    });
    expect(session.getState().working.cards).toEqual([
      positionedSnapshot.cards[0],
      { id: CARD_B, document: { title: 'Reframed A', kind: 'alias', target: CARD_A } },
    ]);
  });

  it('refuses converting a Card to another kind through Card editing', () => {
    const { authoring, session } = openRefusalFixture();
    const before = session.getState().working;

    // Targets `CARD_C`, which owns its content, so this conversion would produce
    // a Space that loads and `isSupportedCardEdit` is the only thing that can
    // refuse it. Pointed at the Alias instead, the Alias chain would be rejected
    // by intake and the failure would say nothing about the guard under test.
    authoring.installCardDocument(CARD_A, {
      title: 'Converted A',
      kind: 'alias',
      target: CARD_C,
    });

    expect(complete(authoring, { kind: 'edited-card', cardId: CARD_A })).toEqual({
      kind: 'no-edit',
    });
    expect(session.getState().working).toBe(before);
  });

  /**
   * Where an Alias points is structure, not the content it shows, and Card
   * editing does not author structure. Both changes below produce a Space that
   * loads — `CARD_C` owns its content and the description is valid — so the only
   * thing that can refuse them is the guard under test.
   */
  it("refuses moving an Alias's target through Card editing", () => {
    const { authoring, session } = openRefusalFixture();
    const before = session.getState().working;

    authoring.installCardDocument(CARD_B, {
      title: 'A again',
      kind: 'alias',
      target: CARD_C,
    });

    expect(complete(authoring, { kind: 'edited-card', cardId: CARD_B })).toEqual({
      kind: 'no-edit',
    });
    expect(session.getState().working).toBe(before);
  });

  it('refuses adding a description to an Alias through Card editing', () => {
    const { authoring, session } = openRefusalFixture();
    const before = session.getState().working;

    authoring.installCardDocument(CARD_B, {
      title: 'A again',
      description: 'Alias metadata is not content',
      kind: 'alias',
      target: CARD_A,
    });

    expect(complete(authoring, { kind: 'edited-card', cardId: CARD_B })).toEqual({
      kind: 'no-edit',
    });
    expect(session.getState().working).toBe(before);
  });

  it('converts an Algorithmic View from the completed on-screen placement', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const { authoring, session, navigation } = openAuthoring();
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(complete(authoring, { kind: 'settled-card-movement' })).toEqual({ kind: 'completed' });

    expect(session.getState().working.document.layouts).toEqual([
      {
        id: LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 10, y: 20 },
          [CARD_B]: { x: 300, y: 40 },
        },
        activeGraph: GRAPH_ID,
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
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(authoring.canConnect(CARD_B, CARD_A)).toBe(true);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'completed',
    });
    expect(session.getState().working.document.graphs[0]?.edges).toEqual([
      { from: CARD_A, to: CARD_B },
      { from: CARD_B, to: CARD_A },
    ]);

    expect(authoring.canConnect(CARD_B, CARD_A)).toBe(false);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'no-edit',
    });
  });

  /**
   * The Layout's explicit empty `graphs` is load-bearing, not incidental
   * scaffolding: it is a filter that shows nothing, and `activateGraph` refuses
   * a Graph the resolved view does not show. What makes the minted Graph the
   * exception is that `updatePositionedLayout` widens the filter to admit it in
   * the same snapshot `submit` installs, so it is visible one statement before
   * it is named active. Omitting the field would filter nothing and leave that
   * ordering untested.
   */
  it('mints and activates Graph 1 only when the first connection completes', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      MINTED_GRAPH_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const graphLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 2,
        title: 'New space',
        graphs: [],
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 10, y: 20 } },
            graphs: [],
          },
        ],
        defaultView: LAYOUT_ID,
      },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const { authoring, session, navigation } = openAuthoring(graphLess, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    replacePlacementForTest(authoring, Placement.fromEntries([[CARD_A, { x: 10, y: 20 }]]));

    expect(session.getState().working.document.graphs).toEqual([]);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_A, to: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(session.getState().working.document.graphs).toEqual([
      {
        id: MINTED_GRAPH_ID,
        title: 'Graph 1',
        edges: [{ from: CARD_A, to: CARD_A }],
      },
    ]);
    expect(session.getState().working.document.layouts?.[0]).toMatchObject({
      graphs: [MINTED_GRAPH_ID],
      activeGraph: MINTED_GRAPH_ID,
    });
    expect(navigation.getState().activeGraphId).toBe(MINTED_GRAPH_ID);
  });

  /**
   * The other half of the minted-Graph ordering, and the only half where the two
   * renderers differ. Converting an Algorithmic View replaces the selection, so
   * the renderer the Edit began in and the one it produced are different values
   * — where an Edit written back into a selected Layout leaves them sharing an
   * id, and every question about which one was asked answers the same.
   *
   * So this is where activating before adopting is visible at all: the guard
   * asked the outgoing View, whose answer is every Graph in the Space for want
   * of a filter, and passed for a reason that had nothing to do with the Edit.
   * What is pinned is the renderer Navigation is on *at the moment of
   * activation*, and that the Layout the conversion wrote carries no filter of
   * its own — which is what makes the minted Graph one it shows.
   */
  it('activates the minted Graph against the Layout the Edit created, not the View it converted', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(MINTED_GRAPH_ID as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValue(LAYOUT_ID as ReturnType<typeof crypto.randomUUID>);
    const graphLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 2, title: 'New space', graphs: [] },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const loaded = { snapshot: graphLess, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
    const real = createNavigation(currentSpace, { kind: 'view', view: 'flow' });
    const activatedUnder: RendererSelection[] = [];
    const navigation: Navigation = {
      ...real,
      activateGraph: (graphId) => {
        activatedUnder.push(real.getState().selectedRenderer);
        real.activateGraph(graphId);
      },
    };
    const authoring = createSpaceAuthoring({ session, navigation });
    replacePlacementForTest(authoring, Placement.fromEntries([[CARD_A, { x: 10, y: 20 }]]));

    expect(complete(authoring, { kind: 'connected-cards', from: CARD_A, to: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(activatedUnder).toEqual([{ kind: 'layout', layoutId: LAYOUT_ID }]);
    expect(real.getState()).toMatchObject({
      selectedRenderer: { kind: 'layout', layoutId: LAYOUT_ID },
      activeGraphId: MINTED_GRAPH_ID,
    });
    expect(session.getState().working.document.layouts?.[0]).not.toHaveProperty('graphs');
    expect(
      resolveView(currentSpace(), { kind: 'layout', layoutId: LAYOUT_ID }).visibleGraphIds,
    ).toEqual([MINTED_GRAPH_ID]);
  });

  it('creates the Card, first Graph, Edge and Layout as one Edit with internal identities', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(CREATED_CARD_ID as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce(MINTED_GRAPH_ID as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce(LAYOUT_ID as ReturnType<typeof crypto.randomUUID>);
    const graphLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 2, title: 'New space', graphs: [] },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const { authoring, session } = openAuthoring(graphLess);
    replacePlacementForTest(authoring, Placement.fromEntries([[CARD_A, { x: 120, y: 240 }]]));

    expect(authoring.canCreateConnectedCard(CARD_A)).toBe(true);
    expect(
      complete(authoring, {
        kind: 'create-and-connect',
        from: CARD_A,
        position: { x: 420, y: 360 },
      }),
    ).toEqual({ kind: 'completed', createdCardId: CREATED_CARD_ID });

    expect(session.getState().working).toEqual({
      ...graphLess,
      document: {
        ...graphLess.document,
        graphs: [
          {
            id: MINTED_GRAPH_ID,
            title: 'Graph 1',
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
            activeGraph: MINTED_GRAPH_ID,
          },
        ],
        defaultView: LAYOUT_ID,
      },
      cards: [
        ...graphLess.cards,
        {
          id: CREATED_CARD_ID,
          document: { title: 'Card 2', kind: 'markdown', body: '' },
        },
      ],
    });
    expect(authoring.canConnect(CREATED_CARD_ID, CARD_A)).toBe(true);
    expect(
      complete(authoring, { kind: 'connected-cards', from: CREATED_CARD_ID, to: CARD_A }),
    ).toEqual({ kind: 'completed' });
    expect(session.getState().working.document.graphs[0]?.edges).toHaveLength(2);
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
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    let reentered = false;
    let reentrantResult: AuthoringResult | null = null;
    authoring.subscribe(() => {
      if (reentered) return;
      reentered = true;
      replacePlacementForTest(
        authoring,
        Placement.fromEntries([
          [CARD_A, { x: 10, y: 20 }],
          [CARD_B, { x: 500, y: 400 }],
        ]),
      );
      reentrantResult = complete(authoring, { kind: 'settled-card-movement' });
    });
    const observed: number[] = [];
    authoring.subscribe(() => {
      const layout = authoring.getState().session.working.document.layouts?.[0];
      observed.push(layout?.positions[CARD_B]?.x ?? -1);
    });

    complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A });

    expect(observed).toEqual([300, 500]);
    // The answer the reentrant caller got, not just its effect: a completion
    // made from inside publication is queued rather than run there.
    expect(reentrantResult).toEqual({ kind: 'queued' });
  });

  it('reports a failed queued completion instead of charging it to the Edit that drained it', () => {
    const failures: unknown[] = [];
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    // Opened with the Layout's own map already installed, as `createApp` does —
    // the outer Edit needs a placement of its own to complete at all.
    const { authoring, session } = attachAuthoring(
      new MemorySpaceBackend([loaded]),
      loaded,
      { kind: 'layout', layoutId: LAYOUT_ID },
      (error) => failures.push(error),
    );
    let reentered = false;
    authoring.subscribe(() => {
      if (reentered) return;
      reentered = true;
      // A placement naming a Card the Space does not hold cannot become a Layout.
      replacePlacementForTest(
        authoring,
        Placement.fromEntries([
          [CARD_A, { x: 10, y: 20 }],
          [UNKNOWN_CARD, { x: 700, y: 800 }],
        ]),
      );
      complete(authoring, { kind: 'settled-card-movement' });
    });

    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(failures).toHaveLength(1);
    expect(String(failures[0])).toContain('Authoring produced an invalid Space');
    // The Edit that drained the queue still stands.
    expect(session.getState().working.document.graphs[0]?.edges).toEqual([
      { from: CARD_A, to: CARD_B },
      { from: CARD_B, to: CARD_A },
    ]);
  });

  it('publishes once after the optimistic Space and navigation consequences are installed', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const { authoring } = openAuthoring();
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
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

    complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A });

    expect(observed).toEqual([{ defaultView: LAYOUT_ID, renderer: LAYOUT_ID }]);
  });

  it('requires rendered placement and treats duplicate Edges and stale Card identities as no Edit', () => {
    const { authoring, session } = openAuthoring();
    const staleCard = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

    expect(authoring.canConnect(CARD_A, CARD_B)).toBe(false);
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    expect(authoring.canConnect(CARD_A, CARD_B)).toBe(false);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_A, to: CARD_B })).toEqual({
      kind: 'no-edit',
    });
    expect(authoring.canConnect(CARD_A, staleCard)).toBe(false);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_A, to: staleCard })).toEqual({
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
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 100, y: 200 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    complete(authoring, { kind: 'settled-card-movement' });
    await vi.waitFor(() => expect(authoring.getState().session.persistence.kind).toBe('failed'));

    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 500, y: 600 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    expect(complete(authoring, { kind: 'settled-card-movement' })).toEqual({ kind: 'completed' });
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

    replacePlacementForTest(authoring, Placement.fromEntries([[CARD_A, { x: 10, y: 20 }]]));

    // One accessor, answering the value that is actually installed. A second
    // copy carried on the published state could only disagree with this, since
    // installing a placement is not a publication.
    const installed = authoring.authoredPlacement();
    expect(installed).toEqual(Placement.fromEntries([[CARD_A, { x: 10, y: 20 }]]));

    // An equal placement is not a change, and must keep its identity:
    // `usePlacementRendering` rebuilds the positioned strategy whenever this map
    // changes identity and re-runs layout, so a fresh copy would re-arrange a
    // settled graph on every projection.
    replacePlacementForTest(authoring, Placement.fromEntries([[CARD_A, { x: 10, y: 20 }]]));
    expect(authoring.authoredPlacement()).toBe(installed);

    // Only an authored Layout supplies positions; an Algorithmic View computes
    // its own, so it must answer null however much placement is installed.
    navigation.selectRenderer({ kind: 'view', view: 'flow' });
    expect(authoring.authoredPlacement()).toBeNull();
  });

  it('adopts every rendered Card on conversion and only placed Cards in a Layout', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );

    fc.assert(
      fc.property(
        fc.record({
          baseAX: fc.integer(),
          baseAY: fc.integer(),
          baseBX: fc.integer(),
          baseBY: fc.integer(),
          renderedAX: fc.integer(),
          renderedAY: fc.integer(),
          renderedBX: fc.integer(),
          renderedBY: fc.integer(),
        }),
        ({ baseAX, baseAY, baseBX, baseBY, renderedAX, renderedAY, renderedBX, renderedBY }) => {
          const base = Placement.fromEntries([
            [CARD_A, { x: baseAX, y: baseAY }],
            [CARD_B, { x: baseBX, y: baseBY }],
          ]);
          const rendered = Placement.fromEntries([
            [CARD_A, { x: renderedAX, y: renderedAY }],
            [CARD_B, { x: renderedBX, y: renderedBY }],
          ]);

          const converting = openAuthoring();
          converting.authoring.reportRendered(rendered);
          converting.authoring.complete({
            kind: 'settled-card-movement',
            rendered,
            placed: [CARD_A],
          });
          expect(converting.session.getState().working.document.layouts?.[0]?.positions).toEqual({
            [CARD_A]: { x: renderedAX, y: renderedAY },
            [CARD_B]: { x: renderedBX, y: renderedBY },
          });

          const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
          const backend = new MemorySpaceBackend([loaded]);
          const authoring = attachAuthoring(backend, loaded, {
            kind: 'layout',
            layoutId: LAYOUT_ID,
          });
          authoring.authoring.replacePlacement(base);
          authoring.authoring.complete({
            kind: 'settled-card-movement',
            rendered,
            placed: [CARD_A],
          });
          expect(authoring.session.getState().working.document.layouts?.[0]?.positions).toEqual({
            [CARD_A]: { x: renderedAX, y: renderedAY },
            [CARD_B]: { x: baseBX, y: baseBY },
          });
          expect(authoring.authoring.authoredPlacement()).toEqual(
            Placement.fromEntries([
              [CARD_A, { x: renderedAX, y: renderedAY }],
              [CARD_B, { x: baseBX, y: baseBY }],
            ]),
          );
        },
      ),
    );
  });

  it('releases its session and navigation subscriptions when disposed', () => {
    const { authoring, session, navigation } = openAuthoring();
    let published = 0;
    authoring.subscribe(() => {
      published += 1;
    });

    navigation.activateGraph(GRAPH_ID);
    expect(published).toBe(1);

    // The session outlives any Authoring composed over it, so one that never
    // unsubscribes leaves a listener and its closure behind on a session still
    // publishing to it. Nothing replaces a composition mid-session now that
    // accepting the stored Space is an edit to this one, but releasing the
    // subscriptions is still this object's to do.
    authoring.dispose();
    navigation.activateGraph(GRAPH_ID);
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
            activeGraph: GRAPH_ID,
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
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(complete(authoring, { kind: 'settled-card-movement' })).toEqual({ kind: 'no-edit' });
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
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(
      complete(authoring, { kind: 'create-and-connect', from: CARD_A, position: { x: 5, y: 6 } }),
    ).toEqual({ kind: 'completed', createdCardId: CREATED_CARD_ID });

    expect(session.getState().working.cards.at(-1)?.document.title).toBe('Card 10');
    expect(session.getState().working.document.layouts?.at(-1)?.title).toBe('Layout 8');
  });

  it('refuses to connect with no active Graph while the Space already holds Graphs', () => {
    // A Layout filtering every Graph away resolves to no active Graph. Minting
    // is reserved for a Space that has none at all, so this is refused rather
    // than quietly adding a second Graph the filter would then hide. It is also
    // why a minted Graph is always the first one, and `nextGraphTitle` only
    // ever numbers against an empty set.
    const filtered: SpaceSnapshot = {
      ...automaticSnapshot,
      document: {
        ...automaticSnapshot.document,
        graphs: [{ id: GRAPH_ID, title: 'Graph 3', edges: [{ from: CARD_A, to: CARD_B }] }],
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 10, y: 20 }, [CARD_B]: { x: 300, y: 40 } },
            graphs: [],
          },
        ],
        defaultView: LAYOUT_ID,
      },
    };
    const { authoring, session, navigation } = openAuthoring(filtered, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    expect(navigation.getState().activeGraphId).toBeNull();
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    const before = session.getState().working;

    expect(authoring.canConnect(CARD_B, CARD_A)).toBe(false);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'no-edit',
    });
    expect(session.getState().working).toBe(before);
  });

  /**
   * The diagnostic path cannot become the failure path. A reporter that throws
   * while explaining a failed queued completion must not interrupt the Edit that
   * drained the queue, and must not cost the Edits discarded behind it the
   * report that says they are gone.
   */
  it('contains a reporter that throws while reporting a failed queued completion', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const real = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
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
    const navigation = createNavigation(currentSpace, { kind: 'view', view: 'flow' });
    const reported: unknown[] = [];
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      reportObserverError: (error) => {
        reported.push(error);
        throw new Error('reporter failed');
      },
    });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    for (const edge of [
      { from: CARD_A, to: CARD_A },
      { from: CARD_B, to: CARD_B },
    ] as const) {
      let done = false;
      authoring.subscribe(() => {
        if (done) return;
        done = true;
        complete(authoring, { kind: 'connected-cards', ...edge });
      });
    }

    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(reported).toHaveLength(2);
    expect(String(reported[0])).toContain('submit failed');
    expect(String(reported[1])).toMatch(/discarded 1 queued completion/);
  });

  it('completes a settled drag without forcing a new placement identity', () => {
    // The render adapter reports a settled gesture before completing, so by the
    // time `performCompletion` installs, the placement it was given is already
    // the installed one and `install` has nothing to do. That is deliberate —
    // the alternative, assigning to take a fresh identity, re-ran layout from
    // every projection that reported unchanged geometry.
    //
    // Both halves are asserted together because the re-layout depends on the
    // second one: dropping the forced identity is only safe while a completed
    // Edit replaces the working snapshot, which is what the render path derives
    // its `LayoutStrategyGraph` from. Lose that and a settled Edit renders stale.
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    const { authoring, session } = attachAuthoring(new MemorySpaceBackend([loaded]), loaded, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 90, y: 90 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    const reported = authoring.authoredPlacement();
    const workingBefore = session.getState().working;

    expect(complete(authoring, { kind: 'settled-card-movement' })).toEqual({ kind: 'completed' });

    expect(authoring.authoredPlacement()).toBe(reported);
    expect(session.getState().working).not.toBe(workingBefore);
    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 90, y: 90 },
      [CARD_B]: { x: 300, y: 40 },
    });
  });

  /**
   * Containing a queued failure must not leave the placement describing an Edit
   * the session never took. `installCompletedEdit` submits before it installs,
   * so a submit that throws leaves the placement untouched — survivable while
   * the throw escaped to the caller, and silent now that the drain contains it.
   *
   * A created Card is what makes the strand visible: only a completed Edit adds
   * it to the placement, so `authoredPlacement()` naming a Card the committed
   * Space does not hold cannot come from anywhere else.
   */
  it('keeps the placement level with the session when a queued submit fails', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      CREATED_CARD_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    const real = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
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
    const navigation = createNavigation(currentSpace, { kind: 'layout', layoutId: LAYOUT_ID });
    const reported: unknown[] = [];
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      initialPlacement: Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
      reportObserverError: (error) => reported.push(error),
    });
    let queuedOnce = false;
    authoring.subscribe(() => {
      if (queuedOnce) return;
      queuedOnce = true;
      // Queued behind the Edit publishing right now, and the only thing that
      // puts the created Card into a placement.
      complete(authoring, {
        kind: 'create-and-connect',
        from: CARD_A,
        position: { x: 700, y: 800 },
      });
    });

    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(reported).toHaveLength(1);
    expect(String(reported[0])).toContain('submit failed');
    const committed = session.getState().working;
    expect(committed.cards.map((card) => card.id)).toEqual([CARD_A, CARD_B]);
    expect([...(authoring.authoredPlacement()?.keys() ?? [])]).toEqual([CARD_A, CARD_B]);
  });

  /**
   * The other half of a failing `submit`, and the one the fault injection above
   * cannot reach: a submit that fails *after* the session installed and
   * published its optimistic working Space. The session has taken the Edit by
   * then, so Authoring may not go on answering with the Space before it.
   *
   * Nothing else can say so. The `installing` gate is up for the whole window,
   * so the session's own notification reached no subscriber — Authoring's
   * publication is the only one there is, and a completion that skips it leaves
   * every subscriber reading the pre-Edit state until some unrelated
   * notification happens to arrive.
   */
  it('publishes the Space the session already took when the completing submit fails', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      LAYOUT_ID as ReturnType<typeof crypto.randomUUID>,
    );
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const real = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const session: SpaceSession = {
      ...real,
      submit: (snapshot) => {
        real.submit(snapshot);
        throw new Error('submit failed');
      },
    };
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
    const navigation = createNavigation(currentSpace, { kind: 'view', view: 'flow' });
    const authoring = createSpaceAuthoring({ session, navigation });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    const published: number[] = [];
    authoring.subscribe(() => {
      published.push(authoring.getState().session.working.document.graphs[0]?.edges.length ?? -1);
    });

    // Containment is the drain's job, not this function's: the Edit the caller
    // made itself still fails in the caller's hands.
    expect(() =>
      complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A }),
    ).toThrow('submit failed');

    expect(session.getState().working.document.graphs[0]?.edges).toEqual([
      { from: CARD_A, to: CARD_B },
      { from: CARD_B, to: CARD_A },
    ]);
    expect(authoring.getState().session.working.document.graphs[0]?.edges).toHaveLength(2);
    expect(published).toEqual([2]);
  });

  /**
   * The window's other collaborator. Navigation is written last and in two
   * calls, so a throw between them leaves it half-applied — the Layout this Edit
   * created adopted, the Graph it minted not yet activated — and the publication
   * is the only way anything finds out.
   *
   * The fault is injected because the real Navigation has no reachable throw
   * path here: both calls resolve against the snapshot `submit` installed a line
   * earlier, that snapshot passed domain intake before the window opened, and
   * the Layout it carries shows the minted Graph. What is pinned is that the
   * guarantee does not depend on that argument staying true.
   *
   * It is injected into the *second* call because that is the one a throw can
   * leave a half-applied Navigation behind: a converted View means the adopted
   * renderer is visibly not the one the Edit began in.
   */
  it('publishes what the collaborators hold when activating the minted Graph throws', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(MINTED_GRAPH_ID as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValue(LAYOUT_ID as ReturnType<typeof crypto.randomUUID>);
    const graphLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 2, title: 'New space', graphs: [] },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const loaded = { snapshot: graphLess, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
    const real = createNavigation(currentSpace, { kind: 'view', view: 'flow' });
    const navigation: Navigation = {
      ...real,
      activateGraph: () => {
        throw new Error('activation failed');
      },
    };
    const authoring = createSpaceAuthoring({ session, navigation });
    replacePlacementForTest(authoring, Placement.fromEntries([[CARD_A, { x: 10, y: 20 }]]));
    const published: NavigationState[] = [];
    authoring.subscribe(() => published.push(authoring.getState().navigation));

    expect(() =>
      complete(authoring, { kind: 'connected-cards', from: CARD_A, to: CARD_A }),
    ).toThrow('activation failed');

    expect(session.getState().working.document.graphs).toHaveLength(1);
    expect(authoring.getState().session.working.document.graphs).toHaveLength(1);
    expect(real.getState()).toMatchObject({
      selectedRenderer: { kind: 'layout', layoutId: LAYOUT_ID },
      activeGraphId: null,
    });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      selectedRenderer: { kind: 'layout', layoutId: LAYOUT_ID },
      activeGraphId: null,
    });
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
    const navigation = createNavigation(currentSpace, { kind: 'view', view: 'flow' });
    const reported: unknown[] = [];
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      reportObserverError: (error) => reported.push(error),
    });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
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
        complete(authoring, { kind: 'connected-cards', ...edge });
      });
    }

    // The Edit that drained the queue is not charged the failure of one it
    // drained — it had already installed and published by then.
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'completed',
    });

    // Two reports, and both are the point. Draining stops at the first failure,
    // so the Edit behind it never runs — and abandoning either silently is what
    // makes the failure unreadable: the Edits are gone and nothing said so.
    expect(reported).toHaveLength(2);
    expect(String(reported[0])).toContain('submit failed');
    expect(String(reported[1])).toMatch(/discarded 1 queued completion/);
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
    navigation.activateGraph(GRAPH_ID);

    await vi.waitFor(() => expect(reported.map(String)).toEqual(['Error: observer rejected']));
  });

  it('contains a throwing observer and still notifies the ones behind it', () => {
    const reported: unknown[] = [];
    const { authoring, navigation } = openAuthoring(automaticSnapshot, undefined, (error) =>
      reported.push(error),
    );
    const observerFailed = new Error('observer failed');
    const notified: string[] = [];
    // The synchronous twin of the rejection above. An observer that throws must
    // not decide whether the observers registered after it hear about the
    // publication at all — a notification is not a transaction, and nothing
    // above one could act on the failure anyway.
    authoring.subscribe(() => {
      notified.push('throwing');
      throw observerFailed;
    });
    authoring.subscribe(() => {
      notified.push('behind it');
    });

    expect(() => navigation.activateGraph(GRAPH_ID)).not.toThrow();

    expect(notified).toEqual(['throwing', 'behind it']);
    expect(reported).toEqual([observerFailed]);
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
          activeGraphId: GRAPH_ID,
        }) as NavigationState,
      subscribe: () => () => undefined,
      continueInRenderer: () => undefined,
      activateGraph: () => undefined,
    } as unknown as Navigation;
    const authoring = createSpaceAuthoring({ session, navigation });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    const before = session.getState().working;

    expect(complete(authoring, { kind: 'settled-card-movement' })).toEqual({ kind: 'no-edit' });
    expect(session.getState().working).toBe(before);
  });

  it('keeps the local working Space authorable after a persistence conflict', async () => {
    const positioned = positionedSnapshot;
    const remote: SpaceSnapshot = {
      ...positioned,
      document: { ...positioned.document, title: 'Stored' },
    };
    const backend = new MemorySpaceBackend([
      { snapshot: remote, revision: 1n, exportedRevision: null },
    ]);
    const { authoring } = attachAuthoring(
      backend,
      { snapshot: positioned, revision: 0n, exportedRevision: null },
      { kind: 'layout', layoutId: LAYOUT_ID },
    );
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 100, y: 200 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    complete(authoring, { kind: 'settled-card-movement' });
    await vi.waitFor(() =>
      expect(authoring.getState().session.persistence.kind).toBe('conflicted'),
    );

    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 500, y: 600 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(complete(authoring, { kind: 'settled-card-movement' })).toEqual({ kind: 'completed' });
    expect(authoring.getState().session.working.document.layouts?.[0]?.positions[CARD_A]).toEqual({
      x: 500,
      y: 600,
    });
    expect(authoring.getState().session.persistence.kind).toBe('conflicted');
  });

  it('accepts the stored Space as a fresh opening and discards every local Edit', async () => {
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
            activeGraph: GRAPH_ID,
          },
        ],
        defaultView: LAYOUT_ID,
      },
    };
    const remote: SpaceSnapshot = {
      ...positioned,
      document: {
        ...positioned.document,
        title: 'Stored',
        graphs: [
          ...positioned.document.graphs,
          { id: STORED_GRAPH_ID, title: 'Stored Graph', edges: [{ from: CARD_B, to: CARD_A }] },
        ],
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Stored Layout',
            kind: 'positioned',
            positions: {
              [CARD_A]: { x: 900, y: 700 },
              [CARD_B]: { x: 600, y: 500 },
            },
            activeGraph: STORED_GRAPH_ID,
          },
        ],
      },
    };
    const backend = new MemorySpaceBackend([
      { snapshot: remote, revision: 4n, exportedRevision: null },
    ]);
    const { navigation, authoring } = attachAuthoring(
      backend,
      { snapshot: positioned, revision: 3n, exportedRevision: null },
      { kind: 'layout', layoutId: LAYOUT_ID },
    );
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 100, y: 200 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    complete(authoring, { kind: 'settled-card-movement' });
    await vi.waitFor(() =>
      expect(authoring.getState().session.persistence.kind).toBe('conflicted'),
    );
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 500, y: 600 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    complete(authoring, { kind: 'settled-card-movement' });
    navigation.selectRenderer({ kind: 'view', view: 'grid' });
    navigation.present();
    navigation.openCard(CARD_B);
    authoring.installCardDocument(CARD_A, {
      title: 'Stale local title',
      kind: 'markdown',
      body: 'stale local body',
    });

    expect(authoring.acceptStoredSpace()).toBeNull();
    expect(complete(authoring, { kind: 'edited-card', cardId: CARD_A })).toEqual({
      kind: 'no-edit',
    });

    // The counter the render adapter watches to drop stale local placement.
    expect(authoring.getState().replacementEpoch).toBe(1);
    expect(authoring.getState()).toMatchObject({
      session: {
        working: remote,
        acknowledgedRevision: 4n,
        persistence: { kind: 'settled' },
      },
      navigation: {
        selectedRenderer: { kind: 'layout', layoutId: LAYOUT_ID },
        activeGraphId: STORED_GRAPH_ID,
        mode: 'overview',
        openedCardId: null,
      },
    });
    expect(authoring.authoredPlacement()).toEqual(
      Placement.fromEntries([
        [CARD_A, { x: 900, y: 700 }],
        [CARD_B, { x: 600, y: 500 }],
      ]),
    );
  });

  it('notifies the listeners subscribed when publication began, not those added during it', () => {
    // `attachAuthoring`, not `openAuthoring`: the Edit has to actually complete.
    // Without an installed placement this returns `no-edit` before publishing,
    // the outer listener never runs, and `late` is empty however `publish`
    // iterates — an assertion that cannot fail. `completed` and `subscribed` are
    // asserted for the same reason: they are what stop it going vacuous again.
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    const { authoring } = attachAuthoring(new MemorySpaceBackend([loaded]), loaded, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    const late: string[] = [];
    let subscribed = false;
    authoring.subscribe(() => {
      if (subscribed) return;
      subscribed = true;
      authoring.subscribe(() => late.push('notified'));
    });

    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'completed',
    });
    expect(subscribed).toBe(true);

    // A listener that did not exist when this publication began has not missed
    // anything — it reads current state on its first real notification.
    expect(late).toEqual([]);
  });

  it('has nothing to accept when persistence is not in conflict', () => {
    const { authoring } = openAuthoring(positionedSnapshot, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    const before = authoring.getState();

    expect(authoring.acceptStoredSpace()).toBeNull();

    expect(authoring.getState().replacementEpoch).toBe(before.replacementEpoch);
    expect(authoring.getState().session).toEqual(before.session);
    expect(authoring.getState().navigation).toEqual(before.navigation);
  });

  it('refuses a stored Space that does not load and keeps the local work', async () => {
    const dangling: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        title: 'Stored',
        graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: UNKNOWN_CARD }] }],
      },
    };
    const backend = new MemorySpaceBackend([
      { snapshot: dangling, revision: 4n, exportedRevision: null },
    ]);
    const { authoring } = attachAuthoring(
      backend,
      { snapshot: positionedSnapshot, revision: 3n, exportedRevision: null },
      { kind: 'layout', layoutId: LAYOUT_ID },
    );
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 500, y: 600 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    complete(authoring, { kind: 'settled-card-movement' });
    await vi.waitFor(() =>
      expect(authoring.getState().session.persistence.kind).toBe('conflicted'),
    );
    const before = authoring.getState();

    const refusal = authoring.acceptStoredSpace();

    expect(refusal).toBe(
      `The remote space is invalid and was not accepted:\n  - Graph "${GRAPH_ID}" edge 0 references missing card "${UNKNOWN_CARD}" as its to`,
    );
    expect(authoring.getState().replacementEpoch).toBe(before.replacementEpoch);
    expect(authoring.getState().session).toEqual(before.session);
    expect(authoring.getState().session.persistence.kind).toBe('conflicted');
  });

  /**
   * Nesting is the case a boolean gate cannot carry. Accepting notifies from
   * inside its own window — `session.acceptRemote()` publishes before the
   * placement, Navigation and the replacement epoch have moved — and an
   * observer is allowed to complete an Edit from there, exactly as one may
   * submit from a session notification. That inner completion opens the gate a
   * second time, and a boolean drops it on the way out: Navigation's own
   * notification then publishes the accepted Space while the epoch still names
   * the one it replaced, which is the read the epoch exists to make impossible.
   */
  it('keeps the gate closed when accepting re-enters through a completed Edit', async () => {
    const remote: SpaceSnapshot = {
      ...positionedSnapshot,
      document: { ...positionedSnapshot.document, title: 'Stored' },
    };
    const backend = new MemorySpaceBackend([
      { snapshot: remote, revision: 4n, exportedRevision: null },
    ]);
    const { authoring, session } = attachAuthoring(
      backend,
      { snapshot: positionedSnapshot, revision: 3n, exportedRevision: null },
      { kind: 'layout', layoutId: LAYOUT_ID },
    );
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 500, y: 600 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    complete(authoring, { kind: 'settled-card-movement' });
    await vi.waitFor(() =>
      expect(authoring.getState().session.persistence.kind).toBe('conflicted'),
    );
    const epochBefore = authoring.getState().replacementEpoch;

    let reentered = false;
    session.subscribe(() => {
      if (reentered) return;
      reentered = true;
      complete(authoring, { kind: 'settled-card-movement' });
    });
    const published: { title: string; replacementEpoch: number }[] = [];
    authoring.subscribe(() =>
      published.push({
        title: authoring.getState().session.working.document.title,
        replacementEpoch: authoring.getState().replacementEpoch,
      }),
    );

    expect(authoring.acceptStoredSpace()).toBeNull();

    expect(reentered).toBe(true);
    // One publication, after the whole sequence — never the accepted Space
    // carrying the replacement epoch of the Space it replaced.
    expect(published).toEqual([{ title: 'Stored', replacementEpoch: epochBefore + 1 }]);
  });

  /**
   * ADR 0042's discard, against the path the depth-counting gate already allows:
   * the drain runs after publication, and accepting the stored Space is among
   * the things an observer may legally do from inside that publication. The
   * queued completion is finished work, but the Space it was derived from is
   * gone by the time the drain reaches it.
   *
   * Why the discard is not a refusal the derivation could make is AGENTS.md's
   * install-gate rule; what this pins is that the accepted Space comes through
   * untouched.
   */
  it('discards a queued completion written against the Space a replacement replaced', async () => {
    const { authoring, remote, reported } = await openConflictedAgainstStoredSpace();

    let reentered = false;
    let queuedResult: AuthoringResult | null = null;
    let refusal: string | null | undefined;
    authoring.subscribe(() => {
      if (reentered) return;
      reentered = true;
      // Queued against the local Space, and then that Space is replaced while
      // this completion waits behind the publication it was made from.
      replacePlacementForTest(
        authoring,
        Placement.fromEntries([
          [CARD_A, { x: 111, y: 222 }],
          [CARD_B, { x: 300, y: 40 }],
        ]),
      );
      queuedResult = complete(authoring, { kind: 'settled-card-movement' });
      refusal = authoring.acceptStoredSpace();
    });

    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 700, y: 800 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    expect(complete(authoring, { kind: 'settled-card-movement' })).toEqual({ kind: 'completed' });

    // Both asserted so the test cannot go vacuous: a completion that ran instead
    // of queueing, or an accept that refused, would leave nothing to discard and
    // the assertions below would hold however the drain behaved.
    expect(queuedResult).toEqual({ kind: 'queued' });
    expect(refusal).toBeNull();
    expect(authoring.getState().replacementEpoch).toBe(1);
    // The accepted Space is authoritative, down to the positions it arrived
    // with — the drained completion contributed nothing to it.
    expect(authoring.getState().session.working).toEqual(remote);
    expect(authoring.authoredPlacement()).toEqual(
      Placement.fromEntries([
        [CARD_A, { x: 900, y: 700 }],
        [CARD_B, { x: 600, y: 500 }],
      ]),
    );
    // Reported rather than dropped in silence: the author completed that Edit,
    // and nothing else in the running app will mention that it is gone.
    expect(reported).toHaveLength(1);
    expect(String(reported[0])).toMatch(/discarded 1 queued completion.*replaced/);
  });

  /**
   * The same rule seen from the other side: two entries queued behind one drain,
   * the stale one first. Fails if the drain breaks at the stale entry instead of
   * skipping it — see AGENTS.md's install-gate rule for why the queue is not
   * abandoned wholesale.
   */
  it('still drains a completion queued after the replacement it was made against', async () => {
    const { authoring, reported } = await openConflictedAgainstStoredSpace();

    let replaced = false;
    authoring.subscribe(() => {
      if (replaced) return;
      replaced = true;
      replacePlacementForTest(
        authoring,
        Placement.fromEntries([
          [CARD_A, { x: 111, y: 222 }],
          [CARD_B, { x: 300, y: 40 }],
        ]),
      );
      complete(authoring, { kind: 'settled-card-movement' });
      authoring.acceptStoredSpace();
    });
    // Subscribed second, so its first notification is the one accepting
    // publishes from inside the observer above — after the epoch has advanced.
    let afterwards = false;
    let queuedAfterwards: AuthoringResult | null = null;
    authoring.subscribe(() => {
      if (afterwards) return;
      afterwards = true;
      replacePlacementForTest(
        authoring,
        Placement.fromEntries([
          [CARD_A, { x: 40, y: 50 }],
          [CARD_B, { x: 600, y: 500 }],
        ]),
      );
      queuedAfterwards = complete(authoring, { kind: 'settled-card-movement' });
    });

    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 700, y: 800 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    expect(complete(authoring, { kind: 'settled-card-movement' })).toEqual({ kind: 'completed' });

    expect(queuedAfterwards).toEqual({ kind: 'queued' });
    expect(authoring.getState().replacementEpoch).toBe(1);
    // Made against the accepted Space, so it is an Edit to it — while the one
    // that named the replaced Space contributed nothing.
    expect(authoring.getState().session.working.document.title).toBe('Stored');
    expect(authoring.getState().session.working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 40, y: 50 },
      [CARD_B]: { x: 600, y: 500 },
    });
    expect(reported).toHaveLength(1);
    expect(String(reported[0])).toMatch(/discarded 1 queued completion.*replaced/);
  });

  /**
   * Accepting updates the same collaborators behind the same gate, so it has the
   * same obligation: a throw part-way through must not take the publication with
   * it. Reporting a conflict that the session has already resolved away — and
   * going on reporting it until something unrelated publishes — leaves the
   * author a Resolve control over work that is no longer theirs to resolve.
   */
  it('publishes the accepted Space when the accepting session throws', async () => {
    const remote: SpaceSnapshot = {
      ...positionedSnapshot,
      document: { ...positionedSnapshot.document, title: 'Stored' },
    };
    const backend = new MemorySpaceBackend([
      { snapshot: remote, revision: 4n, exportedRevision: null },
    ]);
    const real = openSpaceSession(backend, {
      snapshot: positionedSnapshot,
      revision: 3n,
      exportedRevision: null,
    });
    const session: SpaceSession = {
      ...real,
      acceptRemote: () => {
        real.acceptRemote();
        throw new Error('accept failed');
      },
    };
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
    const navigation = createNavigation(currentSpace, { kind: 'layout', layoutId: LAYOUT_ID });
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      initialPlacement: Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 500, y: 600 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    complete(authoring, { kind: 'settled-card-movement' });
    await vi.waitFor(() =>
      expect(authoring.getState().session.persistence.kind).toBe('conflicted'),
    );
    const published: string[] = [];
    authoring.subscribe(() => published.push(authoring.getState().session.persistence.kind));

    expect(() => authoring.acceptStoredSpace()).toThrow('accept failed');

    expect(session.getState().persistence.kind).toBe('settled');
    expect(authoring.getState().session.persistence.kind).toBe('settled');
    expect(authoring.getState().session.working.document.title).toBe('Stored');
    expect(published).toEqual(['settled']);
  });
});
