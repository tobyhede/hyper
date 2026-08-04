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
  /** Re-render with title editing on or off, everything else unchanged. */
  readonly setTitleEditing: (enabled: boolean) => void;
}

/**
 * A GraphView holding one Card, with a title Edit that always refuses.
 *
 * The refusal is what leaves the editor open and the graph's invalid-title guard
 * raised, which is the state these tests take away the editor from.
 */
function mountGraph(nodes: CardFlowNode[] = [cardNode('A')]): Harness {
  const openCard = vi.fn();
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

/** Leave the graph holding an open title editor that has just refused a draft. */
function refuseTitleEdit(settle: 'enter' | 'blur' = 'enter'): Harness {
  const harness = mountGraph();
  fireEvent.click(screen.getByRole('button', { name: 'Edit title of A' }));
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

describe('a title Edit the graph refused', () => {
  it('swallows the click that blurred it rather than opening a Card', () => {
    const { openCard } = refuseTitleEdit('blur');

    fireEvent.click(screen.getByTestId('card'));

    expect(openCard).not.toHaveBeenCalled();
  });

  /**
   * One click, not the rest of the session. The blurring click is the only one
   * the refusal has any claim on — it was spent leaving the field. Holding the
   * guard up past it left every Card unopenable by click while the refused
   * editor sat there, and the only way back was noticing a small field error on
   * a Card the pointer had already left.
   */
  it('opens a Card on the next click, having spent the refusal on the first', () => {
    const { openCard } = refuseTitleEdit('blur');
    fireEvent.click(screen.getByTestId('card'));

    fireEvent.click(screen.getByTestId('card'));

    expect(openCard).toHaveBeenCalledWith(CARD_ID);
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

    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit title of B' }), { key: 'F2' });

    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
  });

  it('renames the selected Card when the key is not typed into a control', () => {
    mountGraph([cardNode('A', CARD_ID, true), cardNode('B', OTHER_CARD_ID)]);

    fireEvent.keyDown(document.body, { key: 'F2' });

    expect(screen.getByRole('textbox', { name: 'Card title' })).toHaveValue('A');
  });
});

/**
 * The title-edit affordance is a real button in the tab order, revealed by
 * `:focus-visible`, so a keyboard author reaches it without a pointer. Its
 * activation keys are the same two the graph reads as "open this Card", and the
 * graph's handler sits on the ancestor that sees them first: it opened the Card
 * and called `preventDefault`, which in a browser also cancels the activation
 * the button never got. The button was unusable by the input it was there for.
 *
 * Activation is modelled as the browser does it — the keydown, then the click it
 * generates — because jsdom does not synthesize the second from the first.
 */
describe.each([
  ['Enter', 'Enter'],
  ['Space', ' '],
] as const)('%s on the focused title-edit button', (_name, key) => {
  it('does not open the Card', () => {
    const { openCard } = mountGraph();
    const button = screen.getByRole('button', { name: 'Edit title of A' });
    button.focus();

    fireEvent.keyDown(button, { key });

    expect(openCard).not.toHaveBeenCalled();
  });

  it('begins title editing', () => {
    mountGraph();
    const button = screen.getByRole('button', { name: 'Edit title of A' });
    button.focus();

    fireEvent.keyDown(button, { key });
    fireEvent.click(button);

    expect(screen.getByRole('textbox', { name: 'Card title' })).toHaveValue('A');
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

  it('opens a Card clicked after an unsettled title Edit was withdrawn', () => {
    const { openCard, setTitleEditing } = refuseTitleEdit();

    setTitleEditing(false);
    setTitleEditing(true);
    fireEvent.click(screen.getByTestId('card'));

    expect(openCard).toHaveBeenCalledWith(CARD_ID);
  });
});
