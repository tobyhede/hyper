import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { WorkspaceToolbar, type WorkspaceToolbarProps } from '../src/components/WorkspaceToolbar';

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
  persistence: { kind: 'settled' },
  acknowledgedRevision: 4n,
  onRetryPersistence: vi.fn(),
  onAcceptRemote: vi.fn(),
  onKeepLocal: vi.fn(),
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

  it('keeps settled persistence quiet and pending or rejected cues outside the menu', () => {
    const props = settledProps();
    const { rerender } = render(<WorkspaceToolbar {...props} />);
    const menubar = screen.getByRole('menubar', { name: 'Workspace commands' });

    expect(screen.queryByRole('button', { name: 'Changes saved' })).not.toBeInTheDocument();

    rerender(<WorkspaceToolbar {...props} persistence={{ kind: 'pending' }} />);
    expect(menubar).not.toContainElement(screen.getByRole('button', { name: 'Saving changes' }));

    rerender(
      <WorkspaceToolbar
        {...props}
        persistence={{
          kind: 'rejected',
          failure: { kind: 'permanent-failure', code: 'forbidden', message: 'Denied' },
        }}
      />,
    );
    expect(menubar).not.toContainElement(
      screen.getByRole('button', { name: 'Persistence rejected' }),
    );
  });

  it('renders retryable failure and conflict recovery as explicit commands', () => {
    const failed = settledProps();
    const { rerender } = render(
      <WorkspaceToolbar
        {...failed}
        persistence={{
          kind: 'failed',
          failure: { kind: 'retryable-failure', code: 'network', message: 'Offline' },
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry persistence' }));
    expect(failed.onRetryPersistence).toHaveBeenCalledOnce();

    const conflicted = settledProps();
    rerender(
      <WorkspaceToolbar
        {...conflicted}
        persistence={{
          kind: 'conflicted',
          current: {
            snapshot: {
              id: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
              document: { version: 1, title: 'Remote' },
              cards: [],
            },
            revision: 5n,
            exportedRevision: null,
          },
        }}
        remoteRefusal="The remote space is invalid"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accept remote' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep local' }));
    expect(conflicted.onAcceptRemote).toHaveBeenCalledOnce();
    expect(conflicted.onKeepLocal).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('The remote space is invalid');
  });
});
