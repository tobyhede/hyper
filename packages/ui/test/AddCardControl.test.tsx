import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AddCardControl } from '../src/index';

/**
 * Radix's menu positions itself through Popper, which measures. jsdom ships
 * neither `ResizeObserver` nor pointer capture, and both are reached before the
 * menu can open at all.
 */
beforeAll(() => {
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

describe('AddCardControl', () => {
  /**
   * Add Card creates immediately — there is no placement mode, no ghost and no
   * second click — so the primary half must not be a menu that has to be opened
   * first. That is the whole reason this is a split control rather than one
   * trigger with two items.
   */
  it('creates a Markdown Card on one activation, without opening the menu', () => {
    const onAddCard = vi.fn();
    const onAddAlias = vi.fn();
    render(<AddCardControl onAddCard={onAddCard} onAddAlias={onAddAlias} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));

    expect(onAddCard).toHaveBeenCalledTimes(1);
    expect(onAddAlias).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  /** `C` is the only unmodified authoring shortcut, and it is announced here. */
  it('announces the Add Card shortcut on the control that performs it', () => {
    render(<AddCardControl onAddCard={vi.fn()} onAddAlias={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Add Card' })).toHaveAttribute(
      'aria-keyshortcuts',
      'C',
    );
  });

  /**
   * Add Alias has no letter key of its own — the visible control *is* its
   * keyboard path — so the menu has to open and select from the keyboard alone.
   */
  it('reaches Add Alias from the keyboard through the menu', () => {
    const onAddCard = vi.fn();
    const onAddAlias = vi.fn();
    render(<AddCardControl onAddCard={onAddCard} onAddAlias={onAddAlias} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'More Card kinds' }), { key: 'Enter' });
    // Radix moves focus onto the first item as the menu opens, and activates it
    // from the key rather than from a click. Asserting that here is the
    // difference between "the item exists" and "the keyboard reaches it".
    const item = screen.getByRole('menuitem', { name: 'Add Alias' });
    expect(item).toHaveFocus();
    fireEvent.keyDown(item, { key: 'Enter' });

    expect(onAddAlias).toHaveBeenCalledTimes(1);
    expect(onAddCard).not.toHaveBeenCalled();
  });

  /**
   * Both halves go together. Card authoring is withdrawn while a Card is open
   * over the graph, while presenting, and before the first arrangement resolves
   * — and a menu that still opened onto an action nothing would perform would be
   * a control that says yes and does nothing.
   */
  it('withdraws both halves when Card authoring is unavailable', () => {
    render(<AddCardControl onAddCard={vi.fn()} onAddAlias={vi.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Add Card' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'More Card kinds' })).toBeDisabled();
  });
});
