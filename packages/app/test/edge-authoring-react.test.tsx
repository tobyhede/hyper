import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { Position, ReactFlowProvider, type Edge } from '@xyflow/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { inHandleId, loadSpaceSnapshot, outHandleId, Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { AddCardControl, PersistenceIndicator, SidebarProvider } from '@project/ui';
import type { CanvasRenderer } from '../src/canvas-renderers';
import { createNavigation } from '../src/navigation';
import { createRenderAdapter, edgeSelectionOf } from '../src/render-adapter';
import {
  createConnectionCompletion,
  type ConnectionCompletion,
} from '../src/connection-completion';
import { createEdgeAuthoring } from '../src/edge-authoring';
import { useEdgeAuthoring } from '../src/edge-authoring-react';
import { createSpaceAuthoring } from '../src/space-authoring';
import { createRendererResolver } from '../src/renderer';
import { SpaceCanvas } from '../src/components/SpaceCanvas';
import { EdgeAuthoringContext } from '../src/components/edge-authoring-context';
import { WorkspaceSidebar } from '../src/components/WorkspaceSidebar';
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
/** The one row this chrome draws, named so `selected` can be that very value. */
const FLOW: CanvasRenderer = { selection: { kind: 'view', view: 'flow' }, title: 'Flow' };
/** The real workspace chrome, composed as `App` composes it, outside the canvas. */
const workspaceChrome = (
  <SidebarProvider>
    <WorkspaceSidebar
      workspaceTitle="Space"
      canvas={{
        renderers: { computed: [FLOW], authored: [] },
        current: FLOW,
        onSelect: () => undefined,
      }}
      graph={{
        graphs: [],
        colorByGraphId: {},
        activeGraphId: null,
        onActivate: () => undefined,
        onPresent: () => undefined,
        onExitPresenting: () => undefined,
      }}
      addCard={{ onAddCard: () => undefined, onAddAlias: () => undefined }}
      persistence={{
        control: <PersistenceIndicator state="settled" />,
        state: 'settled',
        acknowledgedRevision: 0n,
      }}
    />
  </SidebarProvider>
);
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
    defaultRenderer: LAYOUT_ID,
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
    { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
  ],
};

/**
 * Nodes carrying declared handles, which is how this repo gives React Flow
 * handle geometry (docs/agents/rendering.md): `parseHandles` prefers a declaration to the DOM,
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

/**
 * The composition every canvas test runs on.
 *
 * `connections` is overridable because `ConnectionCompletion` is a declared
 * dependency of `createEdgeAuthoring`, and one refusal channel is reachable
 * only through it: a code about the *subject* rather than the choice needs a
 * Layout whose Active Graph has left it, which no gesture over this Space's one
 * Layout can produce. Everything else composes the real collaborator.
 */
function compose({ connections }: { connections?: ConnectionCompletion | undefined } = {}) {
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
    connections: connections ?? createConnectionCompletion({ adapter, authoring }),
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

/**
 * `beside` mounts a control *outside* the flow wrapper, the way the app's
 * toolbar sits beside the canvas. React Flow's delete listener is on `document`,
 * so what such a control does with a key press is a fact about this canvas even
 * though it is not part of it.
 */
function mountCanvas(
  beside: ReactNode = null,
  {
    covered = false,
    presenting = false,
    connections,
  }: {
    covered?: boolean;
    presenting?: boolean;
    connections?: ConnectionCompletion | undefined;
  } = {},
) {
  const composed = compose({ connections });
  const canvas = (paneOpen: boolean) => (
    <ReactFlowProvider>
      {beside}
      <CanvasHarness {...composed} covered={paneOpen} presenting={presenting} />
    </ReactFlowProvider>
  );
  const view = render(canvas(covered));
  return {
    ...composed,
    view,
    /**
     * Open or close the pane over the *same* canvas.
     *
     * A fresh mount is not the same question: `SpaceCanvas` adjusts state during
     * render when its authoring flag flips, and Edge Authoring's surfaces are
     * derived from an `enabled` that has to come back. Only a re-render asks
     * whether they do.
     */
    setCovered: (paneOpen: boolean) => view.rerender(canvas(paneOpen)),
  };
}

/** The composition `App` performs, narrowed to what an Edge test needs. */
function CanvasHarness({
  adapter,
  edgeAuthoring,
  currentSpace,
  covered,
  presenting,
}: Pick<ReturnType<typeof compose>, 'adapter' | 'edgeAuthoring' | 'currentSpace'> & {
  /** A modal pane is open over the graph — what `App` reports as no title editing. */
  readonly covered: boolean;
  readonly presenting: boolean;
}) {
  const projection = adapter((state) => state.projection);
  const selection = adapter((state) => state.selection);
  return (
    <SpaceCanvas
      nodes={projection?.nodes ?? []}
      edges={projection?.edges ?? []}
      projectedNodes={null}
      activeCardId={null}
      presenting={presenting}
      editable={true}
      titleEditingEnabled={!covered}
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

  it('opens the endpoint editor from its own button', async () => {
    const { adapter, edgeAuthoring } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.click(screen.getByRole('button', { name: 'Edit this Edge' }));

    expect(edgeAuthoring.getState().draft).toEqual({
      kind: 'keyboard-reconnect',
      graphId: GRAPH_ID,
      edge: EDGE,
    });
    // Base UI mounts its portalled Positioner after the controlled Root opens.
    // The author-visible contract is still that both endpoint fields stand when
    // the command completes; `waitFor` observes that contract rather than its
    // scheduling implementation.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'From' })).toBeVisible();
      expect(screen.getByRole('combobox', { name: 'To' })).toBeVisible();
    });
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
 * React Flow's delete key reaches the whole page, and `.nokey` only covers what
 * is beneath it in the DOM.
 *
 * `useGlobalKeyHandler` subscribes `deleteKeyCode` through `useKeyPress` with no
 * target, so the listener is on `document` and nothing about it is scoped to the
 * flow. Its one exclusion is `isInputDOMNode`, which reads the target's tag and
 * then walks the target's DOM *ancestors* for `.nokey` — so a control Radix has
 * portalled to `document.body` has none of the app's above it, however many are
 * placed inside the flow, and a toolbar control was never inside it at all.
 *
 * The Edge the key removes is the *selected* one, which is the same Edge whose
 * editor is open: the author's own Edge, deleted from under the editor they
 * opened on it.
 *
 * **Asserted on the Space, not on the drawing.** `onBeforeDelete` returns false
 * and nothing is removed locally, so the Edge stays on screen either way and
 * only the working snapshot says whether an Edit ran.
 */
describe("React Flow's document-level delete key", () => {
  const DELETE_KEYS = ['Backspace', 'Delete'] as const;

  it.each(DELETE_KEYS)('leaves the Edge standing when %s reaches its own editor', (key) => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));
    fireEvent.click(screen.getByRole('button', { name: 'Edit this Edge' }));

    // The endpoint trigger — where Radix's focus scope lands as the popover
    // opens, and a `button role="combobox"`, so neither an input tag nor
    // `contenteditable` excludes it. Named rather than left to that autofocus,
    // so this does not turn on `FocusScope` timing.
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'From' }), { key });

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
  });

  it.each(DELETE_KEYS)('leaves the Edge standing when %s reaches the sidebar', (key) => {
    // The real control, mounted where the real one is: outside the flow
    // entirely, with no portal involved and so nothing for a `.nokey` inside
    // the canvas to reach. A canvas choice is a focusable `button` that no
    // input tag excludes, which is exactly the exposure this covers.
    const { adapter, session } = mountCanvas(workspaceChrome);
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Flow' }), { key });

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
  });

  it.each(DELETE_KEYS)(
    'leaves the Edge standing when %s reaches the Add Card menu trigger',
    (key) => {
      // AddCardControl sits beside the Menubar in the real toolbar, outside the
      // flow, with the same document-level exposure MenubarTrigger has.
      const { adapter, session } = mountCanvas(
        <AddCardControl onAddCard={NO_OP} onAddAlias={NO_OP} />,
      );
      act(() => adapter.getState().selectEdge(SUBJECT));

      fireEvent.keyDown(screen.getByRole('button', { name: 'More Card kinds' }), { key });

      expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
    },
  );
});

/**
 * A pane over the graph withdraws the Edge lifecycle exactly as it withdraws the
 * Card controls — one authoring surface at a time.
 *
 * `titleEditingEnabled` is named for the first control it took away and means
 * "no modal pane covers the graph": `App` passes
 * `openedCardId === null && !creatingAlias`, and both panes are `CardPane` —
 * `role="dialog" aria-modal="true"`, a backdrop at `inset: 0` over the whole
 * graph area, and a focus trap. The canvas fed it to every Card control and
 * *not* to Edge authoring, so the two disagreed about when the graph is
 * authorable.
 *
 * Hidden control, live gesture is the asymmetry that matters, and the delete key
 * is where it bites. `useGlobalKeyHandler` subscribes `deleteKeyCode` on
 * `document`, and its one exclusion, `isInputDOMNode`, covers
 * `INPUT`/`SELECT`/`TEXTAREA`, `contenteditable` and `.nokey` — a pane's `Done`
 * and `Cancel` are `Button`s with none of those, so a `Backspace` aimed at the
 * dialog the author is working in deleted the Edge selected behind it.
 */
describe('a pane covering the graph', () => {
  it('withdraws the Edge surface with the Connect control, not after it', () => {
    mountCanvas(null, { covered: true });

    expect(screen.queryAllByRole('button', { name: /^Connect from/ })).toEqual([]);
    expect(edgeElement(`${GRAPH_ID}::0`)).not.toHaveAttribute('tabindex');
  });

  it('offers both again once the pane closes', () => {
    const { setCovered } = mountCanvas(null, { covered: true });
    expect(screen.queryAllByRole('button', { name: /^Connect from/ })).toEqual([]);

    setCovered(false);

    expect(screen.queryAllByRole('button', { name: /^Connect from/ })).not.toEqual([]);
    expect(edgeElement(`${GRAPH_ID}::0`)).toHaveAttribute('tabindex', '0');
  });

  /**
   * The handles themselves, not just the control that opens the picker.
   *
   * A Card's four authoring handles are rendered unconditionally and withdrawn
   * only by CSS and by the pane's own backdrop — so before `nodesConnectable`
   * reached them, a pane hid the affordance while leaving a live drag target
   * underneath it. React Flow marks a handle it will accept a drag at with
   * `connectablestart`, which is what this reads: the class is the primitive's
   * own answer rather than our styling, so it says the gesture is off and not
   * merely invisible.
   */
  it('leaves no handle a drag could start from', () => {
    mountCanvas(null, { covered: true });

    const handles = document.querySelectorAll('.rf-card-node__authoring-handle');
    expect(handles.length).toBeGreaterThan(0);
    expect([...handles].some((handle) => handle.classList.contains('connectablestart'))).toBe(
      false,
    );
  });

  /**
   * Presenting is the exception, and it is the reason `nodesConnectable` reads
   * `canConnectOnCanvas` rather than `canAuthorOnCanvas`.
   *
   * The presenting chrome enumerates the active Card's outgoing Edges at render
   * time so an Edge drawn from the presented Card is a move available without
   * leaving the presentation (ADR 0027). `editing.spec.ts` authors a self-Edge
   * mid-presentation and asserts exactly that. Withdrawing the handles here
   * would take the feature with them — which is what happened the first time
   * `CardNode` was made to honour the flag, because the flag had been carrying
   * `!presenting` unread for as long as nothing forwarded it.
   */
  it('keeps the handles connectable while presenting, where the Edge is a move', () => {
    mountCanvas(null, { presenting: true });

    const handles = document.querySelectorAll('.rf-card-node__authoring-handle');
    expect(handles.length).toBeGreaterThan(0);
    expect([...handles].some((handle) => handle.classList.contains('connectablestart'))).toBe(true);
  });

  it.each(['Backspace', 'Delete'] as const)(
    'leaves the selected Edge standing when %s reaches the pane',
    (key) => {
      // A pane action button, mounted where the pane is: outside the flow, and
      // carrying none of the tags or `.nokey` that would exclude it.
      const { adapter, session } = mountCanvas(<button type="button">Cancel</button>, {
        covered: true,
      });
      act(() => adapter.getState().selectEdge(SUBJECT));

      fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key });

      expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
    },
  );
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
    ['the source anchor', 'target' as const],
    ['the target anchor', 'source' as const],
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
 * **In Chromium the `aria-expanded` guard is not what produces those two
 * stages**, and that is the first thing to know about this test. Measured
 * against the fixture: Base UI closes from a document listener, and the
 * microtask checkpoint the browser performs *between* listeners commits that
 * close before React's delegated listener runs — by which time the cmdk input
 * is detached and React has stripped its fiber, so nothing dispatches, the
 * handler is never asked, and the trigger already reads `false`.
 * `editing.spec.ts` passes with the guard removed, and the author's two stages
 * are the e2e's to pin.
 *
 * What this pins is the **rule**, in the one environment that can see it. A
 * portal is no escape from the React tree — Base UI renders the list through a
 * portal, React dispatches synthetic events along the *fiber* tree, and the
 * popup's Escape handling calls `preventDefault` and never `stopPropagation` —
 * and jsdom dispatches a whole event in one frame with no
 * checkpoint, so here the press really does arrive in front of the guard.
 * Without it this fails with the picker gone on the first press: one gesture
 * cancelled by a keystroke the author aimed at a list. That is what will matter
 * the next time the primitive moves to one answering Escape from React rather
 * than from the document.
 *
 * It also holds the guard to the primitive underneath it: the picker is
 * shadcn's Combobox — a Base UI Popover over cmdk. Its trigger continues to
 * expose its expanded state to the surrounding keyboard interaction.
 */
describe('Escape in the keyboard target picker', () => {
  it('closes the open list first and cancels the connection only on the press after', async () => {
    const { edgeAuthoring, session } = mountCanvas();
    const before = session.getState().working;
    act(() => edgeAuthoring.beginKeyboardConnect(CARD_A));
    const trigger = screen.getByRole('combobox', { name: 'Connect to' });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
    fireEvent.keyDown(trigger, { key: 'Escape' });

    // The list has gone and the gesture has not.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
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

  /**
   * The picker's *other* channel: a refusal no row in its list could answer.
   *
   * `edge-already-exists` above is about the Card chosen, so it marks Target and
   * the author corrects it by choosing again. A Layout whose Active Graph has
   * gone is about the subject — every row would be refused the same way — so it
   * belongs beneath the field with the field left valid (ADR 0057).
   */
  it('says a refusal no Card choice could answer beneath the field, not on it', () => {
    const { edgeAuthoring } = mountCanvas(null, {
      connections: {
        connect: () => ({ kind: 'refused', refusal: { code: 'layout-active-graph-required' } }),
        createAndConnect: () => ({ kind: 'unavailable' }),
      },
    });

    act(() => edgeAuthoring.beginKeyboardConnect(CARD_A));
    act(() => {
      edgeAuthoring.completeKeyboardConnect(CARD_B, null);
    });

    expect(screen.getByTestId('connect-form-refusal')).toHaveTextContent(
      'This Layout has no active Graph for the connection to join.',
    );
    // Target stays valid, and says so: choosing another Card is not the fix.
    expect(screen.queryByTestId('connect-refusal')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Connect to' })).toHaveAttribute(
      'aria-invalid',
      'false',
    );
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
