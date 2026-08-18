import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { PersistenceIndicator } from '@project/ui';
import { WorkspaceToolbar, type WorkspaceToolbarProps } from '../src/components/WorkspaceToolbar';

const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
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

const settledProps = (): WorkspaceToolbarProps => ({
  view: { value: 'flow', active: true, onValueChange: vi.fn() },
  layout: { layouts: [], value: null, active: false, onValueChange: vi.fn() },
  graph: {
    graphs: [],
    colorByGraphId: {},
    activeGraphId: null,
    onActivate: vi.fn(),
    onPresent: vi.fn(),
    onExitPresenting: vi.fn(),
  },
  addCard: {
    onAddCard: vi.fn(),
    onAddAlias: vi.fn(),
    keyShortcut: 'C',
    menuTriggerRef: createRef<HTMLButtonElement>(),
  },
  persistence: {
    control: <PersistenceIndicator state="settled" />,
    state: 'settled',
    acknowledgedRevision: 4n,
  },
});

describe('WorkspaceToolbar', () => {
  it('renders the persistent workspace commands and forwards Card creation', () => {
    const props = settledProps();
    render(<WorkspaceToolbar {...props} />);

    expect(screen.getByRole('combobox', { name: 'Choose view' })).toHaveTextContent('Flow');
    expect(screen.getByRole('combobox', { name: 'Choose layout' })).toHaveTextContent('None');
    expect(screen.getByRole('combobox', { name: 'Active Graph' })).toHaveTextContent('None');
    expect(screen.getByRole('button', { name: 'Present this Graph' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));
    expect(props.addCard.onAddCard).toHaveBeenCalledOnce();
    expect(screen.getByTestId('persistence-status')).toHaveAttribute('data-revision', '4');
  });

  it('exposes mutually exclusive View choices and forwards the chosen value', async () => {
    const props = settledProps();
    render(<WorkspaceToolbar {...props} />);

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Choose view' }), { key: 'ArrowDown' });
    const flow = await screen.findByRole('option', { name: 'Flow' });
    const grid = screen.getByRole('option', { name: 'Grid' });
    expect(flow).toHaveAttribute('aria-selected', 'true');
    expect(grid).toHaveAttribute('aria-selected', 'false');

    fireEvent.pointerDown(grid, { pointerType: 'mouse' });
    fireEvent.click(grid);
    expect(props.view.onValueChange).toHaveBeenCalledWith('grid');
  });

  it('uses an authored Graph colour when no resolved colour is available', async () => {
    const base = settledProps();
    const props: WorkspaceToolbarProps = {
      ...base,
      graph: {
        ...base.graph,
        graphs: [{ id: GRAPH_ID, title: 'Authored', color: '#123456', edges: [] }],
        activeGraphId: GRAPH_ID,
      },
    };
    render(<WorkspaceToolbar {...props} />);

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Active Graph' }), { key: 'ArrowDown' });
    const choice = await screen.findByRole('option', { name: 'Authored' });
    expect(choice.querySelector('[style]')).toHaveStyle({ background: '#123456' });
  });

  /**
   * A Layout is created with its initial Active Graph empty (ADR 0040), so this
   * is the state every conversion out of a View leaves behind until the author
   * draws an Edge. `graphStartCard` has no answer for it, so `present()` would
   * return having changed nothing — the control must say so rather than accept a
   * click and do nothing.
   */
  it('cannot present an active Graph that holds no Edges', () => {
    const base = settledProps();
    const props: WorkspaceToolbarProps = {
      ...base,
      graph: {
        ...base.graph,
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraphId: GRAPH_ID,
      },
    };
    render(<WorkspaceToolbar {...props} />);

    const present = screen.getByRole('button', { name: 'Present this Graph' });
    expect(present).toBeDisabled();
    fireEvent.click(present);
    expect(props.graph.onPresent).not.toHaveBeenCalled();
  });

  it('exits presenting through the Overview action', () => {
    const base = settledProps();
    const props: WorkspaceToolbarProps = {
      ...base,
      graph: {
        ...base.graph,
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [{ from: CARD_A, to: CARD_B }] }],
        activeGraphId: GRAPH_ID,
        presenting: true,
      },
    };
    render(<WorkspaceToolbar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Return to overview' }));

    expect(props.graph.onExitPresenting).toHaveBeenCalledOnce();
    expect(props.graph.onPresent).not.toHaveBeenCalled();
  });

  it('colours Present with the active Graph', () => {
    const base = settledProps();
    const props: WorkspaceToolbarProps = {
      ...base,
      graph: {
        ...base.graph,
        graphs: [
          {
            id: GRAPH_ID,
            title: 'Authored',
            color: '#123456',
            edges: [{ from: CARD_A, to: CARD_B }],
          },
        ],
        activeGraphId: GRAPH_ID,
      },
    };
    render(<WorkspaceToolbar {...props} />);

    const present = screen.getByRole('button', { name: 'Present this Graph' });
    expect(present).toBeEnabled();
    expect(present.querySelector('svg')).toHaveAttribute('stroke', '#123456');
  });

  it('keeps persistence feedback out of the selectors', () => {
    const props = settledProps();
    const { rerender } = render(<WorkspaceToolbar {...props} />);

    expect(screen.queryByRole('button', { name: 'Changes saved' })).not.toBeInTheDocument();

    rerender(
      <WorkspaceToolbar
        {...props}
        persistence={{
          control: <PersistenceIndicator state="pending" />,
          state: 'pending',
          acknowledgedRevision: 4n,
        }}
      />,
    );
    const saving = screen.getByRole('button', { name: 'Saving changes' });
    for (const name of ['Choose view', 'Choose layout', 'Active Graph']) {
      expect(screen.getByRole('combobox', { name })).not.toContainElement(saving);
    }
  });
});
