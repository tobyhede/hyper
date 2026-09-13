import { fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import { THING_DRAG_TYPE } from '../src/components/ThingsPopover';
import { authoringAvailability } from '../src/authoring-availability';
import { SpaceCanvas } from '../src/components/SpaceCanvas';
import { composeApp } from '../src/compose-app';
import type { EdgeAuthoring } from '../src/edge-authoring';
import { THING_SIZE } from '../src/thing';
import type { ThingResize } from '../src/render-adapter';

const THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const snapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram',
        kind: 'positioned',
        positions: {
          [THING_ID]: { x: 0, y: 0, open: false },
          [OTHER_THING_ID]: { x: 300, y: 0, open: false },
          [ALIAS_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  things: [
    { id: THING_ID, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: OTHER_THING_ID, document: { title: 'B', kind: 'markdown', body: 'B' } },
    { id: ALIAS_ID, document: { title: 'A again', kind: 'alias', target: THING_ID } },
  ],
});

/**
 * `width`/`height` are declared for the same reason `projectThingNodes` declares
 * them: React Flow keeps an unmeasured node hidden from the accessibility tree,
 * and a headless DOM measures nothing.
 */
const thingNode = (
  title: string,
  id: typeof THING_ID = THING_ID,
  selected = false,
): ThingFlowNode => ({
  id,
  type: 'thing',
  position: { x: 0, y: 0 },
  width: THING_SIZE.width,
  height: THING_SIZE.height,
  selected,
  data: {
    thingId: id,
    title,
    readOnly: false,
    kind: 'markdown',
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
    emphasis: 'equal',
  },
});

interface Harness {
  readonly view: RenderResult;
  readonly openThing: ReturnType<typeof vi.fn>;
  readonly addThing: ReturnType<typeof vi.fn>;
  /** Re-render with Thing authoring on or off, everything else unchanged. */
  readonly setTitleEditing: (enabled: boolean) => void;
  /** Re-render with nothing changed at all, the way a parent's render does. */
  readonly rerender: () => void;
  /** Re-render over a different projection, the way a completed Edit does. */
  readonly setNodes: (next: ThingFlowNode[]) => void;
  /** Every change React Flow proposed to the node array. */
  readonly nodesChanged: ReturnType<typeof vi.fn>;
  /** What the canvas told its parent about a live Thing title edit. */
  readonly titleEditingChanged: ReturnType<typeof vi.fn>;
}

/**
 * An Edge Authoring that answers nothing, so these Thing-authoring tests are not
 * also exercising the Edge lifecycle. Its own behaviour is covered by
 * `edge-authoring.test.ts` and `edge-authoring-react.test.tsx`.
 */
const IDLE_EDGE_STATE = { draft: null, refusal: null } as const;

function inertEdgeAuthoring(): EdgeAuthoring {
  return {
    // One identity, because `useSyncExternalStore` re-renders on every changed
    // snapshot: a fresh object per call is an infinite loop, not a stub detail.
    getState: () => IDLE_EDGE_STATE,
    subscribe: () => () => undefined,
    eligibility: () => ({
      kind: 'refused',
      refusal: { code: 'diagram-required', operation: 'reconnected-edge' },
    }),
    accepts: () => false,
    beginPointerConnect: () => undefined,
    connect: () => undefined,
    createConnectedThing: () => undefined,
    endPointerDrag: () => undefined,
    beginPointerReconnect: () => undefined,
    openEdgeEditor: () => undefined,
    reconnect: () => false,
    deleteEdge: () => false,
    cancelDraft: () => undefined,
    dispose: () => undefined,
  };
}

/** A SpaceCanvas whose title Edit always refuses, so a draft can be left unsettled. */
function mountGraph(
  initialNodes: ThingFlowNode[] = [thingNode('A')],
  onSelectThing: (thingId: string) => void = () => undefined,
  thingResize: ThingResize = {
    beginResize: () => undefined,
    previewResize: () => undefined,
    finishResize: () => undefined,
    cancelResize: () => undefined,
  },
  editable = true,
): Harness {
  const openThing = vi.fn();
  const addThing = vi.fn();
  const titleEditingChanged = vi.fn();
  const nodesChanged = vi.fn();
  let nodes = initialNodes;
  const edgeAuthoring = inertEdgeAuthoring();
  let titleEditing = true;
  const stored = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(new MemorySpaceBackend([stored]), stored);
  const { authoring } = composeApp({ spaceSession });
  const testedAuthoring = {
    ...authoring,
    complete: (completion: Parameters<typeof authoring.complete>[0]) => {
      if (completion.kind === 'opened-thing') openThing(completion.thingId);
      return authoring.complete(completion);
    },
  };
  const graph = () => (
    <ReactFlowProvider>
      <SpaceCanvas
        nodes={nodes}
        edges={[]}
        projectedNodes={null}
        activeThingId={null}
        presenting={false}
        placementReady={editable}
        // The facts a mounted canvas is given, turned into answers by the one
        // module that owns them: `titleEditing` is the chrome rename `App`
        // reports — the surviving fact that withdraws canvas authoring, the
        // creation panes having gone with ADR 0089 — and `editable` is a
        // resolved placement.
        availability={authoringAvailability({
          editable,
          presenting: false,
          editingThingBody: false,
          editingThingTitle: false,
          thingIsOpen: false,
          editingChromeTitle: !titleEditing,
          spaceOnCanvas: true,
          editingEmbeddedDiagram: false,
          creatingSpaceThing: false,
        })}
        onNodesChange={nodesChanged}
        onEdgesChange={() => undefined}
        edgeAuthoring={edgeAuthoring}
        selection={{ kind: 'none' }}
        onSelectThing={onSelectThing}
        onSelectEdge={() => undefined}
        placedThings={[]}
        newThingTitle="Thing 2"
        onAddThing={addThing}
        onAddExistingThing={() => undefined}
        nameOnCreation={null}
        authoring={testedAuthoring}
        spaceSession={spaceSession}
        onBodyEditingChange={() => undefined}
        onTitleEditingChange={titleEditingChanged}
        thingResize={thingResize}
        reportEmbeddedDiagramEditing={() => undefined}
        graphs={[]}
        colorByGraphId={{}}
        activeGraphId={null}
        activeGraphThingIds={new Set()}
      />
    </ReactFlowProvider>
  );
  const view = render(graph());
  return {
    view,
    openThing,
    addThing,
    titleEditingChanged,
    nodesChanged,
    setNodes: (next) => {
      nodes = next;
      view.rerender(graph());
    },
    setTitleEditing: (enabled) => {
      titleEditing = enabled;
      view.rerender(graph());
    },
    rerender: () => view.rerender(graph()),
  };
}

/**
 * By id, not by heading: half these tests run with the title editor open, and
 * then there is no heading to find — `getByRole` throws rather than falling back.
 */
function nodeOf(id: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
  if (node === null) throw new Error(`No node is drawn for ${id}.`);
  return node;
}

/**
 * Leave the graph holding an open title editor on A that has just refused a
 * draft. B is there so the tests can ask what the refusal did to the rest of the
 * graph — A's own affordance is hidden while its title is being renamed.
 */
function refuseTitleEdit(settle: 'enter' | 'blur' = 'enter'): Harness {
  const harness = mountGraph([thingNode('A', THING_ID, true), thingNode('B', OTHER_THING_ID)]);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));
  const input = screen.getByRole('textbox', { name: 'Thing title' });
  fireEvent.change(input, { target: { value: '' } });
  if (settle === 'enter') fireEvent.keyDown(input, { key: 'Enter' });
  else fireEvent.blur(input);
  expect(screen.getByRole('alert')).toHaveTextContent('A Thing title is required.');
  return harness;
}

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

/**
 * Leaving a refused title used to open the Thing underneath, because the click
 * that blurred the field was also the click that selected the Thing — so the
 * graph carried a ref that ate exactly one click to stop it. The field now
 * contains its own events, while the Thing body keeps selection (ADR 0065).
 */
describe('a title Edit the graph refused', () => {
  it('does not open a Thing on the click that blurred it', () => {
    const { openThing } = refuseTitleEdit('blur');

    fireEvent.click(nodeOf(THING_ID));

    expect(openThing).not.toHaveBeenCalled();
  });

  it('leaves the rest of the graph working', () => {
    const { openThing } = refuseTitleEdit('blur');

    fireEvent.click(screen.getByRole('button', { name: 'Open Thing B' }));

    expect(openThing).toHaveBeenCalledWith(OTHER_THING_ID);
  });
});

/**
 * No pointer gesture on a Thing's body opens it (ADR 0036). A Thing centres its
 * title, so a body gesture and the title's rename want the same pixels; opening
 * moved to the Thing's own control and the keyboard instead.
 */
describe('opening a Thing', () => {
  it.each([
    ['a single click', (node: HTMLElement) => fireEvent.click(node)],
    ['a double click', (node: HTMLElement) => fireEvent.doubleClick(node)],
  ])('does not happen on %s of the Thing body', (_name, gesture) => {
    const { openThing } = mountGraph();

    gesture(nodeOf(THING_ID));

    expect(openThing).not.toHaveBeenCalled();
  });

  it('happens from the Thing affordance', () => {
    const { openThing } = mountGraph();

    fireEvent.click(screen.getByRole('button', { name: 'Open Thing A' }));

    expect(openThing).toHaveBeenCalledWith(THING_ID);
  });

  it('leaves the Title control free to rename without Opening the Thing', () => {
    const { openThing } = mountGraph();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));

    expect(screen.getByRole('textbox', { name: 'Thing title' })).toHaveValue('A');
    expect(openThing).not.toHaveBeenCalled();
  });
});

/**
 * `F2` renames the *selected* Thing, so it must not fire while a control has
 * focus — the author is then working on that control, and the selection may
 * belong to another Thing entirely. The graph used to answer the key twice: a
 * React Flow `onKeyDown` branch that ran first and asked nothing about the
 * target, and a window listener that declined for a focused control and never
 * got the chance.
 */
describe('F2 while a control has focus', () => {
  it('does not rename the selected Thing from a control on a different Thing', () => {
    mountGraph([thingNode('A', THING_ID, true), thingNode('B', OTHER_THING_ID)]);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Open Thing B' }), { key: 'F2' });

    expect(screen.queryByRole('textbox', { name: 'Thing title' })).not.toBeInTheDocument();
  });

  it('renames the selected Thing when the key is not typed into a control', () => {
    mountGraph([thingNode('A', THING_ID, true), thingNode('B', OTHER_THING_ID)]);

    fireEvent.keyDown(document.body, { key: 'F2' });

    expect(screen.getByRole('textbox', { name: 'Thing title' })).toHaveValue('A');
  });
});

/**
 * The Thing affordance is a real button in the tab order, revealed by
 * `:focus-visible`, so a keyboard author reaches it without a pointer. Its
 * activation keys are the same two the graph reads as "open this Thing", and the
 * graph's handler sits on the ancestor that sees them first — it opened the Thing
 * for reading and called `preventDefault`, which in a browser also cancels the
 * activation the button never got. The button was unusable by the input it is
 * there for, and its whole point is to open something the plain open does not.
 *
 * Base UI's composite handles Space on keydown, while Enter retains native
 * click activation. jsdom supplies the former but not the latter.
 */
describe.each([
  ['Enter', 'Enter', 'native'],
  ['Space', ' ', 'composite'],
] as const)('%s on the focused Thing affordance', (_name, key, activation) => {
  it('opens the Thing once through the button rather than the graph', () => {
    const { openThing } = mountGraph();
    const button = screen.getByRole('button', { name: 'Open Thing A' });
    button.focus();

    fireEvent.keyDown(button, { key });
    if (activation === 'native') fireEvent.click(button);

    expect(openThing).toHaveBeenCalledTimes(1);
    expect(openThing).toHaveBeenCalledWith(THING_ID);
  });
});

it.each(['Enter', ' '])('opens a focused Alias with %s', (key) => {
  const alias = thingNode('A again', ALIAS_ID);
  alias.data.kind = 'alias';
  const { openThing } = mountGraph([alias]);

  const focusedAlias = nodeOf(ALIAS_ID);
  focusedAlias.focus();
  fireEvent.keyDown(focusedAlias, { key });

  expect(openThing).toHaveBeenCalledWith(ALIAS_ID);
});

describe.each([
  ['Thing', thingNode('A'), THING_ID],
  [
    'Alias',
    {
      ...thingNode('A again', ALIAS_ID),
      data: { ...thingNode('A again', ALIAS_ID).data, kind: 'alias' as const },
    },
    ALIAS_ID,
  ],
] as const)('a focused %s while placement is pending', (_kind, projected, id) => {
  it.each(['Enter', ' '])('does not open with %s', (key) => {
    const { openThing } = mountGraph([projected], undefined, undefined, false);
    const focused = nodeOf(id);
    focused.focus();

    fireEvent.keyDown(focused, { key });

    expect(openThing).not.toHaveBeenCalled();
  });

  it('does not announce authoring keyboard commands', () => {
    mountGraph([projected], undefined, undefined, false);

    expect(nodeOf(id)).toHaveAccessibleDescription(
      'This Thing is unavailable while placement is pending.',
    );
  });
});

describe('the Thing affordance', () => {
  it('opens the Thing rather than renaming its title on the graph', () => {
    const { openThing } = mountGraph();

    fireEvent.click(screen.getByRole('button', { name: 'Open Thing A' }));

    expect(openThing).toHaveBeenCalledWith(THING_ID);
    expect(screen.queryByRole('textbox', { name: 'Thing title' })).not.toBeInTheDocument();
  });
});

describe('withdrawing canvas authoring from an Expanded Thing', () => {
  it('withdraws body editing and resize through the same complete gate', () => {
    const expanded = thingNode('A', THING_ID, true);
    expanded.data.expanded = true;
    expanded.data.body = '# A';
    const { view, setTitleEditing } = mountGraph([expanded]);

    expect(screen.getByRole('button', { name: 'Edit Markdown source of A' })).toBeVisible();
    expect(view.container.querySelector('.react-flow__resize-control')).toBeInTheDocument();

    setTitleEditing(false);

    expect(screen.queryByRole('button', { name: 'Edit Markdown source of A' })).toBeNull();
    expect(view.container.querySelector('.react-flow__resize-control')).toBeNull();
  });

  it.each(['Enter', ' '])(
    'does not Open a Thing with %s while its body is being edited',
    async (key) => {
      const expanded = thingNode('A', THING_ID, true);
      expanded.data.expanded = true;
      expanded.data.body = '# A';
      const { openThing } = mountGraph([expanded]);
      fireEvent.click(screen.getByRole('button', { name: 'Edit Markdown source of A' }));

      const editor = await screen.findByRole('textbox', { name: 'Markdown source of A' });
      editor.focus();
      expect(editor).toBe(document.activeElement);
      fireEvent.keyDown(editor, { key });

      expect(openThing).not.toHaveBeenCalled();
    },
  );
});

test('reports a live Thing title edit so Space chrome can withdraw', () => {
  const { titleEditingChanged } = mountGraph([thingNode('A', THING_ID, true)]);

  fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));

  expect(titleEditingChanged).toHaveBeenLastCalledWith(true);
});

test('returns Space chrome when it unmounts over a live Thing title edit', () => {
  const { titleEditingChanged, view } = mountGraph([thingNode('A', THING_ID, true)]);

  fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));
  expect(titleEditingChanged).toHaveBeenLastCalledWith(true);
  view.unmount();

  expect(titleEditingChanged).toHaveBeenLastCalledWith(false);
});

/**
 * React Flow's control begins its drag through real d3-drag, which reads
 * `event.view.document` on the native mouse event — and jsdom's own `MouseEvent`
 * constructor rejects this environment's ambient `window` as a `view` even
 * though it is the real one, so the event is built and dispatched directly
 * rather than through `fireEvent`, which goes through that same constructor.
 */
function mouseEventInView(type: 'mousedown' | 'mousemove', clientX = 0, clientY = 0): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(event, 'view', { value: window, configurable: true });
  return event;
}

/**
 * A touch gesture on that same control, built by hand for a neighbouring
 * reason: jsdom has `TouchEvent` but no `Touch` constructor, so a `TouchInit`
 * cannot be filled. The two lists the gesture is read through are installed on
 * the event afterwards — `changedTouches`, which d3-drag identifies and
 * positions the gesture from, and `touches`, which is where React Flow's
 * `getEventPosition` looks once it sees no `clientX` on the event itself.
 */
function touchEventOnControl(
  type: 'touchstart' | 'touchmove' | 'touchend',
  clientX = 0,
  clientY = 0,
): TouchEvent {
  const event = new TouchEvent(type, { bubbles: true, cancelable: true });
  const touch = { identifier: 0, clientX, clientY };
  Object.defineProperty(event, 'changedTouches', { value: [touch], configurable: true });
  Object.defineProperty(event, 'touches', { value: [touch], configurable: true });
  return event;
}

/** The one bottom-right control the Open Thing draws. */
function resizeControl(): Element {
  const control = document.querySelector('.react-flow__resize-control.bottom.right');
  if (control === null) throw new Error('No resize control is drawn for Thing A.');
  return control;
}

/** Press that control. */
function pressResizeControl(): void {
  resizeControl().dispatchEvent(mouseEventInView('mousedown'));
}

/**
 * One frame of a touch gesture. Unlike the mouse, every frame goes to the
 * control element: d3-drag keeps a touch gesture's `touchmove`/`touchend` on
 * the element it began on, and moves only the mouse's to the window.
 */
function touchResizeControl(
  type: 'touchstart' | 'touchmove' | 'touchend',
  clientX = 0,
  clientY = 0,
): void {
  resizeControl().dispatchEvent(touchEventOnControl(type, clientX, clientY));
}

/** Carry a pressed control to a pointer position, the way one drag frame does. */
function dragResizeControlTo(clientX: number, clientY: number): void {
  window.dispatchEvent(mouseEventInView('mousemove', clientX, clientY));
}

/**
 * Resize is Thing behaviour rather than kind behaviour (ADR 0066): a Thing owns
 * the surrounding rect and the resize interaction, while a kind owns only what
 * fills an Open front. Alias has no Open front yet, but that is content
 * ownership and must not read back as a second resize gate.
 */
describe('resize belongs to Thing rather than to a Thing kind', () => {
  it('offers a resize operation to an Open Thing whatever its kind', () => {
    const alias = thingNode('Alias', THING_ID, false);
    alias.data.kind = 'alias';
    alias.data.expanded = true;
    const { view } = mountGraph([alias]);

    expect(view.container.querySelector('.react-flow__resize-control')).toBeInTheDocument();
  });

  it('offers no resize operation to a Closed Thing', () => {
    const { view } = mountGraph([thingNode('A')]);

    expect(view.container.querySelector('.react-flow__resize-control')).toBeNull();
  });

  /**
   * `onResizeStart` is what the composition put on the node's data
   * (`projection.ts`'s `ThingNodeData.resize`); a mouse press on the drawn
   * control is what invokes it, through the real `NodeResizeControl` rather
   * than a stand-in for it. One drag both selects the Thing and grows it —
   * never a separate click first.
   */
  it('routes one resize lifecycle from the control to the canvas capability', () => {
    const expanded = thingNode('A', THING_ID, false);
    expanded.data.expanded = true;
    expanded.data.body = '# A';
    const onSelectThing = vi.fn();
    const thingResize: ThingResize = {
      beginResize: vi.fn(),
      previewResize: vi.fn(),
      finishResize: vi.fn(),
      cancelResize: vi.fn(),
    };
    mountGraph([expanded], onSelectThing, thingResize);

    pressResizeControl();

    expect(onSelectThing).toHaveBeenCalledWith(THING_ID);
    expect(thingResize.beginResize).toHaveBeenCalledWith(THING_ID);

    dragResizeControlTo(80, 60);
    expect(thingResize.previewResize).toHaveBeenCalledWith(THING_ID, expect.any(Object));

    fireEvent.pointerUp(window);
    expect(thingResize.finishResize).toHaveBeenCalledWith(THING_ID);
  });

  /**
   * The whole gesture reaches the capability and proposes nothing to React
   * Flow's own node array.
   *
   * `NodeResizeControl` asks `shouldResize` before it emits anything, and the
   * Thing answers `false` to every frame while still handing the proposed rect
   * on (`ThingNode`). So the only producer of a `dimensions` change never runs,
   * and there is no node-only rect for anything downstream to have to reject:
   * the next projected draft publishes the resized Thing, its displaced
   * neighbours, handles and Edges together.
   */
  it('proposes no node change to React Flow while it resizes', () => {
    const expanded = thingNode('A', THING_ID, false);
    expanded.data.expanded = true;
    const thingResize: ThingResize = {
      beginResize: vi.fn(),
      previewResize: vi.fn(),
      finishResize: vi.fn(),
      cancelResize: vi.fn(),
    };
    const { nodesChanged } = mountGraph([expanded], () => undefined, thingResize);
    nodesChanged.mockClear();

    pressResizeControl();
    dragResizeControlTo(80, 60);
    dragResizeControlTo(160, 120);
    fireEvent.pointerUp(window);

    expect(thingResize.previewResize).toHaveBeenCalledTimes(2);
    expect(nodesChanged).not.toHaveBeenCalled();
  });

  it('routes loss of an active resize to cancellation', () => {
    const expanded = thingNode('A', THING_ID, false);
    expanded.data.expanded = true;
    const thingResize: ThingResize = {
      beginResize: vi.fn(),
      previewResize: vi.fn(),
      finishResize: vi.fn(),
      cancelResize: vi.fn(),
    };
    mountGraph([expanded], () => undefined, thingResize);
    pressResizeControl();

    fireEvent.blur(window);

    expect(thingResize.cancelResize).toHaveBeenCalledWith(THING_ID);
    expect(thingResize.finishResize).not.toHaveBeenCalled();
  });

  /**
   * A gesture outlives the re-renders the resize itself causes.
   *
   * Touch is what proves it, and ADR 0066 makes resizing pointer *and* touch.
   * `NodeResizeControl` lists its resize callbacks among an effect's
   * dependencies and tears the d3-drag binding down with
   * `selection.on('.drag', null)` whenever they change — which strips every
   * `.drag` listener the control element carries. For a touch gesture that is
   * `touchmove` and `touchend`, which d3-drag leaves on the element for the
   * whole gesture, so the drag dies on its first frame; a mouse gesture happens
   * to survive only because d3-drag moved its two to the window at `mousedown`.
   *
   * The re-render is not hypothetical: the render adapter republishes the
   * projection on every preview frame, which is exactly the publish staged here
   * between the first frame and the second.
   */
  it('keeps a touch gesture alive across the projection its own frames publish', () => {
    const expanded = thingNode('A', THING_ID, false);
    expanded.data.expanded = true;
    const thingResize: ThingResize = {
      beginResize: vi.fn(),
      previewResize: vi.fn(),
      finishResize: vi.fn(),
      cancelResize: vi.fn(),
    };
    const { setNodes } = mountGraph([expanded], () => undefined, thingResize);

    touchResizeControl('touchstart');
    expect(thingResize.beginResize).toHaveBeenCalledWith(THING_ID);

    const republished = thingNode('A', THING_ID, false);
    republished.data.expanded = true;
    setNodes([republished]);

    touchResizeControl('touchmove', 80, 60);

    expect(thingResize.previewResize).toHaveBeenCalledWith(THING_ID, expect.any(Object));
  });
});

/**
 * `C` is the only unmodified authoring shortcut there is, so the whole of what
 * makes it safe is *where* it is answered: on React Flow's own wrapper, which a
 * key pressed anywhere else in the app never reaches.
 */
describe('the C shortcut', () => {
  it('adds a Thing from a focused Thing', () => {
    const { addThing } = mountGraph();

    fireEvent.keyDown(nodeOf(THING_ID), { key: 'c' });

    expect(addThing).toHaveBeenCalledTimes(1);
  });

  /**
   * A `c` typed into a field is a letter, not a command. The inline editor stops
   * its own key events before they reach the graph, which is why this asserts
   * through the editor rather than through a bare input: the guard covers
   * whatever text entry the canvas gains next.
   */
  it('is a letter while the caret is in the title editor', () => {
    const { addThing } = mountGraph();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Thing title' }), { key: 'c' });

    expect(addThing).not.toHaveBeenCalled();
  });

  /**
   * A modifier makes the key a browser or OS shortcut, and a repeat is one press
   * held down. Neither is a command, and the default stays with whoever else
   * wanted it.
   */
  it('ignores a modified press and a key repeat', () => {
    const { addThing } = mountGraph();
    const node = nodeOf(THING_ID);

    fireEvent.keyDown(node, { key: 'c', metaKey: true });
    fireEvent.keyDown(node, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(node, { key: 'c', repeat: true });
    fireEvent.keyDown(node, { key: 'c', altKey: true });
    // Shift is the one a case-insensitive match lets through by construction:
    // the press arrives as `C`, which is exactly what an unmodified press under
    // Caps Lock looks like. `aria-keyshortcuts="C"` announces the unmodified
    // key, and this is the guard that makes that announcement true.
    fireEvent.keyDown(node, { key: 'C', shiftKey: true });

    expect(addThing).not.toHaveBeenCalled();
  });

  /**
   * And Caps Lock is not a modifier: it changes the character, never `shiftKey`,
   * so the shortcut has to keep working with it on.
   */
  it('answers an unmodified C typed with Caps Lock on', () => {
    const { addThing } = mountGraph();

    fireEvent.keyDown(nodeOf(THING_ID), { key: 'C' });

    expect(addThing).toHaveBeenCalledTimes(1);
  });

  it('is withdrawn along with every other Thing authoring control', () => {
    const { addThing, setTitleEditing } = mountGraph();

    setTitleEditing(false);
    fireEvent.keyDown(nodeOf(THING_ID), { key: 'c' });

    expect(addThing).not.toHaveBeenCalled();
  });

  /**
   * The canvas zoom controls render *inside* the wrapper this shortcut is
   * bound to, so its buttons are somewhere a `c` can be pressed while the graph
   * is still the event's path. A button is not text entry, but it is a control
   * answering keys of its own, and the F2 guard beside this one already says so
   * — the two disagreed, and the narrower one is a canvas that adds a Thing when
   * the author meant to press Zoom in.
   */
  it.each(['Zoom in', 'Zoom out', 'Fit view'] as const)(
    'is a keypress on the %s control rather than a command',
    async (name) => {
      const { addThing } = mountGraph();

      fireEvent.keyDown(await screen.findByRole('button', { name }), { key: 'c' });

      expect(addThing).not.toHaveBeenCalled();
    },
  );

  /**
   * The shipped slider, not a stand-in for one.
   *
   * Found by its label rather than its role because Base UI keeps a thumb
   * `visibility: hidden` until it has measured the track, and jsdom measures
   * nothing — so the real control is absent from the accessibility tree here
   * while being an ordinary visible slider in a browser. What is asserted is
   * the mechanism that excludes it: the `.nokey` its Panel already carries for
   * React Flow's own subscriptions, which the canvas guard now reads too.
   */
  it('is a keypress on the zoom slider rather than a command', async () => {
    const { addThing } = mountGraph();
    const slider = await screen.findByLabelText('Zoom');
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider.closest('.nokey')).not.toBeNull();

    fireEvent.keyDown(slider, { key: 'c' });

    expect(addThing).not.toHaveBeenCalled();
  });
});

/**
 * React Flow still subscribes keys on `document` — just not the delete pair.
 *
 * `deleteKeyCode` is `null`, so `useKeyPress` short-circuits for it, but the pan
 * and zoom *activation* codes keep their default Space and Meta and are live.
 * That is what makes the re-render assertion below worth keeping and what makes
 * the flat "no keydown at all" reading of it wrong: `useKeyPress` has the key
 * code in its listener effect's dependency array, so a fresh array per render
 * re-attaches `keydown`/`keyup` on `document` for every code still subscribed.
 */
describe("React Flow's document key subscriptions", () => {
  it('does not re-subscribe them on an unchanged re-render', () => {
    const { rerender } = mountGraph();
    const listen = vi.spyOn(document, 'addEventListener');

    rerender();

    expect(listen.mock.calls.filter(([type]) => type === 'keydown')).toEqual([]);
  });

  it('does not re-subscribe the F2 listener on an unrelated unchanged re-render', () => {
    const { rerender } = mountGraph();
    const listen = vi.spyOn(window, 'addEventListener');

    rerender();

    expect(listen.mock.calls.filter(([type]) => type === 'keydown')).toEqual([]);
  });
});

/**
 * Opening is a command of the *canvas*, and a Thing now contains the text control
 * its content is edited in. The `C` shortcut already asks this question; the
 * open key did not, and a Space typed into an Expanded Thing's editor is a
 * character rather than a request to open the Thing it is inside.
 *
 * Modelled with a plain `contenteditable` rather than the real editor because
 * `MarkdownSourceEditor` is reached by dynamic import: the rule under test is
 * about where the key came from, not which component put it there.
 */
describe.each([
  ['Enter', 'Enter'],
  ['Space', ' '],
] as const)('%s typed into a text control inside a Thing', (_name, key) => {
  it('is a keypress rather than a request to open that Thing', () => {
    const { openThing } = mountGraph();
    const field = document.createElement('div');
    field.setAttribute('contenteditable', 'true');
    nodeOf(THING_ID).append(field);

    fireEvent.keyDown(field, { key });

    expect(openThing).not.toHaveBeenCalled();
  });
});

describe('dragging a Thing from the Things list over canvas chrome', () => {
  it('does not offer a drop the pane will refuse', () => {
    mountGraph();
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    expect(zoomIn.closest('.react-flow__pane')).toBeNull();

    const dataTransfer = {
      types: [THING_DRAG_TYPE],
      dropEffect: 'none',
      setData: () => undefined,
      getData: () => '',
    };
    fireEvent.dragOver(zoomIn, { dataTransfer });

    expect(dataTransfer.dropEffect).toBe('none');
  });
});
