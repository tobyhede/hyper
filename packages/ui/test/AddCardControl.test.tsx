import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AddCardControl } from '../src/index';

/**
 * Base UI's menu positions itself through Floating UI, which measures. jsdom ships
 * neither `ResizeObserver` nor pointer capture, and both are reached before the
 * menu can open at all.
 */
beforeAll(() => {
  // Base UI dispatches a PointerEvent when a keyboard-activated menu item
  // completes. jsdom exposes MouseEvent but not its PointerEvent subclass.
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

/**
 * Only the global. The three prototype assignments above are left standing, as
 * they are in every other file that makes them — restoring one file's and not
 * the other eleven's would read as a rule nobody follows.
 */
afterAll(() => vi.unstubAllGlobals());

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

  /**
   * The shortcut is announced on the control that performs it — but it is the
   * caller's to name, because the caller is where the key is actually bound.
   * A literal here would be this package asserting a binding it cannot see.
   */
  it('announces the shortcut its caller says performs it', () => {
    render(<AddCardControl onAddCard={vi.fn()} onAddAlias={vi.fn()} keyShortcut="C" />);

    expect(screen.getByRole('button', { name: 'Add Card' })).toHaveAttribute(
      'aria-keyshortcuts',
      'C',
    );
  });

  /**
   * And announces none where the caller names none. An `aria-keyshortcuts` a
   * caller never claimed is a promise to a screen reader that nothing keeps.
   */
  it('announces no shortcut where its caller names none', () => {
    render(<AddCardControl onAddCard={vi.fn()} onAddAlias={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Add Card' })).not.toHaveAttribute(
      'aria-keyshortcuts',
    );
  });

  /**
   * Add Alias has no letter key of its own — the visible control *is* its
   * keyboard path — so the menu has to open and select from the keyboard alone.
   */
  it('reaches Add Alias from the keyboard through the menu', async () => {
    const onAddCard = vi.fn();
    const onAddAlias = vi.fn();
    render(<AddCardControl onAddCard={onAddCard} onAddAlias={onAddAlias} />);

    const trigger = screen.getByRole('button', { name: 'More Card kinds' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    // A native button's Enter activation follows keydown with a click. Base UI
    // deliberately keeps that browser contract, while Radix opened from the
    // synthetic keydown alone, so jsdom needs the native activation completed.
    fireEvent.click(trigger, { detail: 0 });
    // Base UI moves focus onto the first item as the menu opens, and activates
    // it from the key rather than from a pointer click. Asserting that here is
    // the difference between "the item exists" and "the keyboard reaches it".
    const item = screen.getByRole('menuitem', { name: 'Add Alias' });
    await waitFor(() => expect(item).toHaveFocus());
    fireEvent.keyDown(item, { key: 'Enter' });

    expect(onAddAlias).toHaveBeenCalledTimes(1);
    expect(onAddCard).not.toHaveBeenCalled();
  });

  it('returns focus to its trigger when the menu is dismissed', async () => {
    render(<AddCardControl onAddCard={vi.fn()} onAddAlias={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'More Card kinds' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    await waitFor(() => expect(trigger).toHaveFocus());
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

  it('keeps a visible keyboard focus indicator on the menu trigger', () => {
    render(<AddCardControl onAddCard={vi.fn()} onAddAlias={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'More Card kinds' });
    expect(trigger.className).not.toContain('focus-visible:outline-none');
    expect(trigger.className).toContain('focus-visible:outline-2');
  });
});
