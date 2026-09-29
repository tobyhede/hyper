import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ChoiceMenu,
  ChoiceMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
} from '../src';

/**
 * A menu button inside a toolbar, drawn unavailable (ADR 0073).
 *
 * The Command Dock's Space, Map and Graph names are `ChoiceMenuTrigger`s and
 * its Open Spaces control is a `DropdownMenuTrigger`, each rendered through a
 * `ToolbarButton` so the Dock stays one tab stop. An unavailable one has to
 * announce itself through `aria-disabled`, keep its place in the arrow order
 * and open nothing — which is what a toolbar item owes, and what a native
 * `disabled` (a fieldset's included) takes away.
 *
 * Base UI supplies all three when the trigger itself is given `disabled`:
 * inside a toolbar the trigger is a composite item, so `useButton` withholds
 * the native property and the menu's click interaction is off. These hold
 * that for the two compositions the Dock draws, with `disabled` on the
 * trigger.
 *
 * Unavailability is read from `aria-disabled` and never from `toBeDisabled`:
 * a focusable disabled toolbar item is not natively disabled.
 */

type Unavailable = 'none' | 'choice' | 'dropdown';

function Bar({ unavailable, onChoose }: { unavailable: Unavailable; onChoose?: () => void }) {
  const choiceDisabled = unavailable === 'choice';
  const dropdownDisabled = unavailable === 'dropdown';
  return (
    <Toolbar aria-label="Bar">
      <ToolbarButton aria-label="Before" />
      <ToolbarGroup aria-label="Map">
        <ChoiceMenu
          label="Maps"
          choices={[
            { id: 'a', title: 'Map A' },
            { id: 'b', title: 'Map B' },
          ]}
          chosen="a"
          onChoose={onChoose ?? vi.fn()}
          trigger={
            <ChoiceMenuTrigger
              aria-label="Map: Map A"
              name="Map A"
              disabled={choiceDisabled}
              render={<ToolbarButton variant="ghost" size="compact" />}
            />
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Open Spaces"
            disabled={dropdownDisabled}
            render={<ToolbarButton variant="ghost" size="icon" />}
          />
          <DropdownMenuContent>
            <DropdownMenuItem>Meta</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>
      <ToolbarButton aria-label="After" />
    </Toolbar>
  );
}

const map = () => screen.getByRole('button', { name: 'Map: Map A' });
const spaces = () => screen.getByRole('button', { name: 'Open Spaces' });

describe.each([
  { unavailable: 'choice', subjects: [map] },
  { unavailable: 'dropdown', subjects: [spaces] },
] as const)('a menu button drawn unavailable by $unavailable', ({ unavailable, subjects }) => {
  it('reports aria-disabled and is not natively disabled', () => {
    render(<Bar unavailable={unavailable} />);

    for (const subject of subjects) {
      expect(subject()).toHaveAttribute('aria-disabled', 'true');
      expect(subject()).not.toHaveAttribute('disabled');
      expect(subject()).toHaveProperty('disabled', false);
    }
  });

  it('keeps its place in the arrow order and is moved past in order', async () => {
    render(<Bar unavailable={unavailable} />);
    const before = screen.getByRole('button', { name: 'Before' });
    const after = screen.getByRole('button', { name: 'After' });

    before.focus();
    for (const next of [map, spaces]) {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowRight' });
      await waitFor(() => expect(next()).toHaveFocus());
    }
    fireEvent.keyDown(spaces(), { key: 'ArrowRight' });
    await waitFor(() => expect(after).toHaveFocus());

    fireEvent.keyDown(after, { key: 'ArrowLeft' });
    await waitFor(() => expect(spaces()).toHaveFocus());
    fireEvent.keyDown(spaces(), { key: 'ArrowLeft' });
    await waitFor(() => expect(map()).toHaveFocus());
  });

  it('opens nothing on a pointer press, Enter or Space', async () => {
    const onChoose = vi.fn();
    render(<Bar unavailable={unavailable} onChoose={onChoose} />);

    for (const subject of subjects) {
      const control = subject();
      // A menu that opened would mount on the next frame, so the presses run
      // inside one act that waits a beat before asserting nothing did.
      await act(async () => {
        control.focus();
        fireEvent.pointerDown(control, { button: 0, pointerType: 'mouse' });
        fireEvent.mouseDown(control, { button: 0 });
        fireEvent.pointerUp(control, { button: 0, pointerType: 'mouse' });
        fireEvent.mouseUp(control, { button: 0 });
        fireEvent.click(control);
        fireEvent.keyDown(control, { key: 'Enter' });
        fireEvent.keyUp(control, { key: 'Enter' });
        fireEvent.keyDown(control, { key: ' ' });
        fireEvent.keyUp(control, { key: ' ' });
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(control).toHaveAttribute('aria-expanded', 'false');
    }
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe('a menu button that is available', () => {
  it('opens its menu, so the refusal above is the disabled state and not the harness', async () => {
    render(<Bar unavailable="none" />);

    expect(map()).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(map());
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
  });
});
