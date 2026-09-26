import type { ReactNode } from 'react';
import { cn } from './lib/utils';

/** Panel sizing shared by the popover and submenu surfaces that host a swatch grid. */
export const swatchPanelClassName = 'nokey w-[6.75rem] p-[0.6rem]';

/** One choice a swatch grid offers: the value it chooses and the name it is read by. */
export interface SwatchEntry<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

export interface SwatchGridProps<Value extends string> {
  readonly entries: readonly SwatchEntry<Value>[];
  readonly value: Value | null | undefined;
  readonly onValueChange: (value: Value) => void;
  /** Draws one choice's swatch; `selected` says whether it is the current value. */
  readonly renderSwatch: (value: Value, selected: boolean) => ReactNode;
  readonly disabled?: boolean;
  readonly 'aria-label': string;
  readonly className?: string | undefined;
}

/**
 * A closed set of choices drawn as a two-column grid of swatches, each named
 * only in its accessible label and tooltip — shared by the colour and head
 * shape choices so both sit in panels of one size.
 *
 * Deviation: hand-rolled `role="radio"` buttons rather than a registry RadioGroup —
 * the grid mounts inside a popover or submenu panel, not a Menu radio list, and needs
 * a two-column swatch layout. Behaviour is held by `PaletteColorPicker.test.tsx`,
 * `GraphHeadShapeSwatchGrid.test.tsx` and the Dock/application parity tests.
 */
export function SwatchGrid<Value extends string>({
  entries,
  value,
  onValueChange,
  renderSwatch,
  disabled = false,
  'aria-label': ariaLabel,
  className,
}: SwatchGridProps<Value>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('grid grid-cols-2 gap-[0.35rem]', className)}
    >
      {entries.map((entry) => {
        const selected = value === entry.value;
        return (
          <button
            key={entry.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={entry.label}
            title={entry.label}
            disabled={disabled}
            className={cn(
              'flex cursor-pointer items-center justify-center rounded-chrome-md border border-transparent p-[0.35rem] transition-[background-color,border-color] hover:border-border hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
              selected && 'border-border bg-accent',
            )}
            onClick={() => onValueChange(entry.value)}
          >
            {renderSwatch(entry.value, selected)}
          </button>
        );
      })}
    </div>
  );
}
