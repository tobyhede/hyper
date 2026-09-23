import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useContext, useLayoutEffect, type ReactNode } from 'react';
import {
  Position,
  ReactFlowProvider,
  type Edge,
  type FinalConnectionState,
  type InternalNode,
} from '@xyflow/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { graphRenderEdgeId } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { ROUTED_EDGE_TYPE, type ResourceFlowNode } from '@project/react-flow-adapter';
import { Toolbar, ToolbarButton } from '@project/ui';
import { authoringAvailability } from '../src/authoring-availability';
import { RESOURCES_TRIGGER } from '../src/components/command-dock-triggers';
import { composeApp, type EdgeCollaborators } from '../src/compose-app';
import { edgeSelectionOf } from '../src/render-adapter';
import type { ConnectionCompletion } from '../src/connection-completion';
import { useEdgeAuthoring } from '../src/edge-authoring-react';
import { CanvasContinuation } from '../src/components/CanvasContinuation';
import { SpaceCanvas } from '../src/components/SpaceCanvas';
import { EdgeAuthoringContext } from '../src/components/edge-authoring-context';
import { RESOURCE_SIZE } from '../src/resource';

/**
 * Edge Authoring's React interface: what it hands React Flow, and the controls
 * an author reaches through it.
 *
 * The state machine is `edge-authoring.test.ts`'s and the Graph rules are Space
 * Authoring's. What is left here is the translation — decorated Edges, stable
 * callbacks, and the toolbar and pickers that drive the module.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const RESOURCE_C = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const RESOURCE_D = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');

const EDGE = { from: RESOURCE_A, to: RESOURCE_B } as const;
/** The Graph and Edge an Edge operation is named by, which travel together. */
const SUBJECT = { graphId: GRAPH_ID, edge: EDGE } as const;
const ASIDE_EDGE = { from: RESOURCE_B, to: RESOURCE_C } as const;

const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 0, y: 0, open: false },
          [RESOURCE_B]: { x: 400, y: 0, open: false },
          [RESOURCE_C]: { x: 800, y: 0, open: false },
        },
        graphs: [
          { id: GRAPH_ID, title: 'Main', edges: [EDGE] },
          { id: OTHER_GRAPH_ID, title: 'Aside', edges: [ASIDE_EDGE] },
        ],
      },
    ],
    defaultMap: MAP_ID,
  },
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
    { id: RESOURCE_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
  ],
};

/**
 * Nodes carrying declared handles, which is how this repo gives React Flow
 * handle geometry (docs/agents/rendering.md): `parseHandles` prefers a declaration to the DOM,
 * and jsdom measures nothing, so without these no Edge resolves a position and
 * none is drawn at all.
 *
 * Four anchors of each role, as `projection.ts` declares them (ADR 0087). The
 * diameter is spelled out rather than imported because `@project/react-flow-adapter`
 * offers its projection and not its constants; what matters to these tests is
 * that both roles are declared on every side, which is what lets an Edge naming
 * no handle resolve at either end.
 */
function resourceNode(id: string, x: number, title: string): ResourceFlowNode {
  const radius = 12;
  const sides = [
    { position: Position.Top, x: RESOURCE_SIZE.width / 2 - radius, y: -radius },
    {
      position: Position.Right,
      x: RESOURCE_SIZE.width - radius,
      y: RESOURCE_SIZE.height / 2 - radius,
    },
    {
      position: Position.Bottom,
      x: RESOURCE_SIZE.width / 2 - radius,
      y: RESOURCE_SIZE.height - radius,
    },
    { position: Position.Left, x: -radius, y: RESOURCE_SIZE.height / 2 - radius },
  ];
  const anchors = (['source', 'target'] as const).flatMap((type) =>
    sides.map((side) => ({
      id: `authoring-${type}-${side.position}`,
      type,
      position: side.position,
      x: side.x,
      y: side.y,
      width: radius * 2,
      height: radius * 2,
    })),
  );
  return {
    id,
    type: 'resource',
    position: { x, y: 0 },
    width: RESOURCE_SIZE.width,
    height: RESOURCE_SIZE.height,
    handles: anchors,
    data: {
      resourceId: uuidSchema.parse(id),
      title,
      readOnly: false,
      kind: 'markdown',
      active: false,
      selectedForAuthoring: false,
      showContent: false,
      activeGraphId: GRAPH_ID,
      activeGraphColor: '#8a94a6',
    },
  };
}

const NODES = [
  resourceNode(RESOURCE_A, 0, 'A'),
  resourceNode(RESOURCE_B, 400, 'B'),
  resourceNode(RESOURCE_C, 800, 'C'),
];

/**
 * One projected Edge, with the id minted by the function that mints it in
 * production: from the Graph and the two endpoints, so a replaced Edge is a new
 * element rather than the previous one under a reused id. Spelling the format
 * out here instead would leave this fixture green against a shape
 * `buildGraphRenderEdges` no longer produces — which is the divergence between
 * two ideas of an Edge's identity that the format exists to end.
 */
const flowEdge = (graphId: string, from: string, to: string): Edge => ({
  id: graphRenderEdgeId(uuidSchema.parse(graphId), {
    from: uuidSchema.parse(from),
    to: uuidSchema.parse(to),
  }),
  type: ROUTED_EDGE_TYPE,
  source: from,
  target: to,
  data: { graphId },
});

const EDGES = [
  flowEdge(GRAPH_ID, RESOURCE_A, RESOURCE_B),
  flowEdge(OTHER_GRAPH_ID, RESOURCE_B, RESOURCE_C),
];

/**
 * The composition every canvas test runs on.
 *
 * `connections` is overridable because `ConnectionCompletion` is a declared
 * dependency of `createEdgeAuthoring`, and one refusal channel is reachable
 * only through it. `map-active-graph-required` is the sole refusal that can
 * reach `connect-form-refusal` on a connect gesture — the others are
 * `correctableByResourceChoice` and mark the Target field instead (ADR 0057,
 * `authoring-refusal.ts`) — and it needs a selected Map whose Active Graph
 * the Map does not own. **No legal Space can be in that state**, not merely
 * no gesture over this fixture: `spaceFileSchema` gives a Map
 * `graphs: z.array(graphSchema).min(1)` (`core/src/schema.ts`, asserted by
 * `core/test/persistence-schema.test.ts`), `ResolvedMap.activeGraph`
 * resolves named-or-first and is never null, Navigation writes only an Active
 * Graph the selected Map owns, and Graph deletion refuses the
 * last one (`map-must-keep-graph`).
 *
 * So the stand-in is what exercises the channel at all, and the alternative —
 * arranging the fixture so the real completion refuses this way — is not
 * available. Everything else composes the real collaborator; only the one test
 * at the bottom of this file passes anything here.
 */
function compose({
  connections,
  selection = MAP_ID,
}: {
  connections?: ((collaborators: EdgeCollaborators) => ConnectionCompletion) | undefined;
  /** Which Map opens. */
  selection?: typeof MAP_ID | undefined;
} = {}) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
  const composed = composeApp({ spaceSession: session, selection, connections });
  composed.adapter.getState().syncProjection(NODES, EDGES);
  return { session, ...composed };
}

const graphsOf = (working: SpaceSnapshot) =>
  (working.document.maps ?? []).flatMap((map) => map.graphs);

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
  // `elementDropTargetOf` reads as off-canvas — so every test that leaves this
  // stub alone exercises the cancelling path. `what a reconnect release decides`
  // answers it with a real mounted element instead, and drives the other paths.
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
 * toolbar sits beside the canvas. The app-owned listener is on `window`, so
 * what such a control does with a key press is a fact about this canvas even
 * though it is not part of it.
 */
function mountCanvas(
  beside: ReactNode = null,
  {
    covered = false,
    presenting = false,
    deleteWhenCoveredCommits = false,
    connections,
    selection,
  }: {
    covered?: boolean;
    presenting?: boolean;
    deleteWhenCoveredCommits?: boolean;
    connections?: ((collaborators: EdgeCollaborators) => ConnectionCompletion) | undefined;
    selection?: typeof MAP_ID | undefined;
  } = {},
) {
  const composed = compose({ connections, selection });
  const canvas = (paneOpen: boolean) => (
    <ReactFlowProvider>
      {beside}
      <CanvasHarness {...composed} covered={paneOpen} presenting={presenting} />
      {deleteWhenCoveredCommits ? <DeleteWhenCommitted armed={paneOpen} /> : null}
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

function DeleteWhenCommitted({ armed }: { readonly armed: boolean }) {
  useLayoutEffect(() => {
    if (armed) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    }
  }, [armed]);
  return null;
}

/** The composition `App` performs, narrowed to what an Edge test needs. */
function CanvasHarness({
  adapter,
  edgeAuthoring,
  continuation,
  currentSpace,
  authoring,
  session,
  covered,
  presenting,
}: Pick<
  ReturnType<typeof compose>,
  'adapter' | 'edgeAuthoring' | 'continuation' | 'currentSpace' | 'authoring' | 'session'
> & {
  /** A modal pane is open over the graph, withdrawing everything on it. */
  readonly covered: boolean;
  readonly presenting: boolean;
}) {
  const projection = adapter((state) => state.projection);
  const selection = adapter((state) => state.selection);
  return (
    <>
      {/* Production's own adapter, because where a completed Edge Edit leaves
          the author is now this module's claim and not Edge Authoring's: it
          publishes a continuation, and this is what resolves one against the
          projection React Flow has drawn. */}
      <CanvasContinuation
        continuation={continuation}
        onSelectResource={adapter.getState().selectResource}
        onSelectEdge={adapter.getState().selectEdge}
      />
      <SpaceCanvas
        continuation={continuation}
        nodes={projection?.nodes ?? []}
        edges={projection?.edges ?? []}
        projectedNodes={null}
        activeResourceId={null}
        presenting={presenting}
        placementReady={true}
        availability={authoringAvailability({
          editable: true,
          presenting,
          editingResourceBody: false,
          editingResourceTitle: false,
          resourceIsOpen: false,
          editingChromeTitle: covered,
          spaceOnCanvas: true,
          editingEmbeddedMap: false,
          creatingSpaceResource: false,
        })}
        onNodesChange={adapter.getState().changeNodes}
        onEdgesChange={adapter.getState().changeEdges}
        edgeAuthoring={edgeAuthoring}
        selection={selection}
        onSelectResource={adapter.getState().selectResource}
        onSelectEdge={adapter.getState().selectEdge}
        placedResources={currentSpace().resources}
        newResourceTitle="Resource 4"
        onAddResource={() => undefined}
        onAddExistingResource={() => undefined}
        nameOnCreation={null}
        authoring={authoring}
        spaceSession={session}
        resourceResize={{
          beginResize: () => undefined,
          previewResize: () => undefined,
          finishResize: () => undefined,
          cancelResize: () => undefined,
        }}
        reportEmbeddedMapEditing={() => undefined}
        spaceTitle="Test Space"
        mapTitle="Test Map"
        graphs={currentSpace().graphs}
        colorByGraphId={{}}
        activeGraphId={GRAPH_ID}
      />
    </>
  );
}

const edgeElement = (id: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`.react-flow__edge[data-id="${id}"]`);
  if (element === null) throw new Error(`No Edge is drawn for ${id}.`);
  return element;
};

const canvasElement = (): HTMLElement => {
  const canvas = document.querySelector<HTMLElement>('.react-flow');
  if (canvas === null) throw new Error('The canvas must be mounted.');
  return canvas;
};

/**
 * Only the Active Graph's Edges are tab stops. An Edge belonging to another
 * Graph the Map draws is there to be seen; putting it in the tab order would
 * place inert stops between a keyboard author and the Edges they can act on.
 */
describe('decorated Edges', () => {
  it('makes only the Active Graph Edge focusable and names it for a screen reader', () => {
    mountCanvas();

    const active = edgeElement(EDGES[0]!.id);
    expect(active).toHaveAttribute('tabindex', '0');
    expect(active).toHaveAttribute('aria-label', 'Edge from A to B in Main');

    expect(edgeElement(EDGES[1]!.id)).not.toHaveAttribute('tabindex');
  });

  it('installs a focused Edge as the canvas selection', () => {
    const { adapter } = mountCanvas();

    fireEvent.focus(edgeElement(EDGES[0]!.id));

    expect(adapter.getState().selection).toEqual({
      kind: 'edge',
      graphId: GRAPH_ID,
      edge: EDGE,
    });
  });

  it('does not select an Edge outside the Active Graph when it receives focus', () => {
    const { adapter } = mountCanvas();

    fireEvent.focus(edgeElement(EDGES[1]!.id));

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
   * `Main` holds A→B, so every Resource of this Map is a legal `to` for it: B is
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
        placedResources: composed.currentSpace().resources,
        newResourceTitle: 'Resource 4',
        enabled: true,
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
 * The application owns one window listener and excludes every surface with its
 * own keyboard model before routing the selected subject through Authoring.
 * Assertions read the working Space, because the completed Edit rather than a
 * local React Flow array mutation is the behavior under test.
 */
describe("the app's canvas delete key", () => {
  const DELETE_KEYS = ['Backspace', 'Delete'] as const;

  it.each(DELETE_KEYS)('removes the selected Edge when %s is aimed at the canvas', (key) => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.keyDown(canvasElement(), { key });

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([]);
  });

  it.each(DELETE_KEYS)(
    'removes the selected Resource from its Map when %s is aimed at the canvas',
    (key) => {
      const { adapter, session } = mountCanvas();
      act(() => adapter.getState().selectResource(RESOURCE_A));

      fireEvent.keyDown(canvasElement(), { key });

      const current = session.getState().working;
      expect(current.resources.map(({ id }) => id)).toContain(RESOURCE_A);
      expect(current.document.maps?.[0]?.positions[RESOURCE_A]).toBeUndefined();
    },
  );

  it.each(DELETE_KEYS)(
    'leaves the selected Resource standing when %s is aimed outside the canvas',
    (key) => {
      const { adapter, session } = mountCanvas(<main tabIndex={-1}>Outside the canvas</main>);
      act(() => adapter.getState().selectResource(RESOURCE_A));

      fireEvent.keyDown(screen.getByText('Outside the canvas'), { key });

      expect(session.getState().working.document.maps?.[0]?.positions[RESOURCE_A]).toBeDefined();
    },
  );

  /**
   * The key acts on the Resource it was aimed at, not the one selected before.
   *
   * React Flow never selects a node on focus — its `onFocus` only auto-pans —
   * and only the Edge half of this canvas has a focus-to-selection bridge. So a
   * Tab to another Resource leaves the selection where it was, while the node's own
   * assistive description promises Delete removes *it*. The open command one
   * branch above already resolves its Resource from the event target; this one now
   * agrees, and falls back to the selection when the key came from the pane.
   */
  it.each(DELETE_KEYS)('removes the focused Resource rather than the selected one on %s', (key) => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectResource(RESOURCE_A));
    const focused = document.querySelector(`.react-flow__node[data-id="${RESOURCE_B}"]`);
    if (focused === null)
      throw new Error('The Resource the key is aimed at must be on the canvas.');

    fireEvent.keyDown(focused, { key, bubbles: true });

    const map = session.getState().working.document.maps?.[0];
    expect(map?.positions[RESOURCE_B]).toBeUndefined();
    expect(map?.positions[RESOURCE_A]).toBeDefined();
  });

  /**
   * The same two exclusions the `C` binding spells out, for the same reasons: a
   * command runs once per press, and a modifier makes the key somebody else's.
   */
  it('ignores an auto-repeated Backspace so one press removes one Resource', () => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectResource(RESOURCE_A));

    fireEvent.keyDown(document.body, { key: 'Backspace', repeat: true });

    expect(session.getState().working.document.maps?.[0]?.positions[RESOURCE_A]).toBeDefined();
  });

  /**
   * `shiftKey` belongs with the rest, and for a plainer reason than the `C`
   * binding's.
   *
   * There, Shift has to be named because matching case-insensitively lets it
   * through as the same character. Here the key is already the same key, so
   * Shift makes an ordinary chord — one this canvas never advertised, since both
   * assistive descriptions name backspace and delete unmodified, and one that is
   * somebody else's in several places a browser runs (cut in a text control,
   * permanent delete in a file manager). Nothing on this canvas holds Shift
   * either: `selectionKeyCode` and `multiSelectionKeyCode` are both `null`.
   */
  it.each(['metaKey', 'ctrlKey', 'altKey', 'shiftKey'] as const)(
    'leaves a %s-modified Backspace to whatever else would have had it',
    (modifier) => {
      const { adapter, session } = mountCanvas();
      act(() => adapter.getState().selectResource(RESOURCE_A));

      fireEvent.keyDown(document.body, { key: 'Backspace', [modifier]: true });

      expect(session.getState().working.document.maps?.[0]?.positions[RESOURCE_A]).toBeDefined();
    },
  );

  it.each(['metaKey', 'ctrlKey', 'altKey', 'shiftKey'] as const)(
    'leaves the selected Edge standing under a %s-modified Delete',
    (modifier) => {
      const { adapter, session } = mountCanvas();
      act(() => adapter.getState().selectEdge(SUBJECT));

      fireEvent.keyDown(document.body, { key: 'Delete', [modifier]: true });

      expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
    },
  );

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

  it.each(DELETE_KEYS)(
    'leaves the Edge standing when %s reaches a Create Resource control',
    (key) => {
      // The real treatment, mounted where the real control is: outside the flow
      // entirely, in chrome that marks itself `.nokey` — which is the marker
      // the canvas guard reads rather than a list of its own. `RESOURCES_TRIGGER` is
      // the Command Dock's own Resources trigger, exported for whoever supplies that
      // surface, so the class under test here is the class the Dock ships.
      //
      // It carried two cases beside it once, over `AddResourceControl` and a
      // `SpaceSidebar` mounted the same way. ADR 0082 retired the Sidebar,
      // `.scratch/command-dock/issues/08` deleted the control, and the Dock that
      // replaced both marks itself the same way — so one production trigger
      // proves one guard.
      const { adapter, session } = mountCanvas(
        <Toolbar>
          <ToolbarButton {...RESOURCES_TRIGGER}>Resources</ToolbarButton>
        </Toolbar>,
      );
      act(() => adapter.getState().selectEdge(SUBJECT));

      fireEvent.keyDown(screen.getByRole('button', { name: 'Resources' }), { key });

      expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
    },
  );

  it.each([
    ['menu', 'menu'],
    ['listbox', 'listbox'],
    ['dialog', 'dialog'],
  ] as const)('leaves the Edge standing when Delete reaches a %s', (_name, role) => {
    const { adapter, session } = mountCanvas(<div role={role} tabIndex={0} aria-label={role} />);
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.keyDown(screen.getByRole(role), { key: 'Delete' });

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
  });

  it('leaves the Edge standing while presenting', () => {
    const { adapter, session } = mountCanvas(null, { presenting: true });
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.keyDown(document.body, { key: 'Delete' });

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
  });

  /**
   * The real control this canvas mounts, not a stand-in for it.
   *
   * A fabricated `input[type=range]` proved only that the guard's `input` entry
   * works, which was true before the zoom controls existed. What has to hold is
   * that the shipped `ZoomSlider` — a Base UI thumb inside a React Flow `Panel`,
   * both of which this test renders for real — is excluded, and the entry that
   * excludes it is the `.nokey` its Panel already carries for React Flow's own
   * subscriptions.
   */
  it('leaves the Edge standing when Delete reaches the zoom slider', async () => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    // Found by label rather than role: Base UI keeps a thumb `visibility:
    // hidden` until it has measured the track, and jsdom measures nothing, so
    // the real control is absent from the accessibility tree here.
    const slider = await screen.findByLabelText('Zoom');
    expect(slider.closest('.nokey')).not.toBeNull();
    fireEvent.keyDown(slider, { key: 'Delete' });

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
  });

  it('leaves the Edge standing when Delete reaches a zoom button', async () => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.keyDown(await screen.findByRole('button', { name: 'Zoom in' }), { key: 'Delete' });

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
  });

  it('observes a pane refusal from the commit that publishes it', () => {
    const { adapter, session, setCovered } = mountCanvas(null, {
      deleteWhenCoveredCommits: true,
    });
    act(() => adapter.getState().selectEdge(SUBJECT));

    setCovered(true);

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
  });
});

/**
 * A pane over the graph withdraws the Edge lifecycle — one authoring surface at
 * a time.
 *
 * A creation pane is a `Dialog` — a backdrop at `inset: 0` over the whole graph
 * area, and a focus trap — and `authorOnCanvas` carries it, alongside the live
 * chrome rename, which withdraws canvas authoring without covering anything.
 * The canvas once fed that condition to every Resource control and *not* to Edge
 * authoring, so the two disagreed about when the graph is authorable.
 *
 * The `covered` prop below is the pane, which is the case this file exercises.
 *
 * A hidden live gesture is the asymmetry that matters, and the delete key is
 * where it bites. The app-owned canvas command listens on `window`, so its
 * semantic guard must recognise the pane's dialog ancestor; a `Backspace`
 * aimed at the dialog must not delete the Edge selected behind it.
 */
describe('a pane covering the graph', () => {
  it('withdraws the Edge surface while the pane covers it', () => {
    mountCanvas(null, { covered: true });

    expect(edgeElement(EDGES[0]!.id)).not.toHaveAttribute('tabindex');
  });

  it('offers the Edge surface again once the pane closes', () => {
    const { setCovered } = mountCanvas(null, { covered: true });

    setCovered(false);

    expect(edgeElement(EDGES[0]!.id)).toHaveAttribute('tabindex', '0');
  });

  /**
   * The handles themselves, not just the control that opens the picker.
   *
   * A Resource's four authoring handles are rendered unconditionally and withdrawn
   * only by CSS and by the pane's own backdrop — so before `nodesConnectable`
   * reached them, a pane hid the affordance while leaving a live drag target
   * underneath it. React Flow marks a handle it will accept a drag at with
   * `connectablestart`, which is what this reads: the class is the primitive's
   * own answer rather than our styling, so it says the gesture is off and not
   * merely invisible.
   */
  it('leaves no handle a drag could start from', () => {
    mountCanvas(null, { covered: true });

    const handles = document.querySelectorAll('.rf-resource-node__authoring-handle');
    expect(handles.length).toBeGreaterThan(0);
    expect([...handles].some((handle) => handle.classList.contains('connectablestart'))).toBe(
      false,
    );
  });

  /**
   * Presenting is the exception, and it is the reason `nodesConnectable` reads
   * `connectOnCanvas` rather than `authorOnCanvas`.
   *
   * The presenting chrome enumerates the active Resource's outgoing Edges at render
   * time so an Edge drawn from the presented Resource is a move available without
   * leaving the presentation (ADR 0027). `editing.spec.ts` authors a self-Edge
   * mid-presentation and asserts exactly that. Withdrawing the handles here
   * would take the feature with them — which is what happened the first time
   * `ResourceNode` was made to honour the flag, because the flag had been carrying
   * `!presenting` unread for as long as nothing forwarded it.
   */
  it('keeps the handles connectable while presenting, where the Edge is a move', () => {
    mountCanvas(null, { presenting: true });

    const handles = document.querySelectorAll('.rf-resource-node__authoring-handle');
    expect(handles.length).toBeGreaterThan(0);
    expect([...handles].some((handle) => handle.classList.contains('connectablestart'))).toBe(true);
  });

  it.each(['Backspace', 'Delete'] as const)(
    'leaves the selected Edge standing when %s reaches the pane',
    (key) => {
      // A pane action button, mounted where the pane is outside the flow. The
      // app-owned canvas command guard recognises its dialog ancestor.
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
/** The hook over a composed Space, with the drafted Edge selected. */
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
        placedResources: composed.currentSpace().resources,
        newResourceTitle: 'Resource 4',
        enabled: true,
        onSelectEdge: NO_OP,
      }),
    { wrapper: ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider> },
  );

describe("React Flow's reconnect callback order", () => {
  const startDrag = (props: ReturnType<typeof surface>['result']['current'], edge: Edge) => {
    // The order React Flow uses, verbatim.
    props.reactFlowProps.onReconnectStart(null, edge, 'target');
    props.reactFlowProps.onConnectStart(new MouseEvent('mousedown'), {
      nodeId: RESOURCE_B,
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
   * Dropping either end of A→B back on its own Resource is the case that exposes
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
        nodeId: RESOURCE_B,
        handleId: null,
        handleType: 'target',
      });
    });

    expect(
      result.current.reactFlowProps.isValidConnection(connectionTo(RESOURCE_A, RESOURCE_B)),
    ).toBe(true);
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
      composed.edgeAuthoring.beginPointerConnect(RESOURCE_A);
      composed.edgeAuthoring.connect(RESOURCE_A, RESOURCE_C, null);
      composed.edgeAuthoring.endPointerDrag();
    });
    expect(graphsOf(composed.session.getState().working)[0]?.edges).toEqual([
      EDGE,
      { from: RESOURCE_A, to: RESOURCE_C },
    ]);

    const { result } = surface(composed);
    act(() => result.current.reactFlowProps.onReconnectStart(null, EDGES[0]!, 'target'));

    expect(
      result.current.reactFlowProps.isValidConnection(connectionTo(RESOURCE_A, RESOURCE_C)),
    ).toBe(false);
    // And the endpoint's own Resource is still offered, so the refusal is the
    // duplicate rule rather than the reconnect branch refusing everything.
    expect(
      result.current.reactFlowProps.isValidConnection(connectionTo(RESOURCE_A, RESOURCE_B)),
    ).toBe(true);
  });

  /** With no reconnect draft open, the ordinary connect rule still answers. */
  it('asks the connect rule when no reconnect drag is in flight', () => {
    const composed = compose();
    const { result } = surface(composed);

    // A→B already exists in Main, so as a plain connection it is a duplicate.
    expect(
      result.current.reactFlowProps.isValidConnection(connectionTo(RESOURCE_A, RESOURCE_B)),
    ).toBe(false);
    expect(
      result.current.reactFlowProps.isValidConnection(connectionTo(RESOURCE_B, RESOURCE_C)),
    ).toBe(true);
  });

  it('completes the reconnection rather than silently authoring nothing', () => {
    const composed = compose();
    const { result } = surface(composed);
    act(() => startDrag(result.current, EDGES[0]!));

    act(() => {
      result.current.reactFlowProps.onReconnect(EDGES[0]!, {
        source: RESOURCE_A,
        target: RESOURCE_C,
        sourceHandle: null,
        targetHandle: null,
      });
    });

    expect(graphsOf(composed.session.getState().working)[0]?.edges).toEqual([
      { from: RESOURCE_A, to: RESOURCE_C },
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
   * plain Resource-to-Resource drag still authors and hides it.
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
        nodeId: RESOURCE_C,
        handleId: null,
        handleType: 'source',
      });
    });

    expect(composed.edgeAuthoring.getState().draft).toEqual({
      kind: 'pointer-connect',
      from: RESOURCE_C,
    });
  });

  /**
   * The connection release arrives first and must author nothing: with Alt held
   * it would otherwise create a Resource and an Edge from the anchored end, and then
   * `onReconnectEnd` would delete the Edge — one gesture, two Edits.
   */
  it('authors no Resource when an Alt-held reconnect release reaches the connection callback', () => {
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
 * What a reconnect release decides, and the precedence it decides it by.
 *
 * This is the third site of the rule `docs/agents/rendering.md` states in its
 * *"Neither React Flow's `toNode` nor the DOM alone answers"* bullet, and
 * the one that is easiest to miss: it composes React Flow's answer with the
 * DOM's exactly as the connect path does, and then asks a different question of
 * the result — delete this Edge, rather than author a Resource. Nothing but
 * `editing.spec.ts` used to cover it.
 *
 * jsdom performs no hit-testing, so `elementFromPoint` is answered with a
 * **real mounted element** rather than a fabricated verdict: `closest` then
 * walks the tree for real, which is the half of the rule under test. Both class
 * names are React Flow's published theming API.
 */
describe('what a reconnect release decides', () => {
  const mountFlowDom = () => {
    const renderer = document.createElement('div');
    renderer.className = 'react-flow__renderer';
    const resource = document.createElement('div');
    resource.className = 'react-flow__node';
    renderer.append(resource);
    document.body.append(renderer);
    mounted = renderer;
    return { renderer, resource };
  };

  /** The node `mountFlowDom` put in the document, so cleanup removes that one. */
  let mounted: Element | null = null;

  const internalNode = (id: string): InternalNode => {
    const userNode = { id, position: { x: 0, y: 0 }, data: {} };
    return {
      ...userNode,
      measured: { width: RESOURCE_SIZE.width, height: RESOURCE_SIZE.height },
      internals: { positionAbsolute: { x: 0, y: 0 }, z: 0, userNode },
    };
  };

  /**
   * A release React Flow resolved a target for and **refused** — the only shape
   * that reaches the precedence with a non-null `toNode`.
   *
   * `isValid: true` would be unreachable here: `onReconnect` fires for a valid
   * release and sets `proposedReconnection`, so `handleReconnectEnd` returns at
   * its `!proposed` guard before the precedence is consulted. What is left is a
   * handle in range whose connection the validator refused — the author aimed at
   * a handle and missed the rule, not the handle.
   *
   * Written out in full because the type requires the whole in-progress branch,
   * not because the handler reads more than `toNode`.
   */
  const RESOLVED_CONNECTION = {
    isValid: false,
    from: { x: 0, y: 0 },
    fromHandle: {
      id: null,
      nodeId: RESOURCE_A,
      type: 'source',
      position: Position.Right,
      x: 0,
      y: 0,
      width: 6,
      height: 6,
    },
    fromPosition: Position.Right,
    fromNode: internalNode(RESOURCE_A),
    to: { x: 400, y: 0 },
    toHandle: null,
    toPosition: Position.Left,
    toNode: internalNode(RESOURCE_B),
    pointer: { x: 400, y: 0 },
  } satisfies FinalConnectionState;

  const release = (
    composed: ReturnType<typeof compose>,
    at: Element,
    state: FinalConnectionState,
  ) => {
    const { result } = surface(composed);
    document.elementFromPoint = () => at;
    act(() => {
      result.current.reactFlowProps.onReconnectStart(null, EDGES[0]!, 'target');
      result.current.reactFlowProps.onReconnectEnd(
        new MouseEvent('mouseup', { clientX: 10, clientY: 10 }),
        EDGES[0]!,
        'target',
        state,
      );
    });
  };

  afterEach(() => {
    mounted?.remove();
    mounted = null;
    // Restores what `beforeAll` installed for every other block in this file.
    document.elementFromPoint = () => null;
  });

  it('deletes the Edge when the release lands on empty canvas', () => {
    const composed = compose();
    release(composed, mountFlowDom().renderer, FINISHED_CONNECTION);

    expect(graphsOf(composed.session.getState().working)[0]?.edges).toEqual([]);
  });

  it('keeps the Edge when the release lands on a Resource body', () => {
    const composed = compose();
    release(composed, mountFlowDom().resource, FINISHED_CONNECTION);

    expect(graphsOf(composed.session.getState().working)[0]?.edges).toEqual([EDGE]);
  });

  /**
   * **The precedence itself.** The DOM says empty canvas — the same fact that
   * deletes in the first case — and React Flow says a handle is in range. A drag
   * that merely *missed* a handle cancels rather than deleting, so the Edge
   * survives.
   */
  it('keeps the Edge when a connection target in range outranks the empty canvas underneath', () => {
    const composed = compose();
    release(composed, mountFlowDom().renderer, RESOLVED_CONNECTION);

    expect(graphsOf(composed.session.getState().working)[0]?.edges).toEqual([EDGE]);
  });
});

/**
 * The one claim the canvas adapter owns: it calls `.focus()` on the element the
 * pending continuation resolves to, once that element is drawn.
 *
 * Which continuations stay owed is `continuation.test.ts`'s, in the node
 * environment. What only a tree can show is the resolution itself — a domain
 * subject becoming a React Flow element — and the timing that makes it worth
 * having: an Edge continuation is published synchronously with the Edit, but
 * the projection carrying the reconnected Edge arrives a strategy later, so an
 * adapter that spent it on the render that received it would land focus
 * anywhere but the "Edited Edge" the matrix names.
 */
describe('spending a continuation on the canvas', () => {
  const RECONNECTED = { graphId: GRAPH_ID, edge: { from: RESOURCE_A, to: RESOURCE_C } } as const;
  const reconnectedFlowEdge = flowEdge(GRAPH_ID, RESOURCE_A, RESOURCE_C);

  it('focuses the Edge on the projection that draws it, not the one before', () => {
    // The real canvas, because resolving the continuation is a DOM lookup: the
    // element only exists once React Flow has drawn the Edge.
    const { edgeAuthoring, adapter, continuation } = mountCanvas();
    document.body.focus();

    act(() => {
      edgeAuthoring.openEdgeEditor(SUBJECT);
      edgeAuthoring.reconnect('to', RESOURCE_C);
    });

    // The Edit has completed, but the projection still holds the Edge as it
    // was — so the continuation is still owed rather than spent on the canvas.
    expect(continuation.getState().pending).toEqual({
      target: { kind: 'edge', ...RECONNECTED },
      select: false,
      then: 'focus',
    });

    // One publication, and the reconnected Edge is an element React Flow has
    // never drawn — it draws that a commit later, from a store it syncs in an
    // effect of its own. `CanvasContinuation` subscribes to those drawn Edges
    // for exactly this reason, so the spend does not wait on an unrelated
    // render to come along.
    act(() => adapter.getState().syncProjection(NODES, [reconnectedFlowEdge, EDGES[1]!]));

    expect(continuation.getState().pending).toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector(`.react-flow__edge[data-id="${reconnectedFlowEdge.id}"]`),
    );
  });

  /**
   * **The selection survives the focus the continuation spends on it.**
   *
   * Landing focus is not the same claim as keeping the selection, and the two
   * came apart: `reconnect` installs the reconnected subject and *then* asks for
   * focus, and focus lands on an Edge element whose `onFocus` bridge writes
   * whatever subject that element is currently drawing back into the union
   * (`decorated`, above). While a React Flow Edge id named the Edge's *position*
   * in its Graph, a replaced Edge inherited the previous one's id — so the
   * element the previous Edge had already drawn answered the query for the
   * reconnected one, and its still-stale `onFocus` put the Edge the Space no
   * longer holds back on the union. Nothing then drew selected. Keyed on the
   * endpoints, the reconnected Edge is a different element, drawn by the
   * projection that names it, and the bridge writes the subject already stored.
   */
  it('leaves the reconnected Edge selected, not only focused', () => {
    const { edgeAuthoring, adapter, continuation } = mountCanvas();
    document.body.focus();

    act(() => {
      edgeAuthoring.openEdgeEditor(SUBJECT);
      edgeAuthoring.reconnect('to', RESOURCE_C);
    });
    act(() => adapter.getState().syncProjection(NODES, [reconnectedFlowEdge, EDGES[1]!]));

    // Asserted after the continuation has been spent, because focus landing is
    // the event that could take the selection with it.
    expect(continuation.getState().pending).toBeNull();
    // Both halves, because "not only focused" is a claim about the pair: the
    // defect this pins had the focus half true on its own, and a test that
    // leaves that half to a sibling stops naming what it holds the moment the
    // sibling moves.
    expect(document.activeElement).toBe(
      document.querySelector(`.react-flow__edge[data-id="${reconnectedFlowEdge.id}"]`),
    );
    expect(adapter.getState().selection).toEqual({ kind: 'edge', ...RECONNECTED });
  });

  /**
   * **The other kind `staysOwed` waits for, on the same schedule.**
   *
   * A resource target is resolved by `data-id` against the DOM, so it needs the
   * commit that draws just as much as an Edge does — React Flow syncs the
   * `nodes` prop into its own store from an effect and draws from that.
   *
   * **`mergeProjected` is what makes that a claim of its own rather than one
   * the Edge arm answers by accident.** `syncProjection` copies the Edge list
   * (`edges: [...edges]`), so every publication through it moves the Edge
   * subscription whether or not an Edge changed. `mergeProjected` spreads the
   * projection and replaces only `nodes` — it is the path a create-and-connect
   * takes, where Authoring has just minted a Resource and the projection carrying
   * it arrives with the Edges untouched. `decorated` memoises on that same
   * reference, so React Flow's store keeps the edges it has and the drawn nodes
   * are the only state that moves. Without the node subscription the spend
   * waits on whatever unrelated render happens along — and on nothing at all if
   * none does, which is a caret left on `document.body` and, for `reveal`, a
   * camera that never arrives.
   */
  it('focuses a Resource on the projection that draws it, not the one before', () => {
    const { adapter, continuation } = mountCanvas();
    document.body.focus();

    act(() =>
      continuation.request({
        target: { kind: 'resource', resourceId: RESOURCE_D },
        select: false,
        then: 'focus',
      }),
    );

    // Owed rather than spent: the canvas is not drawing this Resource yet.
    expect(continuation.getState().pending).not.toBeNull();

    act(() => adapter.getState().mergeProjected([...NODES, resourceNode(RESOURCE_D, 1200, 'D')]));

    expect(continuation.getState().pending).toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector(`.react-flow__node[data-id="${RESOURCE_D}"]`),
    );
  });

  /** A Resource already on the canvas resolves on the render that receives it. */
  it('focuses a Resource that is already drawn without waiting', () => {
    const { edgeAuthoring, continuation } = mountCanvas();
    document.body.focus();

    act(() => {
      edgeAuthoring.deleteEdge(SUBJECT);
    });

    expect(continuation.getState().pending).toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector(`.react-flow__node[data-id="${RESOURCE_A}"]`),
    );
  });
});

/**
 * A finished pointer gesture has no draft or surface left, so its refusal is
 * announced at canvas level. It is rare by design, because eligibility refuses
 * most proposals during the drag, but "rare" is not "announced".
 */
describe('announcing a refusal', () => {
  it('shows the reason a finished pointer gesture ran into', () => {
    const { edgeAuthoring } = mountCanvas();
    expect(screen.queryByTestId('edge-gesture-refusal')).not.toBeInTheDocument();

    // A→B already exists in Main, so this is the duplicate rule — reached
    // directly, as a completion whose drag has already ended.
    act(() => {
      edgeAuthoring.beginPointerConnect(RESOURCE_A);
      edgeAuthoring.connect(RESOURCE_A, RESOURCE_B, null);
      edgeAuthoring.endPointerDrag();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'These Resources are already connected in this Graph.',
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
          placedResources: composed.currentSpace().resources,
          newResourceTitle: 'Resource 4',
          enabled: true,
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
          placedResources: composed.currentSpace().resources,
          newResourceTitle: 'Resource 4',
          enabled: true,
          onSelectEdge: NO_OP,
        }),
      { wrapper: ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider> },
    );

    expect(result.current.reactFlowProps).toMatchObject({
      // `null`, not a key pair: deletion is the app's command, answered once by
      // `SpaceCanvas`, so React Flow subscribes no delete key at all.
      deleteKeyCode: null,
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
          placedResources: composed.currentSpace().resources,
          newResourceTitle: 'Resource 4',
          enabled: true,
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
      { id: EDGES[0]!.id, selected: true, focusable: true, reconnectable: true },
      { id: EDGES[1]!.id, selected: false, focusable: false, reconnectable: false },
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
          placedResources: composed.currentSpace().resources,
          newResourceTitle: 'Resource 4',
          enabled: false,
          onSelectEdge: NO_OP,
        }),
      { wrapper: ({ children }) => <ReactFlowProvider>{children}</ReactFlowProvider> },
    );

    expect(result.current.edges.every((edge) => edge.focusable === false)).toBe(true);
    expect(result.current.edges.every((edge) => edge.deletable === false)).toBe(true);
  });
});
