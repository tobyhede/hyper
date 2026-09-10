import { afterEach, describe, expect, it, vi } from 'vitest';
import { Position, type Edge } from '@xyflow/react';

import {
  uuidSchema,
  type LayoutId,
  type LayoutPosition,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { graphRenderEdgeId, Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { mintingIds } from './minting';
import { composeApp } from '../src/compose-app';
import { createRenderAdapter, type RenderAdapter } from '../src/render-adapter';
import { createConnectionCompletion } from '../src/connection-completion';
import type {
  AuthoringResult,
  EdgeEligibility,
  EdgeProposal,
  SpaceAuthoring,
} from '../src/space-authoring';

import { completeDrag, moving, node, settled } from './render-adapter-fixtures';

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const CREATED_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const PROJECTED = [node(CARD_A, 10, 20), node(CARD_B, 300, 20)];

/**
 * One projected Graph Edge, in the shape `projectGraphEdges` builds: the id
 * comes from the minter production uses, so it is the Graph and the Edge's two
 * endpoints — the same triple the Edge subject is compared by — and
 * `data.graphId` is what the adapter reads to recover the domain Edge behind
 * it.
 */
const EDGE: Edge = {
  id: graphRenderEdgeId(GRAPH_ID, { from: CARD_A, to: CARD_B }),
  source: CARD_A,
  target: CARD_B,
  data: { graphId: GRAPH_ID },
};

interface InstallRecord {
  readonly kind: 'reported' | 'replaced';
  readonly placement: ReadonlyMap<string, LayoutPosition> | null;
  /** What the adapter's own state held at the moment the effect ran. */
  readonly nodesAtCall: readonly CardFlowNode[] | null;
}

/** What Authoring answers about an Edge gesture before the coordinator attempts it. */
interface AuthoringCapabilities {
  /** The proposal kind this Authoring refuses; every other kind is eligible. */
  readonly refusing?: EdgeProposal['kind'];
  readonly authoredPlacement?: Placement | null;
}

/** A Space Authoring that records what it was told, without a session behind it. */
function authoringSpy({ refusing, authoredPlacement = null }: AuthoringCapabilities = {}) {
  const installs: InstallRecord[] = [];
  const completions: unknown[] = [];
  let adapter: RenderAdapter | null = null;
  const authoring: SpaceAuthoring = {
    completeInLayout: () => {
      throw new Error('Embedded authoring is outside this adapter test.');
    },
    // SAFETY: `getState` is never read by these tests — the spy only needs to
    // satisfy `SpaceAuthoring`'s shape, not implement a real state.
    getState: () => ({}) as never,
    authoredPlacement: () => authoredPlacement,
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
    edgeEligibility: (proposal: EdgeProposal): EdgeEligibility =>
      proposal.kind === refusing
        ? { kind: 'refused', refusal: { code: 'edge-card-outside-layout' } }
        : { kind: 'eligible' },
    complete: (completion): AuthoringResult => {
      completions.push(completion);
      return { kind: 'completed' };
    },
    retryPersistence: () => undefined,
    keepLocalWork: () => undefined,
    acceptStoredSpace: () => null,
    dispose: () => undefined,
  };
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
 * The connection completion coordinator over one adapter and one Authoring.
 *
 * Tested here rather than beside Edge Authoring because what it owns is an
 * *ordering* between those two — complete first, reconcile only on a real Edit
 * — and neither pointers nor keys appear in it.
 */
function connections(
  store: RenderAdapter,
  authoring: SpaceAuthoring,
  reportInvariant: (error: unknown) => void = () => undefined,
) {
  return createConnectionCompletion({ adapter: store, authoring, reportInvariant });
}

/**
 * A real Session, Navigation and Authoring behind one render adapter. The spy
 * above answers what the adapter was *told*; this answers what a Space ends up
 * holding, so the two are not interchangeable.
 *
 * `initialPlacement` is `null` rather than absent, because these cases install
 * whatever geometry they are about; absent, the composition would open on the
 * selected Layout's own map (ADR 0025), which is a different starting state.
 */
function sessionBackedAdapter(
  snapshot: SpaceSnapshot,
  layoutId: LayoutId,
  initialPlacement: Placement | null = null,
  /** A newer stored state, so the first commit conflicts rather than settling. */
  stored?: SpaceSnapshot,
  /** The ids this Space's Edits mint, supplied rather than mocked. */
  newId?: () => UUID,
) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const backend = new MemorySpaceBackend([
    stored === undefined ? loaded : { snapshot: stored, revision: 1n, exportedRevision: null },
  ]);
  const session = openSpaceSession(backend, loaded);
  const { authoring, adapter } = composeApp({
    spaceSession: session,
    selection: layoutId,
    initialPlacement,
    newId,
  });
  return { session, authoring, store: adapter };
}

/**
 * A Space whose Layout places Cards A and B, leaving C outside the Layout.
 *
 * The Layout's position keys are its Card membership and every Edge of a Graph
 * it owns is closed over them (ADR 0040), so the omitted Card is one the Graph
 * never names — C, which the positioned projection does not draw.
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
            [uuidSchema.parse(CARD_A)]: { x: 10, y: 20, open: false },
            [uuidSchema.parse(CARD_B)]: { x: 300, y: 20, open: false },
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
      defaultLayout: LAYOUT_ID,
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
    LAYOUT_ID,
    Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: false }],
      [CARD_B, { x: 300, y: 20, open: false }],
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
            [uuidSchema.parse(CARD_A)]: { x: 10, y: 20, open: false },
            [uuidSchema.parse(CARD_B)]: { x: 300, y: 20, open: false },
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
      defaultLayout: LAYOUT_ID,
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
    LAYOUT_ID,
    Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: false }],
      [CARD_B, { x: 300, y: 20, open: false }],
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
  it('has published no projection at all before the first placement resolves', () => {
    expect(adapter().getState().projection).toBeNull();
  });

  it('drops the published Graph Edges with their nodes when the Layout changes', () => {
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);
    store.getState().syncProjection(PROJECTED, [EDGE]);
    expect(store.getState().projection?.edges).toEqual([EDGE]);

    store.getState().selectLayout(null);

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
    // The other path into the selection: `selectCard` is the explicit store
    // action, this is React Flow reporting an ordinary click. Both read a node
    // id as a Card identity, and only the first was covered.
    const store = adapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);

    store.getState().changeNodes([{ type: 'select', id: CARD_A, selected: true }]);
    expect(store.getState().selection).toEqual({ kind: 'card', cardId: CARD_A });

    store.getState().changeNodes([{ type: 'select', id: CARD_A, selected: false }]);
    expect(store.getState().selection).toEqual({ kind: 'none' });
  });

  /*
   * **One React Flow selection action produces two callback batches.** It selects
   * the new subject and then deselects the other kind, and the second batch names
   * a subject the union has already moved past. Reading the last change would
   * answer `none` for a click that plainly selected something — which is why the
   * union is folded additively rather than derived from the resulting arrays.
   */
  describe("React Flow's select-then-cross-kind-deselect order", () => {
    const selectingEdge = (store: RenderAdapter) =>
      store.getState().changeEdges([{ type: 'select', id: EDGE.id, selected: true }]);

    it('keeps a newly selected Edge when the Card deselection arrives after it', () => {
      const store = adapter();
      store.getState().syncProjection(PROJECTED, [EDGE]);
      store.getState().changeNodes([{ type: 'select', id: CARD_A, selected: true }]);

      selectingEdge(store);
      store.getState().changeNodes([{ type: 'select', id: CARD_A, selected: false }]);

      expect(store.getState().selection).toEqual({
        kind: 'edge',
        graphId: GRAPH_ID,
        edge: { from: CARD_A, to: CARD_B },
      });
    });

    it('keeps a newly selected Card when the Edge deselection arrives after it', () => {
      const store = adapter();
      store.getState().syncProjection(PROJECTED, [EDGE]);
      selectingEdge(store);

      store.getState().changeNodes([{ type: 'select', id: CARD_B, selected: true }]);
      store.getState().changeEdges([{ type: 'select', id: EDGE.id, selected: false }]);

      expect(store.getState().selection).toEqual({ kind: 'card', cardId: CARD_B });
    });

    it('clears the Card React Flow still holds selected when an Edge takes the selection', () => {
      // The controlled node array is what React Flow's Delete key reads, so a
      // Card left `selected` there would be deleted alongside the Edge the
      // author actually named.
      const store = adapter();
      store.getState().syncProjection(PROJECTED, [EDGE]);
      store.getState().changeNodes([{ type: 'select', id: CARD_A, selected: true }]);

      selectingEdge(store);

      expect(store.getState().projection?.nodes.every((node) => node.selected !== true)).toBe(true);
    });
  });

  /*
   * The focus-to-selection bridge React Flow does not supply: focusing an Edge
   * selects nothing there, so Tab-to-Edge then Delete would act on whatever was
   * selected before.
   */
  it('installs a focused Edge as the selected subject', () => {
    const store = adapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);

    store.getState().selectEdge({ graphId: GRAPH_ID, edge: { from: CARD_A, to: CARD_B } });

    expect(store.getState().selection).toEqual({
      kind: 'edge',
      graphId: GRAPH_ID,
      edge: { from: CARD_A, to: CARD_B },
    });
  });

  /*
   * The selection names the domain Edge, not React Flow's id for it. A
   * deselection reported for an id this projection no longer draws names no
   * subject at all, and must not clear a selection the author has since made —
   * which is reachable whenever the previous projection held an Edge this one
   * does not, a removed Edge and a reconnected one alike.
   */
  it('ignores a selection change for an Edge this projection does not draw', () => {
    const store = adapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);
    store.getState().selectCard(uuidSchema.parse(CARD_A));

    store.getState().changeEdges([
      {
        type: 'select',
        id: graphRenderEdgeId(GRAPH_ID, { from: CARD_A, to: CARD_C }),
        selected: false,
      },
    ]);

    expect(store.getState().selection).toEqual({ kind: 'card', cardId: CARD_A });
  });

  /**
   * A Card selected before the projection draws it is selected in React Flow's
   * own node array once it does.
   *
   * Authoring selects a Card in the same tick it creates it, one render before
   * the projection that first draws it — so `selectCard` records the subject
   * while no live node carries `selected`, and `selecting` maps over nodes that
   * do not include it yet. A projection carries no selection of its own either:
   * `projectCardNodes` sets `data.selectedForAuthoring` and never the node's
   * `selected`. So unless the sync folds the union back in, the Card arrives
   * unselected and stays that way — it *reads* as selected, since
   * `selectedForAuthoring` is right, while React Flow holds no selected node at
   * all. `F2` asks React Flow, so `F2` is what stops working, until any click
   * repairs it. Add Card, Add Alias and create-and-connect all land here.
   *
   * The `dimensions` change is the window in front of it: React Flow measures
   * anything it renders, so `changeNodes` is reached before that projection
   * lands. Under the additive union that cannot erase the subject — a
   * `dimensions` change is not a `select` change and `selectChanges` drops it —
   * and this pins that too, since the model this replaced *did* erase it by
   * re-deriving the selection from the live node array.
   */
  it('keeps a selection seeded for a Card the projection has not drawn yet', () => {
    const store = adapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);

    store.getState().selectCard(CREATED_CARD_ID);
    store
      .getState()
      .changeNodes([{ type: 'dimensions', id: CARD_A, dimensions: { width: 260, height: 146 } }]);

    expect(store.getState().selection).toEqual({ kind: 'card', cardId: CREATED_CARD_ID });

    store.getState().syncProjection([...PROJECTED, node(CREATED_CARD_ID, 900, 20)], [EDGE]);

    const seeded = store.getState().projection?.nodes.find((each) => each.id === CREATED_CARD_ID);
    expect(seeded?.selected).toBe(true);
  });

  /**
   * The same seeding on the other path a created Card arrives by.
   *
   * A completed create-and-connect publishes, Authoring selects the Card it has
   * just minted, and the projection carrying that Card reaches the store through
   * `mergeProjected` rather than `syncProjection`. Two call sites, one rule —
   * and this is the one the Edge Authoring seam uses.
   */
  it('seeds a selection for a Card that arrives through a merged projection', () => {
    const store = adapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);

    store.getState().selectCard(CREATED_CARD_ID);
    store.getState().mergeProjected([...PROJECTED, node(CREATED_CARD_ID, 900, 20)]);

    const seeded = store.getState().projection?.nodes.find((each) => each.id === CREATED_CARD_ID);
    expect(seeded?.selected).toBe(true);
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
        [CARD_A, { x: 10, y: 20, open: false }],
        [CARD_B, { x: 300, y: 20, open: false }],
      ]),
    );
    expect(store.getState().projection?.nodes.map((entry) => entry.id)).toEqual([CARD_A, CARD_B]);
  });

  it('keeps the Cards on screen when a connection completes with no fresh projection', () => {
    // A Space change starts a replacement placement, so the render path has no
    // projection to hand over — while the canvas deliberately keeps drawing the
    // Cards already on screen, which is what makes it still connectable. Nothing
    // fresh to merge means keep what is live: reconciling against an empty list
    // would blank the canvas until the strategy resolved.
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);

    store.getState().syncProjection(PROJECTED, []);
    expect(
      connections(store, spy.authoring).connect(
        uuidSchema.parse(CARD_A),
        uuidSchema.parse(CARD_B),
        null,
      ),
    ).toEqual({ kind: 'completed', cardId: CARD_B });

    expect(store.getState().projection?.nodes.map((node) => node.id)).toEqual([CARD_A, CARD_B]);
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
    store.getState().syncProjection(PROJECTED, []);

    store.getState().changeNodes(moving(CARD_A, 90, 90));
    store.getState().syncProjection(PROJECTED, []);
    // The gesture ends where it began, so no Edit completes and nothing reports.
    store.getState().changeNodes(settled(CARD_A, 10, 20));

    expect(authoring.authoredPlacement()).toEqual(
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20, open: false }],
        [CARD_B, { x: 300, y: 20, open: false }],
      ]),
    );
  });

  it('adds a newly created Card without placing other omitted Cards', () => {
    const { session, store, authoring } = sparsePositionedAdapter(mintingIds(CREATED_CARD_ID));
    store.getState().syncProjection(PROJECTED, []);

    expect(
      connections(store, authoring).createAndConnect(
        uuidSchema.parse(CARD_A),
        { x: 420, y: 360 },
        null,
      ),
    ).toEqual({ kind: 'completed', cardId: CREATED_CARD_ID });

    expect(session.getState().working.document.layouts?.[0]?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20, open: false },
      [CARD_B]: { x: 300, y: 20, open: false },
      [CREATED_CARD_ID]: { x: 420, y: 360, open: false },
    });
  });

  /*
   * Authoring owns eligibility; the coordinator only asks. A refusal has to stop
   * before the placement install, because installing is what commits an
   * pending placement into a Layout — a gesture Authoring rejected
   * would otherwise still author one as a side effect.
   */
  it('installs and completes nothing for a connection Authoring refuses', () => {
    const spy = authoringSpy({ refusing: 'connect' });
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);
    store.getState().syncProjection(PROJECTED, []);
    const published = store.getState().projection;
    const installedBefore = spy.installs.length;

    expect(
      connections(store, spy.authoring).connect(
        uuidSchema.parse(CARD_A),
        uuidSchema.parse(CARD_B),
        PROJECTED,
      ),
      // The refusal travels with the outcome, so nothing asks eligibility a
      // second time to recover the identity it already had — and it travels
      // structured, because the sentence is the surface's (ADR 0057).
    ).toEqual({ kind: 'refused', refusal: { code: 'edge-card-outside-layout' } });

    expect(spy.completions).toEqual([]);
    expect(spy.installs).toHaveLength(installedBefore);
    expect(store.getState().projection).toBe(published);
  });

  it('installs and completes nothing for a created Card Authoring refuses', () => {
    const spy = authoringSpy({ refusing: 'create-and-connect' });
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);
    store.getState().syncProjection(PROJECTED, []);
    const installedBefore = spy.installs.length;

    expect(
      connections(store, spy.authoring).createAndConnect(
        uuidSchema.parse(CARD_A),
        { x: 420, y: 360 },
        null,
      ),
    ).toEqual({ kind: 'refused', refusal: { code: 'edge-card-outside-layout' } });

    expect(spy.completions).toEqual([]);
    expect(spy.installs).toHaveLength(installedBefore);
  });

  it('applies projected rect and stacking to an existing live node', () => {
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);

    const closed = node(CARD_A, 10, 20);
    closed.width = 260;
    closed.height = 146;
    store.getState().syncProjection([closed], []);

    const expanded = node(CARD_A, 40, 60);
    expanded.width = 560;
    expanded.height = 420;
    expanded.zIndex = 10;
    expanded.data.expanded = true;
    store.getState().syncProjection([expanded], []);

    expect(store.getState().projection?.nodes[0]).toMatchObject({
      position: { x: 40, y: 60 },
      width: 560,
      height: 420,
      zIndex: 10,
      data: { expanded: true },
    });
  });

  /**
   * The canvas holds the resize capability across a live gesture — it is a
   * dependency of the memo that builds every node's data, and React Flow's own
   * resize control re-registers its drag handler whenever the callbacks built
   * from it change identity. Zustand merges every partial into a fresh state
   * object, so the capability has to be a value of its own rather than the
   * state that carries it.
   */
  it('answers one resize capability across writes resize knows nothing about', () => {
    const spy = authoringSpy({
      authoredPlacement: Placement.fromEntries([
        [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 500, height: 360 } }],
      ]),
    });
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);
    const capability = store.getState().cardResize;

    store.getState().syncProjection(PROJECTED, []);
    store.getState().selectCard(CARD_A);
    completeDrag(store, CARD_A, 111, 222);

    expect(store.getState().cardResize).toBe(capability);
    // Still the live capability and not a snapshot of one: the canvas holds it
    // from before the gesture and the store has to answer that same value.
    capability.beginResize(CARD_A);
    expect(store.getState().interactionDraft).toMatchObject({ kind: 'resize', cardId: CARD_A });
  });

  it('previews one resize through a derived Placement and completes only its final size', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 500, height: 360 } }],
      [CARD_B, { x: 300, y: 200, open: false }],
    ]);
    const spy = authoringSpy({ authoredPlacement: authored });
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);

    store.getState().cardResize.beginResize(CARD_A);
    store.getState().cardResize.previewResize(CARD_A, { width: 620, height: 440 });

    expect(store.getState().interactionDraft).toEqual({
      kind: 'resize',
      cardId: CARD_A,
      size: { width: 620, height: 440 },
      placement: Placement.fromEntries([
        [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 620, height: 440 } }],
        [CARD_B, { x: 300, y: 200, open: false }],
      ]),
    });
    expect(spy.completions).toEqual([]);

    store.getState().cardResize.finishResize(CARD_A);

    expect(spy.completions).toEqual([
      { kind: 'resized-card', cardId: CARD_A, size: { width: 620, height: 440 } },
    ]);
    expect(store.getState().interactionDraft).toBeNull();
  });

  it('snaps both dimensions inside the Close range to the exact Closed rect', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 500, height: 360 } }],
    ]);
    const spy = authoringSpy({ authoredPlacement: authored });
    const store = createRenderAdapter(spy.authoring);

    store.getState().cardResize.beginResize(CARD_A);
    store.getState().cardResize.previewResize(CARD_A, { width: 280, height: 166 });

    expect(store.getState().interactionDraft).toMatchObject({
      cardId: CARD_A,
      size: { width: 260, height: 146 },
    });
    expect(store.getState().interactionDraft?.placement.get(CARD_A)).toEqual({
      x: 10,
      y: 20,
      open: true,
      openSize: { width: 260, height: 146 },
    });

    store.getState().cardResize.finishResize(CARD_A);

    expect(spy.completions).toEqual([
      { kind: 'resized-card', cardId: CARD_A, size: { width: 260, height: 146 } },
    ]);
  });

  it('keeps an Open resize proposal when only one dimension reaches the Close range', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 500, height: 360 } }],
    ]);
    const store = createRenderAdapter(authoringSpy({ authoredPlacement: authored }).authoring);

    store.getState().cardResize.beginResize(CARD_A);
    store.getState().cardResize.previewResize(CARD_A, { width: 280, height: 240 });

    expect(store.getState().interactionDraft).toMatchObject({
      cardId: CARD_A,
      size: { width: 280, height: 240 },
    });
  });

  /**
   * A resize draft leaves the live nodes alone. Nothing rejects a node-only
   * rect here because React Flow never proposes one: its resize control emits
   * that `dimensions` change from the callback `shouldResize` gates, and the
   * Card refuses every frame while still handing the rect on. What proves that
   * end of it is the real control under a real gesture, in
   * `SpaceCanvas.test.tsx`; what this holds is that the draft alone does not
   * touch the published projection.
   */
  it('leaves the published projection alone while the resize draft grows', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 500, height: 360 } }],
      [CARD_B, { x: 300, y: 200, open: false }],
    ]);
    const store = createRenderAdapter(authoringSpy({ authoredPlacement: authored }).authoring);
    const open = node(CARD_A, 10, 20);
    open.width = 500;
    open.height = 360;
    store.getState().syncProjection([open, node(CARD_B, 300, 200)], [EDGE]);
    const beforeDraftProjection = store.getState().projection;

    store.getState().cardResize.beginResize(CARD_A);
    store.getState().cardResize.previewResize(CARD_A, { width: 620, height: 440 });

    expect(store.getState().projection).toBe(beforeDraftProjection);
    expect(store.getState().projection?.nodes[0]).toMatchObject({ width: 500, height: 360 });
  });

  it('discards the complete resize draft without an Edit when the gesture is cancelled', () => {
    const spy = authoringSpy({
      authoredPlacement: Placement.fromEntries([
        [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 500, height: 360 } }],
      ]),
    });
    const store = createRenderAdapter(spy.authoring);

    store.getState().cardResize.beginResize(CARD_A);
    store.getState().cardResize.previewResize(CARD_A, { width: 620, height: 440 });
    store.getState().cardResize.cancelResize(CARD_A);

    expect(store.getState().interactionDraft).toBeNull();
    expect(spy.completions).toEqual([]);
  });

  /**
   * A dragged Open Card is the one gesture that moves Cards it is not.
   *
   * Displacement is derived from the Open Card's *authored* position (ADR 0064),
   * so the neighbours are somewhere else the moment it crosses them — and the
   * author is aiming at those neighbours while they drag. The draft is what puts
   * that answer on screen during the gesture rather than one frame after it.
   */
  describe('a dragged Open Card previews the displacement it is causing', () => {
    // B sits `+x` and `+y` of A, so it takes A's whole growth on both axes:
    // 500 - 260 = 240 across, 360 - 146 = 214 down.
    const openAAndClosedB = () =>
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 500, height: 360 } }],
        [CARD_B, { x: 300, y: 200, open: false }],
      ]);

    it('drafts the placement the neighbours are drawn from, per frame', () => {
      const authored = openAAndClosedB();
      const store = createRenderAdapter(authoringSpy({ authoredPlacement: authored }).authoring);
      store.getState().syncProjection([node(CARD_A, 10, 20), node(CARD_B, 540, 414)], []);

      // Dragged to (400, 300) in drawn coordinates. A displaces nobody but B,
      // and never itself, so a lone Open Card's drawn position is its authored
      // one and the draft takes the drop point as it stands.
      store.getState().changeNodes(moving(CARD_A, 400, 300));

      // The Placement is the whole draft: a `move` names no Card, because what
      // its two consumers ask is where everything is, not which one moved.
      expect(store.getState().interactionDraft).toEqual({
        kind: 'move',
        placement: Placement.fromEntries([
          [CARD_A, { x: 400, y: 300, open: true, openSize: { width: 500, height: 360 } }],
          [CARD_B, { x: 300, y: 200, open: false }],
        ]),
      });
      // B is now `-x` and `-y` of A, so the draft draws it undisplaced — which
      // is the jump the author would otherwise have seen only at release.
      expect(Placement.drawn(store.getState().interactionDraft!.placement).get(CARD_B)).toEqual({
        x: 300,
        y: 200,
        open: false,
      });

      store.getState().changeNodes(moving(CARD_A, 400, 100));

      // Back above B on `y` alone: B takes the vertical growth again and keeps
      // its horizontal freedom. Each frame is answered from the authored
      // placement rather than from the frame before, so nothing accumulates.
      expect(Placement.drawn(store.getState().interactionDraft!.placement).get(CARD_B)).toEqual({
        x: 300,
        y: 414,
        open: false,
      });
    });

    it('leaves release still: the authored placement redraws what the draft showed', () => {
      const authored = openAAndClosedB();
      const spy = authoringSpy({ authoredPlacement: authored });
      const store = createRenderAdapter(spy.authoring);
      store.getState().syncProjection([node(CARD_A, 10, 20), node(CARD_B, 540, 414)], []);

      store.getState().changeNodes(moving(CARD_A, 400, 300));
      const previewed = store.getState().interactionDraft!.placement;
      store.getState().changeNodes(settled(CARD_A, 400, 300));

      // The draft is gone and the completion carries the same drop point, so
      // what Authoring installs draws exactly what was already on screen.
      expect(store.getState().interactionDraft).toBeNull();
      expect(spy.completions).toMatchObject([{ kind: 'settled-card-movement', placed: [CARD_A] }]);
      expect(Placement.next(authored, store.getState().renderedPlacement()!, [CARD_A])).toEqual(
        previewed,
      );
    });

    it('drafts nothing for a closed Card, whose position displaces nobody', () => {
      const store = createRenderAdapter(
        authoringSpy({ authoredPlacement: openAAndClosedB() }).authoring,
      );
      store.getState().syncProjection([node(CARD_A, 10, 20), node(CARD_B, 540, 414)], []);

      store.getState().changeNodes(moving(CARD_B, 900, 900));

      expect(store.getState().interactionDraft).toBeNull();
    });

    it('leaves a live resize draft alone', () => {
      const store = createRenderAdapter(
        authoringSpy({ authoredPlacement: openAAndClosedB() }).authoring,
      );
      store.getState().syncProjection([node(CARD_A, 10, 20), node(CARD_B, 540, 414)], []);
      store.getState().cardResize.beginResize(CARD_A);
      store.getState().cardResize.previewResize(CARD_A, { width: 620, height: 440 });
      const resizing = store.getState().interactionDraft;

      store.getState().changeNodes(moving(CARD_A, 400, 300));
      expect(store.getState().interactionDraft).toBe(resizing);

      store.getState().changeNodes(settled(CARD_A, 400, 300));
      expect(store.getState().interactionDraft).toBe(resizing);
    });

    it('discards the draft when the canvas moves to another Layout', () => {
      const store = createRenderAdapter(
        authoringSpy({ authoredPlacement: openAAndClosedB() }).authoring,
      );
      store.getState().syncProjection([node(CARD_A, 10, 20), node(CARD_B, 540, 414)], []);
      store.getState().changeNodes(moving(CARD_A, 400, 300));
      expect(store.getState().interactionDraft).not.toBeNull();

      store.getState().selectLayout(null);

      expect(store.getState().interactionDraft).toBeNull();
    });
  });

  it('keeps an in-flight drag position while applying projected expanded geometry', () => {
    const spy = authoringSpy();
    const store = createRenderAdapter(spy.authoring);
    spy.attach(store);

    store.getState().syncProjection([node(CARD_A, 10, 20)], []);
    store.getState().changeNodes(moving(CARD_A, 111, 222));

    const expanded = node(CARD_A, 40, 60);
    expanded.width = 560;
    expanded.height = 420;
    expanded.zIndex = 10;
    expanded.data.expanded = true;
    store.getState().syncProjection([expanded], []);

    expect(store.getState().projection?.nodes[0]).toMatchObject({
      position: { x: 111, y: 222 },
      width: 560,
      height: 420,
      zIndex: 10,
      data: { expanded: true },
    });
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

    // A layout's routed Edge geometry describes the placement it computed, so
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
          [CARD_A, { x: 500, y: 400, open: false }],
          [CARD_B, { x: 300, y: 20, open: false }],
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
      connections(store, failing).connect(
        uuidSchema.parse(CARD_A),
        uuidSchema.parse(CARD_B),
        projected,
      ),
    ).toThrow('Authoring produced an invalid Space');

    expect(store.getState().projection).toBe(published);
    expect(store.getState().projection?.nodes.every((card) => card.className !== 'connected')).toBe(
      true,
    );
  });

  /*
   * `queued` is Authoring's answer to a completion made from inside its own
   * publication, and a React Flow event is never that — it arrives from the
   * browser's event loop with no Edit on the stack. So reaching it here is an
   * invariant violation rather than an interaction outcome: it is reported, and
   * the gesture ends having drawn nothing. Taking the canvas down mid-drag would
   * be the wrong answer to a diagnostic, and if the queued Edit does land, the
   * projection that follows it draws the Edge anyway.
   */
  it('reports and draws nothing when a completion at the React Flow seam is queued', () => {
    const spy = authoringSpy();
    const queueing: SpaceAuthoring = {
      ...spy.authoring,
      complete: () => ({ kind: 'queued' }),
    };
    const store = createRenderAdapter(queueing);
    store.getState().syncProjection(PROJECTED, []);
    const published = store.getState().projection;
    const projected = PROJECTED.map((card) => ({ ...card, className: 'connected' }));
    const reported: unknown[] = [];

    expect(
      connections(store, queueing, (error) => reported.push(error)).connect(
        uuidSchema.parse(CARD_A),
        uuidSchema.parse(CARD_B),
        projected,
      ),
      // Not a refusal: the author is owed no sentence for a diagnostic, and a
      // message already on screen must not be wiped by one.
    ).toEqual({ kind: 'unavailable' });

    expect(reported).toHaveLength(1);
    expect(store.getState().projection).toBe(published);
    expect(store.getState().projection?.nodes.every((card) => card.className !== 'connected')).toBe(
      true,
    );
  });

  /*
   * An embedded Layout's live edit is an Interaction of the canvas, so it is
   * held beside `interactionDraft` rather than reported up through a callback prop:
   * this store is what re-renders the Space's command surface and the canvas
   * together, and every availability answer is derived once, above both of them
   * (`authoring-availability.ts`).
   */
  it('carries no embedded edit before the canvas has reported one', () => {
    expect(adapter().getState().editingEmbeddedLayout).toBe(false);
  });

  it("takes the canvas's report of a live embedded edit and of its end", () => {
    const store = adapter();

    store.getState().reportEmbeddedLayoutEditing(true);
    expect(store.getState().editingEmbeddedLayout).toBe(true);

    store.getState().reportEmbeddedLayoutEditing(false);
    expect(store.getState().editingEmbeddedLayout).toBe(false);
  });

  /*
   * The canvas reports what it currently holds rather than a transition, so the
   * same answer arrives again whenever anything else about the embeddings
   * changes. Publishing a fresh state for it would notify every subscriber of
   * this store — the projection's readers included — for a fact none of them
   * has seen change.
   */
  it('publishes nothing for a report that says what the store already holds', () => {
    const store = adapter();
    const seen: boolean[] = [];
    store.subscribe((state) => seen.push(state.editingEmbeddedLayout));

    store.getState().reportEmbeddedLayoutEditing(false);
    store.getState().reportEmbeddedLayoutEditing(true);
    store.getState().reportEmbeddedLayoutEditing(true);

    expect(seen).toEqual([true]);
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
    expect(authoring.complete({ kind: 'opened-card', cardId: CARD_A }).kind).toBe('completed');
    store.getState().cardResize.beginResize(CARD_A);
    store.getState().cardResize.previewResize(CARD_A, { width: 620, height: 440 });
    expect(store.getState().projection).not.toBeNull();
    expect(store.getState().interactionDraft).not.toBeNull();

    expect(authoring.acceptStoredSpace()).toBeNull();

    expect(store.getState().projection).toBeNull();
    expect(store.getState().selection).toEqual({ kind: 'none' });
    expect(store.getState().moved).toBe(false);
    expect(store.getState().interactionDraft).toBeNull();
  });
});
