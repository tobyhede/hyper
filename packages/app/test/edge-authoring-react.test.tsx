import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { Position, ReactFlowProvider, type Edge } from '@xyflow/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { graphRenderEdgeId } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { ROUTED_EDGE_TYPE, type ResourceFlowNode } from '@project/react-flow-adapter';
import { Toolbar, ToolbarButton } from '@project/ui';
import { authoringAvailability } from '../src/authoring-availability';
import { RESOURCES_TRIGGER } from '../src/components/command-dock-triggers';
import { composeApp, type EdgeCollaborators } from '../src/compose-app';
import type { ConnectionCompletion } from '../src/connection-completion';
import { useEdgeAuthoring } from '../src/edge-authoring-react';
import { CanvasContinuation } from '../src/components/CanvasContinuation';
import { SpaceCanvas } from '../src/components/SpaceCanvas';
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

/** The projection with the Active Graph's Edge titled. */
const titled = (edges: readonly Edge[], title: string, hidden = false): Edge[] =>
  edges.map((edge, index) => {
    if (index !== 0) return edge;
    const data = { ...edge.data, title };
    return { ...edge, data: hidden ? { ...data, titleHidden: true } : data };
  });

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

beforeAll(() => {
  // jsdom implements no hit-testing, and a connection release asks for one.
  // Answering `null` is what a release over nothing really produces, which
  // `elementDropTargetOf` reads as off-canvas.
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
  commandOutcomes,
  currentSpace,
  authoring,
  session,
  covered,
  presenting,
}: Pick<
  ReturnType<typeof compose>,
  | 'adapter'
  | 'edgeAuthoring'
  | 'continuation'
  | 'commandOutcomes'
  | 'currentSpace'
  | 'authoring'
  | 'session'
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
        commandOutcomes={commandOutcomes}
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
        onPlaceSpace={() => undefined}
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
        mapId={MAP_ID}
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

const toolbarOf = (name: string): HTMLElement =>
  screen.getByRole('toolbar', { name: `Edge ${name}` });

describe('the Edge toolbar', () => {
  it('appears on the selected Edge alone, named for its endpoints while it has no Title', () => {
    const { adapter } = mountCanvas();
    expect(screen.queryByRole('toolbar', { name: 'Edge A → B' })).not.toBeInTheDocument();

    act(() => adapter.getState().selectEdge(SUBJECT));

    expect(toolbarOf('A → B')).toBeVisible();
    expect(screen.queryByRole('toolbar', { name: 'Edge B → C' })).not.toBeInTheDocument();
  });

  it('offers Edit, the Title eye and Delete as one named group, the eye disabled with no Title', () => {
    const { adapter } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    const group = within(toolbarOf('A → B')).getByRole('group', { name: 'Edge commands' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Edit Edge A → B', 'Hide Title A → B', 'Delete Edge A → B']);
    expect(within(group).getByRole('button', { name: 'Hide Title A → B' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('deletes the Edge from its Graph and leaves the Graph standing', () => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Edge A → B' }));

    expect(graphsOf(session.getState().working)).toEqual([
      { id: GRAPH_ID, title: 'Main', edges: [] },
      { id: OTHER_GRAPH_ID, title: 'Aside', edges: [ASIDE_EDGE] },
    ]);
  });

  it('writes the Title from Edit, completes on Enter, and returns focus to the Title', async () => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Edge A → B' }));
    const field = screen.getByRole('textbox', { name: 'Edge Title' });
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: 'depends on' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([
      { ...EDGE, title: 'depends on' },
    ]);
    // The projection lags the Edit by a publication.
    act(() => adapter.getState().syncProjection(NODES, titled(EDGES, 'depends on')));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit Title depends on' })).toHaveFocus(),
    );
    expect(toolbarOf('depends on')).toBeVisible();
  });

  it('cancels on Escape, writing nothing, and returns focus to the Edge it had no Title for', async () => {
    const { adapter, session, edgeAuthoring } = mountCanvas();
    const before = session.getState().working;
    act(() => adapter.getState().selectEdge(SUBJECT));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Edge A → B' }));

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edge Title' }), { key: 'Escape' });

    expect(session.getState().working).toBe(before);
    expect(edgeAuthoring.getState().draft).toBeNull();
    await waitFor(() => expect(edgeElement(EDGES[0]!.id)).toHaveFocus());
  });

  it('completes on blur without taking focus back to the Title', () => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Edge A → B' }));
    const field = screen.getByRole('textbox', { name: 'Edge Title' });
    fireEvent.change(field, { target: { value: 'depends on' } });

    fireEvent.blur(field);
    act(() => adapter.getState().syncProjection(NODES, titled(EDGES, 'depends on')));

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([
      { ...EDGE, title: 'depends on' },
    ]);
    expect(screen.getByRole('button', { name: 'Edit Title depends on' })).not.toHaveFocus();
  });

  /**
   * The eye reads the projected Title, which lags the draft: a press that
   * blurred an emptied field would complete the clear, then hide a Title the
   * Edge no longer has.
   */
  it('makes the eye unavailable while the Title is being written, keeping the caret', () => {
    const { adapter, session, authoring } = mountCanvas();
    authoring.complete({ kind: 'titled-edge', ...SUBJECT, title: 'depends on' });
    act(() => adapter.getState().syncProjection(NODES, titled(EDGES, 'depends on')));
    act(() => adapter.getState().selectEdge(SUBJECT));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Edge depends on' }));
    const field = screen.getByRole('textbox', { name: 'Edge Title' });
    fireEvent.change(field, { target: { value: '' } });

    const eye = screen.getByRole('button', { name: 'Hide Title depends on' });
    expect(eye).toHaveAttribute('aria-disabled', 'true');
    // `ladle-e2e/edge-toolbar.spec.ts` holds the caret staying in a browser.
    expect(fireEvent.pointerDown(eye)).toBe(false);
    fireEvent.click(eye);

    expect(field).toBeInTheDocument();
    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([
      { ...EDGE, title: 'depends on' },
    ]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('begins writing from the revealed Title itself', () => {
    const { adapter, edgeAuthoring } = mountCanvas();
    act(() => adapter.getState().syncProjection(NODES, titled(EDGES, 'depends on')));
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title depends on' }));

    expect(edgeAuthoring.getState().draft).toEqual({ kind: 'title', ...SUBJECT });
    expect(screen.getByRole('textbox', { name: 'Edge Title' })).toHaveValue('depends on');
  });

  it('draws a Title at rest, fitted to its Edge, with the whole Title in its tooltip', () => {
    const { adapter } = mountCanvas();
    act(() => adapter.getState().syncProjection(NODES, titled(EDGES, 'depends on')));

    const title = screen.getByTitle('depends on');
    expect(title).toHaveTextContent('depends on');
    // Not a control until the Edge is revealed.
    expect(screen.queryByRole('button', { name: 'Edit Title depends on' })).toBeNull();
    expect(title.style.maxWidth).toMatch(/px$/u);
  });

  it("draws only the Active Graph's Titles", () => {
    const { adapter } = mountCanvas();
    act(() =>
      adapter
        .getState()
        .syncProjection(NODES, [
          EDGES[0]!,
          { ...EDGES[1]!, data: { ...EDGES[1]!.data, title: 'aside' } },
        ]),
    );

    expect(screen.queryByTitle('aside')).toBeNull();
  });

  it('hides a Title at rest from the eye, and dims it while the Edge is revealed', () => {
    const { adapter, session, authoring } = mountCanvas();
    authoring.complete({ kind: 'titled-edge', ...SUBJECT, title: 'depends on' });
    act(() => adapter.getState().syncProjection(NODES, titled(EDGES, 'depends on')));
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.click(screen.getByRole('button', { name: 'Hide Title depends on' }));

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([
      { ...EDGE, title: 'depends on', titleHidden: true },
    ]);
    act(() => adapter.getState().syncProjection(NODES, titled(EDGES, 'depends on', true)));
    expect(screen.getByRole('button', { name: 'Show Title depends on' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit Title depends on' })).toHaveAttribute(
      'data-hidden',
      'true',
    );

    act(() => adapter.getState().clearSelection());
    expect(screen.queryByTitle('depends on')).toBeNull();
  });

  /**
   * Hiding a missing Title is unreachable from the disabled eye, so it is asked
   * of Edge Authoring directly, as a stale toolbar would.
   */
  it('reports a refused command in one alert region under the toolbar, until the selection moves', () => {
    const { adapter, edgeAuthoring } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    act(() => {
      edgeAuthoring.setTitleHidden(SUBJECT, true);
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Give this Edge a title before hiding it.');
    expect(toolbarOf('A → B').parentElement).toContainElement(alert);

    act(() => adapter.getState().clearSelection());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps a refused Title open with its reason in that same region', () => {
    const { adapter, edgeAuthoring } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Edge A → B' }));
    const field = screen.getByRole('textbox', { name: 'Edge Title' });

    // A text field strips line breaks, so the one-line rule is reached directly.
    act(() => {
      edgeAuthoring.completeTitle('two\nlines');
    });

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('An Edge title must be one line.');
    expect(field).toBeInTheDocument();
  });

  it('moves focus from the Edge into its toolbar on Enter, and back on Escape', () => {
    mountCanvas();
    const edge = edgeElement(EDGES[0]!.id);
    act(() => edge.focus());

    fireEvent.keyDown(edge, { key: 'Enter' });
    const edit = screen.getByRole('button', { name: 'Edit Edge A → B' });
    expect(edit).toHaveFocus();

    fireEvent.keyDown(edit, { key: 'Escape' });
    expect(edge).toHaveFocus();
  });

  /** The delay lets the pointer cross from the line to the toolbar. */
  it('reveals the toolbar on hover and releases it a moment after the pointer leaves', () => {
    vi.useFakeTimers();
    try {
      mountCanvas();
      const edge = edgeElement(EDGES[0]!.id);

      fireEvent.mouseEnter(edge);
      expect(toolbarOf('A → B')).toBeVisible();

      fireEvent.mouseLeave(edge);
      expect(toolbarOf('A → B')).toBeVisible();
      fireEvent.pointerEnter(toolbarOf('A → B'));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(toolbarOf('A → B')).toBeVisible();

      fireEvent.pointerLeave(toolbarOf('A → B'));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByRole('toolbar', { name: 'Edge A → B' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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

  it.each(DELETE_KEYS)('leaves the Edge standing when %s reaches its Title field', (key) => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Edge A → B' }));

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edge Title' }), { key });

    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([EDGE]);
  });

  it.each(DELETE_KEYS)('leaves the Edge standing when %s reaches its toolbar', (key) => {
    const { adapter, session } = mountCanvas();
    act(() => adapter.getState().selectEdge(SUBJECT));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Edge A → B' }), { key });

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
 * The one claim the canvas adapter owns: it calls `.focus()` on the element the
 * pending continuation resolves to, once that element is drawn.
 *
 * Which continuations stay owed is `continuation.test.ts`'s, in the node
 * environment. What only a tree can show is the resolution itself — a domain
 * subject becoming a React Flow element — and the timing that makes it worth
 * having: an Edge continuation is published synchronously with the Edit, but
 * the projection carrying a new Edge arrives a strategy later, so an adapter
 * that spent it on the render that received it would land focus anywhere but
 * the Edge the Edit produced.
 */
describe('spending a continuation on the canvas', () => {
  const DRAWN = { graphId: GRAPH_ID, edge: { from: RESOURCE_A, to: RESOURCE_C } } as const;
  const drawnFlowEdge = flowEdge(GRAPH_ID, RESOURCE_A, RESOURCE_C);
  const focusDrawn = { target: { kind: 'edge', ...DRAWN }, select: false, then: 'focus' } as const;

  it('focuses the Edge on the projection that draws it, not the one before', () => {
    // The real canvas, because resolving the continuation is a DOM lookup: the
    // element only exists once React Flow has drawn the Edge.
    const { authoring, adapter, continuation } = mountCanvas();
    document.body.focus();

    act(() => {
      authoring.complete({ kind: 'connected-resources', from: RESOURCE_A, to: RESOURCE_C });
      continuation.request(focusDrawn);
    });

    // The Edit has completed, but the projection does not hold the Edge yet —
    // so the continuation is still owed rather than spent on the canvas.
    expect(continuation.getState().pending).toEqual(focusDrawn);

    // One publication, and the new Edge is an element React Flow has
    // never drawn — it draws that a commit later, from a store it syncs in an
    // effect of its own. `CanvasContinuation` subscribes to those drawn Edges
    // for exactly this reason, so the spend does not wait on an unrelated
    // render to come along.
    act(() => adapter.getState().syncProjection(NODES, [...EDGES, drawnFlowEdge]));

    expect(continuation.getState().pending).toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector(`.react-flow__edge[data-id="${drawnFlowEdge.id}"]`),
    );
  });

  /**
   * **The selection survives the focus the continuation spends on it.** Focus
   * lands on an Edge element whose `onFocus` writes the subject it draws back
   * into the selection, so the element must be the new Edge's own, not one a
   * departed Edge left behind.
   */
  it('leaves the Edge it focuses selected, not only focused', () => {
    const { authoring, adapter, continuation } = mountCanvas();
    document.body.focus();

    act(() => {
      authoring.complete({ kind: 'connected-resources', from: RESOURCE_A, to: RESOURCE_C });
      adapter.getState().selectEdge(DRAWN);
      continuation.request(focusDrawn);
    });
    act(() => adapter.getState().syncProjection(NODES, [...EDGES, drawnFlowEdge]));

    // After the spend, because focus landing could take the selection with it.
    expect(continuation.getState().pending).toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector(`.react-flow__edge[data-id="${drawnFlowEdge.id}"]`),
    );
    expect(adapter.getState().selection).toEqual({ kind: 'edge', ...DRAWN });
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
      // No Edge's end can be moved; focusability is per-Edge, Active Graph only.
      edgesReconnectable: false,
      edgesFocusable: false,
      // Version 1 authors one element at a time.
      multiSelectionKeyCode: null,
      selectionKeyCode: null,
      selectionOnDrag: false,
    });
  });

  it('selects and focuses the Active Graph Edge alone, and reconnects none', () => {
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
      { id: EDGES[0]!.id, selected: true, focusable: true, reconnectable: undefined },
      { id: EDGES[1]!.id, selected: false, focusable: false, reconnectable: undefined },
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
