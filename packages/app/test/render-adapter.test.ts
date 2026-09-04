import { afterEach, describe, expect, it, vi } from 'vitest';
import { Position, type Edge } from '@xyflow/react';

import {
  uuidSchema,
  type LayoutId,
  type LayoutPosition,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { Placement } from '@project/graph';
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
 * One projected Graph Edge, in the shape `projectGraphEdges` builds: the id is
 * keyed on the Edge's position in its Graph, and `data.graphId` is what the
 * adapter reads to recover the domain Edge behind it.
 */
const EDGE: Edge = {
  id: `${GRAPH_ID}::0`,
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
  renderer: LayoutId,
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
    selection: renderer,
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
   * An Edge id is `<graphId>::<index>` and re-indexes whenever a Graph loses an
   * Edge, so the selection names the domain Edge instead. A deselection reported
   * for an id this projection no longer draws names no subject at all, and must
   * not clear a selection the author has since made.
   */
  it('ignores a selection change for an Edge this projection does not draw', () => {
    const store = adapter();
    store.getState().syncProjection(PROJECTED, [EDGE]);
    store.getState().selectCard(uuidSchema.parse(CARD_A));

    store.getState().changeEdges([{ type: 'select', id: 'gone::0', selected: false }]);

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
    expect(store.getState().resizeDraft?.cardId).toBe(CARD_A);
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

    expect(store.getState().resizeDraft).toEqual({
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
    expect(store.getState().resizeDraft).toBeNull();
  });

  it('snaps both dimensions inside the Close range to the exact Closed rect', () => {
    const authored = Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 500, height: 360 } }],
    ]);
    const spy = authoringSpy({ authoredPlacement: authored });
    const store = createRenderAdapter(spy.authoring);

    store.getState().cardResize.beginResize(CARD_A);
    store.getState().cardResize.previewResize(CARD_A, { width: 280, height: 166 });

    expect(store.getState().resizeDraft).toMatchObject({
      cardId: CARD_A,
      size: { width: 260, height: 146 },
    });
    expect(store.getState().resizeDraft?.placement.get(CARD_A)).toEqual({
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

    expect(store.getState().resizeDraft).toMatchObject({
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

    expect(store.getState().resizeDraft).toBeNull();
    expect(spy.completions).toEqual([]);
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
    expect(store.getState().resizeDraft).not.toBeNull();

    expect(authoring.acceptStoredSpace()).toBeNull();

    expect(store.getState().projection).toBeNull();
    expect(store.getState().selection).toEqual({ kind: 'none' });
    expect(store.getState().moved).toBe(false);
    expect(store.getState().resizeDraft).toBeNull();
  });
});
