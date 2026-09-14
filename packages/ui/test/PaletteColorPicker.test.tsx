import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  PaletteColorPicker,
  PaletteColorSwatchGrid,
  type PaletteColorEntry,
} from '../src/PaletteColorPicker';

const entries: readonly PaletteColorEntry[] = [
  { color: '#1f77b4', label: 'Blue' },
  { color: '#ff7f0e', label: 'Orange' },
];

const tableauEntries: readonly PaletteColorEntry[] = [
  { color: '#ffbb78', label: 'Orange light' },
  { color: '#c5b0d5', label: 'Purple light' },
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
    expect(screen.getByRole('radio', { name: 'Orange' })).toBeInTheDocument();
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

  it('draws one radio per palette entry', () => {
    const fullPalette = Array.from({ length: 20 }, (_, index) => ({
      color: `#${index.toString(16).padStart(6, '0')}`,
      label: `Slot ${index}`,
    }));

    render(
      <PaletteColorSwatchGrid
        entries={fullPalette}
        value="#000000"
        onValueChange={() => undefined}
        aria-label="Graph colour"
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(20);
  });

  it('names swatches for accessibility without drawing visible labels', () => {
    render(
      <PaletteColorSwatchGrid
        entries={tableauEntries}
        value="#ffbb78"
        onValueChange={() => undefined}
        aria-label="Graph colour"
      />,
    );

    const orangeLight = screen.getByRole('radio', { name: 'Orange light' });
    expect(orangeLight).toHaveAttribute('title', 'Orange light');
    expect(orangeLight).toHaveTextContent('');
  });
});
