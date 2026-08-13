import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { Position, ReactFlowProvider, type Edge } from '@xyflow/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { inHandleId, loadSpaceSnapshot, outHandleId, Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { createNavigation } from '../src/navigation';
import { createRenderAdapter, edgeSelectionOf } from '../src/render-adapter';
import { createConnectionCompletion } from '../src/connection-completion';
import { createEdgeAuthoring } from '../src/edge-authoring';
import { useEdgeAuthoring } from '../src/edge-authoring-react';
import { createSpaceAuthoring } from '../src/space-authoring';
import { createRendererResolver } from '../src/renderer';
import { SpaceCanvas } from '../src/components/SpaceCanvas';
import { EdgeAuthoringContext } from '../src/components/edge-authoring-context';
import { CARD_SIZE } from '../src/card';

/**
 * Edge Authoring's React interface: what it hands React Flow, and the controls
 * an author reaches through it.
 *
 * The state machine is `edge-authoring.test.ts`'s and the Graph rules are Space
 * Authoring's. What is left here is the translation — decorated Edges, stable
 * callbacks, and the toolbar and pickers that drive the module.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');

const EDGE = { from: CARD_A, to: CARD_B } as const;
/** The Graph and Edge an Edge operation is named by, which travel together. */
const SUBJECT = { graphId: GRAPH_ID, edge: EDGE } as const;
const ASIDE_EDGE = { from: CARD_B, to: CARD_C } as const;

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
          [CARD_A]: { x: 0, y: 0 },
          [CARD_B]: { x: 400, y: 0 },
          [CARD_C]: { x: 800, y: 0 },
        },
        graphs: [
          { id: GRAPH_ID, title: 'Main', edges: [EDGE] },
          { id: OTHER_GRAPH_ID, title: 'Aside', edges: [ASIDE_EDGE] },
        ],
      },
    ],
    defaultView: LAYOUT_ID,
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
    { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
  ],
};

/**
 * Nodes carrying declared handles, which is how this repo gives React Flow
 * handle geometry (AGENTS.md): `parseHandles` prefers a declaration to the DOM,
 * and jsdom measures nothing, so without these no Edge resolves a position and
 * none is drawn at all.
 */
function cardNode(id: string, x: number, title: string): CardFlowNode {
  const anchors = [GRAPH_ID, OTHER_GRAPH_ID].flatMap((graphId) => [
    {
      id: inHandleId(graphId),
      type: 'target' as const,
      position: Position.Left,
      x: 0,
      y: CARD_SIZE.height / 2,
      width: 6,
      height: 6,
    },
    {
      id: outHandleId(graphId),
      type: 'source' as const,
      position: Position.Right,
      x: CARD_SIZE.width,
      y: CARD_SIZE.height / 2,
      width: 6,
      height: 6,
    },
  ]);
  return {
    id,
    type: 'card',
    position: { x, y: 0 },
    width: CARD_SIZE.width,
    height: CARD_SIZE.height,
    handles: anchors,
    data: {
      cardId: uuidSchema.parse(id),
      title,
      kind: 'markdown',
      active: false,
      selectedForAuthoring: false,
      showContent: false,
      activeGraphId: GRAPH_ID,
      activeGraphColor: '#8a94a6',
      emphasis: 'equal',
      sourceHandles: [],
      targetHandles: [],
    },
  };
}

const NODES = [cardNode(CARD_A, 0, 'A'), cardNode(CARD_B, 400, 'B'), cardNode(CARD_C, 800, 'C')];

const flowEdge = (id: string, graphId: string, from: string, to: string): Edge => ({
  id,
  type: 'routed',
  source: from,
  target: to,
  sourceHandle: outHandleId(uuidSchema.parse(graphId)),
  targetHandle: inHandleId(uuidSchema.parse(graphId)),
  data: { graphId },
});

const EDGES = [
  flowEdge(`${GRAPH_ID}::0`, GRAPH_ID, CARD_A, CARD_B),
  flowEdge(`${OTHER_GRAPH_ID}::0`, OTHER_GRAPH_ID, CARD_B, CARD_C),
];

function compose() {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
  const currentSpace = () => {
    const result = loadSpaceSnapshot(session.getState().working);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
    return result.space;
  };
  const resolveRenderer = createRendererResolver({
    newGraphId: () => uuidSchema.parse('00000000-0000-4000-8000-0000000000ff'),
  });
  const selection = { kind: 'layout', layoutId: LAYOUT_ID } as const;
  const navigation = createNavigation(currentSpace, resolveRenderer, selection);
  const authoring = createSpaceAuthoring({
    session,
    navigation,
    currentSpace,
    resolveRenderer,
    initialPlacement: Placement.fromEntries([
      [CARD_A, { x: 0, y: 0 }],
      [CARD_B, { x: 400, y: 0 }],
      [CARD_C, { x: 800, y: 0 }],
    ]),
  });
  const adapter = createRenderAdapter(authoring);
  const edgeAuthoring = createEdgeAuthoring({
    authoring,
    adapter,
    connections: createConnectionCompletion({ adapter, authoring }),
  });
  adapter.getState().syncProjection(NODES, EDGES);
  return { session, navigation, authoring, adapter, edgeAuthoring, currentSpace };
}

const graphsOf = (working: SpaceSnapshot) =>
  (working.document.layouts ?? []).flatMap((layout) => layout.graphs);

/** One identity, so the memo under test is not defeated by the test's own input. */
const NO_OP = () => undefined;

/** A release that resolved no handle — React Flow's shape for "dropped nowhere". */
const FINISHED_CONNECTION = {
  pointer: null,
  isValid: null,
  from: null,
  fromHandle: null,
  fromPosition: null,
  fromNode: null,
  to: null,
  toHandle: null,
  toPosition: null,
  toNode: null,
} as const;

beforeAll(() => {
  // jsdom implements no hit-testing, and the reconnect release asks for one.
  // Answering `null` is what a release over nothing really produces, which
  // `dropTargetOf` reads as off-canvas — so these tests exercise the cancelling
  // path rather than the deleting one.
  document.elementFromPoint = () => null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

afterAll(() => vi.unstubAllGlobals());

function mountCanvas() {
  const composed = compose();
  const view = render(
    <ReactFlowProvider>
      <CanvasHarness {...composed} />
    </ReactFlowProvider>,
  );
  return { ...composed, view };
}

/** The composition `App` performs, narrowed to what an Edge test needs. */
function CanvasHarness({
  adapter,
  edgeAuthoring,
  currentSpace,
}: Pick<ReturnType<typeof compose>, 'adapter' | 'edgeAuthoring' | 'currentSpace'>) {
  const projection = adapter((state) => state.projection);
  const selection = adapter((state) => state.selection);
  return (
    <SpaceCanvas
      nodes={projection?.nodes ?? []}
      edges={projection?.edges ?? []}
      projectedNodes={null}
      activeCardId={null}
      presenting={false}
      editable={true}
      titleEditingEnabled={true}
      onNodesChange={adapter.getState().changeNodes}
      onEdgesChange={adapter.getState().changeEdges}
      edgeAuthoring={edgeAuthoring}
      selection={selection}
      onSelectCard={adapter.getState().selectCard}
      onSelectEdge={adapter.getState().selectEdge}
      subjectCards={currentSpace().cards}
      newCardTitle="Card 4"
      onAddCard={() => undefined}
      nameOnCreation={null}
      onOpenCard={() => undefined}
      onCompleteCardTitle={() => null}
      editableCardIds={new Set([CARD_A, CARD_B, CARD_C])}
      graphs={currentSpace().graphs}
      colorByGraphId={{}}
      activeGraphId={GRAPH_ID}
      activeGraphCardIds={new Set([CARD_A, CARD_B])}
    />
  );
}

const edgeElement = (id: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`.react-flow__edge[data-id="${id}"]`);
  if (element === null) throw new Error(`No Edge is drawn for ${id}.`);
  return element;
};

/**
 * Only the Active Graph's Edges are tab stops. An Edge belonging to another
 * Graph the Layout draws is there to be seen; putting it in the tab order would
 * place inert stops between a keyboard author and the Edges they can act on.
 */
describe('decorated Edges', () => {
  it('makes only the Active Graph Edge focusable and names it for a screen reader', () => {
    mountCanvas();

    const active = edgeElement(`${GRAPH_ID}::0`);
    expect(active).toHaveAttribute('tabindex', '0');
    expect(active).toHaveAttribute('aria-label', 'Edge from A to B in Main');

    expect(edgeElement(`${OTHER_GRAPH_ID}::0`)).not.toHaveAttribute('tabindex');
  });

  it('installs a focused Edge as the canvas selection', () => {
    const { adapter } = mountCanvas();

    fireEvent.focus(edgeElement(`${GRAPH_ID}::0`));

    expect(adapter.getState().selection).toEqual({
      kind: 'edge',
      graphId: GRAPH_ID,
      edge: EDGE,
    });
  });

  it('does not select an Edge outside the Active Graph when it receives focus', () => {
    const { adapter } = mountCanvas();

    fireEvent.focus(edgeElement(`${OTHER_GRAPH_ID}::0`));

    expect(adapter.getState().selection).toEqual({ kind: 'none' });
  });
});

describe('the Edge toolbar', () => {
  it('appears only on the selected Edge', () => {
    const { adapter } = mountCanvas();
    expect(screen.queryByRole('button', { name: 'Delete this Edge' })).not.toBeInTheDocument();

    act(() => adapter.getState().selectEdge(SUBJECT));

    expect(screen.getByRole('button', { name: 'Delete this Edge' })).toBeVisible();
  });

  it('deletes the Edge from its Graph and leaves the Graph standing', () => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.click(screen.getByRole('button', { name: 'Delete this Edge' }));

    expect(graphsOf(session.getState().working)).toEqual([
      { id: GRAPH_ID, title: 'Main', edges: [] },
      { id: OTHER_GRAPH_ID, title: 'Aside', edges: [ASIDE_EDGE] },
    ]);
  });

  it('opens the endpoint editor from its own button', () => {
    const { adapter, edgeAuthoring } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.click(screen.getByRole('button', { name: 'Edit this Edge' }));

    expect(edgeAuthoring.getState().draft).toEqual({
      kind: 'keyboard-reconnect',
      graphId: GRAPH_ID,
      edge: EDGE,
    });
    expect(screen.getByRole('combobox', { name: 'From' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'To' })).toBeVisible();
  });

  /**
   * The picker's disabled rows are eligibility's answer, so they say whether the
   * right *question* was asked.
   *
   * `Main` holds A→B, so every Card of this Layout is a legal `to` for it: B is
   * unchanged, C is a new Edge, and A is a self-Edge, which is valid authored
   * structure (ADR 0032). The subject handed in is an `EdgeSelection`, which is
   * what the callbacks really hold and which carries a `kind` of its own —
   * spread into the proposal it silently asks a *connect* question instead, and
   * every row comes back disabled while two pickers still render.
   */
  it('asks eligibility the reconnect question, whatever shape the subject arrives in', () => {
    const composed = compose();
    // Read through the same context an authorable Edge reads, so what is
    // asserted is the value the Edge really gets rather than a copy of it.
    function Provider({ children }: { children: ReactNode }) {
      const surface = useEdgeAuthoring({
        authoring: composed.edgeAuthoring,
        edges: EDGES,
        projectedNodes: null,
        selection: { kind: 'edge', ...SUBJECT },
        activeGraphId: GRAPH_ID,
        graphs: composed.currentSpace().graphs,
        subjectCards: composed.currentSpace().cards,
        newCardTitle: 'Card 4',
        enabled: true,
        onSelectCard: NO_OP,
        onSelectEdge: NO_OP,
      });
      return <>{surface.provide(children)}</>;
    }
    const { result } = renderHook(() => useContext(EdgeAuthoringContext), {
      wrapper: ({ children }) => (
        <ReactFlowProvider>
          <Provider>{children}</Provider>
        </ReactFlowProvider>
      ),
    });

    const subject = edgeSelectionOf(EDGES[0]!);
    const choices = result.current!.endpointChoices(subject!, 'to');

    expect(choices.map((choice) => ({ title: choice.title, refusal: choice.refusal }))).toEqual([
      { title: 'A', refusal: undefined },
      { title: 'B', refusal: undefined },
      { title: 'C', refusal: undefined },
    ]);
  });
});

/**
 * React Flow drives a reconnect drag through the *connection* callbacks as well
 * as the reconnect ones, in an order these tests pin because nothing else can.
 *
 * `EdgeUpdateAnchors` calls `onReconnectStart` and then the store's
 * `onConnectStart`; on release it calls the store's `onConnectEnd` before
 * `onReconnectEnd`. A reconnect drag therefore arrives as a *connection* from
 * the endpoint that stays put, and the module has to stand its connection
 * handlers down for the duration or it eats its own gesture.
 */
describe("React Flow's reconnect callback order", () => {
  const surface = (composed: ReturnType<typeof compose>) =>
    renderHook(
      () =>
        useEdgeAuthoring({
          authoring: composed.edgeAuthoring,
          edges: EDGES,
          projectedNodes: null,
          selection: { kind: 'edge', ...SUBJECT },
          activeGraphId: GRAPH_ID,
          graphs: composed.currentSpace().graphs,
          subjectCards: composed.currentSpace().cards,
          newCardTitle: 'Card 4',
          enabled: true,
          onSelectCard: NO_OP,
          onSelectEdge: NO_OP,
        }),
      { wrapper: ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider> },
    );

  const startDrag = (props: ReturnType<typeof surface>['result']['current'], edge: Edge) => {
    // The order React Flow uses, verbatim.
    props.reactFlowProps.onReconnectStart(null, edge, 'target');
    props.reactFlowProps.onConnectStart(new MouseEvent('mousedown'), {
      nodeId: CARD_B,
      handleId: null,
      handleType: 'target',
    });
  };

  it('keeps the reconnect draft when the connection callback follows it', () => {
    const composed = compose();
    const { result } = surface(composed);

    act(() => startDrag(result.current, EDGES[0]!));

    expect(composed.edgeAuthoring.getState().draft).toEqual({
      kind: 'pointer-reconnect',
      ...SUBJECT,
      endpoint: 'from',
    });
  });

  /**
   * **React Flow consults the one global validator during a reconnect too**, so
   * it has to be asked the reconnect question or the anchor reads invalid for
   * the whole drag.
   *
   * Dropping either end of A→B back on its own Card is the case that exposes
   * it: as a *connect* proposal that is the duplicate rule, and as a *reconnect*
   * proposal it is the endpoint returning to where it came from, which
   * `reconnectOutcome` answers `unchanged` before it ever reaches the duplicate
   * check. Eligibility already treats it as offerable; the validator was the one
   * place still saying otherwise.
   */
  const connectionTo = (source: string, target: string) => ({
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
  });

  it.each([
    ['the target anchor', 'target' as const],
    ['the source anchor', 'source' as const],
  ])('accepts an endpoint dropped back where it came from, from %s', (_name, handleType) => {
    const composed = compose();
    const { result } = surface(composed);
    act(() => {
      result.current.reactFlowProps.onReconnectStart(null, EDGES[0]!, handleType);
      result.current.reactFlowProps.onConnectStart(new MouseEvent('mousedown'), {
        nodeId: CARD_B,
        handleId: null,
        handleType: 'target',
      });
    });

    expect(result.current.reactFlowProps.isValidConnection(connectionTo(CARD_A, CARD_B))).toBe(
      true,
    );
  });

  /**
   * A result that really would duplicate another Edge is still refused — the
   * half of the rule the reconnect proposal must not lose.
   *
   * It needs a Graph holding *two* Edges to be reachable at all: with one, every
   * drop is either the unchanged case or a new pair. So Main gains A→C through
   * the ordinary connect path first, and moving A→B's `to` onto C is then the
   * duplicate.
   */
  it('refuses a reconnection that would duplicate another Edge in the Graph', () => {
    const composed = compose();
    act(() => {
      composed.edgeAuthoring.beginPointerConnect(CARD_A);
      composed.edgeAuthoring.connect(CARD_A, CARD_C, null);
      composed.edgeAuthoring.endPointerDrag();
    });
    expect(graphsOf(composed.session.getState().working)[0]?.edges).toEqual([
      EDGE,
      { from: CARD_A, to: CARD_C },
    ]);

    const { result } = surface(composed);
    act(() => result.current.reactFlowProps.onReconnectStart(null, EDGES[0]!, 'target'));

    expect(result.current.reactFlowProps.isValidConnection(connectionTo(CARD_A, CARD_C))).toBe(
      false,
    );
    // And the endpoint's own Card is still offered, so the refusal is the
    // duplicate rule rather than the reconnect branch refusing everything.
    expect(result.current.reactFlowProps.isValidConnection(connectionTo(CARD_A, CARD_B))).toBe(
      true,
    );
  });

  /** With no reconnect draft open, the ordinary connect rule still answers. */
  it('asks the connect rule when no reconnect drag is in flight', () => {
    const composed = compose();
    const { result } = surface(composed);

    // A→B already exists in Main, so as a plain connection it is a duplicate.
    expect(result.current.reactFlowProps.isValidConnection(connectionTo(CARD_A, CARD_B))).toBe(
      false,
    );
    expect(result.current.reactFlowProps.isValidConnection(connectionTo(CARD_B, CARD_C))).toBe(
      true,
    );
  });

  it('completes the reconnection rather than silently authoring nothing', () => {
    const composed = compose();
    const { result } = surface(composed);
    act(() => startDrag(result.current, EDGES[0]!));

    act(() => {
      result.current.reactFlowProps.onReconnect(EDGES[0]!, {
        source: CARD_A,
        target: CARD_C,
        sourceHandle: null,
        targetHandle: null,
      });
    });

    expect(graphsOf(composed.session.getState().working)[0]?.edges).toEqual([
      { from: CARD_A, to: CARD_C },
    ]);
  });

  /**
   * `handleType` names the endpoint that **stays**: taking hold of the source
   * anchor reports `'target'`, because the target is where the drag is now
   * anchored. Read straight off, it names the wrong end — and the draft's
   * endpoint is what a cancelled drag returns focus to.
   */
  it.each([
    ['the source anchor', 'target' as const, 'from' as const],
    ['the target anchor', 'source' as const, 'to' as const],
  ])('records %s as moving the end the author took hold of', (_name, handleType, endpoint) => {
    const composed = compose();
    const { result } = surface(composed);

    act(() => result.current.reactFlowProps.onReconnectStart(null, EDGES[0]!, handleType));

    expect(composed.edgeAuthoring.getState().draft).toEqual({
      kind: 'pointer-reconnect',
      ...SUBJECT,
      endpoint,
    });
  });

  /**
   * **Standing the connection handlers down is for the drag, not for the
   * session.** They are the same handlers an ordinary connection uses, so a flag
   * left raised silently disables every later pointer connection and the Alt
   * empty-drop for the life of the canvas — and `onConnect` is unguarded, so a
   * plain Card-to-Card drag still authors and hides it.
   */
  it('takes its connection handlers back once the reconnect drag ends', () => {
    const composed = compose();
    const { result } = surface(composed);
    act(() => startDrag(result.current, EDGES[0]!));

    act(() => {
      result.current.reactFlowProps.onReconnectEnd(
        new MouseEvent('mouseup'),
        EDGES[0]!,
        'target',
        FINISHED_CONNECTION,
      );
      result.current.reactFlowProps.onConnectStart(new MouseEvent('mousedown'), {
        nodeId: CARD_C,
        handleId: null,
        handleType: 'source',
      });
    });

    expect(composed.edgeAuthoring.getState().draft).toEqual({
      kind: 'pointer-connect',
      from: CARD_C,
    });
  });

  /**
   * The connection release arrives first and must author nothing: with Alt held
   * it would otherwise create a Card and an Edge from the anchored end, and then
   * `onReconnectEnd` would delete the Edge — one gesture, two Edits.
   */
  it('authors no Card when an Alt-held reconnect release reaches the connection callback', () => {
    const composed = compose();
    const { result } = surface(composed);
    const before = composed.session.getState().working;
    act(() => startDrag(result.current, EDGES[0]!));

    act(() => {
      result.current.reactFlowProps.onConnectEnd(
        new MouseEvent('mouseup', { altKey: true, clientX: 10, clientY: 10 }),
        FINISHED_CONNECTION,
      );
    });

    expect(composed.session.getState().working).toBe(before);
  });
});

/**
 * A focus request for an Edge has to outlive the render that made it.
 *
 * The request is published synchronously with the Edit, but the projection
 * carrying the reconnected Edge arrives a strategy later — so resolving it
 * against the projection on screen at that moment finds nothing and falls back
 * to the canvas, landing focus anywhere but the "Edited Edge" the matrix names.
 */
describe('focusing an Edge a completed Edit has just produced', () => {
  const RECONNECTED = { graphId: GRAPH_ID, edge: { from: CARD_A, to: CARD_C } } as const;
  const reconnectedFlowEdge = flowEdge(`${GRAPH_ID}::0`, GRAPH_ID, CARD_A, CARD_C);

  it('waits for the projection that draws it rather than falling back to the canvas', () => {
    // The real canvas, because resolving the request is a DOM lookup: the
    // element only exists once React Flow has drawn the Edge.
    const { edgeAuthoring, adapter } = mountCanvas();
    document.body.focus();

    act(() => {
      edgeAuthoring.openEdgeEditor(SUBJECT);
      edgeAuthoring.reconnect('to', CARD_C);
    });

    // The Edit has completed, but the projection still holds the Edge as it
    // was — so the request is still owed rather than spent on the canvas.
    expect(edgeAuthoring.getState().focusRequest).toEqual({ kind: 'edge', ...RECONNECTED });

    act(() => adapter.getState().syncProjection(NODES, [reconnectedFlowEdge, EDGES[1]!]));

    expect(edgeAuthoring.getState().focusRequest).toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector(`.react-flow__edge[data-id="${GRAPH_ID}::0"]`),
    );
  });

  /** A Card or the canvas resolves immediately, so neither is ever left owed. */
  it('spends a Card request on the render that receives it', () => {
    const { edgeAuthoring } = mountCanvas();

    act(() => {
      edgeAuthoring.deleteEdge(SUBJECT);
    });

    expect(edgeAuthoring.getState().focusRequest).toBeNull();
  });
});

/**
 * Withdrawing Edge authoring withdraws its surfaces in the same render.
 *
 * The module cancels an open draft when presenting begins, but that arrives on
 * a notification and the layer renders before it — so a picker read off the
 * draft alone stays usable over a presentation that has already started. Both
 * halves are needed: this one closes the window, and the module's cancellation
 * is what stops the draft reopening afterwards.
 */
describe('withdrawing Edge authoring', () => {
  const withEnabled = (composed: ReturnType<typeof compose>, enabled: boolean) =>
    renderHook(
      () =>
        useEdgeAuthoring({
          authoring: composed.edgeAuthoring,
          edges: EDGES,
          projectedNodes: null,
          selection: { kind: 'none' },
          activeGraphId: GRAPH_ID,
          graphs: composed.currentSpace().graphs,
          subjectCards: composed.currentSpace().cards,
          newCardTitle: 'Card 4',
          enabled,
          onSelectCard: NO_OP,
          onSelectEdge: NO_OP,
        }),
      { wrapper: ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider> },
    );

  it('draws no keyboard target picker while authoring is withdrawn', () => {
    const composed = compose();
    act(() => composed.edgeAuthoring.beginKeyboardConnect(CARD_A));

    const { result } = withEnabled(composed, false);
    render(<ReactFlowProvider>{result.current.layer}</ReactFlowProvider>);

    expect(screen.queryByTestId('connect-target-picker')).not.toBeInTheDocument();
  });

  it('draws it again once authoring returns', () => {
    const composed = compose();
    act(() => composed.edgeAuthoring.beginKeyboardConnect(CARD_A));

    const { result } = withEnabled(composed, true);
    render(<ReactFlowProvider>{result.current.layer}</ReactFlowProvider>);

    expect(screen.getByTestId('connect-target-picker')).toBeVisible();
  });
});

/**
 * Escape cancels exactly one topmost surface, and the picker's open list is a
 * surface above the connection draft.
 *
 * **A portal is not an escape from the React tree.** Radix renders the list
 * through `createPortal`, so nothing in the DOM puts it inside the picker — but
 * React dispatches synthetic events along the *fiber* tree, so a keydown in the
 * portalled content still reaches the container's `onKeyDown`. Radix's own
 * Escape handling calls `preventDefault` and never `stopPropagation`, so without
 * the `data-state` guard one press would close the list and cancel the
 * connection together, and an author who opened the list to look would have no
 * way back out that kept the gesture.
 *
 * The two layers are told apart by the trigger's `data-state` alone, and this is
 * what holds that fact to the primitive underneath it: the guard was written
 * against a Radix `Select` and the picker is now shadcn's Combobox — a Popover
 * over cmdk. Both stamp `data-state` because both triggers are Radix triggers,
 * which was an argument in a comment until this ran it.
 *
 * **This is the only test of the rule itself, and Chromium reaches the same two
 * stages without it.** Measured against the fixture: Radix closes from a
 * document capture listener, and the microtask checkpoint the browser performs
 * *between* listeners commits that close before React's delegated listener runs
 * — by which time the cmdk input is detached and React has already stripped its
 * fiber, so nothing dispatches and the handler is never asked. jsdom has no such
 * checkpoint, dispatching a whole event in one JS frame, which is what puts the
 * press in front of the guard here. So the browser's two stages are the e2e's to
 * pin (`editing.spec.ts`), and this is what will matter the next time the
 * primitive moves to one that answers Escape from React rather than from the
 * document.
 */
describe('Escape in the keyboard target picker', () => {
  it('closes the open list first and cancels the connection only on the press after', () => {
    const { edgeAuthoring, session } = mountCanvas();
    const before = session.getState().working;
    act(() => edgeAuthoring.beginKeyboardConnect(CARD_A));
    const trigger = screen.getByRole('combobox', { name: 'Connect to' });

    fireEvent.click(trigger);
    expect(screen.getByRole('combobox', { name: 'Search' })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search' }), { key: 'Escape' });

    // The list has gone and the gesture has not.
    expect(screen.queryByRole('combobox', { name: 'Search' })).not.toBeInTheDocument();
    expect(screen.getByTestId('connect-target-picker')).toBeVisible();
    expect(edgeAuthoring.getState().draft).toEqual({ kind: 'keyboard-connect', from: CARD_A });

    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.queryByTestId('connect-target-picker')).not.toBeInTheDocument();
    expect(edgeAuthoring.getState().draft).toBeNull();
    // Cancelling authors nothing: the same working snapshot, not an equal one.
    expect(session.getState().working).toBe(before);
  });
});

/**
 * Every refusal reaches a surface, including the one with no draft left.
 *
 * A refusal is retained beside the draft that ran into it, and a keyboard draft
 * has a surface of its own to show it in context. A **pointer** gesture has
 * neither by the time the refusal exists — the drag is over and its draft is
 * gone — so without a canvas-level alert the sentence is stored and shown
 * nowhere. It is rare by design, because eligibility refuses most of these
 * during the drag through `isValidConnection`, but "rare" is not "announced".
 */
describe('announcing a refusal', () => {
  it('shows the reason a finished pointer gesture ran into', () => {
    const { edgeAuthoring } = mountCanvas();
    expect(screen.queryByTestId('edge-gesture-refusal')).not.toBeInTheDocument();

    // A→B already exists in Main, so this is the duplicate rule — reached
    // directly, as a completion whose drag has already ended.
    act(() => {
      edgeAuthoring.beginPointerConnect(CARD_A);
      edgeAuthoring.connect(CARD_A, CARD_B, null);
      edgeAuthoring.endPointerDrag();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'These Cards are already connected in this Graph.',
    );
  });

  it('says nothing while a keyboard draft has a surface of its own', () => {
    const { edgeAuthoring } = mountCanvas();

    act(() => edgeAuthoring.beginKeyboardConnect(CARD_A));
    act(() => {
      edgeAuthoring.completeKeyboardConnect(CARD_B, null);
    });

    // The picker shows it inline; a second copy over the canvas would say the
    // same thing twice, in a place the author is not looking.
    expect(screen.getByTestId('connect-refusal')).toBeVisible();
    expect(screen.queryByTestId('edge-gesture-refusal')).not.toBeInTheDocument();
  });
});

/**
 * The Edge Authoring properties are read by React Flow, whose own docs warn that
 * handler identities recreated each render can drive it into a re-render loop.
 */
describe('the React Flow properties', () => {
  it('keeps one identity across renders that change only the projection', () => {
    const composed = compose();
    const { result, rerender } = renderHook(
      ({ edges }) =>
        useEdgeAuthoring({
          authoring: composed.edgeAuthoring,
          edges,
          projectedNodes: null,
          selection: { kind: 'none' },
          activeGraphId: GRAPH_ID,
          graphs: composed.currentSpace().graphs,
          subjectCards: composed.currentSpace().cards,
          newCardTitle: 'Card 4',
          enabled: true,
          onSelectCard: NO_OP,
          onSelectEdge: NO_OP,
        }),
      {
        initialProps: { edges: EDGES },
        wrapper: ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider>,
      },
    );
    const first = result.current.reactFlowProps;

    rerender({ edges: [...EDGES] });

    expect(result.current.reactFlowProps).toBe(first);
  });

  it('configures the deletion, reconnection and single-selection policy', () => {
    const composed = compose();
    const { result } = renderHook(
      () =>
        useEdgeAuthoring({
          authoring: composed.edgeAuthoring,
          edges: EDGES,
          projectedNodes: null,
          selection: { kind: 'none' },
          activeGraphId: GRAPH_ID,
          graphs: composed.currentSpace().graphs,
          subjectCards: composed.currentSpace().cards,
          newCardTitle: 'Card 4',
          enabled: true,
          onSelectCard: NO_OP,
          onSelectEdge: NO_OP,
        }),
      { wrapper: ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider> },
    );

    expect(result.current.reactFlowProps).toMatchObject({
      // React Flow defaults to Backspace alone.
      deleteKeyCode: ['Backspace', 'Delete'],
      // Reconnection and focusability are per-Edge, narrowed to the Active
      // Graph — and, for reconnection, to the selected Edge.
      edgesReconnectable: false,
      edgesFocusable: false,
      // Version 1 authors one element at a time.
      multiSelectionKeyCode: null,
      selectionKeyCode: null,
      selectionOnDrag: false,
    });
  });

  it('offers reconnection on the selected Active Graph Edge alone', () => {
    const composed = compose();
    const { result } = renderHook(
      () =>
        useEdgeAuthoring({
          authoring: composed.edgeAuthoring,
          edges: EDGES,
          projectedNodes: null,
          selection: { kind: 'edge', graphId: GRAPH_ID, edge: EDGE },
          activeGraphId: GRAPH_ID,
          graphs: composed.currentSpace().graphs,
          subjectCards: composed.currentSpace().cards,
          newCardTitle: 'Card 4',
          enabled: true,
          onSelectCard: NO_OP,
          onSelectEdge: NO_OP,
        }),
      { wrapper: ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider> },
    );

    expect(
      result.current.edges.map((edge) => ({
        id: edge.id,
        selected: edge.selected,
        focusable: edge.focusable,
        reconnectable: edge.reconnectable,
      })),
    ).toEqual([
      { id: `${GRAPH_ID}::0`, selected: true, focusable: true, reconnectable: true },
      { id: `${OTHER_GRAPH_ID}::0`, selected: false, focusable: false, reconnectable: false },
    ]);
  });

  it('withdraws every Edge control while presenting', () => {
    const composed = compose();
    const { result } = renderHook(
      () =>
        useEdgeAuthoring({
          authoring: composed.edgeAuthoring,
          edges: EDGES,
          projectedNodes: null,
          selection: { kind: 'none' },
          activeGraphId: GRAPH_ID,
          graphs: composed.currentSpace().graphs,
          subjectCards: composed.currentSpace().cards,
          newCardTitle: 'Card 4',
          enabled: false,
          onSelectCard: NO_OP,
          onSelectEdge: NO_OP,
        }),
      { wrapper: ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider> },
    );

    expect(result.current.edges.every((edge) => edge.focusable === false)).toBe(true);
    expect(result.current.edges.every((edge) => edge.deletable === false)).toBe(true);
  });
});
