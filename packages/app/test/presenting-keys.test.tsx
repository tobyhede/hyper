import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePresentingKeys, type TraversalCommands } from '../src/presenting-keys';

/**
 * The global Traversal keys, and what they decline to do.
 *
 * Every command here is Navigation's, so the traversal itself is `navigation.test.ts`'s
 * business. What this owns is the binding: which key runs which operation, when
 * the listener is live at all, and the rule that keeps a global `keydown` from
 * running one command while the browser runs another on the same press.
 */

/** The operations, each a spy — inferred, so a call is still inspectable. */
const commands = () => ({
  advance: vi.fn(),
  retreat: vi.fn(),
  returnToStart: vi.fn(),
  selectBranch: vi.fn(),
  exitPresenting: vi.fn(),
  openNotes: vi.fn(),
  toggleNotes: vi.fn(),
});

function Presenting({
  active = true,
  traversal,
}: {
  readonly active?: boolean;
  readonly traversal: TraversalCommands;
}) {
  usePresentingKeys(active, traversal);
  return (
    <>
      <button type="button" onClick={() => undefined}>
        Overview
      </button>
      {/* A surface over the canvas, of the shape the Sidebar Sheet takes
          below its breakpoint. */}
      <div role="dialog" aria-label="Sidebar">
        <button type="button">Present</button>
      </div>
    </>
  );
}

describe('the global Presenting keys', () => {
  it('binds each Traversal command while a traversal is on', () => {
    const traversal = commands();
    render(<Presenting traversal={traversal} />);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: ' ' });

    expect(traversal.advance).toHaveBeenCalledTimes(2);
    expect(traversal.retreat).toHaveBeenCalledTimes(1);
    expect(traversal.selectBranch.mock.calls).toEqual([[-1], [1]]);
    expect(traversal.exitPresenting).toHaveBeenCalledTimes(1);
  });

  it('answers a presentation clicker: Page Down goes on, Page Up goes back, Home starts again', () => {
    const traversal = commands();
    render(<Presenting traversal={traversal} />);

    fireEvent.keyDown(document.body, { key: 'PageDown' });
    fireEvent.keyDown(document.body, { key: 'PageUp' });
    const home = fireEvent.keyDown(document.body, { key: 'Home' });

    expect(traversal.advance).toHaveBeenCalledTimes(1);
    expect(traversal.retreat).toHaveBeenCalledTimes(1);
    expect(traversal.returnToStart).toHaveBeenCalledTimes(1);
    // Spent, so the page does not also scroll.
    expect(home).toBe(false);
  });

  it('leaves Page Down and Page Up to content that still scrolls that way', () => {
    const traversal = commands();
    render(<Presenting traversal={traversal} />);
    const content = document.createElement('div');
    content.style.overflowY = 'auto';
    Object.defineProperty(content, 'scrollHeight', { value: 500 });
    Object.defineProperty(content, 'clientHeight', { value: 100 });
    const paragraph = document.createElement('p');
    content.append(paragraph);
    document.body.append(content);

    // At the top: Page Down scrolls, and Page Up has nowhere to scroll, so goes back.
    expect(fireEvent.keyDown(paragraph, { key: 'PageDown' })).toBe(true);
    fireEvent.keyDown(paragraph, { key: 'PageUp' });
    // At the end: Page Down goes on, and Page Up scrolls.
    content.scrollTop = 400;
    fireEvent.keyDown(paragraph, { key: 'PageDown' });
    expect(fireEvent.keyDown(paragraph, { key: 'PageUp' })).toBe(true);
    content.remove();

    expect(traversal.advance).toHaveBeenCalledTimes(1);
    expect(traversal.retreat).toHaveBeenCalledTimes(1);
  });

  it('opens a Notes window on S, and leaves a modified S to the browser, Shift included', () => {
    const traversal = commands();
    render(<Presenting traversal={traversal} />);

    fireEvent.keyDown(document.body, { key: 's' });
    fireEvent.keyDown(document.body, { key: 'S', shiftKey: true });
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 's', metaKey: true });
    // Caps Lock is not a modifier: it changes the character and never sets `shiftKey`.
    fireEvent.keyDown(document.body, { key: 'S' });

    expect(traversal.openNotes).toHaveBeenCalledTimes(2);
  });

  it('shows or hides the rehearsal notes on N, and leaves a modified N to the browser, Shift included', () => {
    const traversal = commands();
    render(<Presenting traversal={traversal} />);

    fireEvent.keyDown(document.body, { key: 'n' });
    fireEvent.keyDown(document.body, { key: 'N', shiftKey: true });
    fireEvent.keyDown(document.body, { key: 'n', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'n', altKey: true });
    fireEvent.keyDown(document.body, { key: 'N' });

    expect(traversal.toggleNotes).toHaveBeenCalledTimes(2);
  });

  it('toggles the rehearsal notes once for a held N, and opens one Notes window for a held S', () => {
    const traversal = commands();
    render(<Presenting traversal={traversal} />);

    fireEvent.keyDown(document.body, { key: 'n' });
    fireEvent.keyDown(document.body, { key: 'n', repeat: true });
    fireEvent.keyDown(document.body, { key: 'n', repeat: true });
    fireEvent.keyDown(document.body, { key: 's' });
    fireEvent.keyDown(document.body, { key: 's', repeat: true });

    expect(traversal.toggleNotes).toHaveBeenCalledTimes(1);
    expect(traversal.openNotes).toHaveBeenCalledTimes(1);
  });

  it('binds nothing while a traversal is not the resource on screen', () => {
    const traversal = commands();
    render(<Presenting active={false} traversal={traversal} />);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(traversal.advance).not.toHaveBeenCalled();
    expect(traversal.exitPresenting).not.toHaveBeenCalled();
  });

  /**
   * A focused button activates itself on Space, and this listener sees the press
   * first. Handling it would advance the traversal *and* let the control fire, so
   * one press would run two commands; preventing the default instead would stop
   * the control firing at all. Deferring is the whole rule, and it is a rule about
   * interactive controls rather than about one button.
   */
  it('defers Space to the interactive control that already activates on it', () => {
    const traversal = commands();
    render(<Presenting traversal={traversal} />);

    const handled = fireEvent.keyDown(screen.getByRole('button', { name: 'Overview' }), {
      key: ' ',
    });

    expect(traversal.advance).not.toHaveBeenCalled();
    // Not defaultPrevented either: the browser's own activation is what runs.
    expect(handled).toBe(true);
  });

  /**
   * A modal surface owns every key pressed inside it.
   *
   * A modal surface drawn over the canvas can be opened mid-traversal. Its focus
   * trap means every press then starts inside it, and a window listener that
   * went on traversing would run a command behind a surface the presenter is
   * looking at — one Escape both dismissing the surface and leaving
   * presentation.
   */
  it('leaves every key to a modal surface open over the canvas', () => {
    const traversal = commands();
    render(<Presenting traversal={traversal} />);
    const inside = screen.getByRole('button', { name: 'Present' });

    fireEvent.keyDown(inside, { key: 'Escape' });
    fireEvent.keyDown(inside, { key: 'ArrowRight' });
    fireEvent.keyDown(inside, { key: 'ArrowUp' });

    expect(traversal.exitPresenting).not.toHaveBeenCalled();
    expect(traversal.advance).not.toHaveBeenCalled();
    expect(traversal.selectBranch).not.toHaveBeenCalled();
  });

  /**
   * Arrow and Escape are nobody's native activation, so they stay global — a
   * presenter whose focus is on a chrome control still traverses with them.
   */
  it('keeps the Traversal commands global on a focused control', () => {
    const traversal = commands();
    render(<Presenting traversal={traversal} />);
    const overview = screen.getByRole('button', { name: 'Overview' });

    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    fireEvent.keyDown(overview, { key: 'ArrowDown' });

    expect(traversal.advance).toHaveBeenCalledTimes(1);
    expect(traversal.selectBranch).toHaveBeenCalledWith(1);
  });
});
