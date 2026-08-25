import { fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { SpaceCanvas } from '../src/components/SpaceCanvas';
import type { EdgeAuthoring } from '../src/edge-authoring';
import { CARD_SIZE } from '../src/card';

const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');

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
  readonly addCard: ReturnType<typeof vi.fn>;
  /** Re-render with Card authoring on or off, everything else unchanged. */
  readonly setTitleEditing: (enabled: boolean) => void;
  /** Re-render as a completed creation would, naming the Card to be named. */
  readonly setNameOnCreation: (cardId: string | null) => void;
  /** Re-render with nothing changed at all, the way a parent's render does. */
  readonly rerender: () => void;
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
    beginKeyboardConnect: () => undefined,
    completeKeyboardConnect: () => null,
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
function mountGraph(nodes: CardFlowNode[] = [cardNode('A')]): Harness {
  const openCard = vi.fn();
  const addCard = vi.fn();
  const editableCardIds = new Set(nodes.map((node) => node.id));
  const edgeAuthoring = inertEdgeAuthoring();
  let titleEditing = true;
  let named: string | null = null;
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
        onNodesChange={() => undefined}
        onEdgesChange={() => undefined}
        edgeAuthoring={edgeAuthoring}
        selection={{ kind: 'none' }}
        onSelectCard={() => undefined}
        onSelectEdge={() => undefined}
        subjectCards={[]}
        newCardTitle="Card 2"
        onAddCard={addCard}
        nameOnCreation={named}
        onOpenCard={openCard}
        onCloseCard={() => 'completed'}
        onCompleteCardBody={() => 'completed'}
        onResizeCard={() => undefined}
        onCompleteCardTitle={() => 'A Card needs a title'}
        editableCardIds={editableCardIds}
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
    addCard,
    setTitleEditing: (enabled) => {
      titleEditing = enabled;
      view.rerender(graph());
    },
    setNameOnCreation: (cardId) => {
      named = cardId;
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
  expect(screen.getByRole('alert')).toHaveTextContent('A Card needs a title');
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

describe('the Card affordance', () => {
  it('opens the Card rather than renaming its title on the graph', () => {
    const { openCard } = mountGraph();

    fireEvent.click(screen.getByRole('button', { name: 'Open Card A' }));

    expect(openCard).toHaveBeenCalledWith(CARD_ID);
    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
  });
});

/**
 * Title editing is withdrawn by things that have nothing to do with the editor —
 * presenting starting, or another surface opening over the graph — and the
 * withdrawal unmounts the editor along with the only controls that could settle
 * it. Whatever it left behind has to go with it, or it comes back the moment
 * editing is offered again.
 */
describe('withdrawing title editing', () => {
  it('does not reopen an editor that was withdrawn mid-edit', () => {
    const { setTitleEditing } = refuseTitleEdit();

    setTitleEditing(false);
    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
    setTitleEditing(true);

    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A' })).toBeVisible();
  });

  it('opens a Card after an unsettled title Edit was withdrawn', () => {
    const { openCard, setTitleEditing } = refuseTitleEdit();

    setTitleEditing(false);
    setTitleEditing(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open Card A' }));

    expect(openCard).toHaveBeenCalledWith(CARD_ID);
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

  it('does not let another edit or Card creation replace a live body caret', () => {
    const a = cardNode('A');
    a.data.expanded = true;
    a.data.body = '# A';
    const b = cardNode('B', OTHER_CARD_ID);
    b.data.expanded = true;
    b.data.body = '# B';
    const { addCard } = mountGraph([a, b]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Markdown source of A' }));

    expect(screen.queryByRole('button', { name: 'Edit Title B' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Markdown source of B' })).toBeNull();
    fireEvent.keyDown(nodeOf(OTHER_CARD_ID), { key: 'c' });
    fireEvent.keyDown(document.body, { key: 'F2' });
    expect(addCard).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Card title' })).toBeNull();
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
 * A created Card is named in place, in the editor that already exists for
 * renaming one — so creation needs no second surface, and the author is left
 * typing over a neutral `Card N` rather than hunting for where to.
 */
describe('naming a created Card', () => {
  it('opens the title editor on the Card a completed creation names', () => {
    const { setNameOnCreation } = mountGraph();

    setNameOnCreation(CARD_ID);

    const input = screen.getByRole('textbox', { name: 'Card title' });
    expect(input).toHaveValue('A');
    expect(input).toHaveFocus();
  });

  /**
   * The identity is what says a Card has just been created, so the same one
   * arriving again is not a second creation. Reopening on it would put an editor
   * over a Card nobody asked to rename — after an Escape, over the very Card the
   * author had just declined to name.
   */
  it('does not reopen the editor when nothing new was created', () => {
    const { setNameOnCreation } = mountGraph();
    setNameOnCreation(CARD_ID);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Card title' }), { key: 'Escape' });

    setNameOnCreation(CARD_ID);

    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
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
});
