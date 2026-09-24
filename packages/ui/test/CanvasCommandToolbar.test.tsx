import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasCommand, CanvasCommandToolbar } from '../src';

/**
 * Each case mounts the toolbar inside an ancestor standing in for the canvas:
 * React Flow listens for keys and presses above the toolbar, and a press that
 * reached the entity beneath would select it.
 */

const noop = (): void => undefined;

const renderToolbar = ({
  canvasKeyDown = noop,
  canvasClick = noop,
  canvasPointerDown = noop,
  onFirst = noop,
  onFirstPointerDown = noop,
  holdFocus = false,
}: {
  readonly canvasKeyDown?: () => void;
  readonly canvasClick?: () => void;
  readonly canvasPointerDown?: () => void;
  readonly onFirst?: () => void;
  readonly onFirstPointerDown?: () => void;
  readonly holdFocus?: boolean;
}) =>
  render(
    <div onKeyDown={canvasKeyDown} onClick={canvasClick} onPointerDown={canvasPointerDown}>
      <CanvasCommandToolbar aria-label="Edge A → B">
        <CanvasCommand
          aria-label="First"
          holdFocus={holdFocus}
          onClick={onFirst}
          onPointerDown={onFirstPointerDown}
        >
          1
        </CanvasCommand>
        <CanvasCommand aria-label="Second">2</CanvasCommand>
      </CanvasCommandToolbar>
    </div>,
  );

describe('CanvasCommandToolbar', () => {
  it('is one named toolbar on the shared command surface', () => {
    renderToolbar({});

    const toolbar = screen.getByRole('toolbar', { name: 'Edge A → B' });
    expect(toolbar).toHaveClass('command-surface');
  });

  it('moves between its commands on the arrows and keeps the keys off the canvas', async () => {
    const canvasKeyDown = vi.fn();
    renderToolbar({ canvasKeyDown });
    const first = screen.getByRole('button', { name: 'First' });
    const second = screen.getByRole('button', { name: 'Second' });

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    await waitFor(() => expect(second).toHaveFocus());
    expect(canvasKeyDown).not.toHaveBeenCalled();
  });

  it("still runs a caller's own keydown handler", () => {
    const onKeyDown = vi.fn();
    render(
      <CanvasCommandToolbar aria-label="Commands" onKeyDown={onKeyDown}>
        <CanvasCommand aria-label="Only">1</CanvasCommand>
      </CanvasCommandToolbar>,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Only' }), { key: 'a' });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});

describe('CanvasCommand', () => {
  it("keeps a press off React Flow's pan and drag", () => {
    renderToolbar({});

    expect(screen.getByRole('button', { name: 'First' })).toHaveClass('nodrag', 'nopan');
  });

  it('runs its own handlers and keeps the press from reaching what lies beneath', () => {
    const canvasClick = vi.fn();
    const canvasPointerDown = vi.fn();
    const onFirst = vi.fn();
    const onFirstPointerDown = vi.fn();
    renderToolbar({ canvasClick, canvasPointerDown, onFirst, onFirstPointerDown });
    const first = screen.getByRole('button', { name: 'First' });

    fireEvent.pointerDown(first);
    fireEvent.click(first);

    expect(onFirstPointerDown).toHaveBeenCalledOnce();
    expect(onFirst).toHaveBeenCalledOnce();
    expect(canvasPointerDown).not.toHaveBeenCalled();
    expect(canvasClick).not.toHaveBeenCalled();
  });

  /** `fireEvent` answers whether the default survived, which is what `holdFocus` decides. */
  it('holds the caret where it is only when asked to', () => {
    const { unmount } = renderToolbar({ holdFocus: true });
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'First' }))).toBe(false);
    unmount();

    renderToolbar({});
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'First' }))).toBe(true);
  });
});
