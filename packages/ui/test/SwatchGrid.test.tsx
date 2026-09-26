import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SwatchGrid } from '../src/SwatchGrid';

const entries = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
  { value: 'd', label: 'D' },
  { value: 'e', label: 'E' },
] as const;

const mount = (value: string | null, onValueChange = vi.fn(), onOuterKeyDown = vi.fn()) => {
  render(
    <div onKeyDown={onOuterKeyDown}>
      <SwatchGrid
        entries={entries}
        value={value}
        onValueChange={onValueChange}
        renderSwatch={(each) => <span data-testid={`swatch-${each}`} />}
        aria-label="Choices"
      />
    </div>,
  );
  return { onValueChange, onOuterKeyDown };
};

const radio = (name: string) => screen.getByRole('radio', { name });

describe('SwatchGrid', () => {
  it('is one tab stop, at the current choice', () => {
    mount('c');
    expect(screen.getAllByRole('radio').map((each) => each.getAttribute('tabindex'))).toEqual([
      '-1',
      '-1',
      '0',
      '-1',
      '-1',
    ]);
  });

  it('puts the tab stop on the first choice when none is current', () => {
    mount(null);
    expect(radio('A')).toHaveAttribute('tabindex', '0');
  });

  it('marks the current choice with a check, and no other', () => {
    mount('b');
    const checks = screen
      .getAllByRole('radio')
      .map((each) => each.querySelector('.lucide-check') !== null);
    expect(checks).toEqual([false, true, false, false, false]);
  });

  it('roves focus across the two-column grid, wrapping, without choosing', () => {
    const { onValueChange, onOuterKeyDown } = mount('a');
    radio('A').focus();

    fireEvent.keyDown(radio('A'), { key: 'ArrowRight' });
    expect(radio('B')).toHaveFocus();
    fireEvent.keyDown(radio('B'), { key: 'ArrowDown' });
    expect(radio('D')).toHaveFocus();
    fireEvent.keyDown(radio('D'), { key: 'ArrowUp' });
    expect(radio('B')).toHaveFocus();
    fireEvent.keyDown(radio('B'), { key: 'ArrowLeft' });
    expect(radio('A')).toHaveFocus();
    fireEvent.keyDown(radio('A'), { key: 'ArrowLeft' });
    expect(radio('E')).toHaveFocus();
    fireEvent.keyDown(radio('E'), { key: 'Home' });
    expect(radio('A')).toHaveFocus();
    fireEvent.keyDown(radio('A'), { key: 'End' });
    expect(radio('E')).toHaveFocus();

    expect(onValueChange).not.toHaveBeenCalled();
    // The keys it moves on stop at the grid, so a surrounding menu does not act on them.
    expect(onOuterKeyDown).not.toHaveBeenCalled();
  });

  it('lets every other key through to its surroundings', () => {
    const { onOuterKeyDown } = mount('a');
    fireEvent.keyDown(radio('A'), { key: 'Escape' });
    expect(onOuterKeyDown).toHaveBeenCalledTimes(1);
  });

  it('chooses on a press', () => {
    const { onValueChange } = mount('a');
    fireEvent.click(radio('D'));
    expect(onValueChange).toHaveBeenCalledWith('d');
  });
});
