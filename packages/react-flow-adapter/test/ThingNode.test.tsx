import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as ReactFlowReact from '@xyflow/react';
import { Position, type NodeProps } from '@xyflow/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { vi } from 'vitest';
import { ThingNode } from '../src/ThingNode';
import { ConnectionEndEligibilityContext } from '../src/connection-end-eligibility';
import type { ThingFlowNode, ThingNodeData, ThingTitleEditor } from '../src/projection';
import { uuid } from './uuid';

/**
 * React Flow is the system boundary here, so the mock stands in for it and the
 * assertions read what ThingNode told it. `updateNodeInternals` is the whole of
 * React Flow's remeasure contract — it has no rendered consequence to observe —
 * and the real `useUpdateNodeInternals` reaches for a store this component is
 * deliberately rendered without. It is still stubbed although `ThingNode` no
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

const { updateNodeInternals, connection, proximity } = vi.hoisted(() => {
  const connection: MockConnectionState = {
    inProgress: false,
    fromHandle: { type: 'source' },
  };
  return {
    updateNodeInternals: vi.fn(),
    connection,
    proximity: { near: true },
  };
});

vi.mock('../src/connection-target-proximity', () => ({
  useConnectionTargetProximity: () => proximity.near,
}));

/** React Flow's `Handle` decides on its own whether a drag may start or end at
 *  it; the stand-in records the two answers it was given. */
type MockHandleProps = HTMLAttributes<HTMLButtonElement> & {
  isConnectable?: boolean;
  isConnectableStart?: boolean;
  isConnectableEnd?: boolean;
};

/** The floor and position `ThingNode` hands React Flow's one bottom-right resize
 *  control. */
type MockResizeControlProps = {
  position?: string;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  children?: ReactNode;
  onResizeStart?: () => void;
  shouldResize?: (
    event: MouseEvent,
    size: { width: number; height: number },
  ) => boolean | undefined;
};

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowReact>();
  return {
    ...actual,
    useUpdateNodeInternals: () => updateNodeInternals,
    useViewport: () => ({ zoom: 1 }),
    useConnection: <T,>(selector: (state: MockConnectionState) => T): T => selector(connection),
    /**
     * React Flow's own resize control, which reaches for the flow store and so
     * cannot render outside a provider. Stood in for like every other piece of
     * React Flow here, replicating the class list React Flow's own control
     * publishes for a given `position` — `controlPosition.split('-')` — so a
     * test can pin the same `.bottom.right` selector production code and
     * `editing.spec.ts` both key off, rather than asserting a fixture invention.
     */
    NodeResizeControl: ({
      position,
      minWidth,
      minHeight,
      className,
      children,
      onResizeStart,
      shouldResize,
    }: MockResizeControlProps) => (
      <div
        className={[
          'react-flow__resize-control',
          'nodrag',
          ...(position ?? '').split('-'),
          'handle',
          className ?? '',
        ]
          .filter((part) => part.length > 0)
          .join(' ')}
        data-testid="resize-control"
        data-min-width={String(minWidth)}
        data-min-height={String(minHeight)}
        onMouseDown={onResizeStart}
        onMouseMove={() => shouldResize?.(new MouseEvent('mousemove'), { width: 620, height: 440 })}
      >
        {children}
      </div>
    ),
    Handle: ({
      className,
      style,
      'aria-label': ariaLabel,
      'aria-hidden': ariaHidden,
      isConnectable,
      isConnectableStart,
      isConnectableEnd,
    }: MockHandleProps) => (
      <button
        className={className}
        style={style}
        aria-label={ariaLabel}
        aria-hidden={ariaHidden}
        data-connectable={String(isConnectable)}
        data-connectable-start={String(isConnectableStart)}
        data-connectable-end={String(isConnectableEnd)}
      />
    ),
  };
});

beforeEach(() => {
  connection.inProgress = false;
  connection.fromHandle.type = 'source';
  proximity.near = true;
});

const graphId = uuid('00000000-0000-4000-8000-000000000010');
const thingId = uuid('00000000-0000-4000-8000-000000000001');

interface Overrides {
  selected?: boolean;
  dragging?: boolean;
  /** What React Flow answers for this node from `nodesConnectable`/`node.connectable`. */
  isConnectable?: boolean;
  title?: string;
  kind?: ThingNodeData['kind'];
  titleEditingEnabled?: boolean;
  thingEditingEnabled?: boolean;
  titleEditor?: ThingTitleEditor;
  onEditThing?: (open: boolean) => void;
  onBeginTitleEditing?: () => void;
  expanded?: boolean;
  body?: string;
  onBeginBodyEditing?: () => void;
  bodyEditor?: ThingNodeData['bodyEditor'];
  resize?: ThingNodeData['resize'];
  readOnly?: boolean;
  connectionAuthoringEnabled?: boolean;
}

function props({
  selected = false,
  dragging = false,
  isConnectable = true,
  title = 'A',
  kind = 'markdown',
  titleEditingEnabled = false,
  thingEditingEnabled = false,
  titleEditor,
  onEditThing,
  onBeginTitleEditing,
  expanded,
  body,
  onBeginBodyEditing,
  bodyEditor,
  resize,
  readOnly = false,
  connectionAuthoringEnabled,
}: Overrides = {}): NodeProps<ThingFlowNode> {
  const data: ThingFlowNode['data'] = {
    thingId,
    title,
    kind,
    titleEditingEnabled,
    thingEditingEnabled,
    active: false,
    selectedForAuthoring: false,
    showContent: false,
    activeGraphId: graphId,
    activeGraphColor: '#6ea8fe',
    emphasis: 'subtle',
    readOnly,
  };
  if (onEditThing !== undefined)
    data.onEditThing = (open) => {
      onEditThing(open);
      return 'completed';
    };
  if (onBeginTitleEditing !== undefined) data.onBeginTitleEditing = onBeginTitleEditing;
  if (titleEditor !== undefined) data.titleEditor = titleEditor;
  if (expanded !== undefined) data.expanded = expanded;
  if (body !== undefined) data.body = body;
  if (onBeginBodyEditing !== undefined) data.onBeginBodyEditing = onBeginBodyEditing;
  if (bodyEditor !== undefined) data.bodyEditor = bodyEditor;
  if (resize !== undefined) data.resize = resize;
  if (connectionAuthoringEnabled !== undefined)
    data.connectionAuthoringEnabled = connectionAuthoringEnabled;

  return {
    id: thingId,
    selected,
    draggable: true,
    selectable: true,
    deletable: true,
    dragging,
    zIndex: 0,
    isConnectable,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    type: 'thing',
    data,
  };
}

/**
 * `ThingNode`'s focus-restoration operation reaches for the `.react-flow__node`
 * ancestor React Flow itself renders around whatever this component returns —
 * an ancestor this test has to supply, since `ThingNode` never renders it. The
 * class is React Flow's own, not a fixture invention: `SpaceCanvas.tsx` reads
 * it back the same way to focus a created or renamed Thing (`editing.spec.ts`,
 * `thing-creation.test.tsx`).
 */
function renderInNode(node: NodeProps<ThingFlowNode>): void {
  render(
    <div className="react-flow__node" tabIndex={-1}>
      <ThingNode {...node} />
    </div>,
  );
}

describe('ThingNode canvas Thing state adapter', () => {
  it('translates React Flow selection and dragging into shared visual states', () => {
    const { rerender } = render(<ThingNode {...props({ selected: true })} />);

    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute('data-state', 'selected');

    rerender(<ThingNode {...props({ dragging: true })} />);
    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute('data-state', 'dragging');
  });

  it('renders an Alias through the shared kind treatment', () => {
    render(<ThingNode {...props({ kind: 'alias', title: 'A, again' })} />);

    expect(screen.getByRole('article', { name: 'A, again' })).toHaveAttribute('data-kind', 'alias');
    expect(screen.getByRole('img', { name: 'Alias' })).toBeVisible();
  });

  it('passes the Alias metadata Open operation through its own front', () => {
    const onEditThing = vi.fn();
    render(
      <ThingNode
        {...props({
          kind: 'alias',
          title: 'A, again',
          thingEditingEnabled: true,
          onEditThing,
        })}
      />,
    );

    screen.getByRole('button', { name: 'Open Thing A, again' }).click();
    expect(onEditThing).toHaveBeenCalledWith(true);
  });

  it('draws a Markdown Thing kind glyph like any other kind', () => {
    render(<ThingNode {...props({ kind: 'markdown' })} />);

    expect(screen.getByRole('img', { name: 'Markdown Thing' })).toBeVisible();
  });

  it('renders a Space Thing through an explicit non-Markdown front', () => {
    const onEditThing = vi.fn();
    const onBeginBodyEditing = vi.fn();
    render(
      <ThingNode
        {...props({
          kind: 'space',
          expanded: true,
          body: 'must not render',
          thingEditingEnabled: true,
          onEditThing,
          onBeginBodyEditing,
        })}
      />,
    );

    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute('data-kind', 'space');
    expect(screen.getByRole('img', { name: 'Space Thing' })).toBeVisible();
    expect(screen.queryByText('must not render')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Thing A' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Thing A' })).toBeNull();
  });
});

describe('ThingNode Open authoring', () => {
  /**
   * The pencil edits the Thing, not one field of it — it opens the Markdown
   * surface. Renaming is the title's own gesture and `F2`.
   */
  it('edits the Thing from the affordance, without touching the title', () => {
    const onEditThing = vi.fn();
    const onBeginTitleEditing = vi.fn();
    render(
      <ThingNode
        {...props({
          selected: true,
          titleEditingEnabled: true,
          thingEditingEnabled: true,
          onEditThing,
          onBeginTitleEditing,
        })}
      />,
    );

    screen.getByRole('button', { name: 'Open Thing A' }).click();

    expect(onEditThing).toHaveBeenCalledOnce();
    expect(onBeginTitleEditing).not.toHaveBeenCalled();
  });

  it('offers no affordance on a Thing that owns no content to edit', () => {
    render(<ThingNode {...props({ selected: true, titleEditingEnabled: true })} />);

    expect(screen.queryByRole('button', { name: /^Open Thing/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A' })).toBeVisible();
  });
});

/**
 * A flag says the composition *offers* a control; the operation is how the
 * control is performed, and the two travel together from `SpaceCanvas`. Raised
 * over a missing operation, the flag alone used to draw a live control that did
 * nothing when activated. `CanvasThing` omits a control it has no operation for,
 * and the adapter must not manufacture one on its behalf.
 */
describe('ThingNode withholds a control the composition supplied no operation for', () => {
  it('draws no Edit control for a flag raised over a missing operation', () => {
    render(<ThingNode {...props({ selected: true, thingEditingEnabled: true })} />);

    expect(screen.queryByRole('button', { name: /^Open Thing/ })).not.toBeInTheDocument();
  });

  it('leaves the title unrenameable for a flag raised over a missing operation', () => {
    render(<ThingNode {...props({ selected: true, titleEditingEnabled: true })} />);
    const heading = screen.getByRole('heading', { name: 'A' });

    // The heading is the Title Lines; `data-editable` is the Title's own box,
    // which the activation control wraps when there is one (ADR 0083).
    expect(heading.closest('.canvas-thing__title')).toHaveAttribute('data-editable', 'false');
    fireEvent.click(heading);
    expect(screen.queryByRole('textbox', { name: 'Thing title' })).not.toBeInTheDocument();
  });
});

describe('ThingNode title authoring', () => {
  it('withdraws an active title editor when the Thing becomes read-only', () => {
    const titleEditor = { onComplete: vi.fn(() => null), onCancel: vi.fn() };
    const { rerender } = render(<ThingNode {...props({ titleEditor })} />);
    expect(screen.getByRole('textbox', { name: 'Thing title' })).toBeVisible();

    rerender(<ThingNode {...props({ titleEditor, readOnly: true })} />);

    expect(screen.queryByRole('textbox', { name: 'Thing title' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A' })).toBeVisible();
  });

  it('draws no shared Description slot on the Thing front', () => {
    render(<ThingNode {...props()} />);

    expect(screen.queryByTestId('thing-description')).not.toBeInTheDocument();
  });

  it('begins inline title editing from the Title control', () => {
    const onBeginTitleEditing = vi.fn();
    const { rerender } = render(
      <ThingNode {...props({ selected: true, titleEditingEnabled: true, onBeginTitleEditing })} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));
    expect(onBeginTitleEditing).toHaveBeenCalledOnce();

    rerender(
      <ThingNode
        {...props({
          selected: true,
          titleEditingEnabled: true,
          titleEditor: { onComplete: () => null, onCancel: () => undefined },
          onBeginTitleEditing,
        })}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Thing title' })).toHaveValue('A');
  });

  it('does not offer or mount title editing while the Markdown body owns the caret', () => {
    const onBeginTitleEditing = vi.fn();
    render(
      <ThingNode
        {...props({
          expanded: true,
          body: 'Markdown',
          titleEditingEnabled: true,
          onBeginTitleEditing,
          titleEditor: { onComplete: () => null, onCancel: vi.fn() },
          bodyEditor: { onComplete: vi.fn(), onEnd: vi.fn() },
        })}
      />,
    );

    expect(screen.queryByRole('textbox', { name: 'Thing title' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Title A' })).not.toBeInTheDocument();
    expect(onBeginTitleEditing).not.toHaveBeenCalled();
  });

  it('keeps an invalid title local, completes a valid one with Enter, and returns focus to the node', () => {
    const onCompleteTitleEditing = vi.fn((title: string) =>
      title.length === 0 ? 'A Thing title is required.' : null,
    );
    renderInNode(
      props({
        selected: true,
        titleEditingEnabled: true,
        titleEditor: { onComplete: onCompleteTitleEditing, onCancel: () => undefined },
      }),
    );
    const input = screen.getByRole('textbox', { name: 'Thing title' });

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Thing title is required.');
    expect(onCompleteTitleEditing).toHaveBeenLastCalledWith('');
    expect(document.querySelector('.react-flow__node')).not.toHaveFocus();

    fireEvent.change(input, { target: { value: 'Renamed A' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCompleteTitleEditing).toHaveBeenLastCalledWith('Renamed A');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.querySelector('.react-flow__node')).toHaveFocus();
  });

  it('completes on blur, cancels and returns focus to the node on Escape, without leaking editor events', () => {
    const onCompleteTitleEditing = vi.fn(() => null);
    const onCancelTitleEditing = vi.fn();
    const leakedClick = vi.fn();
    const leakedPointer = vi.fn();
    const leakedKey = vi.fn();
    render(
      <div className="react-flow__node" tabIndex={-1} onClick={leakedClick}>
        <div onPointerDown={leakedPointer} onKeyDown={leakedKey}>
          <ThingNode
            {...props({
              selected: true,
              titleEditingEnabled: true,
              titleEditor: {
                onComplete: onCompleteTitleEditing,
                onCancel: onCancelTitleEditing,
              },
            })}
          />
        </div>
      </div>,
    );
    const input = screen.getByRole('textbox', { name: 'Thing title' });

    fireEvent.change(input, { target: { value: 'Blurred A' } });
    fireEvent.pointerDown(input);
    fireEvent.click(input);
    fireEvent.blur(input);
    expect(onCompleteTitleEditing).toHaveBeenCalledWith('Blurred A');
    // A blur is the author clicking elsewhere; taking focus back would be a steal.
    expect(document.querySelector('.react-flow__node')).not.toHaveFocus();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancelTitleEditing).toHaveBeenCalledOnce();
    expect(document.querySelector('.react-flow__node')).toHaveFocus();
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

describe('ThingNode graph authoring', () => {
  /*
   * A handle does two jobs and ADR 0087 separates them. As an **anchor** it is
   * where an Edge meets a Thing, and that is not optional: a Thing inside a
   * Space Thing's embedded Diagram draws Edges while it withholds every
   * authoring control, and React Flow renders no Edge at all for a Thing whose
   * handles it cannot resolve. As an **affordance** it is where an author
   * begins or ends drawing, and that is what read-only withholds.
   */
  it('keeps the four anchors of each role on a read-only Thing', () => {
    render(<ThingNode {...props({ selected: true, readOnly: true })} />);

    expect(document.querySelectorAll('.rf-thing-node__authoring-handle--source')).toHaveLength(4);
    expect(document.querySelectorAll('.rf-thing-node__authoring-handle--target')).toHaveLength(4);
  });

  /*
   * The anchors are always in the DOM, so what withdraws the *affordance* from
   * an embedded or read-only Thing is the stylesheet, and this is what it reads.
   * The handles are `opacity: 0` at rest and revealed by hover, Selection or a
   * drag in flight; without this the reveal would fire on a Thing that cannot
   * be authored.
   */
  it('publishes whether its anchors are affordances, which is what the reveal reads', () => {
    const { rerender } = render(<ThingNode {...props({ readOnly: true })} />);
    expect(document.querySelector('.rf-thing-node__inner')).toHaveAttribute(
      'data-connection-authoring',
      'false',
    );

    rerender(<ThingNode {...props({ connectionAuthoringEnabled: false })} />);
    expect(document.querySelector('.rf-thing-node__inner')).toHaveAttribute(
      'data-connection-authoring',
      'false',
    );

    rerender(<ThingNode {...props({})} />);
    expect(document.querySelector('.rf-thing-node__inner')).toHaveAttribute(
      'data-connection-authoring',
      'true',
    );
  });

  it('offers no drag affordance on a read-only Thing', () => {
    render(<ThingNode {...props({ selected: true, readOnly: true })} />);

    expect(screen.queryByRole('button', { name: /^Connect from / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Connect to / })).not.toBeInTheDocument();
    const anchors = [...document.querySelectorAll('.rf-thing-node__authoring-handle')];
    expect(anchors.every((anchor) => anchor.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(anchors.every((anchor) => anchor.getAttribute('data-connectable') === 'false')).toBe(
      true,
    );
  });

  it('shows four active-Graph-coloured spatial source handles on a selected Thing', () => {
    render(<ThingNode {...props({ selected: true })} />);

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
  });

  it('starts a drag from a source handle while no Edge is being drawn', () => {
    render(<ThingNode {...props({ selected: true })} />);

    expect(connectable('Connect from', 'start')).toEqual([true, true, true, true]);
    expect(connectable('Connect to', 'end')).toEqual([false, false, false, false]);
  });

  it('ends a drag on a target handle while an Edge is being drawn', () => {
    connection.inProgress = true;

    render(<ThingNode {...props({ selected: true })} />);

    expect(connectable('Connect to', 'end')).toEqual([true, true, true, true]);
    expect(connectable('Connect from', 'start')).toEqual([false, false, false, false]);
    expect(document.querySelector('.rf-thing-node__inner')).toHaveAttribute(
      'data-connection-seeking',
      'target',
    );
  });

  it('withholds the seeking reveal when the pointer is not near the Thing', () => {
    connection.inProgress = true;
    proximity.near = false;

    render(<ThingNode {...props({ selected: true })} />);

    expect(document.querySelector('.rf-thing-node__inner')).toHaveAttribute(
      'data-connection-seeking',
      'none',
    );
    // Snap may still land once the pointer enters the magnet; eligibility alone
    // gates connectable-end, and with no provider every Thing stays eligible.
    expect(connectable('Connect to', 'end')).toEqual([true, true, true, true]);
  });

  it('withholds seeking ends when eligibility refuses the Thing', () => {
    connection.inProgress = true;

    render(
      <ConnectionEndEligibilityContext.Provider value={{ mayOffer: () => false }}>
        <ThingNode {...props({ selected: true })} />
      </ConnectionEndEligibilityContext.Provider>,
    );

    expect(document.querySelector('.rf-thing-node__inner')).toHaveAttribute(
      'data-connection-seeking',
      'none',
    );
    expect(connectable('Connect to', 'end')).toEqual([false, false, false, false]);
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

    render(<ThingNode {...props({ selected: true })} />);

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

      render(<ThingNode {...props({ selected: true, isConnectable: false })} />);

      expect(connectable(label, end)).toEqual([false, false, false, false]);
      expect(
        screen
          .getAllByRole('button', { name: new RegExp(`^${label} `) })
          .map((handle) => handle.getAttribute('data-connectable') === 'true'),
      ).toEqual([false, false, false, false]);
    },
  );
});

/*
 * `projection.ts` declares each laid-out Thing's handle geometry on the node, and
 * React Flow's `parseHandles` takes that in preference to measuring the DOM. A
 * forced remeasure replaces it with `getHandleBounds`, which reads the DOM and
 * whatever it happens to report at that instant — `offsetWidth` is 0 on a node
 * mid-transition, and a handle measured then is one an Edge attaches to at the
 * wrong point until something else re-declares it. So the contract with React
 * Flow is that we never ask.
 *
 * Asserting the absence of that call is the only seam that can say so: the loss
 * is visible in React Flow's node lookup and nowhere in the rendered output, and
 * a test reaching into that lookup would pin @xyflow/system's private shape.
 */
describe('ThingNode handle geometry', () => {
  beforeEach(() => {
    updateNodeInternals.mockClear();
  });

  it('leaves a freshly mounted Thing to React Flow, which measures it', () => {
    render(<ThingNode {...props()} />);

    expect(updateNodeInternals).not.toHaveBeenCalled();
  });

  it('leaves the declared geometry alone when Opening the Thing moves its anchors', () => {
    const { rerender } = render(<ThingNode {...props()} />);

    // An Open Thing occupies a larger rect, so all four of its anchors move
    // (ADR 0064). The projection re-declares them on a freshly allocated node,
    // which is the whole of how a moved anchor reaches React Flow.
    rerender(<ThingNode {...props({ expanded: true })} />);

    expect(updateNodeInternals).not.toHaveBeenCalled();
  });
});

/**
 * `canvas-thing.css` keeps the Thing's hover treatment alive while the pointer is
 * on one of the four authoring handles, which sit centred on the border and so
 * take the pointer out of `.canvas-thing`'s own box without taking it off the
 * Thing. It reads that through `:has(~ .rf-thing-node__authoring-handle:hover)`,
 * a *following*-sibling selector — so every authoring handle has to be a
 * sibling that follows the Thing, and a handle rendered before it is one the
 * rule silently cannot reach.
 */
test('renders every authoring handle as a sibling following the Thing', () => {
  render(<ThingNode {...props()} />);

  const thing = screen.getByTestId('thing');
  const inner = thing.parentElement;
  expect(inner).not.toBeNull();

  const children = [...inner!.children];
  const thingIndex = children.indexOf(thing);
  const authoringHandles = children.filter((child) =>
    child.classList.contains('rf-thing-node__authoring-handle'),
  );

  expect(authoringHandles).toHaveLength(8);
  for (const handle of authoringHandles) {
    expect(children.indexOf(handle)).toBeGreaterThan(thingIndex);
  }
});

describe('ThingNode Expanded Thing front', () => {
  const SOURCE = '# Strategies\n\nNo strategy is privileged.';

  it("draws the Thing's rendered Markdown on the Thing, and says the Thing is Expanded", () => {
    const { container } = render(<ThingNode {...props({ expanded: true, body: SOURCE })} />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Strategies' })).toBeVisible();
    expect(screen.getByText('No strategy is privileged.')).toBeVisible();
    // Both are read off the same fact — the slot's presence — so a Thing cannot
    // be sized as Expanded while drawing nothing, or the reverse.
    expect(screen.getByTestId('thing')).toHaveAttribute('data-expanded', 'true');
    expect(container.querySelector('.rf-thing-node__inner')).toHaveAttribute(
      'data-expanded',
      'true',
    );
  });

  it('draws its title alone until the Diagram Expands it', () => {
    const { container } = render(<ThingNode {...props({ body: SOURCE })} />);

    expect(
      screen.queryByRole('button', { name: 'Edit Markdown source of A' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('thing')).toHaveAttribute('data-expanded', 'false');
    expect(container.querySelector('.rf-thing-node__inner')).toHaveAttribute(
      'data-expanded',
      'false',
    );
  });

  it('does not mount a stale body editor until the Diagram Expands the Thing', () => {
    const { container } = render(
      <ThingNode
        {...props({
          expanded: false,
          body: SOURCE,
          bodyEditor: { onComplete: vi.fn(), onEnd: vi.fn() },
        })}
      />,
    );

    expect(screen.queryByRole('textbox', { name: 'Markdown source of A' })).not.toBeInTheDocument();
    expect(screen.getByTestId('thing')).toHaveAttribute('data-expanded', 'false');
    expect(container.querySelector('.rf-thing-node__inner')).toHaveAttribute(
      'data-expanded',
      'false',
    );
  });

  it("draws an Open Alias's resolved Markdown read-only under the Alias Title", () => {
    render(
      <ThingNode
        {...props({
          kind: 'alias',
          title: 'Return',
          expanded: true,
          body: SOURCE,
          thingEditingEnabled: true,
          onEditThing: vi.fn(),
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Return' })).toBeVisible();
    expect(screen.getByText('No strategy is privileged.')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Thing/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Thing Return' })).toBeVisible();
    expect(screen.getByTestId('thing')).toHaveAttribute('data-expanded', 'true');
  });

  it('keeps Expanding and renaming independent, because one is authored and the other a gesture', () => {
    render(
      <ThingNode
        {...props({
          expanded: true,
          body: SOURCE,
          titleEditingEnabled: true,
          titleEditor: { onComplete: () => null, onCancel: () => undefined },
        })}
      />,
    );

    // The title editor is open *and* the rendered body is drawn. A branch would have
    // made these exclusive; the slot is a prop precisely so they are not.
    expect(screen.getByRole('textbox', { name: 'Thing title' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Strategies' })).toBeVisible();
  });

  it('draws exactly one bottom-right resize control on an Expanded Thing given a resize operation', () => {
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(<ThingNode {...props({ expanded: true, body: SOURCE, resize })} />);

    // One control, not React Flow's eight — a bottom-right-only control cannot
    // move the authored origin by construction, so there is nothing else to draw.
    const controls = screen.getAllByTestId('resize-control');
    expect(controls).toHaveLength(1);
    expect(controls[0]).toHaveClass('react-flow__resize-control', 'bottom', 'right');
    expect(controls[0]).toHaveAttribute('data-min-width', '260');
    expect(controls[0]).toHaveAttribute('data-min-height', '146');
  });

  it('cancels an active resize when the interaction loses the window', () => {
    const onResizeCancel = vi.fn();
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd: () => undefined,
      onResizeCancel,
    };
    render(<ThingNode {...props({ expanded: true, body: SOURCE, resize })} />);

    fireEvent.mouseDown(screen.getByTestId('resize-control'));
    fireEvent.blur(window);

    expect(onResizeCancel).toHaveBeenCalledOnce();
  });

  it('proposes nothing from a gesture that was already cancelled', () => {
    const onResize = vi.fn();
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(<ThingNode {...props({ expanded: true, body: SOURCE, resize })} />);

    fireEvent.mouseDown(screen.getByTestId('resize-control'));
    fireEvent.blur(window);
    fireEvent.mouseMove(screen.getByTestId('resize-control'));

    // Losing the window discards the draft, but it does not end the drag:
    // d3-drag installs its own `mousemove`/`mouseup` on the window at
    // `mousedown` and removes them only at `mouseup`, so React Flow keeps
    // asking this Thing for geometry while the pointer is still down. A
    // cancelled gesture proposes nothing, so the Thing the author sees and the
    // draft the adapter holds cannot disagree.
    expect(onResize).not.toHaveBeenCalled();
  });

  it('proposes resize geometry without allowing React Flow to apply it locally', () => {
    const onResize = vi.fn();
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(<ThingNode {...props({ expanded: true, body: SOURCE, resize })} />);

    // The press is the gesture: geometry is proposed only from a drag this Thing
    // started, so a move without it proves nothing about the live one.
    fireEvent.mouseDown(screen.getByTestId('resize-control'));
    fireEvent.mouseMove(screen.getByTestId('resize-control'));

    expect(onResize).toHaveBeenCalledWith({ width: 620, height: 440 });
  });

  it('finishes the active draft on pointer release', () => {
    const onResizeEnd = vi.fn();
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd,
      onResizeCancel: () => undefined,
    };
    render(<ThingNode {...props({ expanded: true, body: SOURCE, resize })} />);

    fireEvent.mouseDown(screen.getByTestId('resize-control'));
    fireEvent.pointerUp(window);

    expect(onResizeEnd).toHaveBeenCalledOnce();
  });

  it('offers no resize control on a Collapsed Thing', () => {
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(<ThingNode {...props({ body: SOURCE, resize })} />);

    // A Collapsed Thing has no box the author drew, so nothing to resize.
    expect(screen.queryByTestId('resize-control')).not.toBeInTheDocument();
  });

  it('offers no resize control on an Expanded Thing the composition gave no resize operation', () => {
    render(<ThingNode {...props({ expanded: true, body: SOURCE })} />);
    // The capability carries its own floor, so a Thing offered no operation is
    // offered no control either — there is no minimum for this package to guess.
    expect(screen.queryByTestId('resize-control')).not.toBeInTheDocument();
  });

  it('offers a resize control on an Expanded Alias, because resize follows state rather than Thing kind', () => {
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(<ThingNode {...props({ kind: 'alias', expanded: true, resize })} />);

    // `projection.ts` never marks an Alias Expanded in production (ADR 0064), but
    // this Thing's own resize gate must not repeat that as a second opinion —
    // ADR 0066 makes resize Thing behaviour, not kind behaviour.
    expect(screen.getByTestId('resize-control')).toBeInTheDocument();
  });

  it('draws the inert resize mark behind the Thing, separately from the interactive control', () => {
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(<ThingNode {...props({ expanded: true, body: SOURCE, resize })} />);

    // The control owns the hit target's upper layer. The inert mark is its
    // preceding sibling so the later Thing face can occlude their overlap.
    const control = screen.getByTestId('resize-control');
    const mark = document.querySelector<HTMLElement>('.rf-thing-node__resize-mark');
    expect(mark).not.toBeNull();
    expect(control).not.toContainElement(mark);
    expect(mark?.nextElementSibling).toBe(control);
  });
});
