import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as ReactFlowReact from '@xyflow/react';
import { Position, type NodeProps } from '@xyflow/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { vi } from 'vitest';
import { ResourceNode } from '../src/ResourceNode';
import { ConnectionEndEligibilityContext } from '../src/connection-end-eligibility';
import type { ResourceFlowNode, ResourceNodeData, ResourceTitleEditor } from '../src/projection';
import { uuid } from './uuid';

/**
 * React Flow is the system boundary here, so the mock stands in for it and the
 * assertions read what ResourceNode told it. `updateNodeInternals` is the whole of
 * React Flow's remeasure contract — it has no rendered consequence to observe —
 * and the real `useUpdateNodeInternals` reaches for a store this component is
 * deliberately rendered without. `ResourceNode` must not call it, and it is
 * stubbed so that a call is caught here rather than only in a browser.
 */
/** The live connection React Flow reports, so a test can put a drag in flight. */
interface MockConnectionState {
  inProgress: boolean;
  toNode?: { id: string };
}

const { updateNodeInternals, connection, proximity } = vi.hoisted(() => {
  const connection: MockConnectionState = {
    inProgress: false,
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

/** The floor and position `ResourceNode` hands React Flow's one bottom-right resize
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

/** The ids of the Resources the stood-in flow store holds selected. */
const flow = vi.hoisted(() => {
  const selected: string[] = [];
  return { selected };
});

/** The props `ResourceNode` hands React Flow's `NodeToolbar`. */
type MockNodeToolbarProps = {
  isVisible?: boolean;
  position?: string;
  align?: string;
  children?: ReactNode;
  'data-resource-rail-for'?: string;
};

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactFlowReact>();
  return {
    ...actual,
    useUpdateNodeInternals: () => updateNodeInternals,
    useViewport: () => ({ zoom: 1 }),
    useConnection: <T,>(selector: (state: MockConnectionState) => T): T => selector(connection),
    /** The flow store, read here only for how many Resources are selected. */
    useStore: <T,>(
      selector: (state: { nodes: readonly { id: string; selected: boolean }[] }) => T,
    ): T => selector({ nodes: flow.selected.map((id) => ({ id, selected: true })) }),
    /**
     * React Flow's own node toolbar, which portals into the flow's renderer and
     * so cannot render outside a provider. Stood in for with what it decides: its
     * children, drawn only while it is visible, carrying the props it forwards.
     */
    NodeToolbar: ({
      isVisible,
      position,
      align,
      children,
      'data-resource-rail-for': railFor,
    }: MockNodeToolbarProps) =>
      isVisible === true ? (
        <div
          className="react-flow__node-toolbar"
          data-position={position}
          data-align={align}
          data-resource-rail-for={railFor}
        >
          {children}
        </div>
      ) : null,
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
  flow.selected = [];
  connection.inProgress = false;
  delete connection.toNode;
  proximity.near = true;
});

const graphId = uuid('00000000-0000-4000-8000-000000000010');
const resourceId = uuid('00000000-0000-4000-8000-000000000001');

interface Overrides {
  selected?: boolean;
  selectedForAuthoring?: boolean;
  dragging?: boolean;
  /** What React Flow answers for this node from `nodesConnectable`/`node.connectable`. */
  isConnectable?: boolean;
  title?: string;
  kind?: ResourceNodeData['kind'];
  titleEditor?: ResourceTitleEditor;
  onEditResource?: (open: boolean) => void;
  onBeginTitleEditing?: () => void;
  expanded?: boolean;
  body?: string;
  onBeginBodyEditing?: () => void;
  bodyEditor?: ResourceNodeData['bodyEditor'];
  resize?: ResourceNodeData['resize'];
  readOnly?: boolean;
  connectionAuthoringEnabled?: boolean;
}

function props({
  selected = false,
  selectedForAuthoring = false,
  dragging = false,
  isConnectable = true,
  title = 'A',
  kind = 'markdown',
  titleEditor,
  onEditResource,
  onBeginTitleEditing,
  expanded,
  body,
  onBeginBodyEditing,
  bodyEditor,
  resize,
  readOnly = false,
  connectionAuthoringEnabled,
}: Overrides = {}): NodeProps<ResourceFlowNode> {
  const data: ResourceFlowNode['data'] = {
    resourceId,
    title,
    kind,
    active: false,
    selectedForAuthoring,
    showContent: false,
    activeGraphId: graphId,
    activeGraphColor: '#1f77b4',
    readOnly,
  };
  if (onEditResource !== undefined)
    data.onEditResource = (open) => {
      onEditResource(open);
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
    id: resourceId,
    selected,
    draggable: true,
    selectable: true,
    deletable: true,
    dragging,
    zIndex: 0,
    isConnectable,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    type: 'resource',
    data,
  };
}

/**
 * `ResourceNode`'s focus-restoration operation reaches for the `.react-flow__node`
 * ancestor React Flow itself renders around whatever this component returns —
 * an ancestor this test has to supply, since `ResourceNode` never renders it. The
 * class is React Flow's own, not a fixture invention: `SpaceCanvas.tsx` reads
 * it back the same way to focus a created or renamed Resource (`editing.spec.ts`,
 * `resource-rail-actions.test.tsx`).
 */
function renderInNode(node: NodeProps<ResourceFlowNode>): void {
  render(
    <div className="react-flow__node" tabIndex={-1}>
      <ResourceNode {...node} />
    </div>,
  );
}

describe('ResourceNode canvas Resource state adapter', () => {
  it('translates React Flow selection and dragging into shared visual states', () => {
    const { rerender } = render(<ResourceNode {...props({ selected: true })} />);

    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute('data-state', 'selected');

    rerender(<ResourceNode {...props({ dragging: true })} />);
    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute('data-state', 'dragging');
  });

  /*
   * A Resource being moved has one gesture, and its hover chrome is no part of it.
   * The anchors and the resize control are `opacity: 0` at rest and revealed by
   * hover, Selection or focus — every one of which a drag satisfies, the pointer
   * being on the Resource it is carrying and React Flow having Selected it. So the
   * withdrawal is stated where the reveal is decided, and this is the fact the
   * stylesheet reads to decide it.
   */
  it('publishes whether it is being moved, which is what the chrome reveal reads', () => {
    const { rerender } = render(<ResourceNode {...props({})} />);
    expect(document.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-dragging',
      'false',
    );

    rerender(<ResourceNode {...props({ dragging: true, selected: true })} />);
    expect(document.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-dragging',
      'true',
    );
  });

  it('renders a Reference Resource through the shared kind treatment', () => {
    render(
      <ResourceNode
        {...props({
          kind: 'reference',
          title: 'A, again',
          selected: true,
          onEditResource: vi.fn(),
        })}
      />,
    );

    expect(screen.getByRole('article', { name: 'A, again' })).toHaveAttribute(
      'data-kind',
      'reference',
    );
    expect(screen.getByRole('img', { name: 'Reference Resource' })).toBeVisible();
  });

  it('passes the Reference Resource metadata Open operation through its own front', () => {
    const onEditResource = vi.fn();
    render(
      <ResourceNode
        {...props({
          kind: 'reference',
          title: 'A, again',
          selected: true,
          onEditResource,
        })}
      />,
    );

    screen.getByRole('button', { name: 'Open Resource A, again' }).click();
    expect(onEditResource).toHaveBeenCalledWith(true);
  });

  it('draws a Markdown Resource kind glyph like any other kind', () => {
    render(
      <ResourceNode {...props({ kind: 'markdown', selected: true, onEditResource: vi.fn() })} />,
    );

    expect(screen.getByRole('img', { name: 'Markdown Resource' })).toBeVisible();
  });

  it('renders a Space Resource through an explicit non-Markdown front', () => {
    const onEditResource = vi.fn();
    const onBeginBodyEditing = vi.fn();
    render(
      <ResourceNode
        {...props({
          kind: 'space',
          expanded: true,
          body: 'must not render',
          onEditResource,
          onBeginBodyEditing,
        })}
      />,
    );

    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute('data-kind', 'space');
    expect(screen.queryByRole('img', { name: 'Space Resource' })).toBeNull();
    expect(screen.queryByText('must not render')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Resource A' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Resource A' })).toBeNull();
  });
});

describe("ResourceNode floats a Resource's commands in React Flow's NodeToolbar", () => {
  const toolbar = () => screen.queryByRole('toolbar', { name: 'Resource A' });

  it('draws them above the top-right corner while the Resource is the one selected', () => {
    flow.selected = [resourceId];
    render(<ResourceNode {...props({ selected: true, onEditResource: vi.fn() })} />);

    const floating = toolbar()?.closest('.react-flow__node-toolbar');
    expect(floating).toHaveAttribute('data-position', 'top');
    expect(floating).toHaveAttribute('data-align', 'end');
    expect(floating).toHaveAttribute('data-resource-rail-for', resourceId);
  });

  it('draws none on a Resource at rest', () => {
    render(<ResourceNode {...props({ onEditResource: vi.fn() })} />);
    expect(toolbar()).toBeNull();
  });

  it('draws none while several Resources are selected', () => {
    flow.selected = [resourceId, 'other'];
    render(<ResourceNode {...props({ selected: true, onEditResource: vi.fn() })} />);
    expect(toolbar()).toBeNull();
  });

  it('draws none for the authoring selection while React Flow holds another Resource selected', () => {
    flow.selected = ['other'];
    render(<ResourceNode {...props({ selectedForAuthoring: true, onEditResource: vi.fn() })} />);
    expect(toolbar()).toBeNull();
  });

  it('draws none while the Resource is dragged', () => {
    flow.selected = [resourceId];
    render(
      <ResourceNode {...props({ selected: true, dragging: true, onEditResource: vi.fn() })} />,
    );
    expect(toolbar()).toBeNull();
  });

  it('draws none while the Resource is resized', () => {
    flow.selected = [resourceId];
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(
      <ResourceNode
        {...props({
          selected: true,
          expanded: true,
          body: 'Body',
          resize,
          onEditResource: vi.fn(),
        })}
      />,
    );
    expect(toolbar()).not.toBeNull();

    fireEvent.mouseDown(screen.getByTestId('resize-control'));
    expect(toolbar()).toBeNull();
  });

  it('returns focus to the Resource when an edit ends on a Resource no longer selected', async () => {
    const running = props({
      expanded: true,
      body: 'Body',
      onEditResource: vi.fn(),
      bodyEditor: { onComplete: vi.fn(), onEnd: vi.fn() },
    });
    const inNode = (node: NodeProps<ResourceFlowNode>) => (
      <div className="react-flow__node" tabIndex={-1}>
        <ResourceNode {...node} />
      </div>
    );
    const { container, rerender } = render(inNode(running));
    await screen.findByRole('button', { name: 'Save Resource A' });

    // Save or Cancel ends the edit, and with it the reason the toolbar was drawn.
    rerender(inNode(props({ expanded: true, body: 'Body', onEditResource: vi.fn() })));

    expect(toolbar()).toBeNull();
    expect(container.querySelector('.react-flow__node')).toHaveFocus();
  });

  it('keeps the exits of a running edit although the Resource is no longer selected', () => {
    render(
      <ResourceNode
        {...props({
          expanded: true,
          body: 'Body',
          onEditResource: vi.fn(),
          bodyEditor: { onComplete: vi.fn(), onEnd: vi.fn() },
        })}
      />,
    );
    expect(toolbar()).not.toBeNull();
  });
});

describe('ResourceNode Open authoring', () => {
  /**
   * The pencil edits the Resource, not one field of it — it opens the Markdown
   * surface. Renaming is the title's own gesture and `F2`.
   */
  it('edits the Resource from the affordance, without touching the title', () => {
    const onEditResource = vi.fn();
    const onBeginTitleEditing = vi.fn();
    render(
      <ResourceNode
        {...props({
          selected: true,
          onEditResource,
          onBeginTitleEditing,
        })}
      />,
    );

    screen.getByRole('button', { name: 'Open Resource A' }).click();

    expect(onEditResource).toHaveBeenCalledOnce();
    expect(onBeginTitleEditing).not.toHaveBeenCalled();
  });

  it('offers no affordance on a Resource with no Open operation supplied', () => {
    render(<ResourceNode {...props({ selected: true })} />);

    expect(screen.queryByRole('button', { name: /^Open Resource/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A' })).toBeVisible();
  });
});

/**
 * Presence of the operation is the whole capability. `CanvasResource` omits a
 * control it has no operation for, and the adapter must not manufacture one on
 * its behalf.
 */
describe('ResourceNode withholds a control the composition supplied no operation for', () => {
  it('leaves the title unrenameable when no title-editing operation is supplied', () => {
    render(<ResourceNode {...props({ selected: true })} />);
    const heading = screen.getByRole('heading', { name: 'A' });

    // The heading is the Title Lines; `data-editable` is the Title's own box,
    // which the activation control wraps when there is one (ADR 0083).
    expect(heading.closest('.canvas-resource__title')).toHaveAttribute('data-editable', 'false');
    fireEvent.click(heading);
    expect(screen.queryByRole('textbox', { name: 'Resource title' })).not.toBeInTheDocument();
  });
});

describe('ResourceNode title authoring', () => {
  it('withdraws an active title editor when the Resource becomes read-only', () => {
    const titleEditor = { onComplete: vi.fn(() => null), onCancel: vi.fn() };
    const { rerender } = render(<ResourceNode {...props({ titleEditor })} />);
    expect(screen.getByRole('textbox', { name: 'Resource title' })).toBeVisible();

    rerender(<ResourceNode {...props({ titleEditor, readOnly: true })} />);

    expect(screen.queryByRole('textbox', { name: 'Resource title' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A' })).toBeVisible();
  });

  it('draws no shared Description slot on the Resource front', () => {
    render(<ResourceNode {...props()} />);

    expect(screen.queryByTestId('resource-description')).not.toBeInTheDocument();
  });

  it('begins inline title editing from the Title control', () => {
    const onBeginTitleEditing = vi.fn();
    const { rerender } = render(
      <ResourceNode {...props({ selected: true, onBeginTitleEditing })} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title A' }));
    expect(onBeginTitleEditing).toHaveBeenCalledOnce();

    rerender(
      <ResourceNode
        {...props({
          selected: true,
          titleEditor: { onComplete: () => null, onCancel: () => undefined },
          onBeginTitleEditing,
        })}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Resource title' })).toHaveValue('A');
  });

  it('keeps an invalid title local, completes a valid one with Enter, and returns focus to the node', () => {
    const onCompleteTitleEditing = vi.fn((title: string) =>
      title.length === 0 ? 'A Resource title is required.' : null,
    );
    renderInNode(
      props({
        selected: true,
        titleEditor: { onComplete: onCompleteTitleEditing, onCancel: () => undefined },
      }),
    );
    const input = screen.getByRole('textbox', { name: 'Resource title' });

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('A Resource title is required.');
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
          <ResourceNode
            {...props({
              selected: true,
              titleEditor: {
                onComplete: onCompleteTitleEditing,
                onCancel: onCancelTitleEditing,
              },
            })}
          />
        </div>
      </div>,
    );
    const input = screen.getByRole('textbox', { name: 'Resource title' });

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

/**
 * `readOnly` is the suppression a dormant embedded Resource relies on, and no
 * per-control flag stands beside it. `ResourceNode`
 * forwards `data.readOnly` to `CanvasResource`, which withholds Open/Close and
 * begin-title-edit regardless of whether the composition supplied the
 * operation — these cases supply it, so the assertion is genuinely about
 * `readOnly` and not about an absent operation.
 */
describe('ResourceNode readOnly suppresses controls despite a supplied operation', () => {
  it('withholds the Open control from a read-only Closed Resource', () => {
    const onEditResource = vi.fn();
    render(<ResourceNode {...props({ selected: true, readOnly: true, onEditResource })} />);

    expect(screen.queryByRole('button', { name: 'Open Resource A' })).not.toBeInTheDocument();
  });

  it('withholds the Close control from a read-only Open Resource', () => {
    const onEditResource = vi.fn();
    render(
      <ResourceNode
        {...props({ selected: true, readOnly: true, expanded: true, body: 'x', onEditResource })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Close Resource A' })).not.toBeInTheDocument();
  });

  it('withholds the begin-title-edit affordance from a read-only Resource', () => {
    const onBeginTitleEditing = vi.fn();
    render(<ResourceNode {...props({ selected: true, readOnly: true, onBeginTitleEditing })} />);

    expect(screen.queryByRole('button', { name: 'Edit Title A' })).not.toBeInTheDocument();
  });
});

/** The four spatial handles of one role, read back as whether a drag may begin
 *  or end at each. */
const connectable = (label: 'Connect from' | 'Connect to', end: 'start' | 'end') =>
  screen
    .getAllByRole('button', { name: new RegExp(`^${label} `) })
    .map((handle) => handle.getAttribute(`data-connectable-${end}`) === 'true');

describe('ResourceNode graph authoring', () => {
  /*
   * A handle does two jobs and ADR 0087 separates them. As an **anchor** it is
   * where an Edge meets a Resource, and that is not optional: a Resource inside a
   * Space Resource's embedded Map draws Edges while it withholds every
   * authoring control, and React Flow renders no Edge at all for a Resource whose
   * handles it cannot resolve. As an **affordance** it is where an author
   * begins or ends drawing, and that is what read-only withholds.
   */
  it('keeps the four anchors of each role on a read-only Resource', () => {
    render(<ResourceNode {...props({ selected: true, readOnly: true })} />);

    expect(document.querySelectorAll('.rf-resource-node__authoring-handle--source')).toHaveLength(
      4,
    );
    expect(document.querySelectorAll('.rf-resource-node__authoring-handle--target')).toHaveLength(
      4,
    );
  });

  /*
   * The anchors are always in the DOM, so what withdraws the *affordance* from
   * an embedded or read-only Resource is the stylesheet, and this is what it reads.
   * The handles are `opacity: 0` at rest and revealed by hover, Selection or a
   * drag in flight; without this the reveal would fire on a Resource that cannot
   * be authored.
   */
  it('publishes whether its anchors are affordances, which is what the reveal reads', () => {
    const { rerender } = render(<ResourceNode {...props({ readOnly: true })} />);
    expect(document.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-connection-authoring',
      'false',
    );

    rerender(<ResourceNode {...props({ connectionAuthoringEnabled: false })} />);
    expect(document.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-connection-authoring',
      'false',
    );

    rerender(<ResourceNode {...props({})} />);
    expect(document.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-connection-authoring',
      'true',
    );
  });

  it('offers no drag affordance on a read-only Resource', () => {
    render(<ResourceNode {...props({ selected: true, readOnly: true })} />);

    expect(screen.queryByRole('button', { name: /^Connect from / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Connect to / })).not.toBeInTheDocument();
    const anchors = [...document.querySelectorAll('.rf-resource-node__authoring-handle')];
    expect(anchors.every((anchor) => anchor.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(anchors.every((anchor) => anchor.getAttribute('data-connectable') === 'false')).toBe(
      true,
    );
  });

  it('shows four active-Graph-coloured spatial source handles on a selected Resource', () => {
    render(<ResourceNode {...props({ selected: true })} />);

    const handles = screen.getAllByRole('button', { name: /^Connect from / });
    expect(handles).toHaveLength(4);
    expect(handles.map((handle) => handle.getAttribute('aria-label'))).toEqual([
      `Connect from ${Position.Top}`,
      `Connect from ${Position.Right}`,
      `Connect from ${Position.Bottom}`,
      `Connect from ${Position.Left}`,
    ]);
    expect(handles.every((handle) => handle.style.backgroundColor === 'rgb(31, 119, 180)')).toBe(
      true,
    );
  });

  it('starts a drag from a source handle while no Edge is being drawn', () => {
    render(<ResourceNode {...props({ selected: true })} />);

    expect(connectable('Connect from', 'start')).toEqual([true, true, true, true]);
    expect(connectable('Connect to', 'end')).toEqual([false, false, false, false]);
  });

  it('ends a drag on a target handle while an Edge is being drawn', () => {
    connection.inProgress = true;

    render(<ResourceNode {...props({ selected: true })} />);

    expect(connectable('Connect to', 'end')).toEqual([true, true, true, true]);
    expect(connectable('Connect from', 'start')).toEqual([false, false, false, false]);
    expect(document.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-connection-seeking',
      'target',
    );
  });

  it('reveals seeking ends when React Flow has snapped to the Resource', () => {
    connection.inProgress = true;
    connection.toNode = { id: resourceId };
    proximity.near = false;

    render(<ResourceNode {...props({ selected: true })} />);

    expect(document.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-connection-seeking',
      'target',
    );
  });

  it('withholds the seeking reveal when the pointer is not near the Resource', () => {
    connection.inProgress = true;
    proximity.near = false;

    render(<ResourceNode {...props({ selected: true })} />);

    expect(document.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-connection-seeking',
      'none',
    );
    // Snap may still land once the pointer enters the magnet; eligibility alone
    // gates connectable-end, and with no provider every Resource stays eligible.
    expect(connectable('Connect to', 'end')).toEqual([true, true, true, true]);
  });

  it('withholds seeking ends when eligibility refuses the Resource', () => {
    connection.inProgress = true;

    render(
      <ConnectionEndEligibilityContext.Provider value={{ mayOffer: () => false }}>
        <ResourceNode {...props({ selected: true })} />
      </ConnectionEndEligibilityContext.Provider>,
    );

    expect(document.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-connection-seeking',
      'none',
    );
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
   * points for overview Edges — so they are what the switch has to reach, or
   * the flow-level flag governs nothing but whether the connection *line*
   * renders. CSS hiding the handles while presenting is presentation, not a
   * withdrawal: a withdrawal that depends on something being drawn over it
   * leaves a hidden control with a live gesture.
   */
  it.each([
    ['no drag in flight', false, 'Connect from' as const, 'start' as const],
    ['a drag looking for a target', true, 'Connect to' as const, 'end' as const],
  ])(
    'offers no connectable handle when the flow is not connectable, with %s',
    (_name, inProgress, label, end) => {
      connection.inProgress = inProgress;

      render(<ResourceNode {...props({ selected: true, isConnectable: false })} />);

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
 * `projection.ts` declares each laid-out Resource's handle geometry on the node, and
 * React Flow's `parseHandles` takes that in preference to measuring the DOM, so
 * `ResourceNode` leaves measuring to React Flow and never calls
 * `updateNodeInternals` itself. React Flow's own resize observer re-reads the
 * handles from the DOM when a node changes size regardless; these tests hold
 * only that the component adds no call of its own.
 *
 * Asserting the absence of that call is the only seam that can say so: its
 * effect is in React Flow's node lookup and nowhere in the rendered output, and
 * a test reaching into that lookup would pin @xyflow/system's private shape.
 */
describe('ResourceNode handle geometry', () => {
  beforeEach(() => {
    updateNodeInternals.mockClear();
  });

  it('leaves a freshly mounted Resource to React Flow, which measures it', () => {
    render(<ResourceNode {...props()} />);

    expect(updateNodeInternals).not.toHaveBeenCalled();
  });

  it('leaves the declared geometry alone when Opening the Resource moves its anchors', () => {
    const { rerender } = render(<ResourceNode {...props()} />);

    // An Open Resource occupies a larger rect, so all four of its anchors move
    // (ADR 0064). The projection re-declares them on a freshly allocated node,
    // which is the whole of how a moved anchor reaches React Flow.
    rerender(<ResourceNode {...props({ expanded: true })} />);

    expect(updateNodeInternals).not.toHaveBeenCalled();
  });
});

/**
 * `canvas-resource.css` keeps the Resource's hover treatment alive while the pointer is
 * on one of the four authoring handles, which sit centred on the border and so
 * take the pointer out of `.canvas-resource`'s own box without taking it off the
 * Resource. It reads that through `:has(~ .rf-resource-node__authoring-handle:hover)`,
 * a *following*-sibling selector — so every authoring handle has to be a
 * sibling that follows the Resource, and a handle rendered before it is one the
 * rule silently cannot reach.
 */
test('renders every authoring handle as a sibling following the Resource', () => {
  render(<ResourceNode {...props()} />);

  const resource = screen.getByTestId('resource');
  const inner = resource.parentElement;
  expect(inner).not.toBeNull();

  const children = [...inner!.children];
  const resourceIndex = children.indexOf(resource);
  const authoringHandles = children.filter((child) =>
    child.classList.contains('rf-resource-node__authoring-handle'),
  );

  expect(authoringHandles).toHaveLength(8);
  for (const handle of authoringHandles) {
    expect(children.indexOf(handle)).toBeGreaterThan(resourceIndex);
  }
});

describe('ResourceNode Expanded Resource front', () => {
  const SOURCE = '# Strategies\n\nNo strategy is privileged.';

  it("draws the Resource's rendered Markdown on the Resource, and says the Resource is Expanded", () => {
    const { container } = render(<ResourceNode {...props({ expanded: true, body: SOURCE })} />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Strategies' })).toBeVisible();
    expect(screen.getByText('No strategy is privileged.')).toBeVisible();
    // Both are read off the same fact — the slot's presence — so a Resource cannot
    // be sized as Expanded while drawing nothing, or the reverse.
    expect(screen.getByTestId('resource')).toHaveAttribute('data-expanded', 'true');
    expect(container.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-expanded',
      'true',
    );
  });

  it('draws its title alone until the Map Expands it', () => {
    const { container } = render(<ResourceNode {...props({ body: SOURCE })} />);

    expect(
      screen.queryByRole('button', { name: 'Edit Markdown source of A' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('resource')).toHaveAttribute('data-expanded', 'false');
    expect(container.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-expanded',
      'false',
    );
  });

  it('does not mount a stale body editor until the Map Expands the Resource', () => {
    const { container } = render(
      <ResourceNode
        {...props({
          expanded: false,
          body: SOURCE,
          bodyEditor: { onComplete: vi.fn(), onEnd: vi.fn() },
        })}
      />,
    );

    expect(screen.queryByRole('textbox', { name: 'Markdown source of A' })).not.toBeInTheDocument();
    expect(screen.getByTestId('resource')).toHaveAttribute('data-expanded', 'false');
    expect(container.querySelector('.rf-resource-node__inner')).toHaveAttribute(
      'data-expanded',
      'false',
    );
  });

  it("draws an Open Reference Resource's resolved Markdown read-only under the Reference Resource Title", () => {
    render(
      <ResourceNode
        {...props({
          kind: 'reference',
          title: 'Return',
          expanded: true,
          body: SOURCE,
          selected: true,
          onEditResource: vi.fn(),
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Return' })).toBeVisible();
    expect(screen.getByText('No strategy is privileged.')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Resource/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Resource Return' })).toBeVisible();
    expect(screen.getByTestId('resource')).toHaveAttribute('data-expanded', 'true');
  });

  it('keeps Expanding and renaming independent, because one is authored and the other a gesture', () => {
    render(
      <ResourceNode
        {...props({
          expanded: true,
          body: SOURCE,
          titleEditor: { onComplete: () => null, onCancel: () => undefined },
        })}
      />,
    );

    // The title editor is open *and* the rendered body is drawn. A branch would have
    // made these exclusive; the slot is a prop precisely so they are not.
    expect(screen.getByRole('textbox', { name: 'Resource title' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Strategies' })).toBeVisible();
  });

  it('draws exactly one bottom-right resize control on an Expanded Resource given a resize operation', () => {
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(<ResourceNode {...props({ expanded: true, body: SOURCE, resize })} />);

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
    render(<ResourceNode {...props({ expanded: true, body: SOURCE, resize })} />);

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
    render(<ResourceNode {...props({ expanded: true, body: SOURCE, resize })} />);

    fireEvent.mouseDown(screen.getByTestId('resize-control'));
    fireEvent.blur(window);
    fireEvent.mouseMove(screen.getByTestId('resize-control'));

    // Losing the window discards the draft, but it does not end the drag:
    // d3-drag installs its own `mousemove`/`mouseup` on the window at
    // `mousedown` and removes them only at `mouseup`, so React Flow keeps
    // asking this Resource for geometry while the pointer is still down. A
    // cancelled gesture proposes nothing, so the Resource the author sees and the
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
    render(<ResourceNode {...props({ expanded: true, body: SOURCE, resize })} />);

    // The press is the gesture: geometry is proposed only from a drag this Resource
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
    render(<ResourceNode {...props({ expanded: true, body: SOURCE, resize })} />);

    fireEvent.mouseDown(screen.getByTestId('resize-control'));
    fireEvent.pointerUp(window);

    expect(onResizeEnd).toHaveBeenCalledOnce();
  });

  it('offers no resize control on a Collapsed Resource', () => {
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(<ResourceNode {...props({ body: SOURCE, resize })} />);

    // A Collapsed Resource has no box the author drew, so nothing to resize.
    expect(screen.queryByTestId('resize-control')).not.toBeInTheDocument();
  });

  it('offers no resize control on an Expanded Resource the composition gave no resize operation', () => {
    render(<ResourceNode {...props({ expanded: true, body: SOURCE })} />);
    // The capability carries its own floor, so a Resource offered no operation is
    // offered no control either — there is no minimum for this package to guess.
    expect(screen.queryByTestId('resize-control')).not.toBeInTheDocument();
  });

  it('offers a resize control on an Expanded Reference Resource, because resize follows state rather than Resource kind', () => {
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(<ResourceNode {...props({ kind: 'reference', expanded: true, resize })} />);

    // The resize gate reads Expanded and never the kind: ADR 0066 makes resize
    // Resource behaviour, not kind behaviour.
    expect(screen.getByTestId('resize-control')).toBeInTheDocument();
  });

  it('draws the inert resize mark behind the Resource, separately from the interactive control', () => {
    const resize = {
      minWidth: 260,
      minHeight: 146,
      onResizeStart: () => undefined,
      onResize: () => undefined,
      onResizeEnd: () => undefined,
      onResizeCancel: () => undefined,
    };
    render(<ResourceNode {...props({ expanded: true, body: SOURCE, resize })} />);

    // The control owns the hit target's upper layer. The inert mark is its
    // preceding sibling so the later Resource face can occlude their overlap.
    const control = screen.getByTestId('resize-control');
    const mark = document.querySelector<HTMLElement>('.rf-resource-node__resize-mark');
    expect(mark).not.toBeNull();
    expect(control).not.toContainElement(mark);
    expect(mark?.nextElementSibling).toBe(control);
  });
});
