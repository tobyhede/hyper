import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PaletteColorPicker, type PaletteColorEntry } from '../src/PaletteColorPicker';

const entries: readonly PaletteColorEntry[] = [
  { color: '#1f77b4', label: 'Blue' },
  { color: '#ff7f0e', label: 'Orange' },
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

describe('PaletteColorPicker', () => {
  it('invokes onValueChange and closes when a swatch is chosen', () => {
    const onValueChange = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <PaletteColorPicker
        entries={entries}
        value="#1f77b4"
        onValueChange={onValueChange}
        open
        onOpenChange={onOpenChange}
        trigger="Pick colour"
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Orange' }));

    expect(onValueChange).toHaveBeenCalledWith('#ff7f0e');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('marks the current value as selected', () => {
    render(
      <PaletteColorPicker
        entries={entries}
        value="#ff7f0e"
        onValueChange={() => undefined}
        open
        trigger="Pick colour"
      />,
    );

    expect(screen.getByRole('radio', { name: 'Orange' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'false');
  });
});
