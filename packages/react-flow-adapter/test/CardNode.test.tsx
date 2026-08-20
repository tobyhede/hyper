import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as ReactFlowReact from '@xyflow/react';
import { Position, type NodeProps } from '@xyflow/react';
import type { HTMLAttributes } from 'react';
import { vi } from 'vitest';
import { CardNode } from '../src/CardNode';
import type { CardFlowNode, CardHandle, CardNodeData } from '../src/projection';
import { uuid } from './uuid';

/**
 * React Flow is the system boundary here, so the mock stands in for it and the
 * assertions read what CardNode told it. `updateNodeInternals` is the whole of
 * React Flow's remeasure contract — it has no rendered consequence to observe —
 * and the real `useUpdateNodeInternals` reaches for a store this component is
 * deliberately rendered without. It is still stubbed although `CardNode` no
 * longer calls it, so that re-introducing the call is caught here rather than
 * only in a browser.
 */
/**
 * The live connection React Flow reports, so a test can put a drag in flight.
 *
 * `fromHandle` is the end the drag is anchored at, and React Flow always
 * supplies it while `inProgress` — it is what says whether the drag is looking
 * for a target (an ordinary connection, anchored at a source) or for a source
 * (a reconnection that took hold of an Edge's `from` end).
 */
interface MockConnectionState {
  inProgress: boolean;
  fromHandle: { type: 'source' | 'target' };
}

const { updateNodeInternals, connection } = vi.hoisted(() => {
  const connection: MockConnectionState = {
    inProgress: false,
    fromHandle: { type: 'source' },
  };
  return { updateNodeInternals: vi.fn(), connection };
});

/** React Flow's `Handle` decides on its own whether a drag may start or end at
 *  it; the stand-in records the two answers it was given. */
type MockHandleProps = HTMLAttributes<HTMLButtonElement> & {
  isConnectableStart?: boolean;
  isConnectableEnd?: boolean;
};

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowReact>();
  return {
    ...actual,
    useUpdateNodeInternals: () => updateNodeInternals,
    useConnection: <T,>(selector: (state: MockConnectionState) => T): T => selector(connection),
    Handle: ({
      className,
      style,
      'aria-label': ariaLabel,
      'aria-hidden': ariaHidden,
      isConnectableStart,
      isConnectableEnd,
    }: MockHandleProps) => (
      <button
        className={className}
        style={style}
        aria-label={ariaLabel}
        aria-hidden={ariaHidden}
        data-connectable-start={String(isConnectableStart)}
        data-connectable-end={String(isConnectableEnd)}
      />
    ),
  };
});

beforeEach(() => {
  connection.inProgress = false;
  connection.fromHandle.type = 'source';
});

const graphId = uuid('00000000-0000-4000-8000-000000000010');
const otherGraphId = uuid('00000000-0000-4000-8000-000000000011');
const cardId = uuid('00000000-0000-4000-8000-000000000001');

const outHandle = (graph: typeof graphId, offsetY: number): CardHandle => ({
  id: `${graph}::out`,
  graphId: graph,
  color: '#6ea8fe',
  offsetY,
});

interface Overrides {
  selected?: boolean;
  /** What React Flow answers for this node from `nodesConnectable`/`node.connectable`. */
  isConnectable?: boolean;
  title?: string;
  kind?: CardNodeData['kind'];
  titleEditingEnabled?: boolean;
  cardEditingEnabled?: boolean;
  editingTitle?: boolean;
  onEditCard?: () => void;
  onBeginTitleEditing?: () => void;
  onCompleteTitleEditing?: (title: string) => string | null;
  onCancelTitleEditing?: () => void;
  sourceHandles?: CardHandle[];
  targetHandles?: CardHandle[];
}

function props({
  selected = false,
  isConnectable = true,
  title = 'A',
  kind = 'markdown',
  titleEditingEnabled = false,
  cardEditingEnabled = false,
  editingTitle = false,
  onEditCard,
  onBeginTitleEditing,
  onCompleteTitleEditing,
  onCancelTitleEditing,
  sourceHandles = [outHandle(graphId, 50)],
  targetHandles = [],
}: Overrides = {}): NodeProps<CardFlowNode> {
  const data: CardFlowNode['data'] = {
    cardId,
    title,
    kind,
    titleEditingEnabled,
    cardEditingEnabled,
    editingTitle,
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: graphId,
    activeGraphColor: '#6ea8fe',
    emphasis: 'subtle',
    sourceHandles,
    targetHandles,
  };
  if (onEditCard !== undefined) data.onEditCard = onEditCard;
  if (onBeginTitleEditing !== undefined) data.onBeginTitleEditing = onBeginTitleEditing;
  if (onCompleteTitleEditing !== undefined) data.onCompleteTitleEditing = onCompleteTitleEditing;
  if (onCancelTitleEditing !== undefined) data.onCancelTitleEditing = onCancelTitleEditing;

  return {
    id: cardId,
    selected,
    draggable: true,
    selectable: true,
    deletable: true,
    dragging: false,
    zIndex: 0,
    isConnectable,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    type: 'card',
    data,
  };
}

describe('CardNode title authoring', () => {
  it('draws no shared Description slot on the Card front', () => {
    render(<CardNode {...props()} />);

    expect(screen.queryByTestId('card-description')).not.toBeInTheDocument();
  });

  it('begins inline title editing from a double click on the title', () => {
    const onBeginTitleEditing = vi.fn();
    const { rerender } = render(
      <CardNode {...props({ selected: true, titleEditingEnabled: true, onBeginTitleEditing })} />,
    );

    fireEvent.doubleClick(screen.getByRole('heading', { name: 'A' }));
    expect(onBeginTitleEditing).toHaveBeenCalledOnce();

    rerender(
      <CardNode
        {...props({
          selected: true,
          titleEditingEnabled: true,
          editingTitle: true,
          onBeginTitleEditing,
        })}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Card title' })).toHaveValue('A');
  });

  /**
   * The pencil edits the Card, not one field of it — it opens the Markdown
   * surface. Renaming is the title's own gesture and `F2`.
   */
  it('edits the Card from the affordance, without touching the title', () => {
    const onEditCard = vi.fn();
    const onBeginTitleEditing = vi.fn();
    render(
      <CardNode
        {...props({
          selected: true,
          titleEditingEnabled: true,
          cardEditingEnabled: true,
          onEditCard,
          onBeginTitleEditing,
        })}
      />,
    );

    screen.getByRole('button', { name: 'Edit Card A' }).click();

    expect(onEditCard).toHaveBeenCalledOnce();
    expect(onBeginTitleEditing).not.toHaveBeenCalled();
  });

  it('offers no affordance on a Card that owns no content to edit', () => {
    render(<CardNode {...props({ selected: true, titleEditingEnabled: true })} />);

    expect(screen.queryByRole('button', { name: /^Edit Card/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A' })).toBeVisible();
  });

  it('keeps an invalid title local and completes a valid title with Enter', () => {
    const onCompleteTitleEditing = vi.fn((title: string) =>
      title.length === 0 ? 'A Card title is required.' : null,
    );
    render(
      <CardNode
        {...props({
          selected: true,
          titleEditingEnabled: true,
          editingTitle: true,
          onCompleteTitleEditing,
        })}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Card title' });

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
    expect(onCompleteTitleEditing).toHaveBeenLastCalledWith('');

    fireEvent.change(input, { target: { value: 'Renamed A' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCompleteTitleEditing).toHaveBeenLastCalledWith('Renamed A');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('completes on blur and cancels on Escape without leaking editor events', () => {
    const onCompleteTitleEditing = vi.fn(() => null);
    const onCancelTitleEditing = vi.fn();
    const leakedClick = vi.fn();
    const leakedPointer = vi.fn();
    const leakedKey = vi.fn();
    render(
      <div onClick={leakedClick} onPointerDown={leakedPointer} onKeyDown={leakedKey}>
        <CardNode
          {...props({
            selected: true,
            titleEditingEnabled: true,
            editingTitle: true,
            onCompleteTitleEditing,
            onCancelTitleEditing,
          })}
        />
      </div>,
    );
    const input = screen.getByRole('textbox', { name: 'Card title' });

    fireEvent.change(input, { target: { value: 'Blurred A' } });
    fireEvent.pointerDown(input);
    fireEvent.click(input);
    fireEvent.blur(input);
    expect(onCompleteTitleEditing).toHaveBeenCalledWith('Blurred A');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancelTitleEditing).toHaveBeenCalledOnce();
    expect(leakedClick).not.toHaveBeenCalled();
    expect(leakedPointer).not.toHaveBeenCalled();
    expect(leakedKey).not.toHaveBeenCalled();
  });
});

/** The four spatial handles of one role, read back as whether a drag may begin
 *  or end at each. */
const connectable = (label: 'Connect from' | 'Connect to', end: 'start' | 'end') =>
  screen
    .getAllByRole('button', { name: new RegExp(`^${label} `) })
    .map((handle) => handle.getAttribute(`data-connectable-${end}`) === 'true');

describe('CardNode graph authoring', () => {
  it('shows four active-Graph-coloured spatial source handles on a selected Card', () => {
    render(<CardNode {...props({ selected: true })} />);

    const handles = screen.getAllByRole('button', { name: /^Connect from / });
    expect(handles).toHaveLength(4);
    expect(handles.map((handle) => handle.getAttribute('aria-label'))).toEqual([
      `Connect from ${Position.Top}`,
      `Connect from ${Position.Right}`,
      `Connect from ${Position.Bottom}`,
      `Connect from ${Position.Left}`,
    ]);
    expect(handles.every((handle) => handle.style.backgroundColor === 'rgb(110, 168, 254)')).toBe(
      true,
    );
    expect(document.querySelector('.rf-card-node__port')).toHaveAttribute('aria-hidden', 'true');
  });

  it('starts a drag from a source handle while no Edge is being drawn', () => {
    render(<CardNode {...props({ selected: true })} />);

    expect(connectable('Connect from', 'start')).toEqual([true, true, true, true]);
    expect(connectable('Connect to', 'end')).toEqual([false, false, false, false]);
  });

  it('ends a drag on a target handle while an Edge is being drawn', () => {
    connection.inProgress = true;

    render(<CardNode {...props({ selected: true })} />);

    expect(connectable('Connect to', 'end')).toEqual([true, true, true, true]);
    expect(connectable('Connect from', 'start')).toEqual([false, false, false, false]);
  });

  /**
   * A reconnection that took hold of an Edge's `from` end is anchored at the
   * Edge's *target*, so it is looking for a new **source**. Offering only target
   * handles left that gesture with nowhere to land — which is why the role is
   * read off the drag rather than assumed to be `target`.
   */
  it('ends a drag on a source handle while a source endpoint is being moved', () => {
    connection.inProgress = true;
    connection.fromHandle.type = 'target';

    render(<CardNode {...props({ selected: true })} />);

    expect(connectable('Connect from', 'end')).toEqual([true, true, true, true]);
    expect(connectable('Connect to', 'end')).toEqual([false, false, false, false]);
  });

  /**
   * React Flow's connectability switch has to be forwarded, and this is the only
   * place that can.
   *
   * `nodesConnectable` on the flow, and `connectable` on a node, are resolved by
   * `NodeWrapper` into one answer that arrives here as `NodeProps.isConnectable`
   * — **advisory to the node**. React Flow enforces nothing on a handle it did
   * not render itself; its own `DefaultNode` passes the prop straight to both of
   * its `Handle`s, and a custom node that drops it silently keeps every handle
   * live while the flow believes they are off.
   *
   * The four authoring handles are the only ones that can begin a gesture — the
   * graph ports are `isConnectable={false}` outright, being invisible attachment
   * points for overview Edges — so they are what the switch has to reach. Before
   * this they ignored it, and the flow-level flag governed nothing but whether
   * the connection *line* rendered. What stood in for it was presentation: CSS
   * hides the handles while presenting, and a pane's backdrop covers them. A
   * withdrawal that depends on something being drawn over it is not a withdrawal
   * — it is the same hidden-control-live-gesture shape as the delete-key holes.
   */
  it.each([
    ['no drag in flight', false, 'Connect from' as const, 'start' as const],
    ['a drag looking for a target', true, 'Connect to' as const, 'end' as const],
  ])(
    'offers no connectable handle when the flow is not connectable, with %s',
    (_name, inProgress, label, end) => {
      connection.inProgress = inProgress;

      render(<CardNode {...props({ selected: true, isConnectable: false })} />);

      expect(connectable(label, end)).toEqual([false, false, false, false]);
    },
  );
});

/*
 * `projection.ts` declares each laid-out Card's handle geometry on the node, and
 * React Flow's `parseHandles` takes that in preference to measuring the DOM. A
 * forced remeasure replaces it with `getHandleBounds`, which reads *only* the
 * handles the DOM currently renders — the overview anchors of Graphs the Card is
 * already on. The declarations for every other Graph, which are what let an Edge
 * completed onto this Card resolve in the render that first makes it incident,
 * are discarded. So the contract with React Flow is that we never ask.
 *
 * Asserting the absence of that call is the only seam that can say so: the loss
 * is visible in React Flow's node lookup and nowhere in the rendered output, and
 * a test reaching into that lookup would pin @xyflow/system's private shape.
 */
describe('CardNode handle geometry', () => {
  beforeEach(() => {
    updateNodeInternals.mockClear();
  });

  it('leaves a freshly mounted Card to React Flow, which measures it', () => {
    render(<CardNode {...props()} />);

    expect(updateNodeInternals).not.toHaveBeenCalled();
  });

  it('leaves the declared geometry alone when a new Edge gives the Card another Graph handle', () => {
    const { rerender } = render(<CardNode {...props()} />);

    rerender(
      <CardNode
        {...props({ sourceHandles: [outHandle(graphId, 50), outHandle(otherGraphId, 150)] })}
      />,
    );

    expect(updateNodeInternals).not.toHaveBeenCalled();
  });

  it('leaves the declared geometry alone when a strategy moves a handle the Card already had', () => {
    const { rerender } = render(<CardNode {...props()} />);

    rerender(<CardNode {...props({ sourceHandles: [outHandle(graphId, 210)] })} />);

    expect(updateNodeInternals).not.toHaveBeenCalled();
  });
});
