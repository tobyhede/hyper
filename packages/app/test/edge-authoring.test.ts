import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { composeApp } from '../src/compose-app';
import { createConnectionCompletion } from '../src/connection-completion';
import { newCardDrop, type ConnectionGesture, type DropTarget } from '../src/edge-authoring';
import type { CanvasRendererId } from '../src/renderer';
import { CARD_SIZE } from '../src/card';
import { mintingGraphIds, mintingIds } from './minting';
import { node } from './render-adapter-fixtures';

/**
 * Edge Authoring through its own interface: the one draft, what cancels it, what
 * a refusal leaves standing, and where focus is owed afterwards.
 *
 * Deliberately not a test of Graph rules — those belong to Space Authoring, and
 * `space-authoring-operations.test.ts` owns them. What is asserted here is that
 * this module asks the right question at the right moment and keeps nothing of
 * its own that the Space already answers.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const MINTED = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
const MINTED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
const UNKNOWN_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000098');

const EDGE = { from: CARD_A, to: CARD_B } as const;
/** The Graph and Edge an Edge operation is named by, which travel together. */
const SUBJECT = { graphId: GRAPH_ID, edge: EDGE } as const;

const PROJECTED: CardFlowNode[] = [
  node(CARD_A, 10, 20),
  node(CARD_B, 300, 40),
  node(CARD_C, 600, 40),
];

const automaticSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'Space' },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
    { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
  ],
};

/** One Layout holding all three Cards, with two Graphs over them. */
const positionedSnapshot: SpaceSnapshot = {
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
          [CARD_C]: { x: 600, y: 40 },
        },
        graphs: [
          { id: GRAPH_ID, title: 'Main', edges: [EDGE] },
          { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] },
        ],
      },
    ],
    defaultRenderer: LAYOUT_ID,
  },
};

function open(
  snapshot: SpaceSnapshot = positionedSnapshot,
  renderer: CanvasRendererId = { kind: 'layout', layoutId: LAYOUT_ID },
  newId: () => UUID = mintingIds(MINTED),
) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
  const { navigation, authoring, adapter, edgeAuthoring } = composeApp({
    spaceSession: session,
    selection: renderer,
    newGraphId: mintingGraphIds(MINTED_GRAPH),
    newId,
    initialPlacement: Placement.fromEntries([
      [CARD_A, { x: 10, y: 20 }],
      [CARD_B, { x: 300, y: 40 }],
      [CARD_C, { x: 600, y: 40 }],
    ]),
    // The real completion over this composition's own collaborators, with its
    // invariant sink silenced: what a gesture leaves standing is asserted
    // through Edge Authoring's own state, and these cases deliberately drive
    // refusals past it.
    connections: (collaborators) =>
      createConnectionCompletion({ ...collaborators, reportInvariant: () => undefined }),
  });
  adapter.getState().syncProjection(PROJECTED, []);
  return { session, navigation, authoring, adapter, edges: edgeAuthoring };
}

const graphsOf = (snapshot: SpaceSnapshot) =>
  (snapshot.document.layouts ?? []).flatMap((layout) => layout.graphs);

describe('the one Edge interaction draft', () => {
  it('holds at most one draft, whichever kind starts next', () => {
    const { edges } = open();

    edges.beginKeyboardConnect(CARD_A);
    expect(edges.getState().draft).toEqual({ kind: 'keyboard-connect', from: CARD_A });

    edges.openEdgeEditor(SUBJECT);
    expect(edges.getState().draft).toEqual({
      kind: 'keyboard-reconnect',
      graphId: GRAPH_ID,
      edge: EDGE,
    });

    edges.beginPointerReconnect(SUBJECT, 'to');
    expect(edges.getState().draft).toEqual({
      kind: 'pointer-reconnect',
      graphId: GRAPH_ID,
      edge: EDGE,
      endpoint: 'to',
    });
  });

  it('cancels the draft and asks for focus back at the Card the author was on', () => {
    const { edges } = open();
    edges.beginKeyboardConnect(CARD_A);

    edges.cancelDraft();

    expect(edges.getState().draft).toBeNull();
    expect(edges.takeFocusRequest()).toEqual({ kind: 'card', cardId: CARD_A });
    // Taken once: a second read finds nothing to do.
    expect(edges.takeFocusRequest()).toBeNull();
  });

  it('returns focus to the unmoved endpoint when a reconnection is cancelled', () => {
    const { edges } = open();
    edges.beginPointerReconnect(SUBJECT, 'to');

    edges.cancelDraft();

    expect(edges.takeFocusRequest()).toEqual({ kind: 'card', cardId: CARD_A });
  });
});

/**
 * A refusal is not a cancellation. The draft and its refusal stand together so
 * the author can correct what they aimed at, rather than being returned to the
 * start of the gesture with a sentence and nothing to act on.
 */
describe('a refused proposal', () => {
  it('keeps the draft, and retains the refusal on the endpoint editor channel', () => {
    const { edges } = open();
    edges.openEdgeEditor(SUBJECT);

    // A Card outside this Layout, so the rule is Authoring's rather than this
    // module's — which is the point: the identity comes from where the rule is,
    // and the endpoint beside it is the only context presentation needs to mark
    // one Field and not the other.
    expect(edges.reconnect('to', uuidSchema.parse('00000000-0000-4000-8000-0000000000aa'))).toBe(
      false,
    );

    expect(edges.getState().draft).toEqual({
      kind: 'keyboard-reconnect',
      graphId: GRAPH_ID,
      edge: EDGE,
    });
    expect(edges.getState().refusal).toEqual({
      kind: 'reconnection',
      endpoint: 'to',
      refusal: { code: 'edge-card-outside-layout' },
    });
  });

  it('clears the refusal when the next draft begins', () => {
    const { edges } = open();
    edges.openEdgeEditor(SUBJECT);
    edges.reconnect('to', uuidSchema.parse('00000000-0000-4000-8000-0000000000aa'));

    edges.beginKeyboardConnect(CARD_A);

    expect(edges.getState().refusal).toBeNull();
  });

  it('settles the draft when a reconnection completes', () => {
    const { edges, session } = open();
    edges.openEdgeEditor(SUBJECT);

    expect(edges.reconnect('to', CARD_C)).toBe(true);

    expect(edges.getState().draft).toBeNull();
    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([{ from: CARD_A, to: CARD_C }]);
  });

  /**
   * The matrix's focus for a completed Reconnect is the **edited Edge**, and
   * nothing else can supply it: the selection still names the *old* `{from,to}`,
   * so the reconnected Edge draws unselected and the surface that held focus —
   * the popover, on the keyboard path — unmounts with it, leaving focus on
   * `body`. Re-selecting is what keeps the author on the Edge they just edited.
   */
  it('keeps the reconnected Edge selected and asks for focus on it', () => {
    const { edges, adapter } = open();
    adapter.getState().selectEdge(SUBJECT);
    edges.openEdgeEditor(SUBJECT);

    expect(edges.reconnect('to', CARD_C)).toBe(true);

    const reconnected = { graphId: GRAPH_ID, edge: { from: CARD_A, to: CARD_C } };
    expect(adapter.getState().selection).toEqual({ kind: 'edge', ...reconnected });
    expect(edges.takeFocusRequest()).toEqual({ kind: 'edge', ...reconnected });
  });

  /** An endpoint dragged back where it started edited nothing, so nothing moves. */
  it('leaves the selection alone when a reconnection changes nothing', () => {
    const { edges, adapter } = open();
    adapter.getState().selectEdge(SUBJECT);
    edges.openEdgeEditor(SUBJECT);

    expect(edges.reconnect('to', CARD_B)).toBe(true);

    expect(adapter.getState().selection).toEqual({ kind: 'edge', ...SUBJECT });
  });

  /** An endpoint dragged back where it started is the author's ordinary close. */
  it('settles the draft when a reconnection is unchanged', () => {
    const { edges, session } = open();
    const before = session.getState().working;
    edges.openEdgeEditor(SUBJECT);

    expect(edges.reconnect('to', CARD_B)).toBe(true);

    expect(edges.getState().draft).toBeNull();
    expect(session.getState().working).toBe(before);
  });
});

describe('deleting an Edge', () => {
  it('removes it from its Graph and asks for focus at the source Card', () => {
    const { edges, session } = open();

    expect(edges.deleteEdge(SUBJECT)).toBe(true);

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([]);
    expect(edges.takeFocusRequest()).toEqual({ kind: 'card', cardId: CARD_A });
  });

  it('keeps the Edge and retains the refusal on the selected-Edge channel', () => {
    const { edges, session } = open();
    const before = session.getState().working;

    expect(edges.deleteEdge({ graphId: UNKNOWN_GRAPH, edge: EDGE })).toBe(false);

    expect(session.getState().working).toBe(before);
    // Deletion's own channel, not the canvas announcement: the Edge survives its
    // refusal, so the controls that asked are still on screen.
    expect(edges.getState().refusal).toEqual({
      kind: 'deletion',
      refusal: { code: 'graph-not-owned' },
    });
  });

  /**
   * A refused Delete is about the Edge that was selected when it was made, and
   * the controls that carry it are drawn from the *current* selection.
   */
  it('drops a retained deletion refusal when the selection moves to another Edge', () => {
    const { edges, adapter } = open();
    edges.deleteEdge({ graphId: UNKNOWN_GRAPH, edge: EDGE });
    expect(edges.getState().refusal).not.toBeNull();

    adapter.getState().selectEdge({ graphId: GRAPH_ID, edge: { from: CARD_B, to: CARD_C } });

    expect(edges.getState().refusal).toBeNull();
  });
});

/**
 * Invalidation, and only invalidation. A draft is cancelled by what changes what
 * it is *about*; an unrelated completed Edit leaves it standing.
 */
describe('draft invalidation', () => {
  it('cancels the draft when the selected renderer changes', () => {
    const { edges, navigation } = open();
    edges.beginKeyboardConnect(CARD_A);

    navigation.selectRenderer({ kind: 'view', view: 'flow' });

    expect(edges.getState().draft).toBeNull();
  });

  it('cancels the draft when the Active Graph changes', () => {
    const { edges, navigation } = open();
    edges.openEdgeEditor(SUBJECT);

    navigation.activateGraph(OTHER_GRAPH_ID);

    expect(edges.getState().draft).toBeNull();
  });

  it('cancels the draft when the Edge it is about disappears', () => {
    const { edges, authoring } = open();
    edges.openEdgeEditor(SUBJECT);

    authoring.complete({ kind: 'deleted-edge', graphId: GRAPH_ID, edge: EDGE });

    expect(edges.getState().draft).toBeNull();
  });

  it('cancels the draft when a replacement Space is opened over it', async () => {
    const stored: SpaceSnapshot = {
      ...positionedSnapshot,
      document: { ...positionedSnapshot.document, title: 'Stored' },
    };
    const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([
      { snapshot: stored, revision: 1n, exportedRevision: null },
    ]);
    const session = openSpaceSession(backend, loaded);
    const { authoring, edgeAuthoring: edges } = composeApp({
      spaceSession: session,
      selection: { kind: 'layout', layoutId: LAYOUT_ID },
      newGraphId: mintingGraphIds(MINTED_GRAPH),
      initialPlacement: Placement.fromEntries([
        [CARD_A, { x: 10, y: 20 }],
        [CARD_B, { x: 300, y: 40 }],
        [CARD_C, { x: 600, y: 40 }],
      ]),
    });
    edges.openEdgeEditor(SUBJECT);
    // Force the conflict the accept resolves.
    authoring.complete({ kind: 'deleted-edge', graphId: GRAPH_ID, edge: EDGE });
    await vi.waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));

    expect(authoring.acceptStoredSpace()).toBeNull();

    expect(edges.getState().draft).toBeNull();
  });

  /**
   * Presenting withdraws Edge authoring, so a draft made before it cannot
   * survive into it. Left standing, the keyboard picker goes on rendering over
   * the presentation and can author an Edge the canvas is no longer offering —
   * and an Edge editor hidden behind it reopens when the author returns.
   */
  it('cancels the draft when presenting withdraws Edge authoring', () => {
    const { edges, navigation } = open();
    edges.beginKeyboardConnect(CARD_A);

    navigation.present();

    expect(navigation.getState().mode).toBe('presenting');
    expect(edges.getState().draft).toBeNull();
  });

  /**
   * A refusal names Cards and Graphs of the Space it was made against, so the
   * context that invalidates a draft invalidates the sentence too — and a
   * *pointer* refusal has no draft left to be cancelled with it. The handoff's
   * shared case 7 is the hard one: accepting the stored Space "cancels all
   * target-bound transients", and a sentence naming the replaced Space is one.
   */
  it.each([
    [
      'the Active Graph changes',
      ({ navigation }: ReturnType<typeof open>) => navigation.activateGraph(OTHER_GRAPH_ID),
    ],
    [
      'the renderer changes',
      ({ navigation }: ReturnType<typeof open>) =>
        navigation.selectRenderer({ kind: 'view', view: 'flow' }),
    ],
  ])('clears a refusal left by a finished gesture when %s', (_name, change) => {
    const opened = open();
    opened.edges.beginPointerConnect(CARD_A);
    opened.edges.connect(CARD_A, CARD_B, null);
    opened.edges.endPointerDrag();
    expect(opened.edges.getState().refusal).not.toBeNull();

    change(opened);

    expect(opened.edges.getState().refusal).toBeNull();
  });

  it('leaves the draft standing through an unrelated completed Edit', () => {
    const { edges, authoring } = open();
    edges.openEdgeEditor(SUBJECT);

    authoring.complete({ kind: 'renamed-graph', graphId: OTHER_GRAPH_ID, title: 'Renamed' });

    expect(edges.getState().draft).toEqual({
      kind: 'keyboard-reconnect',
      graphId: GRAPH_ID,
      edge: EDGE,
    });
  });

  it('cancels the draft when the canvas selects a different Edge', () => {
    const { edges, adapter } = open();
    edges.openEdgeEditor(SUBJECT);

    adapter.getState().selectEdge({ graphId: OTHER_GRAPH_ID, edge: EDGE });

    expect(edges.getState().draft).toBeNull();
  });

  /**
   * CONTEXT.md's **Selected Edge**: an Edge outside the Active Graph "cannot
   * remain selected". Activating another Graph is not an Edit and moves no Edge,
   * but the selection is what the Edge's own toolbar draws from — so leaving it
   * would keep Delete live on an Edge the canvas has stopped offering.
   */
  it('drops a selected Edge the Active Graph has left behind', () => {
    const { edges, adapter, navigation } = open();
    adapter.getState().selectEdge(SUBJECT);
    expect(edges.getState().draft).toBeNull();

    navigation.activateGraph(OTHER_GRAPH_ID);

    expect(adapter.getState().selection).toEqual({ kind: 'none' });
  });

  it('keeps a selected Edge whose Graph is still the Active one', () => {
    const { adapter, authoring } = open();
    adapter.getState().selectEdge(SUBJECT);

    authoring.complete({ kind: 'renamed-graph', graphId: OTHER_GRAPH_ID, title: 'Renamed' });

    expect(adapter.getState().selection).toEqual({
      kind: 'edge',
      graphId: GRAPH_ID,
      edge: EDGE,
    });
  });

  it('cancels a keyboard connection when the canvas selects another Card', () => {
    const { edges, adapter } = open();
    edges.beginKeyboardConnect(CARD_A);

    adapter.getState().selectCard(CARD_B);

    expect(edges.getState().draft).toBeNull();
  });

  /**
   * React Flow clears the Card selection as a connection drag begins, so a
   * pointer draft that treated `none` as "the author moved on" would end on its
   * own first frame.
   */
  it('survives the selection React Flow clears when a pointer drag begins', () => {
    const { edges, adapter } = open();
    adapter.getState().selectCard(CARD_A);
    edges.beginPointerConnect(CARD_A);

    adapter.getState().clearSelection();

    expect(edges.getState().draft).toEqual({ kind: 'pointer-connect', from: CARD_A });
  });
});

/**
 * The keyboard path settles differently from the pointer's, and owes one thing
 * the pointer does not: the picker holding focus unmounts with the draft, so a
 * completed connection has to say where focus goes.
 */
describe('completing a keyboard connection', () => {
  it('authors the Edge, settles the draft and asks for focus at the target', () => {
    const { edges, session } = open();
    edges.beginKeyboardConnect(CARD_B);

    expect(edges.completeKeyboardConnect(CARD_C, PROJECTED)).toBe(CARD_C);

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([
      EDGE,
      { from: CARD_B, to: CARD_C },
    ]);
    expect(edges.getState().draft).toBeNull();
    expect(edges.takeFocusRequest()).toEqual({ kind: 'card', cardId: CARD_C });
  });

  /**
   * The picker offered this target, so a refusal means the Space changed while
   * it was open — which is exactly why completion asks eligibility again. The
   * draft and its refusal stand so the author can pick another Card.
   */
  it('keeps the draft and its refusal when the completion is refused', () => {
    const { edges, session } = open();
    const before = session.getState().working;
    edges.beginKeyboardConnect(CARD_A);

    expect(edges.completeKeyboardConnect(CARD_B, PROJECTED)).toBeNull();

    expect(session.getState().working).toBe(before);
    expect(edges.getState().draft).toEqual({ kind: 'keyboard-connect', from: CARD_A });
    expect(edges.getState().refusal).toEqual({
      kind: 'connection',
      refusal: { code: 'edge-already-exists' },
    });
  });

  /**
   * The continuation a drag hands back is the **pointer** path's, and it is
   * drained only when a drag ends. A keyboard connection that left one behind
   * would be collected by the next pointer gesture — including one that authored
   * nothing — and select a Card that gesture never named.
   */
  it('leaves no continuation behind for the next pointer drag to collect', () => {
    const { edges } = open();
    edges.beginKeyboardConnect(CARD_B);
    expect(edges.completeKeyboardConnect(CARD_C, PROJECTED)).toBe(CARD_C);

    edges.beginPointerConnect(CARD_A);

    expect(edges.endPointerDrag()).toBeNull();
  });

  it('does nothing without an open keyboard draft', () => {
    const { edges, session } = open();
    const before = session.getState().working;

    expect(edges.completeKeyboardConnect(CARD_C, PROJECTED)).toBeNull();

    expect(session.getState().working).toBe(before);
  });
});

describe('completing a pointer connection', () => {
  it('authors the Edge and hands back the Card to continue at', () => {
    const { edges, session } = open();
    edges.beginPointerConnect(CARD_B);

    expect(edges.connect(CARD_B, CARD_C, PROJECTED)).toBe(CARD_C);

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([
      EDGE,
      { from: CARD_B, to: CARD_C },
    ]);
    expect(edges.endPointerDrag()).toBe(CARD_C);
  });

  it('reports the refusal and continues at nobody when Authoring declines', () => {
    const { edges, session } = open();
    const before = session.getState().working;
    edges.beginPointerConnect(CARD_A);

    expect(edges.connect(CARD_A, CARD_B, PROJECTED)).toBeNull();

    expect(session.getState().working).toBe(before);
    // The canvas announcement channel: this gesture's drag is over by the time
    // anything renders the refusal, so no surface of its own is left.
    expect(edges.getState().refusal).toEqual({
      kind: 'gesture',
      refusal: { code: 'edge-already-exists' },
    });
    expect(edges.endPointerDrag()).toBeNull();
  });

  /**
   * A refusal describes the proposal that produced it, so the next completed
   * connection is the end of it. Leaving it up would put a sentence about an
   * Edge that was declined beside one the Space has just gained.
   */
  it('clears a previous refusal when the next connection completes', () => {
    const { edges } = open();
    edges.beginPointerConnect(CARD_A);
    edges.connect(CARD_A, CARD_B, null);
    expect(edges.getState().refusal).not.toBeNull();

    expect(edges.connect(CARD_A, CARD_C, null)).toBe(CARD_C);

    expect(edges.getState().refusal).toBeNull();
  });

  it('ends the pointer draft with the drag, whatever it produced', () => {
    const { edges } = open();
    edges.beginPointerConnect(CARD_B);

    edges.endPointerDrag();

    expect(edges.getState().draft).toBeNull();
  });

  /**
   * A refusal normally retains its draft so the author can correct the proposal.
   * A finished drag is the exception, and it applies to both pointer drafts: the
   * gesture is over, there is no surface left to correct, and the sentence is the
   * whole of what the author is told — so the draft goes and the message stays.
   */
  it.each([
    [
      'a connection',
      (edges: ReturnType<typeof open>['edges']) => edges.beginPointerConnect(CARD_A),
    ],
    [
      'a reconnection',
      (edges: ReturnType<typeof open>['edges']) => edges.beginPointerReconnect(SUBJECT, 'to'),
    ],
  ])('keeps a refusal %s produced after the drag ends', (_name, begin) => {
    const { edges } = open();
    begin(edges);
    // Both refuse for a reason Space Authoring owns: A→B already exists in this
    // Graph, and this Card is not in this Layout.
    if (edges.getState().draft?.kind === 'pointer-connect') edges.connect(CARD_A, CARD_B, null);
    else edges.reconnect('to', uuidSchema.parse('00000000-0000-4000-8000-0000000000aa'));
    expect(edges.getState().refusal).not.toBeNull();

    edges.endPointerDrag();

    expect(edges.getState().draft).toBeNull();
    expect(edges.getState().refusal).not.toBeNull();
  });
});

/**
 * The empty-drop rule: five facts in, one Card or none out.
 *
 * A table rather than a browser test because nothing here touches the DOM — the
 * `over` classification is the DOM's answer *arriving*, and how each supplier
 * reaches it is the browser's business.
 */
describe('the Option/Alt empty drop', () => {
  const dragging = (over: DropTarget, modifierHeld: boolean): ConnectionGesture => ({
    kind: 'dragging',
    sourceId: CARD_A,
    point: { x: 400, y: 300 },
    over,
    modifierHeld,
  });

  it('authors a Card centred on the drop point', () => {
    expect(newCardDrop(dragging('empty-canvas', true), () => true)).toEqual({
      sourceId: CARD_A,
      position: { x: 400 - CARD_SIZE.width / 2, y: 300 - CARD_SIZE.height / 2 },
    });
  });

  it.each([
    ['an idle gesture', { kind: 'idle' } satisfies ConnectionGesture, true],
    ['a connection target in range', dragging('connection-target', true), true],
    ['a release over a Card', dragging('card', true), true],
    ['a release off the canvas', dragging('off-canvas', true), true],
    ['the modifier not held', dragging('empty-canvas', false), true],
    ['a source Authoring refuses', dragging('empty-canvas', true), false],
  ])('authors nothing for %s', (_name, gesture, accepts) => {
    expect(newCardDrop(gesture, () => accepts)).toBeNull();
  });

  it('never authors a Card unless every fact agrees', () => {
    const anyTarget = fc.constantFrom<DropTarget>(
      'connection-target',
      'card',
      'empty-canvas',
      'off-canvas',
    );
    fc.assert(
      fc.property(
        anyTarget,
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: -5000, max: 5000 }),
        fc.integer({ min: -5000, max: 5000 }),
        (over, modifierHeld, accepts, x, y) => {
          const drop = newCardDrop(
            { kind: 'dragging', sourceId: CARD_A, point: { x, y }, over, modifierHeld },
            () => accepts,
          );
          if (over !== 'empty-canvas' || !modifierHeld || !accepts) {
            expect(drop).toBeNull();
            return;
          }
          // The preview draws from this same answer, so the ghost and the
          // authored Card cannot land in different places.
          expect(drop).toEqual({
            sourceId: CARD_A,
            position: { x: x - CARD_SIZE.width / 2, y: y - CARD_SIZE.height / 2 },
          });
        },
      ),
    );
  });
});
