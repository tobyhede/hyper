import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceToolbar } from '../src/components/WorkspaceToolbar';

describe('WorkspaceToolbar', () => {
  it('renders the production controls in order and forwards Card creation', () => {
    const onAddCard = vi.fn();
    render(
      <div data-testid="toolbar">
        <WorkspaceToolbar
          view={{ value: 'flow', active: true, onValueChange: vi.fn() }}
          layout={{ layouts: [], value: null, active: false, onValueChange: vi.fn() }}
          graph={{
            graphs: [],
            colorByGraphId: {},
            activeGraphId: null,
            onActivate: vi.fn(),
            onPresent: vi.fn(),
            onExitPresenting: vi.fn(),
          }}
          addCard={{
            onAddCard,
            onAddAlias: vi.fn(),
            keyShortcut: 'C',
            menuTriggerRef: createRef<HTMLButtonElement>(),
          }}
          persistence={<span>Persistence slot</span>}
          persistenceState="settled"
          acknowledgedRevision={4n}
        />
      </div>,
    );

    const controls = [
      screen.getByRole('combobox', { name: 'Choose view' }),
      screen.getByRole('combobox', { name: 'Choose layout' }),
      screen.getByRole('group', { name: 'Graph controls' }),
      screen.getByRole('button', { name: 'Add Card' }),
      screen.getByText('Persistence slot'),
    ];
    const toolbar = screen.getByTestId('toolbar');
    expect(controls.every((control) => toolbar.contains(control))).toBe(true);
    for (let index = 1; index < controls.length; index += 1) {
      expect(controls[index - 1]?.compareDocumentPosition(controls[index] ?? toolbar)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }

    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));
    expect(onAddCard).toHaveBeenCalledOnce();
    expect(screen.getByTestId('persistence-status')).toHaveAttribute('data-revision', '4');
  });
});
