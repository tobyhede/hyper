import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  newUuid,
  uuidSchema,
  type CardDocument,
  type CardId,
  type Graph,
  type GraphId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type SpaceBackend,
  type SpaceSession,
} from '@project/persistence';
import { GRAPH_PALETTE } from '../src/colors';
import { mintingIds } from './minting';
import { createNavigation, type Navigation, type NavigationState } from '../src/navigation';
import {
  createSpaceAuthoring,
  type AuthoringResult,
  type SpaceAuthoring,
} from '../src/space-authoring';
import { createRendererResolver, type RendererSelection } from '../src/renderer';

/**
 * The eligibility query, asked in the shape the two connecting gestures ask it.
 *
 * One proposal-shaped answer replaced the pair of boolean queries, and these
 * read it back as the booleans the assertions below are written in — the point
 * being that the preview and the completion consult one policy, not that the
 * question is shaped differently.
 */
const offersConnection = (authoring: SpaceAuthoring, from: CardId, to: CardId): boolean =>
  authoring.edgeEligibility({ kind: 'connect', from, to }).kind === 'eligible';

const offersEmptyDrop = (authoring: SpaceAuthoring, from: CardId): boolean =>
  authoring.edgeEligibility({ kind: 'create-and-connect', from }).kind === 'eligible';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
/** A third Card that owns its content, so an Alias may legally target it. */
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const STORED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const MINTED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
/** The Layout id a conversion mints when the Space already holds one. */
const CONVERTED_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
/** What a *second* conversion of one Algorithmic View would mint, and must not. */
const COMPETING_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000032');
const CREATED_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

/** A Card identity no fixture Space holds, so any Layout naming it fails intake. */
const UNKNOWN_CARD = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

/**
 * A Space with no Layouts, and therefore no Graphs at all.
 *
 * Under ADR 0040 those are one state, not two: a Graph is an owned value of a
 * Layout, so a Space with nothing arranged has nothing connected either. It is
 * what a new Space is (ADR 0015) and what every Algorithmic View below converts
 * out of.
 */
const automaticSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

/** The Graph `positionedSnapshot`'s Layout owns, over both of that Layout's Cards. */
const MAIN_GRAPH: Graph = { id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] };

/** A Layout that places every Card the Space holds and owns the Graph over them. */
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
        graphs: [MAIN_GRAPH],
      },
    ],
    defaultView: LAYOUT_ID,
  },
};

/**
 * The Graphs a snapshot holds, flattened across the Layouts that own them.
 *
 * Derived and never stored (ADR 0045): there is no Space-level collection left
 * to read, so a test asserting about "the Space's Graphs" has to say which
 * Layouts it is flattening — and every assertion below that used to read
 * `document.graphs` reads this instead.
 */
const graphsOf = (snapshot: SpaceSnapshot): readonly Graph[] =>
  (snapshot.document.layouts ?? []).flatMap((layout) => layout.graphs);

interface LoadedFixture {
  snapshot: SpaceSnapshot;
  revision: bigint;
  exportedRevision: bigint | null;
}

type CompletionWithoutGeometry =
  | { readonly kind: 'settled-card-movement' }
  | { readonly kind: 'connected-cards'; readonly from: typeof CARD_A; readonly to: typeof CARD_A }
  | {
      readonly kind: 'edited-card';
      readonly cardId: typeof CARD_A;
      readonly document: CardDocument;
    }
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
 *
 * A movement here names every rendered Card as placed, while the render adapter
 * names only the Cards the gesture moved. Cases that depend on that distinction
 * call `SpaceAuthoring.complete` directly.
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
/**
 * What a test supplies to the composition instead of reaching past it.
 *
 * `newId` is the replacement for `vi.spyOn(crypto, 'randomUUID')`, which
 * controlled the ambient generator rather than the module that mints from it.
 * ADR 0016 rejected that for `loadSpace` and the grounds are the same here.
 */
interface AuthoringOptions {
  readonly reportObserverError?: (error: unknown) => void;
  readonly newId?: () => UUID;
}

/**
 * The composition's renderer resolver, with its own nondeterministic input
 * supplied the same way `newId` is: at composition, never by mocking a global.
 *
 * Two seams rather than one, because they are minted in two places. The Card
 * and Layout ids of a completed Edit come from `newId`, which Space Authoring
 * took when it was composed; a converted Graph's identity is minted inside the
 * conversion boundary, which the resolver closes over (ADR 0045), so the
 * resolver is what takes that one.
 *
 * A fresh sequence per composition, because a Space that is converted twice
 * needs two identities and the boundary refuses a repeat outright.
 */
function testResolver() {
  let minted = 0;
  return createRendererResolver({
    newGraphId: () => {
      minted += 1;
      return minted === 1
        ? MINTED_GRAPH_ID
        : uuidSchema.parse(
            `00000000-0000-4000-8000-${(0xa00 + minted).toString(16).padStart(12, '0')}`,
          );
    },
  });
}

function attachAuthoring(
  backend: SpaceBackend,
  loaded: LoadedFixture,
  renderer: RendererSelection,
  { reportObserverError, newId }: AuthoringOptions = {},
) {
  const session = openSpaceSession(backend, loaded);
  const currentSpace = () => {
    const result = loadSpaceSnapshot(session.getState().working);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
    return result.space;
  };
  const resolveRenderer = testResolver();
  const navigation = createNavigation(currentSpace, resolveRenderer, renderer);
  const resolved = resolveRenderer(currentSpace(), renderer);
  const authoring = createSpaceAuthoring({
    session,
    navigation,
    currentSpace,
    resolveRenderer,
    initialPlacement:
      resolved.kind === 'view' ? null : Placement.fromLayout(resolved.resolvedLayout.layout),
    ...(reportObserverError !== undefined ? { reportObserverError } : {}),
    ...(newId !== undefined ? { newId } : {}),
  });
  return { backend, session, navigation, authoring };
}

function openAuthoring(
  snapshot: SpaceSnapshot = automaticSnapshot,
  renderer: RendererSelection = { kind: 'view', view: 'flow' },
  { reportObserverError, newId }: AuthoringOptions = {},
) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const backend = new MemorySpaceBackend([loaded]);
  const session = openSpaceSession(backend, loaded);
  const currentSpace = () => {
    const result = loadSpaceSnapshot(session.getState().working);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
    return result.space;
  };
  const resolveRenderer = testResolver();
  const navigation = createNavigation(currentSpace, resolveRenderer, renderer);
  return {
    backend,
    session,
    navigation,
    authoring: createSpaceAuthoring({
      session,
      navigation,
      currentSpace,
      resolveRenderer,
      ...(reportObserverError !== undefined ? { reportObserverError } : {}),
      ...(newId !== undefined ? { newId } : {}),
    }),
  };
}

/**
 * `CARD_B` aliases `CARD_A`, and `CARD_C` is a third Card that owns its content.
 *
 * The separate target is what lets the refusal tests below name their reason:
 * every Alias edit they attempt produces a Space that *loads*, so the only thing
 * that can refuse is the guard each one is about. Aimed at the Alias
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
          graphs: [MAIN_GRAPH],
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
    { reportObserverError: (error) => reported.push(error) },
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
    const { authoring, session, navigation } = openAuthoring(undefined, undefined, {
      newId: mintingIds(LAYOUT_ID),
    });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    expect(
      authoring.complete({
        kind: 'edited-card',
        cardId: CARD_A,
        document: { title: 'Renamed A', kind: 'markdown', body: 'A' },
      }),
    ).toEqual({
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
    expect(session.getState().working.document.layouts?.[0]?.graphs[0]?.id).toBe(MINTED_GRAPH_ID);
    // Written *and* selected. A conversion that stored the Layout without
    // repointing the renderer leaves the graph drawing the Algorithmic View it
    // just replaced, so the next placement would be computed rather than read
    // back from the Layout this Edit created.
    expect(navigation.getState().selectedRenderer).toEqual({ kind: 'layout', layoutId: LAYOUT_ID });
  });

  it('binds a Card value to the completion that reports it', () => {
    const { authoring, session } = openAuthoring();
    // No placement: an Algorithmic View has nothing to write the Edit into yet.
    // A refusal rather than `unchanged`, because the author's rename is real and
    // the reason it cannot land is context they can be told about.
    expect(
      complete(authoring, {
        kind: 'edited-card',
        cardId: CARD_A,
        document: { title: 'Abandoned rename', kind: 'markdown', body: 'A' },
      }),
    ).toEqual({
      kind: 'refused',
      reason: 'This view has not finished arranging, so there is nowhere to write yet.',
    });

    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    expect(
      complete(authoring, {
        kind: 'edited-card',
        cardId: CARD_A,
        document: automaticSnapshot.cards[0]!.document,
      }),
    ).toEqual({ kind: 'unchanged' });
    expect(session.getState().working.cards).toEqual(automaticSnapshot.cards);
  });

  it('treats an unchanged Card as no Edit before converting or submitting', () => {
    // Counting this workspace's own minting, rather than every call the process
    // makes to the ambient generator: what the refusal has to leave untouched is
    // the identity *this* Edit would have created.
    const minted = vi.fn(newUuid);
    const control = new MemorySpaceBackendTestControl();
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const { authoring, session } = attachAuthoring(
      new MemorySpaceBackend([loaded], control),
      loaded,
      { kind: 'view', view: 'flow' },
      { newId: minted },
    );
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    const before = session.getState().working;
    expect(
      complete(authoring, {
        kind: 'edited-card',
        cardId: CARD_A,
        document: automaticSnapshot.cards[0]!.document,
      }),
    ).toEqual({ kind: 'unchanged' });
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
    expect(
      complete(authoring, {
        kind: 'edited-card',
        cardId: CARD_A,
        document: {
          title: 'A',
          description: 'Edited in place',
          kind: 'markdown',
          body: '# Edited',
        },
      }),
    ).toEqual({ kind: 'completed' });

    expect(control.attempts).toHaveLength(1);
    expect(control.attempts[0]?.snapshot.cards[0]?.document).toEqual({
      title: 'A',
      description: 'Edited in place',
      kind: 'markdown',
      body: '# Edited',
    });
    expect(graphsOf(session.getState().working)).toEqual(graphsOf(positionedSnapshot));
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
    expect(
      complete(authoring, {
        kind: 'edited-card',
        cardId: CARD_B,
        document: { title: 'Reframed A', kind: 'alias', target: CARD_A },
      }),
    ).toEqual({ kind: 'completed' });
    expect(session.getState().working.cards).toEqual([
      positionedSnapshot.cards[0],
      { id: CARD_B, document: { title: 'Reframed A', kind: 'alias', target: CARD_A } },
    ]);
  });

  it('refuses converting a Card to another kind through Card editing', () => {
    const { authoring, session } = openRefusalFixture();
    const before = session.getState().working;

    // Targets `CARD_C`, which owns its content, so this conversion would produce
    // a Space that loads and the kind guard is the only thing that can refuse
    // it. Pointed at the Alias instead, the Alias chain would be rejected by
    // intake and the failure would say nothing about the guard under test.
    expect(
      complete(authoring, {
        kind: 'edited-card',
        cardId: CARD_A,
        document: { title: 'Converted A', kind: 'alias', target: CARD_C },
      }),
    ).toEqual({ kind: 'refused', reason: 'A Card keeps the kind it was created with.' });
    expect(session.getState().working).toBe(before);
  });

  /**
   * Retargeting is an ordinary Edit of the Alias, made through the same Card
   * editor as its title (ADR 0009, the Alias prototype's Frame 4) — the Card
   * editor is the one canonical place a Target changes, so it is the completion
   * that carries it. The Alias keeps its id, its own title and its position; the
   * old Target keeps everything.
   */
  it("replaces an Alias's Target while preserving its identity and title", () => {
    const { authoring, session } = openRefusalFixture();

    expect(
      complete(authoring, {
        kind: 'edited-card',
        cardId: CARD_B,
        document: { title: 'A again', kind: 'alias', target: CARD_C },
      }),
    ).toEqual({ kind: 'completed' });

    expect(session.getState().working.cards).toEqual([
      { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
      { id: CARD_B, document: { title: 'A again', kind: 'alias', target: CARD_C } },
      { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
    ]);
    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 300, y: 40 },
      [CARD_C]: { x: 600, y: 40 },
    });
    expect(graphsOf(session.getState().working)).toEqual([MAIN_GRAPH]);
  });

  it('refuses an Alias Target that does not own its content', () => {
    const { authoring, session } = openRefusalFixture();
    const before = session.getState().working;

    // `CARD_B` is itself the Alias, so this asks for a chain. Intake rejects one
    // too, but by then the Edit has already been derived — refusing here is what
    // keeps a reachable authoring mistake an author-facing sentence rather than
    // the throw a broken invariant gets.
    expect(
      complete(authoring, {
        kind: 'edited-card',
        cardId: CARD_B,
        document: { title: 'A again', kind: 'alias', target: CARD_B },
      }),
    ).toEqual({
      kind: 'refused',
      reason: 'An Alias must target a Card that owns its content.',
    });
    expect(session.getState().working).toBe(before);
  });

  it('edits an Alias description without touching its Target', () => {
    const { authoring, session } = openRefusalFixture();

    expect(
      complete(authoring, {
        kind: 'edited-card',
        cardId: CARD_B,
        document: {
          title: 'A again',
          description: 'Where the introduction returns',
          kind: 'alias',
          target: CARD_A,
        },
      }),
    ).toEqual({ kind: 'completed' });
    expect(session.getState().working.cards[1]).toEqual({
      id: CARD_B,
      document: {
        title: 'A again',
        description: 'Where the introduction returns',
        kind: 'alias',
        target: CARD_A,
      },
    });
  });

  /**
   * The conversion ADR 0045 describes, in one Edit: the Cards already on screen
   * become a Layout, and that Layout owns exactly one fresh, empty Graph, which
   * is also the Graph it opens on. Nothing is left at the Space level, because
   * there is no Space level left for a Graph to be written to.
   */
  it('converts an Algorithmic View into a Layout owning one fresh empty Graph', () => {
    // Only the Layout: this Edit mints no Card, and the Graph its conversion
    // returns is identified by the resolver composed above.
    const { authoring, session, navigation } = openAuthoring(undefined, undefined, {
      newId: mintingIds(LAYOUT_ID),
    });
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
        // Coloured on the way out: a Graph a conversion mints stores the same
        // rotating palette choice Add Graph would have given it, so the two
        // creation gestures do not produce different Graph properties.
        graphs: [{ id: MINTED_GRAPH_ID, title: 'Graph 1', color: GRAPH_PALETTE[0], edges: [] }],
        activeGraph: MINTED_GRAPH_ID,
      },
    ]);
    expect(Object.hasOwn(session.getState().working.document, 'graphs')).toBe(false);
    expect(session.getState().working.document.defaultView).toBe(LAYOUT_ID);
    expect(navigation.getState().selectedRenderer).toEqual({ kind: 'layout', layoutId: LAYOUT_ID });
    expect(navigation.getState().activeGraphId).toBe(MINTED_GRAPH_ID);
  });

  /**
   * One eligibility policy behind the preview and the completion, on a selected
   * Layout — where a duplicate is a state that exists. The Edge joins a Graph
   * that Layout already owns, so drawing it twice is the exact duplicate intake
   * rejects (ADR 0032) and the second attempt is refused before it is attempted.
   */
  it('uses one eligibility policy for preview and completion of an existing-Card Edge', () => {
    const { authoring, session } = openAuthoring(positionedSnapshot, {
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

    expect(offersConnection(authoring, CARD_B, CARD_A)).toBe(true);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'completed',
    });
    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([
      { from: CARD_A, to: CARD_B },
      { from: CARD_B, to: CARD_A },
    ]);

    expect(offersConnection(authoring, CARD_B, CARD_A)).toBe(false);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'refused',
      reason: 'These Cards are already connected in this Graph.',
    });
  });

  /**
   * The half of that policy that is **not** a mechanical mirror, and the one
   * that fails silently if it is got wrong.
   *
   * On an Algorithmic View the Edge does not join the Graph the author is
   * emphasising — it joins the fresh, empty Graph the conversion is about to
   * mint (ADR 0045). No duplicate is possible against a Graph that holds
   * nothing, so refusing here would refuse the *first* connection drawn on any
   * Space that already has Graphs, with no way for the author to tell why.
   *
   * The emphasis is still only emphasis (ADR 0028): `Main` already holds
   * exactly this Edge, and it neither blocks the gesture nor receives it.
   */
  it('offers an Edge the emphasised Graph already holds, and lands it in the minted one', () => {
    // A Space whose only Layout owns `Main`, opened in the Flow view rather than
    // in that Layout — so the flatten draws `Main`, and it is what is emphasised.
    const { authoring, session, navigation } = openAuthoring(
      {
        ...positionedSnapshot,
        document: { ...positionedSnapshot.document, defaultView: undefined },
      },
      { kind: 'view', view: 'flow' },
      { newId: mintingIds(CONVERTED_LAYOUT_ID) },
    );
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    expect(navigation.getState().activeGraphId).toBe(GRAPH_ID);

    expect(offersConnection(authoring, CARD_A, CARD_B)).toBe(true);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_A, to: CARD_B })).toEqual({
      kind: 'completed',
    });

    const layouts = session.getState().working.document.layouts ?? [];
    expect(layouts.map((layout) => layout.id)).toEqual([LAYOUT_ID, CONVERTED_LAYOUT_ID]);
    // Untouched: the Graph that was emphasised belongs to the Layout that owns
    // it, and nothing about this Edit reached across.
    expect(layouts[0]?.graphs).toEqual([MAIN_GRAPH]);
    // `Graph 1`, not `Graph 2`: the numbering runs above the highest `Graph N`
    // already taken, and `Main` is a title an author wrote rather than a number.
    expect(layouts[1]?.graphs).toEqual([
      {
        id: MINTED_GRAPH_ID,
        title: 'Graph 1',
        // The first palette slot, although the Space already holds `Main`: the
        // rotation is Layout-local, and a conversion creates the Layout, so its
        // initial Graph occupies the first position in it.
        color: GRAPH_PALETTE[0],
        edges: [{ from: CARD_A, to: CARD_B }],
      },
    ]);
    expect(layouts[1]?.activeGraph).toBe(MINTED_GRAPH_ID);
    expect(navigation.getState().activeGraphId).toBe(MINTED_GRAPH_ID);
  });

  /**
   * The Edit is completed with a Layout already selected, so the renderer it
   * begins in is the one it writes back into. `activateGraph` refuses a Graph
   * the resolved view does not show, and what admits the minted one is that
   * `submit` installs the snapshot carrying it before Navigation is asked.
   */
  /**
   * Closure is the author's refusal, not the validator's throw.
   *
   * Every Edge endpoint of an owned Graph must be a Card of the Layout that owns
   * it (ADR 0040), and a Layout's members are its position keys — so an Edge to
   * a Card this Layout omits derives a Space intake rejects. `deriveCompletedEdit`
   * answers an unloadable Space by throwing, which is right for a bug and wrong
   * for a gesture: the omitted-Card fallback band still draws such a Card, so
   * the author can aim at one. The predicate refuses it instead, and the preview
   * and the completion agree because they are the same policy.
   */
  it('refuses an Edge to a Card the selected Layout does not hold', () => {
    const sparse: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            // CARD_C is a Card of the Space and not a member of this Layout.
            positions: { [CARD_A]: { x: 10, y: 20 }, [CARD_B]: { x: 300, y: 40 } },
            graphs: [MAIN_GRAPH],
          },
        ],
      },
      cards: [
        ...positionedSnapshot.cards,
        { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
      ],
    };
    const { authoring, session } = openAuthoring(sparse, { kind: 'layout', layoutId: LAYOUT_ID });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    const before = session.getState().working;

    expect(offersConnection(authoring, CARD_A, CARD_C)).toBe(false);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_A, to: CARD_C })).toEqual({
      kind: 'refused',
      reason: 'A connection can only join Cards in this Layout.',
    });
    expect(offersConnection(authoring, CARD_C, CARD_A)).toBe(false);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_C, to: CARD_A })).toEqual({
      kind: 'refused',
      reason: 'A connection can only join Cards in this Layout.',
    });
    expect(offersEmptyDrop(authoring, CARD_C)).toBe(false);
    expect(session.getState().working).toBe(before);
  });

  /**
   * Activating a Graph is emphasis and nothing else (ADR 0028), and on an
   * Algorithmic View that stays true right through the Edit that follows.
   *
   * The author emphasises `Aside`, which a second Layout owns, and then draws an
   * Edge. Activation itself submits nothing — no Layout appears, no revision
   * moves. And the Edge does not go to `Aside`: it goes to the initial Graph the
   * conversion mints for the Layout it creates, because that is the only Graph
   * the new Layout owns (ADR 0045). Emphasis does not choose where an Edge lands.
   */
  it('submits nothing on activation, and lands the next Edge in the minted Graph', () => {
    const ASIDE_LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
    const ASIDE_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000042');
    const twoLayouts: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        layouts: [
          ...(positionedSnapshot.document.layouts ?? []),
          {
            id: ASIDE_LAYOUT,
            title: 'Aside Layout',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 0, y: 400 }, [CARD_B]: { x: 320, y: 400 } },
            graphs: [{ id: ASIDE_GRAPH, title: 'Aside', edges: [{ from: CARD_B, to: CARD_A }] }],
          },
        ],
        defaultView: undefined,
      },
    };
    const control = new MemorySpaceBackendTestControl();
    const loaded = { snapshot: twoLayouts, revision: 0n, exportedRevision: null };
    const { authoring, session, navigation } = attachAuthoring(
      new MemorySpaceBackend([loaded], control),
      loaded,
      { kind: 'view', view: 'flow' },
      { newId: mintingIds(CONVERTED_LAYOUT_ID) },
    );
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );

    // Emphasis on a Graph the *other* Layout owns. The Flow view draws the
    // flatten, so activating it is legal; it is still not an Edit.
    const before = session.getState().working;
    navigation.activateGraph(ASIDE_GRAPH);
    expect(session.getState().working).toBe(before);
    expect(control.attempts).toEqual([]);

    expect(offersConnection(authoring, CARD_B, CARD_A)).toBe(true);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'completed',
    });

    const layouts = session.getState().working.document.layouts ?? [];
    expect(layouts).toHaveLength(3);
    // Neither existing Layout was touched, and the Edge is in the minted Graph.
    expect(layouts[1]?.graphs).toEqual([
      { id: ASIDE_GRAPH, title: 'Aside', edges: [{ from: CARD_B, to: CARD_A }] },
    ]);
    expect(layouts[2]).toMatchObject({
      id: CONVERTED_LAYOUT_ID,
      graphs: [{ id: MINTED_GRAPH_ID, title: 'Graph 1', edges: [{ from: CARD_B, to: CARD_A }] }],
      activeGraph: MINTED_GRAPH_ID,
    });
    expect(navigation.getState().activeGraphId).toBe(MINTED_GRAPH_ID);
  });

  /**
   * An Edit on a selected Layout adds its Edge to a Graph that Layout **owns**.
   *
   * Under ADR 0040 the Graph is minted when the Layout is created rather than
   * when the first Edge is drawn, so what the first connection does is fill the
   * initial empty Graph that was already there. Nothing is minted here, which is
   * what the unused-mint assertion below says.
   */
  it('adds the first Edge to the Layout’s own initial empty Graph', () => {
    const minted = vi.fn(newUuid);
    const emptyGraph: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'New space',
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 10, y: 20 } },
            graphs: [{ id: MINTED_GRAPH_ID, title: 'Graph 1', edges: [] }],
          },
        ],
        defaultView: LAYOUT_ID,
      },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const { authoring, session, navigation } = openAuthoring(
      emptyGraph,
      { kind: 'layout', layoutId: LAYOUT_ID },
      { newId: minted },
    );
    replacePlacementForTest(authoring, Placement.fromEntries([[CARD_A, { x: 10, y: 20 }]]));

    expect(graphsOf(session.getState().working)).toEqual([
      { id: MINTED_GRAPH_ID, title: 'Graph 1', edges: [] },
    ]);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_A, to: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(graphsOf(session.getState().working)).toEqual([
      {
        id: MINTED_GRAPH_ID,
        title: 'Graph 1',
        edges: [{ from: CARD_A, to: CARD_A }],
      },
    ]);
    expect(session.getState().working.document.layouts?.[0]).toMatchObject({
      activeGraph: MINTED_GRAPH_ID,
    });
    expect(navigation.getState().activeGraphId).toBe(MINTED_GRAPH_ID);
    expect(minted).not.toHaveBeenCalled();
  });

  /**
   * The renderer and the Active Graph reach Navigation as **one** answer, and it
   * is the answer this Edit produced rather than the one it began in.
   *
   * Converting an Algorithmic View is where that is visible at all: the Edit
   * began on the Flow view and produced a Layout, so the two renderers are
   * different values — where an Edit written back into a selected Layout leaves
   * them sharing an id and every question about which was asked answers alike.
   *
   * Under ADR 0040 handing them over separately is not merely arbitrary, it is
   * unrepresentable: between the two calls Navigation would name the new Layout
   * beside a Graph some other Layout owns, which is exactly the pair its guard
   * refuses. What is pinned here is that one call carries both, and that the
   * Graph it carries is the one the new Layout owns.
   */
  it('adopts the Layout the Edit created together with the Graph that Layout owns', () => {
    const structureLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 1, title: 'New space' },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const loaded = { snapshot: structureLess, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
    const resolveRenderer = testResolver();
    const real = createNavigation(currentSpace, resolveRenderer, { kind: 'view', view: 'flow' });
    const adopted: { renderer: RendererSelection; graphId: GraphId | null }[] = [];
    const navigation: Navigation = {
      ...real,
      continueInRenderer: (selection, graphId) => {
        adopted.push({ renderer: selection, graphId });
        real.continueInRenderer(selection, graphId);
      },
      activateGraph: () => {
        throw new Error('Edit completion must not activate separately.');
      },
    };
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      currentSpace,
      resolveRenderer,
      newId: mintingIds(LAYOUT_ID),
    });
    replacePlacementForTest(authoring, Placement.fromEntries([[CARD_A, { x: 10, y: 20 }]]));

    expect(complete(authoring, { kind: 'connected-cards', from: CARD_A, to: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(adopted).toEqual([
      { renderer: { kind: 'layout', layoutId: LAYOUT_ID }, graphId: MINTED_GRAPH_ID },
    ]);
    expect(real.getState()).toMatchObject({
      selectedRenderer: { kind: 'layout', layoutId: LAYOUT_ID },
      activeGraphId: MINTED_GRAPH_ID,
    });
    // The Graph is inside the Layout that owns it, and that Layout draws it.
    expect(session.getState().working.document.layouts?.[0]?.graphs).toEqual([
      {
        id: MINTED_GRAPH_ID,
        title: 'Graph 1',
        color: GRAPH_PALETTE[0],
        edges: [{ from: CARD_A, to: CARD_A }],
      },
    ]);
    expect(
      resolveRenderer(currentSpace(), { kind: 'layout', layoutId: LAYOUT_ID }).subject.graphs.map(
        (graph) => graph.id,
      ),
    ).toEqual([MINTED_GRAPH_ID]);
  });

  it('creates the Card, first Graph, Edge and Layout as one Edit with internal identities', () => {
    // Card, then Layout — the order the one Edit mints them in. The Graph is
    // not in this list: the conversion boundary identifies it, from the
    // resolver's own minter.
    const graphLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 1, title: 'New space' },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const { authoring, session } = openAuthoring(graphLess, undefined, {
      newId: mintingIds(CREATED_CARD_ID, LAYOUT_ID),
    });
    replacePlacementForTest(authoring, Placement.fromEntries([[CARD_A, { x: 120, y: 240 }]]));

    expect(offersEmptyDrop(authoring, CARD_A)).toBe(true);
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
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: {
              [CARD_A]: { x: 120, y: 240 },
              [CREATED_CARD_ID]: { x: 420, y: 360 },
            },
            graphs: [
              {
                id: MINTED_GRAPH_ID,
                title: 'Graph 1',
                color: GRAPH_PALETTE[0],
                edges: [{ from: CARD_A, to: CREATED_CARD_ID }],
              },
            ],
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
    expect(offersConnection(authoring, CREATED_CARD_ID, CARD_A)).toBe(true);
    expect(
      complete(authoring, { kind: 'connected-cards', from: CREATED_CARD_ID, to: CARD_A }),
    ).toEqual({ kind: 'completed' });
    expect(graphsOf(session.getState().working)[0]?.edges).toHaveLength(2);
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
            graphs: [MAIN_GRAPH],
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

  /**
   * The case the queue's other test cannot reach: what a queued completion is
   * an Edit *to* when the Edit ahead of it converted an Algorithmic View.
   *
   * A completion carries the interaction and its rendered geometry and never a
   * `ResolvedRenderer`, so the drain resolves one against the Space and the
   * selection as they stand — by which time the conversion has installed its
   * Layout and Navigation has moved to it. Retaining the renderer instead would
   * convert a second time, and the two Layouts would each hold half the
   * author's work with nothing to say which is the Space's.
   */
  it('applies a completion queued behind a conversion to the Layout that conversion created', () => {
    // Two identities rather than one repeated: a second conversion then shows up
    // as the second Layout it would really be, instead of overwriting the first.
    const { authoring, session, navigation } = openAuthoring(undefined, undefined, {
      newId: mintingIds(CONVERTED_LAYOUT_ID, COMPETING_LAYOUT_ID),
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

    complete(authoring, { kind: 'settled-card-movement' });

    expect(reentrantResult).toEqual({ kind: 'queued' });
    const { working } = session.getState();
    // One Layout and one Graph, both from the first Edit: the queued one found
    // them by re-resolving rather than minting a competing pair of its own.
    expect(working.document.layouts?.map((layout) => layout.id)).toEqual([CONVERTED_LAYOUT_ID]);
    expect(graphsOf(working).map((graph) => graph.id)).toEqual([MINTED_GRAPH_ID]);
    // And it is the queued gesture's geometry that survives, written into that
    // same Layout rather than into a second one.
    expect(working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 500, y: 400 },
    });
    expect(navigation.getState().selectedRenderer).toEqual({
      kind: 'layout',
      layoutId: CONVERTED_LAYOUT_ID,
    });
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
      { reportObserverError: (error) => failures.push(error) },
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
    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([
      { from: CARD_A, to: CARD_B },
      { from: CARD_B, to: CARD_A },
    ]);
  });

  it('publishes once after the optimistic Space and navigation consequences are installed', () => {
    const { authoring } = openAuthoring(undefined, undefined, {
      newId: mintingIds(LAYOUT_ID),
    });
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
    // On the selected Layout, so the duplicate below has a Graph to be a
    // duplicate *of*. On an Algorithmic View the Edge would join the Graph the
    // conversion mints, which holds nothing — that case is the "offers an Edge
    // the emphasised Graph already holds" test above.
    const { authoring, session } = openAuthoring(positionedSnapshot, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    const staleCard = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

    expect(offersConnection(authoring, CARD_A, CARD_B)).toBe(false);
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    expect(offersConnection(authoring, CARD_A, CARD_B)).toBe(false);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_A, to: CARD_B })).toEqual({
      kind: 'refused',
      reason: 'These Cards are already connected in this Graph.',
    });
    expect(offersConnection(authoring, CARD_A, staleCard)).toBe(false);
    expect(complete(authoring, { kind: 'connected-cards', from: CARD_A, to: staleCard })).toEqual({
      kind: 'refused',
      reason: 'A connection can only join Cards in this Layout.',
    });
    expect(session.getState().working).toEqual(positionedSnapshot);
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
            graphs: [MAIN_GRAPH],
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
    const resolveRenderer = testResolver();
    const navigation = createNavigation(currentSpace, resolveRenderer, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    const authoring = createSpaceAuthoring({ session, navigation, currentSpace, resolveRenderer });
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
            graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
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

          // A fresh minter per case, which is what a constant mock could not be:
          // it is the collision ADR 0016 names as the reason a global mock ends
          // up needing a generator anyway.
          const converting = openAuthoring(undefined, undefined, {
            newId: mintingIds(LAYOUT_ID),
          });
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
          fc.pre(renderedAX !== 10 || renderedAY !== 20 || baseBX !== 300 || baseBY !== 40);
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

    navigation.openCard(CARD_A);
    expect(published).toBe(1);

    // The session outlives any Authoring composed over it, so one that never
    // unsubscribes leaves a listener and its closure behind on a session still
    // publishing to it. Nothing replaces a composition mid-session now that
    // accepting the stored Space is an edit to this one, but releasing the
    // subscriptions is still this object's to do.
    authoring.dispose();
    navigation.openCard(CARD_B);
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
            graphs: [MAIN_GRAPH],
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

    expect(complete(authoring, { kind: 'settled-card-movement' })).toEqual({ kind: 'unchanged' });
    expect(session.getState().working).toBe(before);
  });

  it('numbers a new Layout and Card above the highest existing number', () => {
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
            graphs: [
              {
                id: uuidSchema.parse('00000000-0000-4000-8000-000000000032'),
                title: 'Graph 1',
                edges: [],
              },
            ],
          },
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000023'),
            title: 'Layout 7',
            kind: 'positioned',
            positions: {},
            graphs: [
              {
                id: uuidSchema.parse('00000000-0000-4000-8000-000000000033'),
                title: 'Graph 1',
                edges: [],
              },
            ],
          },
        ],
      },
      cards: [
        { id: CARD_A, document: { title: 'Card 9', kind: 'markdown', body: '' } },
        { id: CARD_B, document: { title: 'Intro', kind: 'markdown', body: '' } },
      ],
    };
    // Card, Graph, Layout. The mock this replaced named only two, so the Layout
    // took an id from the real generator — invisible, because the assertions are
    // about titles.
    const { authoring, session } = openAuthoring(numbered, undefined, {
      newId: mintingIds(CREATED_CARD_ID, LAYOUT_ID),
    });
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

  /**
   * The diagnostic path cannot become the failure path. A reporter that throws
   * while explaining a failed queued completion must not interrupt the Edit that
   * drained the queue, and must not cost the Edits discarded behind it the
   * report that says they are gone.
   */
  it('contains a reporter that throws while reporting a failed queued completion', () => {
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
    const resolveRenderer = testResolver();
    const navigation = createNavigation(currentSpace, resolveRenderer, {
      kind: 'view',
      view: 'flow',
    });
    const reported: unknown[] = [];
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      currentSpace,
      resolveRenderer,
      reportObserverError: (error) => {
        reported.push(error);
        throw new Error('reporter failed');
      },
      newId: mintingIds(LAYOUT_ID),
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
    const resolveRenderer = testResolver();
    const navigation = createNavigation(currentSpace, resolveRenderer, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    const reported: unknown[] = [];
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      currentSpace,
      resolveRenderer,
      initialPlacement: Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
      reportObserverError: (error) => reported.push(error),
      newId: mintingIds(CREATED_CARD_ID),
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
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
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
    const resolveRenderer = testResolver();
    const navigation = createNavigation(currentSpace, resolveRenderer, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    const authoring = createSpaceAuthoring({ session, navigation, currentSpace, resolveRenderer });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    const published: number[] = [];
    authoring.subscribe(() => {
      published.push(graphsOf(authoring.getState().session.working)[0]?.edges.length ?? -1);
    });

    // Containment is the drain's job, not this function's: the Edit the caller
    // made itself still fails in the caller's hands.
    expect(() =>
      complete(authoring, { kind: 'connected-cards', from: CARD_B, to: CARD_A }),
    ).toThrow('submit failed');

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([
      { from: CARD_A, to: CARD_B },
      { from: CARD_B, to: CARD_A },
    ]);
    expect(graphsOf(authoring.getState().session.working)[0]?.edges).toHaveLength(2);
    expect(published).toEqual([2]);
  });

  /**
   * The window's other collaborator. Navigation is written last, so a throw
   * there leaves the session and the placement already moved and Navigation
   * still on the View the Edit began in — and the publication is the only way
   * anything finds out.
   *
   * The fault is injected because the real Navigation has no reachable throw
   * path here: the call resolves against the snapshot `submit` installed a line
   * earlier, that snapshot passed domain intake before the window opened, and
   * the Layout it carries owns the Graph handed over with it. What is pinned is
   * that the guarantee does not depend on that argument staying true.
   *
   * A converted View is used because it is where the half-applied state is
   * visible at all: the renderer Navigation keeps is plainly not the one the
   * Edit produced.
   */
  it('publishes what the collaborators hold when adopting the written Layout throws', () => {
    const graphLess: SpaceSnapshot = {
      id: SPACE_ID,
      document: { version: 1, title: 'New space' },
      cards: [{ id: CARD_A, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
    };
    const loaded = { snapshot: graphLess, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
    const resolveRenderer = testResolver();
    const real = createNavigation(currentSpace, resolveRenderer, { kind: 'view', view: 'flow' });
    const navigation: Navigation = {
      ...real,
      continueInRenderer: () => {
        throw new Error('adoption failed');
      },
    };
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      currentSpace,
      resolveRenderer,
      newId: mintingIds(LAYOUT_ID),
    });
    replacePlacementForTest(authoring, Placement.fromEntries([[CARD_A, { x: 10, y: 20 }]]));
    const published: NavigationState[] = [];
    authoring.subscribe(() => published.push(authoring.getState().navigation));

    expect(() =>
      complete(authoring, { kind: 'connected-cards', from: CARD_A, to: CARD_A }),
    ).toThrow('adoption failed');

    // The session took the Edit; Navigation refused it and is still on the View
    // the Edit began in. That is the half-applied state, and the publication in
    // the `finally` is what makes it observable at all.
    expect(graphsOf(session.getState().working)).toHaveLength(1);
    expect(graphsOf(authoring.getState().session.working)).toHaveLength(1);
    expect(real.getState()).toMatchObject({
      selectedRenderer: { kind: 'view', view: 'flow' },
      activeGraphId: null,
    });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      selectedRenderer: { kind: 'view', view: 'flow' },
      activeGraphId: null,
    });
  });

  it('reports the completions a failed drain discards', () => {
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
    const resolveRenderer = testResolver();
    const navigation = createNavigation(currentSpace, resolveRenderer, {
      kind: 'view',
      view: 'flow',
    });
    const reported: unknown[] = [];
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      currentSpace,
      resolveRenderer,
      reportObserverError: (error) => reported.push(error),
      newId: mintingIds(LAYOUT_ID),
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
    const { authoring, navigation } = openAuthoring(automaticSnapshot, undefined, {
      reportObserverError: (error) => reported.push(error),
    });
    // `subscribe` takes `() => void`, and TypeScript's void-return bivariance
    // lets an async listener through without complaint. Its rejection never
    // reaches the try/catch around the call, and Node answers an unhandled
    // rejection by killing the process.
    // Deliberately the shape lint rejects: the rule is the first line of
    // defence and this asserts the second, for a listener that reaches the same
    // shape indirectly and never trips it.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    authoring.subscribe(() => Promise.reject(new Error('observer rejected')));
    navigation.openCard(CARD_A);

    await vi.waitFor(() => expect(reported.map(String)).toEqual(['Error: observer rejected']));
  });

  it('contains a throwing observer and still notifies the ones behind it', () => {
    const reported: unknown[] = [];
    const { authoring, navigation } = openAuthoring(automaticSnapshot, undefined, {
      reportObserverError: (error) => reported.push(error),
    });
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

    expect(() => navigation.openCard(CARD_A)).not.toThrow();

    expect(notified).toEqual(['throwing', 'behind it']);
    expect(reported).toEqual([observerFailed]);
  });

  it('treats a selected Layout the Space no longer holds as no Edit', () => {
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
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
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      currentSpace,
      resolveRenderer: testResolver(),
    });
    replacePlacementForTest(
      authoring,
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
      ]),
    );
    const before = session.getState().working;

    expect(complete(authoring, { kind: 'settled-card-movement' })).toEqual({
      kind: 'refused',
      reason: 'This Layout is no longer part of the Space.',
    });
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
            graphs: [MAIN_GRAPH],
            activeGraph: GRAPH_ID,
          },
        ],
        defaultView: LAYOUT_ID,
      },
    };
    // The stored Space's Layout owns a second Graph and opens on it. Under ADR
    // 0040 a Graph arrives inside the Layout that owns it, so "the stored Space
    // has a Graph the local one does not" and "its Layout differs" are one
    // difference rather than two.
    const remote: SpaceSnapshot = {
      ...positioned,
      document: {
        ...positioned.document,
        title: 'Stored',
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Stored Layout',
            kind: 'positioned',
            positions: {
              [CARD_A]: { x: 900, y: 700 },
              [CARD_B]: { x: 600, y: 500 },
            },
            graphs: [
              MAIN_GRAPH,
              { id: STORED_GRAPH_ID, title: 'Stored Graph', edges: [{ from: CARD_B, to: CARD_A }] },
            ],
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

    expect(authoring.acceptStoredSpace()).toBeNull();
    expect(
      complete(authoring, {
        kind: 'edited-card',
        cardId: CARD_A,
        document: remote.cards[0]!.document,
      }),
    ).toEqual({ kind: 'unchanged' });

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
    // Without an installed placement this refuses before publishing,
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
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Layout 1',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 10, y: 20 }, [CARD_B]: { x: 300, y: 40 } },
            graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: UNKNOWN_CARD }] }],
          },
        ],
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

    // Every refusal intake makes reaches the author verbatim, and it says which
    // of the two closure failures this is: the Card is not in the Space at all,
    // rather than in it and outside this Layout (ADR 0040). The two send an
    // author to different places.
    expect(refusal).toBe(
      `The remote space is invalid and was not accepted:\n  - Graph "${GRAPH_ID}" edge 0 names "${UNKNOWN_CARD}" as its to, which the space does not hold`,
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
    const resolveRenderer = testResolver();
    const navigation = createNavigation(currentSpace, resolveRenderer, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    const authoring = createSpaceAuthoring({
      session,
      navigation,
      currentSpace,
      resolveRenderer,
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
