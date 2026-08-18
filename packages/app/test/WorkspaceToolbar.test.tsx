import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { PersistenceIndicator } from '@project/ui';
import { WorkspaceToolbar, type WorkspaceToolbarProps } from '../src/components/WorkspaceToolbar';

const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');

beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
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

    expect(screen.getByRole('menubar', { name: 'Workspace commands' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'View · Flow' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Layout · None' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Graph · None' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Present this Graph' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));
    expect(props.addCard.onAddCard).toHaveBeenCalledOnce();
    expect(screen.getByTestId('persistence-status')).toHaveAttribute('data-revision', '4');
  });

  it('exposes mutually exclusive View choices and forwards the chosen value', async () => {
    const props = settledProps();
    render(<WorkspaceToolbar {...props} />);

    fireEvent.click(screen.getByRole('menuitem', { name: 'View · Flow' }));
    const flow = await screen.findByRole('menuitemradio', { name: 'Flow' });
    const grid = screen.getByRole('menuitemradio', { name: 'Grid' });
    expect(flow).toHaveAttribute('aria-checked', 'true');
    expect(grid).toHaveAttribute('aria-checked', 'false');

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

    fireEvent.click(screen.getByRole('menuitem', { name: 'Graph · Authored' }));
    const choice = await screen.findByRole('menuitemradio', { name: 'Authored' });
    expect(choice.querySelector('[style]')).toHaveStyle({ background: '#123456' });
  });

  it('keeps persistence feedback outside the menu', () => {
    const props = settledProps();
    const { rerender } = render(<WorkspaceToolbar {...props} />);
    const menubar = screen.getByRole('menubar', { name: 'Workspace commands' });

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
    expect(menubar).not.toContainElement(screen.getByRole('button', { name: 'Saving changes' }));
  });
});
