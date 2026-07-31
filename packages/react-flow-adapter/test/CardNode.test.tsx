import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type * as ReactFlowReact from '@xyflow/react';
import { Position, type NodeProps } from '@xyflow/react';
import type { HTMLAttributes } from 'react';
import { vi } from 'vitest';
import { CardNode } from '../src/CardNode';
import type { CardFlowNode, CardHandle } from '../src/projection';
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
const { updateNodeInternals, connection } = vi.hoisted(() => ({
  updateNodeInternals: vi.fn(),
  /** The live connection React Flow reports, so a test can put a drag in flight. */
  connection: { inProgress: false },
}));

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
    useConnection: (selector: (state: { inProgress: boolean }) => unknown) => selector(connection),
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
});

const routeId = uuid('00000000-0000-4000-8000-000000000010');
const otherRouteId = uuid('00000000-0000-4000-8000-000000000011');
const cardId = uuid('00000000-0000-4000-8000-000000000001');

const outHandle = (route: typeof routeId, offsetY: number): CardHandle => ({
  id: `${route}::out`,
  routeId: route,
  color: '#6ea8fe',
  offsetY,
});

interface Overrides {
  selected?: boolean;
  title?: string;
  sourceHandles?: CardHandle[];
  targetHandles?: CardHandle[];
}

function props({
  selected = false,
  title = 'A',
  sourceHandles = [outHandle(routeId, 50)],
  targetHandles = [],
}: Overrides = {}): NodeProps<CardFlowNode> {
  return {
    id: cardId,
    selected,
    draggable: true,
    selectable: true,
    deletable: true,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    type: 'card',
    data: {
      cardId,
      title,
      active: false,
      selectedForAuthoring: false,
      showContent: false,
      activeRouteId: routeId,
      activeRouteColor: '#6ea8fe',
      emphasis: 'subtle',
      sourceHandles,
      targetHandles,
    },
  };
}

/** The four spatial handles of one role, read back as whether a drag may begin
 *  or end at each. */
const connectable = (label: 'Connect from' | 'Connect to', end: 'start' | 'end') =>
  screen
    .getAllByRole('button', { name: new RegExp(`^${label} `) })
    .map((handle) => handle.getAttribute(`data-connectable-${end}`) === 'true');

describe('CardNode route authoring', () => {
  it('shows four active-Route-coloured spatial source handles on a selected Card', () => {
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
});

/*
 * `projection.ts` declares each laid-out Card's handle geometry on the node, and
 * React Flow's `parseHandles` takes that in preference to measuring the DOM. A
 * forced remeasure replaces it with `getHandleBounds`, which reads *only* the
 * handles the DOM currently renders — the overview anchors of Routes the Card is
 * already on. The declarations for every other Route, which are what let an Edge
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

  it('leaves the declared geometry alone when a new Edge gives the Card another Route handle', () => {
    const { rerender } = render(<CardNode {...props()} />);

    rerender(
      <CardNode
        {...props({ sourceHandles: [outHandle(routeId, 50), outHandle(otherRouteId, 150)] })}
      />,
    );

    expect(updateNodeInternals).not.toHaveBeenCalled();
  });

  it('leaves the declared geometry alone when a strategy moves a handle the Card already had', () => {
    const { rerender } = render(<CardNode {...props()} />);

    rerender(<CardNode {...props({ sourceHandles: [outHandle(routeId, 210)] })} />);

    expect(updateNodeInternals).not.toHaveBeenCalled();
  });
});
