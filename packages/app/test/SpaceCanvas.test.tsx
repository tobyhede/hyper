import { fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema } from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { SpaceCanvas } from '../src/components/SpaceCanvas';
import { composeApp } from '../src/compose-app';
import type { EdgeAuthoring } from '../src/edge-authoring';
import { CARD_SIZE } from '../src/card';
import type { CardResize } from '../src/render-adapter';

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const snapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: {
          [CARD_ID]: { x: 0, y: 0, open: false },
          [OTHER_CARD_ID]: { x: 300, y: 0, open: false },
          [ALIAS_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultRenderer: LAYOUT_ID,
  },
  cards: [
    { id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: OTHER_CARD_ID, document: { title: 'B', kind: 'markdown', body: 'B' } },
    { id: ALIAS_ID, document: { title: 'A again', kind: 'alias', target: CARD_ID } },
  ],
});

/**
 * `width`/`height` are declared for the same reason `projectCardNodes` declares
 * them: React Flow keeps an unmeasured node hidden from the accessibility tree,
 * and a headless DOM measures nothing.
 */
const cardNode = (title: string, id: typeof CARD_ID = CARD_ID, selected = false): CardFlowNode => ({
  id,
  type: 'card',
  position: { x: 0, y: 0 },
  width: CARD_SIZE.width,
  height: CARD_SIZE.height,
  selected,
  data: {
    cardId: id,
    title,
    kind: 'markdown',
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: null,
    activeGraphColor: '#8a94a6',
    emphasis: 'equal',
    sourceHandles: [],
    targetHandles: [],
  },
});

interface Harness {
  readonly view: RenderResult;
  readonly openCard: ReturnType<typeof vi.fn>;
  readonly openAlias: ReturnType<typeof vi.fn>;
  readonly addCard: ReturnType<typeof vi.fn>;
  /** Re-render with Card authoring on or off, everything else unchanged. */
  readonly setTitleEditing: (enabled: boolean) => void;
  /** Re-render with nothing changed at all, the way a parent's render does. */
  readonly rerender: () => void;
  /** Re-render over a different projection, the way a completed Edit does. */
  readonly setNodes: (next: CardFlowNode[]) => void;
  /** Every change React Flow proposed to the node array. */
  readonly nodesChanged: ReturnType<typeof vi.fn>;
}

/**
 * An Edge Authoring that answers nothing, so these Card-authoring tests are not
 * also exercising the Edge lifecycle. Its own behaviour is covered by
 * `edge-authoring.test.ts` and `edge-authoring-react.test.tsx`.
 */
const IDLE_EDGE_STATE = { draft: null, refusal: null, focusRequest: null } as const;

function inertEdgeAuthoring(): EdgeAuthoring {
  return {
    // One identity, because `useSyncExternalStore` re-renders on every changed
    // snapshot: a fresh object per call is an infinite loop, not a stub detail.
    getState: () => IDLE_EDGE_STATE,
    subscribe: () => () => undefined,
    eligibility: () => ({
      kind: 'refused',
      refusal: { code: 'layout-required', operation: 'reconnected-edge' },
    }),
    accepts: () => false,
    beginPointerConnect: () => undefined,
    connect: () => null,
    createConnectedCard: () => null,
    endPointerDrag: () => null,
    beginPointerReconnect: () => undefined,
    openEdgeEditor: () => undefined,
    reconnect: () => false,
    deleteEdge: () => false,
    cancelDraft: () => undefined,
    takeFocusRequest: () => null,
    dispose: () => undefined,
  };
}

/** A SpaceCanvas whose title Edit always refuses, so a draft can be left unsettled. */
function mountGraph(
  initialNodes: CardFlowNode[] = [cardNode('A')],
  onSelectCard: (cardId: string) => void = () => undefined,
  cardResize: CardResize = {
    beginResize: () => undefined,
    previewResize: () => undefined,
    finishResize: () => undefined,
    cancelResize: () => undefined,
  },
): Harness {
  const openCard = vi.fn();
  const openAlias = vi.fn();
  const addCard = vi.fn();
  const nodesChanged = vi.fn();
  let nodes = initialNodes;
  const edgeAuthoring = inertEdgeAuthoring();
  let titleEditing = true;
  const stored = { snapshot, revision: 0n, exportedRevision: null };
  const spaceSession = openSpaceSession(new MemorySpaceBackend([stored]), stored);
  const { authoring, navigation } = composeApp({ spaceSession });
  const testedAuthoring = {
    ...authoring,
    complete: (completion: Parameters<typeof authoring.complete>[0]) => {
      if (completion.kind === 'opened-card') openCard(completion.cardId);
      return authoring.complete(completion);
    },
  };
  const graph = () => (
    <ReactFlowProvider>
      <SpaceCanvas
        nodes={nodes}
        edges={[]}
        projectedNodes={null}
        activeCardId={null}
        presenting={false}
        editable={true}
        titleEditingEnabled={titleEditing}
        onNodesChange={nodesChanged}
        onEdgesChange={() => undefined}
        edgeAuthoring={edgeAuthoring}
        selection={{ kind: 'none' }}
        onSelectCard={onSelectCard}
        onSelectEdge={() => undefined}
        subjectCards={[]}
        newCardTitle="Card 2"
        onAddCard={addCard}
        nameOnCreation={null}
        authoring={testedAuthoring}
        spaceSession={spaceSession}
        onOpenAlias={(cardId) => {
          openAlias(cardId);
          navigation.openCard(cardId);
        }}
        onBodyEditingChange={() => undefined}
        cardResize={cardResize}
        graphs={[]}
        colorByGraphId={{}}
        activeGraphId={null}
        activeGraphCardIds={new Set()}
      />
    </ReactFlowProvider>
  );
  const view = render(graph());
  return {
    view,
    openCard,
    openAlias,
    addCard,
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
  const harness = mountGraph([cardNode('A', CARD_ID, true), cardNode('B', OTHER_CARD_ID)]);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));
  const input = screen.getByRole('textbox', { name: 'Card title' });
  fireEvent.change(input, { target: { value: '' } });
  if (settle === 'enter') fireEvent.keyDown(input, { key: 'Enter' });
  else fireEvent.blur(input);
  expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
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
 * Leaving a refused title used to open the Card underneath, because the click
 * that blurred the field was also the click that selected the Card — so the
 * graph carried a ref that ate exactly one click to stop it. The field now
 * contains its own events, while the Card body keeps selection (ADR 0065).
 */
describe('a title Edit the graph refused', () => {
  it('does not open a Card on the click that blurred it', () => {
    const { openCard } = refuseTitleEdit('blur');

    fireEvent.click(nodeOf(CARD_ID));

    expect(openCard).not.toHaveBeenCalled();
  });

  it('leaves the rest of the graph working', () => {
    const { openCard } = refuseTitleEdit('blur');

    fireEvent.click(screen.getByRole('button', { name: 'Open Card B' }));

    expect(openCard).toHaveBeenCalledWith(OTHER_CARD_ID);
  });
});

/**
 * No pointer gesture on a Card's body opens it (ADR 0036). A Card centres its
 * title, so a body gesture and the title's rename want the same pixels; opening
 * moved to the Card's own control and the keyboard instead.
 */
describe('opening a Card', () => {
  it.each([
    ['a single click', (node: HTMLElement) => fireEvent.click(node)],
    ['a double click', (node: HTMLElement) => fireEvent.doubleClick(node)],
  ])('does not happen on %s of the Card body', (_name, gesture) => {
    const { openCard } = mountGraph();

    gesture(nodeOf(CARD_ID));

    expect(openCard).not.toHaveBeenCalled();
  });

  it('happens from the Card affordance', () => {
    const { openCard } = mountGraph();

    fireEvent.click(screen.getByRole('button', { name: 'Open Card A' }));

    expect(openCard).toHaveBeenCalledWith(CARD_ID);
  });

  it('leaves the Title control free to rename without Opening the Card', () => {
    const { openCard } = mountGraph();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));

    expect(screen.getByRole('textbox', { name: 'Card title' })).toHaveValue('A');
    expect(openCard).not.toHaveBeenCalled();
  });
});

/**
 * `F2` renames the *selected* Card, so it must not fire while a control has
 * focus — the author is then working on that control, and the selection may
 * belong to another Card entirely. The graph used to answer the key twice: a
 * React Flow `onKeyDown` branch that ran first and asked nothing about the
 * target, and a window listener that declined for a focused control and never
 * got the chance.
 */
describe('F2 while a control has focus', () => {
  it('does not rename the selected Card from a control on a different Card', () => {
    mountGraph([cardNode('A', CARD_ID, true), cardNode('B', OTHER_CARD_ID)]);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Open Card B' }), { key: 'F2' });

    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
  });

  it('renames the selected Card when the key is not typed into a control', () => {
    mountGraph([cardNode('A', CARD_ID, true), cardNode('B', OTHER_CARD_ID)]);

    fireEvent.keyDown(document.body, { key: 'F2' });

    expect(screen.getByRole('textbox', { name: 'Card title' })).toHaveValue('A');
  });
});

/**
 * The Card affordance is a real button in the tab order, revealed by
 * `:focus-visible`, so a keyboard author reaches it without a pointer. Its
 * activation keys are the same two the graph reads as "open this Card", and the
 * graph's handler sits on the ancestor that sees them first — it opened the Card
 * for reading and called `preventDefault`, which in a browser also cancels the
 * activation the button never got. The button was unusable by the input it is
 * there for, and its whole point is to open something the plain open does not.
 *
 * Activation is modelled as the browser does it — the keydown, then the click it
 * generates — because jsdom does not synthesize the second from the first.
 */
describe.each([
  ['Enter', 'Enter'],
  ['Space', ' '],
] as const)('%s on the focused Card affordance', (_name, key) => {
  it("does not open the Card twice — the keydown is the button's, not the graph's", () => {
    const { openCard } = mountGraph();
    const button = screen.getByRole('button', { name: 'Open Card A' });
    button.focus();

    fireEvent.keyDown(button, { key });

    expect(openCard).not.toHaveBeenCalled();
  });

  it('opens the Card', () => {
    const { openCard } = mountGraph();
    const button = screen.getByRole('button', { name: 'Open Card A' });
    button.focus();

    fireEvent.keyDown(button, { key });
    fireEvent.click(button);

    expect(openCard).toHaveBeenCalledWith(CARD_ID);
  });
});

it.each(['Enter', ' '])('routes %s on a focused Alias through Alias opening', (key) => {
  const alias = cardNode('A again', ALIAS_ID);
  alias.data.kind = 'alias';
  alias.data.aliasOf = 'A';
  const { openAlias } = mountGraph([alias]);

  const focusedAlias = nodeOf(ALIAS_ID);
  focusedAlias.focus();
  fireEvent.keyDown(focusedAlias, { key });

  expect(openAlias).toHaveBeenCalledWith(ALIAS_ID);
});

describe('the Card affordance', () => {
  it('opens the Card rather than renaming its title on the graph', () => {
    const { openCard } = mountGraph();

    fireEvent.click(screen.getByRole('button', { name: 'Open Card A' }));

    expect(openCard).toHaveBeenCalledWith(CARD_ID);
    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
  });
});

describe('withdrawing canvas authoring from an Expanded Card', () => {
  it('withdraws body editing and resize through the same complete gate', () => {
    const expanded = cardNode('A', CARD_ID, true);
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
    'does not Open a Card with %s while its body is being edited',
    async (key) => {
      const expanded = cardNode('A', CARD_ID, true);
      expanded.data.expanded = true;
      expanded.data.body = '# A';
      const { openCard } = mountGraph([expanded]);
      fireEvent.click(screen.getByRole('button', { name: 'Edit Markdown source of A' }));

      const editor = await screen.findByRole('textbox', { name: 'Markdown source of A' });
      editor.focus();
      expect(editor).toBe(document.activeElement);
      fireEvent.keyDown(editor, { key });

      expect(openCard).not.toHaveBeenCalled();
    },
  );
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

/** The one bottom-right control the Open Card draws. */
function resizeControl(): Element {
  const control = document.querySelector('.react-flow__resize-control.bottom.right');
  if (control === null) throw new Error('No resize control is drawn for Card A.');
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
 * Resize is Card behaviour rather than kind behaviour (ADR 0066): a Card owns
 * the surrounding rect and the resize interaction, while a kind owns only what
 * fills an Open front. Alias has no Open front yet, but that is content
 * ownership and must not read back as a second resize gate.
 */
describe('resize belongs to Card rather than to a Card kind', () => {
  it('offers a resize operation to an Open Card whatever its kind', () => {
    const alias = cardNode('Alias', CARD_ID, false);
    alias.data.kind = 'alias';
    alias.data.aliasOf = 'A';
    alias.data.expanded = true;
    const { view } = mountGraph([alias]);

    expect(view.container.querySelector('.react-flow__resize-control')).toBeInTheDocument();
  });

  it('offers no resize operation to a Closed Card', () => {
    const { view } = mountGraph([cardNode('A')]);

    expect(view.container.querySelector('.react-flow__resize-control')).toBeNull();
  });

  /**
   * `onResizeStart` is what the composition put on the node's data
   * (`projection.ts`'s `CardNodeData.resize`); a mouse press on the drawn
   * control is what invokes it, through the real `NodeResizeControl` rather
   * than a stand-in for it. One drag both selects the Card and grows it —
   * never a separate click first.
   */
  it('routes one resize lifecycle from the control to the canvas capability', () => {
    const expanded = cardNode('A', CARD_ID, false);
    expanded.data.expanded = true;
    expanded.data.body = '# A';
    const onSelectCard = vi.fn();
    const cardResize: CardResize = {
      beginResize: vi.fn(),
      previewResize: vi.fn(),
      finishResize: vi.fn(),
      cancelResize: vi.fn(),
    };
    mountGraph([expanded], onSelectCard, cardResize);

    pressResizeControl();

    expect(onSelectCard).toHaveBeenCalledWith(CARD_ID);
    expect(cardResize.beginResize).toHaveBeenCalledWith(CARD_ID);

    dragResizeControlTo(80, 60);
    expect(cardResize.previewResize).toHaveBeenCalledWith(CARD_ID, expect.any(Object));

    fireEvent.pointerUp(window);
    expect(cardResize.finishResize).toHaveBeenCalledWith(CARD_ID);
  });

  /**
   * The whole gesture reaches the capability and proposes nothing to React
   * Flow's own node array.
   *
   * `NodeResizeControl` asks `shouldResize` before it emits anything, and the
   * Card answers `false` to every frame while still handing the proposed rect
   * on (`CardNode`). So the only producer of a `dimensions` change never runs,
   * and there is no node-only rect for anything downstream to have to reject:
   * the next projected draft publishes the resized Card, its displaced
   * neighbours, handles and Edges together.
   */
  it('proposes no node change to React Flow while it resizes', () => {
    const expanded = cardNode('A', CARD_ID, false);
    expanded.data.expanded = true;
    const cardResize: CardResize = {
      beginResize: vi.fn(),
      previewResize: vi.fn(),
      finishResize: vi.fn(),
      cancelResize: vi.fn(),
    };
    const { nodesChanged } = mountGraph([expanded], () => undefined, cardResize);
    nodesChanged.mockClear();

    pressResizeControl();
    dragResizeControlTo(80, 60);
    dragResizeControlTo(160, 120);
    fireEvent.pointerUp(window);

    expect(cardResize.previewResize).toHaveBeenCalledTimes(2);
    expect(nodesChanged).not.toHaveBeenCalled();
  });

  it('routes loss of an active resize to cancellation', () => {
    const expanded = cardNode('A', CARD_ID, false);
    expanded.data.expanded = true;
    const cardResize: CardResize = {
      beginResize: vi.fn(),
      previewResize: vi.fn(),
      finishResize: vi.fn(),
      cancelResize: vi.fn(),
    };
    mountGraph([expanded], () => undefined, cardResize);
    pressResizeControl();

    fireEvent.blur(window);

    expect(cardResize.cancelResize).toHaveBeenCalledWith(CARD_ID);
    expect(cardResize.finishResize).not.toHaveBeenCalled();
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
    const expanded = cardNode('A', CARD_ID, false);
    expanded.data.expanded = true;
    const cardResize: CardResize = {
      beginResize: vi.fn(),
      previewResize: vi.fn(),
      finishResize: vi.fn(),
      cancelResize: vi.fn(),
    };
    const { setNodes } = mountGraph([expanded], () => undefined, cardResize);

    touchResizeControl('touchstart');
    expect(cardResize.beginResize).toHaveBeenCalledWith(CARD_ID);

    const republished = cardNode('A', CARD_ID, false);
    republished.data.expanded = true;
    setNodes([republished]);

    touchResizeControl('touchmove', 80, 60);

    expect(cardResize.previewResize).toHaveBeenCalledWith(CARD_ID, expect.any(Object));
  });
});

/**
 * `C` is the only unmodified authoring shortcut there is, so the whole of what
 * makes it safe is *where* it is answered: on React Flow's own wrapper, which a
 * key pressed anywhere else in the app never reaches.
 */
describe('the C shortcut', () => {
  it('adds a Card from a focused Card', () => {
    const { addCard } = mountGraph();

    fireEvent.keyDown(nodeOf(CARD_ID), { key: 'c' });

    expect(addCard).toHaveBeenCalledTimes(1);
  });

  /**
   * A `c` typed into a field is a letter, not a command. The inline editor stops
   * its own key events before they reach the graph, which is why this asserts
   * through the editor rather than through a bare input: the guard covers
   * whatever text entry the canvas gains next.
   */
  it('is a letter while the caret is in the title editor', () => {
    const { addCard } = mountGraph();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Card title' }), { key: 'c' });

    expect(addCard).not.toHaveBeenCalled();
  });

  /**
   * A modifier makes the key a browser or OS shortcut, and a repeat is one press
   * held down. Neither is a command, and the default stays with whoever else
   * wanted it.
   */
  it('ignores a modified press and a key repeat', () => {
    const { addCard } = mountGraph();
    const node = nodeOf(CARD_ID);

    fireEvent.keyDown(node, { key: 'c', metaKey: true });
    fireEvent.keyDown(node, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(node, { key: 'c', repeat: true });
    fireEvent.keyDown(node, { key: 'c', altKey: true });
    // Shift is the one a case-insensitive match lets through by construction:
    // the press arrives as `C`, which is exactly what an unmodified press under
    // Caps Lock looks like. `aria-keyshortcuts="C"` announces the unmodified
    // key, and this is the guard that makes that announcement true.
    fireEvent.keyDown(node, { key: 'C', shiftKey: true });

    expect(addCard).not.toHaveBeenCalled();
  });

  /**
   * And Caps Lock is not a modifier: it changes the character, never `shiftKey`,
   * so the shortcut has to keep working with it on.
   */
  it('answers an unmodified C typed with Caps Lock on', () => {
    const { addCard } = mountGraph();

    fireEvent.keyDown(nodeOf(CARD_ID), { key: 'C' });

    expect(addCard).toHaveBeenCalledTimes(1);
  });

  it('is withdrawn along with every other Card authoring control', () => {
    const { addCard, setTitleEditing } = mountGraph();

    setTitleEditing(false);
    fireEvent.keyDown(nodeOf(CARD_ID), { key: 'c' });

    expect(addCard).not.toHaveBeenCalled();
  });

  /**
   * React Flow's own `<Controls>` renders *inside* the wrapper this shortcut is
   * bound to, so its buttons are somewhere a `c` can be pressed while the graph
   * is still the event's path. A button is not text entry, but it is a control
   * answering keys of its own, and the F2 guard beside this one already says so
   * — the two disagreed, and the narrower one is a canvas that adds a Card when
   * the author meant to press Zoom in.
   */
  it('is a keypress on a canvas control rather than a command', () => {
    const { addCard } = mountGraph();

    const zoomIn = document.querySelector('.react-flow__controls-zoomin');
    if (!(zoomIn instanceof HTMLElement)) throw new Error('React Flow drew no zoom control');
    fireEvent.keyDown(zoomIn, { key: 'c' });

    expect(addCard).not.toHaveBeenCalled();
  });
});

/**
 * `useKeyPress` keys both its `useMemo` and its listener `useEffect` on the
 * `deleteKeyCode` **value**, so a fresh array per render tears down and
 * re-attaches `keydown`/`keyup` on `document` — and, since the prop reaches the
 * `memo`'d `GraphView` and `FlowRenderer` on the way, defeats both of those too,
 * once per frame of a Card drag.
 *
 * Asserted on the listener rather than on the array: the pair of keys is already
 * pinned by value in `edge-authoring-react.test.tsx`, and a value assertion is
 * exactly what stayed green while the canvas spread the array into a new one.
 */
describe("React Flow's delete keys", () => {
  it('does not re-subscribe the document listener on an unchanged re-render', () => {
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
 * Opening is a command of the *canvas*, and a Card now contains the text control
 * its content is edited in. The `C` shortcut already asks this question; the
 * open key did not, and a Space typed into an Expanded Card's editor is a
 * character rather than a request to open the Card it is inside.
 *
 * Modelled with a plain `contenteditable` rather than the real editor because
 * `MarkdownSourceEditor` is reached by dynamic import: the rule under test is
 * about where the key came from, not which component put it there.
 */
describe.each([
  ['Enter', 'Enter'],
  ['Space', ' '],
] as const)('%s typed into a text control inside a Card', (_name, key) => {
  it('is a keypress rather than a request to open that Card', () => {
    const { openCard } = mountGraph();
    const field = document.createElement('div');
    field.setAttribute('contenteditable', 'true');
    nodeOf(CARD_ID).append(field);

    fireEvent.keyDown(field, { key });

    expect(openCard).not.toHaveBeenCalled();
  });
});
