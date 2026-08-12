import { afterEach, describe, expect, it, vi } from 'vitest';
import { Position, type Edge } from '@xyflow/react';
import { uuidSchema, type LayoutPosition, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { mintingIds } from './minting';
import { createNavigation } from '../src/navigation';
import { createRenderAdapter, type RenderAdapter } from '../src/render-adapter';
import {
  createSpaceAuthoring,
  type AuthoringResult,
  type SpaceAuthoring,
} from '../src/space-authoring';
import type { RendererSelection } from '../src/renderer';
import { completeDrag, moving, node, settled } from './render-adapter-fixtures';

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
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
  readonly kind: 'reported' | 'replaced';
  readonly placement: ReadonlyMap<string, LayoutPosition> | null;
  /** What the adapter's own state held at the moment the effect ran. */
  readonly nodesAtCall: readonly CardFlowNode[] | null;
}

/** What Authoring answers about an Edit before the adapter attempts it. */
interface AuthoringCapabilities {
  readonly canConnect?: boolean;
  readonly canCreateConnectedCard?: boolean;
}

/** A Space Authoring that records what it was told, without a session behind it. */
function authoringSpy({
  canConnect = true,
  canCreateConnectedCard = true,
}: AuthoringCapabilities = {}) {
  const installs: InstallRecord[] = [];
  const completions: unknown[] = [];
  let adapter: RenderAdapter | null = null;
  const authoring = {
    getState: () => ({}) as never,
    authoredPlacement: () => null,
    subscribe: () => () => undefined,
    reportRendered: (placement: ReadonlyMap<string, LayoutPosition>) => {
      installs.push({
        kind: 'reported',
        placement,
        nodesAtCall: adapter?.getState().projection?.nodes ?? null,
      });
    },
    replacePlacement: (placement: ReadonlyMap<string, LayoutPosition> | null) => {
      installs.push({
        kind: 'replaced',
        placement,
        nodesAtCall: adapter?.getState().projection?.nodes ?? null,
      });
    },
    canConnect: () => canConnect,
    canCreateConnectedCard: () => canCreateConnectedCard,
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

/**
 * A real Session, Navigation and Authoring behind one render adapter. The spy
 * above answers what the adapter was *told*; this answers what a Space ends up
 * holding, so the two are not interchangeable.
 */
function sessionBackedAdapter(
  snapshot: SpaceSnapshot,
  renderer: RendererSelection,
  initialPlacement?: Placement,
  /** A newer stored state, so the first commit conflicts rather than settling. */
  stored?: SpaceSnapshot,
  /** The ids this workspace's Edits mint, supplied rather than mocked. */
  newId?: () => UUID,
) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const backend = new MemorySpaceBackend([
    stored === undefined ? loaded : { snapshot: stored, revision: 1n, exportedRevision: null },
  ]);
  const session = openSpaceSession(backend, loaded);
  const currentSpace = () => {
    const result = loadSpaceSnapshot(session.getState().working);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
    return result.space;
  };
  const navigation = createNavigation(currentSpace, renderer);
  const authoring = createSpaceAuthoring({
    session,
    navigation,
    currentSpace,
    ...(initialPlacement !== undefined ? { initialPlacement } : {}),
    ...(newId !== undefined ? { newId } : {}),
  });
  return { session, authoring, store: createRenderAdapter(authoring) };
}

/**
 * A Space whose Layout places Cards A and B, leaving C unplaced.
 *
 * The Layout's position keys are its Card membership and every Edge of a Graph
 * it owns is closed over them (ADR 0040), so the omitted Card is one the Graph
 * never names — C, which the projection still draws and which no Edit here may
 * quietly author.
 */
function sparsePositionedAdapter(newId?: () => UUID) {
  const snapshot: SpaceSnapshot = {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      layouts: [
        {
          id: LAYOUT_ID,
          title: 'Layout 1',
          kind: 'positioned',
          positions: {
            [uuidSchema.parse(CARD_A)]: { x: 10, y: 20 },
            [uuidSchema.parse(CARD_B)]: { x: 300, y: 20 },
          },
          graphs: [
            {
              id: GRAPH_ID,
              title: 'Main',
              edges: [{ from: uuidSchema.parse(CARD_A), to: uuidSchema.parse(CARD_B) }],
            },
          ],
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
  return sessionBackedAdapter(
    snapshot,
    { kind: 'layout', layoutId: LAYOUT_ID },
    Placement.fromEntries([
      [CARD_A, { x: 10, y: 20 }],
      [CARD_B, { x: 300, y: 20 }],
    ]),
    undefined,
    newId,
  );
}

/** The same Space, with a newer one already stored — so an Edit conflicts. */
function storedSpaceAdapter() {
  const snapshot: SpaceSnapshot = {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      layouts: [
        {
          id: LAYOUT_ID,
          title: 'Layout 1',
          kind: 'positioned',
          positions: {
            [uuidSchema.parse(CARD_A)]: { x: 10, y: 20 },
            [uuidSchema.parse(CARD_B)]: { x: 300, y: 20 },
          },
          graphs: [
            {
              id: GRAPH_ID,
              title: 'Main',
              edges: [{ from: uuidSchema.parse(CARD_A), to: uuidSchema.parse(CARD_B) }],
            },
          ],
        },
      ],
      defaultView: LAYOUT_ID,
    },
    cards: [
      { id: uuidSchema.parse(CARD_A), document: { title: 'A', kind: 'markdown', body: 'A' } },
      { id: uuidSchema.parse(CARD_B), document: { title: 'B', kind: 'markdown', body: 'B' } },
    ],
  };
  const stored: SpaceSnapshot = {
    ...snapshot,
    document: { ...snapshot.document, title: 'Stored' },
  };
  return sessionBackedAdapter(
    snapshot,
    { kind: 'layout', layoutId: LAYOUT_ID },
    Placement.fromEntries([
      [CARD_A, { x: 10, y: 20 }],
      [CARD_B, { x: 300, y: 20 }],
    ]),
    stored,
  );
}

describe('render adapter', () => {
  afterEach(() => vi.restoreAllMocks());

  /*
   * Nodes and their Graph Edges are one published value, not two fields that
   * happen to be written together. The tests below pin the states that
   * separation allowed: Edges surviving without the nodes declaring their
   * handles, and Edges being dropped by a change that concerns only nodes.
   */
  it('has published no projection at all before the first arrangement resolves', () => {
    expect(adapter().getState().projection).toBeNull();
  });

  it('drops the published Graph Edges with their nodes when the renderer changes', () => {
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);
    store.getState().syncProjection(PROJECTED, [EDGE]);
    expect(store.getState().projection?.edges).toEqual([EDGE]);

    store.getState().selectRenderer(null);

    expect(store.getState().projection).toBeNull();
    expect(spy.installs.at(-1)).toEqual({
      kind: 'replaced',
      placement: null,
      nodesAtCall: null,
    });
  });

  it('keeps the published Graph Edges through a change that concerns only nodes', () => {
    const store = adapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);

    completeDrag(store, CARD_A, 500, 400);
    store.getState().selectCard(uuidSchema.parse(CARD_A));

    expect(store.getState().projection?.edges).toEqual([EDGE]);
    expect(store.getState().projection?.nodes[0]?.position).toEqual({ x: 500, y: 400 });
  });

  it("takes React Flow's own selection change as the Card selected for authoring", () => {
    // The other path into `selectedCardId`: `selectCard` is the explicit store
    // action, this is React Flow reporting an ordinary click. Both read a node
    // id as a Card identity, and only the first was covered.
    const store = adapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);

    store.getState().changeNodes([{ type: 'select', id: CARD_A, selected: true }]);
    expect(store.getState().selectedCardId).toBe(CARD_A);

    store.getState().changeNodes([{ type: 'select', id: CARD_A, selected: false }]);
    expect(store.getState().selectedCardId).toBeNull();
  });

  it('publishes a new Graph Edge only with both endpoint handle declarations', () => {
    const store = adapter();
    store.getState().syncProjection(PROJECTED, []);
    const graphId = '00000000-0000-4000-8000-000000000004';
    const sourceHandle = `${graphId}::out`;
    const targetHandle = `${graphId}::in`;
    const edge: Edge = {
      id: `${graphId}:A->B`,
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
    expect(spy.installs[0]?.kind).toBe('reported');
    expect(spy.installs[0]?.nodesAtCall?.map((entry) => entry.id)).toEqual([CARD_A, CARD_B]);
    expect(spy.installs[0]?.placement).toEqual(
      Placement.fromEntries([
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

    // C was rendered and is still not a member of this Layout.
    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 300, y: 20 },
    });
  });

  it('keeps the Cards on screen when a connection completes with no fresh projection', () => {
    // A Space change starts a replacement arrangement, so the render path has no
    // projection to hand over — while the canvas deliberately keeps drawing the
    // one already on screen, which is what makes it still connectable. Nothing
    // fresh to merge means keep what is live: reconciling against an empty list
    // would blank the canvas until the strategy resolved.
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);

    store.getState().syncProjection(PROJECTED, []);
    expect(
      store.getState().connectCards(uuidSchema.parse(CARD_A), uuidSchema.parse(CARD_B), null),
    ).toBe(true);

    expect(store.getState().projection?.nodes.map((node) => node.id)).toEqual([CARD_A, CARD_B]);
  });

  it('captures every projected Card when an Algorithmic View converts', () => {
    // No Layout, so no Graph either: a Graph is a nested owned value and a Space
    // with nothing to own one holds none (ADR 0040). Converting is what gives
    // this Space both.
    const snapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'Space',
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
    // Converting mints the Layout's Graph before the Layout itself.
    const { session, store } = sessionBackedAdapter(
      snapshot,
      { kind: 'view', view: 'flow' },
      undefined,
      undefined,
      mintingIds(GRAPH_ID, LAYOUT_ID),
    );

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

    completeDrag(store, CARD_C, 400, 120);

    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 300, y: 20 },
      [CARD_C]: { x: 400, y: 120 },
    });
  });

  /*
   * A reprojection can land while a Card is in flight — an activated Graph or a
   * selection redraws the graph without the gesture ending. The nodes it reports
   * carry the live position, and the author has settled on nothing, so that
   * geometry is not theirs to author. Reported at review as reaching the Layout
   * through a later connection; it does not, because every completion re-reports
   * first. What it does reach is the in-memory placement, which re-runs the
   * strategy under a gesture still in progress.
   */
  it('keeps the authored position when a reprojection lands mid-drag', () => {
    const { authoring, store } = sparsePositionedAdapter();
    store.getState().syncProjection(SPARSE_PROJECTED, []);

    store.getState().changeNodes(moving(CARD_A, 90, 90));
    store.getState().syncProjection(SPARSE_PROJECTED, []);
    // The gesture ends where it began, so no Edit completes and nothing reports.
    store.getState().changeNodes(settled(CARD_A, 10, 20));

    expect(authoring.authoredPlacement()).toEqual(
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 20 }],
      ]),
    );
  });

  it('adds a newly created Card without placing other omitted Cards', () => {
    const { session, store } = sparsePositionedAdapter(mintingIds(CREATED_CARD_ID));
    store.getState().syncProjection(SPARSE_PROJECTED, []);

    expect(store.getState().createConnectedCard(uuidSchema.parse(CARD_A), { x: 420, y: 360 })).toBe(
      CREATED_CARD_ID,
    );

    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 300, y: 20 },
      [CREATED_CARD_ID]: { x: 420, y: 360 },
    });
  });

  /*
   * Authoring owns eligibility; the adapter only asks. A refusal has to stop
   * before the placement install, because installing is what converts an
   * Algorithmic View into a Layout (ADR 0025) — a gesture Authoring rejected
   * would otherwise still author one as a side effect.
   */
  it('installs and completes nothing for a connection Authoring refuses', () => {
    const spy = authoringSpy({ canConnect: false });
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);
    store.getState().syncProjection(PROJECTED, []);
    const published = store.getState().projection;
    const installedBefore = spy.installs.length;

    expect(
      store.getState().connectCards(uuidSchema.parse(CARD_A), uuidSchema.parse(CARD_B), PROJECTED),
    ).toBe(false);

    expect(spy.completions).toEqual([]);
    expect(spy.installs).toHaveLength(installedBefore);
    expect(store.getState().projection).toBe(published);
  });

  it('installs and completes nothing for a created Card Authoring refuses', () => {
    const spy = authoringSpy({ canCreateConnectedCard: false });
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);
    store.getState().syncProjection(PROJECTED, []);
    const installedBefore = spy.installs.length;

    expect(
      store.getState().createConnectedCard(uuidSchema.parse(CARD_A), { x: 420, y: 360 }),
    ).toBeNull();

    expect(spy.completions).toEqual([]);
    expect(spy.installs).toHaveLength(installedBefore);
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
    expect(spy.installs.at(-1)?.placement).toEqual(
      Placement.fromEntries([[CARD_A, { x: 111, y: 222 }]]),
    );
  });

  it('completes no Edit for a drag that returns to where it began', () => {
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);
    store.getState().syncProjection([node(CARD_A, 10, 20)], []);

    // React Flow reports a drag as many moving frames and one settled frame, and
    // the settled frame is measured against the *gesture's* start, not the
    // previous frame. `dragOrigins` is what retains that start across the two
    // callbacks; without it the comparison falls back to the last moving frame,
    // and a card put back where it came from reads as moved — persisting an Edit
    // the author did not make.
    store.getState().changeNodes(moving(CARD_A, 500, 400));
    store.getState().changeNodes(settled(CARD_A, 10, 20));

    expect(spy.completions).toEqual([]);
    expect(store.getState().moved).toBe(false);
    expect(store.getState().projection?.nodes[0]?.position).toEqual({ x: 10, y: 20 });
  });

  it('publishes nothing new for a change aimed at a node it does not own', () => {
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);
    store.getState().syncProjection([node(CARD_A, 10, 20)], []);
    const published = store.getState().projection;

    store
      .getState()
      .changeNodes([{ type: 'dimensions', id: CARD_C, dimensions: { width: 240, height: 120 } }]);

    // React Flow measures everything it renders and reports a `dimensions`
    // change for it, while `applyNodeChanges` always returns a fresh array. An
    // unowned node's change therefore round-trips into a re-sync that measures
    // it again, forever. Holding the published value's identity is what breaks
    // that loop, so identity — not equality — is the assertion.
    expect(store.getState().projection).toBe(published);
  });

  it('records that a card has moved, so routed Edge geometry stops being drawn', () => {
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);
    store.getState().syncProjection(PROJECTED, [EDGE]);

    // A layout's routed Edge geometry describes the arrangement it computed, so
    // it stops being true the moment a card leaves the place that routing
    // assumed. `App` reads this flag to fall back to plain curves; left false, a
    // dragged graph keeps drawing channels routed for positions nothing is at.
    expect(store.getState().moved).toBe(false);
    completeDrag(store, CARD_A, 500, 400);

    expect(store.getState().moved).toBe(true);
    expect(spy.completions).toEqual([
      {
        kind: 'settled-card-movement',
        rendered: Placement.fromEntries([
          [CARD_A, { x: 500, y: 400 }],
          [CARD_B, { x: 300, y: 20 }],
        ]),
        placed: [CARD_A],
      },
    ]);
  });

  /*
   * Completing comes before the connection is drawn. A completion that refuses
   * or throws — deriving a Space that fails intake is the realistic way —
   * would otherwise leave the connected styling published for an Edge the
   * Space never gained.
   */
  it('leaves the projected connection uncommitted when the completion fails', () => {
    const spy = authoringSpy();
    const failing: SpaceAuthoring = {
      ...spy.authoring,
      complete: () => {
        throw new Error('Authoring produced an invalid Space');
      },
    };
    const store = createRenderAdapter(failing);
    store.getState().syncProjection(PROJECTED, []);
    const published = store.getState().projection;
    const projected = PROJECTED.map((card) => ({ ...card, className: 'connected' }));

    expect(() =>
      store.getState().connectCards(uuidSchema.parse(CARD_A), uuidSchema.parse(CARD_B), projected),
    ).toThrow('Authoring produced an invalid Space');

    expect(store.getState().projection).toBe(published);
    expect(store.getState().projection?.nodes.every((card) => card.className !== 'connected')).toBe(
      true,
    );
  });

  /*
   * A queued completion has not happened yet: the Edit it is queued behind
   * decides the Space it will run against, and it can still answer `no-edit`
   * there. Drawing the connection now publishes it for an Edge the Space has
   * not gained — the same failure as a refusal, one turn later. If the queued
   * Edit does land, the projection that follows it draws the Edge anyway.
   */
  it('leaves the projected connection uncommitted when the completion is queued', () => {
    const spy = authoringSpy();
    const queueing: SpaceAuthoring = {
      ...spy.authoring,
      complete: () => ({ kind: 'queued' }),
    };
    const store = createRenderAdapter(queueing);
    store.getState().syncProjection(PROJECTED, []);
    const published = store.getState().projection;
    const projected = PROJECTED.map((card) => ({ ...card, className: 'connected' }));

    expect(
      store.getState().connectCards(uuidSchema.parse(CARD_A), uuidSchema.parse(CARD_B), projected),
    ).toBe(false);

    expect(store.getState().projection).toBe(published);
    expect(store.getState().projection?.nodes.every((card) => card.className !== 'connected')).toBe(
      true,
    );
  });

  /*
   * Accepting a stored Space replaces the working state without unmounting
   * anything, so this store is left holding a projection of Cards that may no
   * longer exist. Local placement cannot outlive the Space it belonged to
   * (ADR 0030).
   */
  it('drops the published projection when a replacement Space is opened', async () => {
    const { store, session, authoring } = storedSpaceAdapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);
    completeDrag(store, CARD_A, 500, 400);
    await vi.waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));
    expect(store.getState().projection).not.toBeNull();

    expect(authoring.acceptStoredSpace()).toBeNull();

    expect(store.getState().projection).toBeNull();
    expect(store.getState().selectedCardId).toBeNull();
    expect(store.getState().moved).toBe(false);
  });
});
