import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Position, ReactFlowProvider, type Edge } from '@xyflow/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { inHandleId, loadSpaceSnapshot, outHandleId, Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { createNavigation } from '../src/navigation';
import { createRenderAdapter } from '../src/render-adapter';
import { createConnectionCompletion } from '../src/connection-completion';
import { createEdgeAuthoring } from '../src/edge-authoring';
import { useEdgeAuthoring } from '../src/edge-authoring-react';
import { createSpaceAuthoring } from '../src/space-authoring';
import { createRendererResolver } from '../src/renderer';
import { SpaceCanvas } from '../src/components/SpaceCanvas';
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

beforeAll(() => {
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

    act(() => adapter.getState().selectEdge(GRAPH_ID, EDGE));

    expect(screen.getByRole('button', { name: 'Delete this Edge' })).toBeVisible();
  });

  it('deletes the Edge from its Graph and leaves the Graph standing', () => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(GRAPH_ID, EDGE));

    fireEvent.click(screen.getByRole('button', { name: 'Delete this Edge' }));

    expect(graphsOf(session.getState().working)).toEqual([
      { id: GRAPH_ID, title: 'Main', edges: [] },
      { id: OTHER_GRAPH_ID, title: 'Aside', edges: [ASIDE_EDGE] },
    ]);
  });

  it('opens the endpoint editor from its own button', () => {
    const { adapter, edgeAuthoring } = mountCanvas();
    act(() => adapter.getState().selectEdge(GRAPH_ID, EDGE));

    fireEvent.click(screen.getByRole('button', { name: 'Edit this Edge' }));

    expect(edgeAuthoring.getState().draft).toEqual({
      kind: 'keyboard-reconnect',
      graphId: GRAPH_ID,
      edge: EDGE,
    });
    expect(screen.getByRole('combobox', { name: 'From' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'To' })).toBeVisible();
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
