import { fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { GraphView } from '../src/components/GraphView';
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
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeRouteId: null,
    activeRouteColor: '#8a94a6',
    emphasis: 'equal',
    sourceHandles: [],
    targetHandles: [],
  },
});

interface Harness {
  readonly view: RenderResult;
  readonly openCard: ReturnType<typeof vi.fn>;
  /** Re-render with Card authoring on or off, everything else unchanged. */
  readonly setTitleEditing: (enabled: boolean) => void;
}

/** A GraphView whose title Edit always refuses, so a draft can be left unsettled. */
function mountGraph(nodes: CardFlowNode[] = [cardNode('A')]): Harness {
  const openCard = vi.fn();
  const editableCardIds = new Set(nodes.map((node) => node.id));
  const graph = (titleEditingEnabled: boolean) => (
    <ReactFlowProvider>
      <GraphView
        nodes={nodes}
        edges={[]}
        activeCardId={null}
        presenting={false}
        editable={true}
        titleEditingEnabled={titleEditingEnabled}
        onNodesChange={() => undefined}
        onConnect={() => undefined}
        acceptsConnection={() => false}
        acceptsNewCardTarget={() => false}
        onConnectEnd={() => undefined}
        onCreateConnectedCard={() => undefined}
        newCardTitle="Card 2"
        onOpenCard={openCard}
        onCompleteCardTitle={() => 'A Card needs a title'}
        editableCardIds={editableCardIds}
        routes={[]}
        colorByRouteId={{}}
        activeRouteId={null}
        activeRouteCardIds={new Set()}
      />
    </ReactFlowProvider>
  );
  const view = render(graph(true));
  return {
    view,
    openCard,
    setTitleEditing: (enabled) => view.rerender(graph(enabled)),
  };
}

/**
 * The node element React Flow dispatches `onNodeDoubleClick` from.
 *
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
  fireEvent.doubleClick(screen.getByRole('heading', { name: 'A' }));
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
 * that blurred the field was also the click that opened — so the graph carried a
 * ref that ate exactly one click to stop it. The gesture delivers that now
 * (ADR 0036): a click selects, and only a double click opens.
 */
describe('a title Edit the graph refused', () => {
  it('does not open a Card on the click that blurred it', () => {
    const { openCard } = refuseTitleEdit('blur');

    fireEvent.click(nodeOf(CARD_ID));

    expect(openCard).not.toHaveBeenCalled();
  });

  it('leaves the rest of the graph working', () => {
    const { openCard } = refuseTitleEdit('blur');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Card B' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Edit Card A' }));

    expect(openCard).toHaveBeenCalledWith(CARD_ID);
  });

  it('leaves the title free to rename on a double click', () => {
    const { openCard } = mountGraph();

    fireEvent.doubleClick(screen.getByRole('heading', { name: 'A' }));

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

    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Card B' }), { key: 'F2' });

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
    const button = screen.getByRole('button', { name: 'Edit Card A' });
    button.focus();

    fireEvent.keyDown(button, { key });

    expect(openCard).not.toHaveBeenCalled();
  });

  it('opens the Card', () => {
    const { openCard } = mountGraph();
    const button = screen.getByRole('button', { name: 'Edit Card A' });
    button.focus();

    fireEvent.keyDown(button, { key });
    fireEvent.click(button);

    expect(openCard).toHaveBeenCalledWith(CARD_ID);
  });
});

describe('the Card affordance', () => {
  it('opens the Card rather than renaming its title on the graph', () => {
    const { openCard } = mountGraph();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Card A' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Edit Card A' }));

    expect(openCard).toHaveBeenCalledWith(CARD_ID);
  });
});
