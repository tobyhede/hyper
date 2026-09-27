import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PaletteColorPicker, type PaletteColorEntry } from '../src/PaletteColorPicker';

const entries: readonly PaletteColorEntry[] = [
  { color: '#1f77b4', label: 'Blue' },
  { color: '#ff7f0e', label: 'Orange' },
];

const threeEntries: readonly PaletteColorEntry[] = [
  ...entries,
  { color: '#2ca02c', label: 'Green' },
];

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

const mountOpen = (
  value: string,
  { onValueChange = vi.fn(), onOpenChange = vi.fn(), palette = entries } = {},
) => {
  render(
    <PaletteColorPicker
      entries={palette}
      value={value}
      onValueChange={onValueChange}
      open
      onOpenChange={onOpenChange}
      trigger="Pick colour"
      aria-label="Graph colour"
    />,
  );
  return {
    onValueChange,
    onOpenChange,
    group: screen.getByRole('group', { name: 'Graph colour' }),
  };
};

const swatch = (group: HTMLElement, name: string) => within(group).getByRole('button', { name });

describe('PaletteColorPicker', () => {
  it('invokes onValueChange and closes when a swatch is pressed', () => {
    const { onValueChange, onOpenChange, group } = mountOpen('#1f77b4');

    fireEvent.click(swatch(group, 'Orange'));

    expect(onValueChange).toHaveBeenCalledWith('#ff7f0e');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('opens when only onOpenChange is supplied', () => {
    const onOpenChange = vi.fn();

    render(
      <PaletteColorPicker
        entries={entries}
        value="#1f77b4"
        onValueChange={() => undefined}
        onOpenChange={onOpenChange}
        trigger="Pick colour"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Pick colour' });
    fireEvent.click(trigger);

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Orange' })).toBeInTheDocument();
  });

  it('marks the current colour as pressed, and no other', () => {
    const { group } = mountOpen('#ff7f0e');

    expect(swatch(group, 'Orange')).toHaveAttribute('aria-pressed', 'true');
    expect(swatch(group, 'Blue')).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the choice when the current colour is pressed again, and closes', () => {
    const { onValueChange, onOpenChange, group } = mountOpen('#ff7f0e');

    fireEvent.click(swatch(group, 'Orange'));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('is one tab stop whose arrows move focus without pressing', async () => {
    const { onValueChange, group } = mountOpen('#ff7f0e', { palette: threeEntries });

    expect(
      within(group)
        .getAllByRole('button')
        .filter((each) => each.getAttribute('tabindex') === '0'),
    ).toHaveLength(1);

    act(() => swatch(group, 'Orange').focus());
    fireEvent.keyDown(swatch(group, 'Orange'), { key: 'ArrowRight' });
    await waitFor(() => expect(swatch(group, 'Green')).toHaveFocus());
    fireEvent.keyDown(swatch(group, 'Green'), { key: 'ArrowRight' });
    await waitFor(() => expect(swatch(group, 'Blue')).toHaveFocus());

    expect(onValueChange).not.toHaveBeenCalled();
    expect(swatch(group, 'Orange')).toHaveAttribute('aria-pressed', 'true');
  });

  it('names swatches for accessibility without drawing visible labels', () => {
    const { group } = mountOpen('#1f77b4');

    const orange = swatch(group, 'Orange');
    expect(orange).toHaveAttribute('title', 'Orange');
    expect(orange).toHaveTextContent('');
  });
});
