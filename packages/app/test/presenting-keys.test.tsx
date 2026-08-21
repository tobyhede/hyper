import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePresentingKeys, type TraversalCommands } from '../src/presenting-keys';

/**
 * The global Traversal keys, and what they decline to do.
 *
 * Every command here is Navigation's, so the walk itself is `navigation.test.ts`'s
 * business. What this owns is the binding: which key runs which operation, when
 * the listener is live at all, and the rule that keeps a global `keydown` from
 * running one command while the browser runs another on the same press.
 */

/** The four operations, each a spy — inferred, so a call is still inspectable. */
const commands = () => ({
  advance: vi.fn(),
  retreat: vi.fn(),
  selectBranch: vi.fn(),
  exitPresenting: vi.fn(),
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
      {/* A surface over the canvas, of the shape the workspace Sheet takes
          below the Sidebar's breakpoint. */}
      <div role="dialog" aria-label="Workspace">
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

  it('binds nothing while a traversal is not the thing on screen', () => {
    const traversal = commands();
    render(<Presenting active={false} traversal={traversal} />);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(traversal.advance).not.toHaveBeenCalled();
    expect(traversal.exitPresenting).not.toHaveBeenCalled();
  });

  /**
   * A focused button activates itself on Space, and this listener sees the press
   * first. Handling it advanced the traversal *and* let the control fire, so one
   * press ran two commands; preventing the default instead stopped the control
   * firing at all. Deferring is the whole rule, and it is a rule about
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
   * Below the Sidebar's breakpoint the workspace is a Sheet drawn over the
   * canvas and can be reopened mid-traversal. Its focus trap means every press
   * then starts inside it, and a window listener that went on traversing would
   * run a command behind a surface the presenter is looking at — one Escape
   * both dismissing the sheet and leaving presentation.
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
