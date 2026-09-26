import { useRef, type ReactNode } from 'react';
import { Check } from 'lucide-react';
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
  /** Draws one choice's swatch, filling the square box the grid gives it. */
  readonly renderSwatch: (value: Value) => ReactNode;
  readonly disabled?: boolean;
  readonly 'aria-label': string;
  readonly className?: string | undefined;
}

/** The grid's column count, which the vertical arrows step by. */
const COLUMNS = 2;

/** Where an arrow, Home or End moves focus from `index`, wrapping; `null` for any other key. */
const rovingTarget = (key: string, index: number, count: number): number | null => {
  const step = (by: number) => (index + by + count) % count;
  switch (key) {
    case 'ArrowRight':
      return step(1);
    case 'ArrowLeft':
      return step(-1);
    case 'ArrowDown':
      return step(COLUMNS);
    case 'ArrowUp':
      return step(-COLUMNS);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
};

/**
 * A closed set of choices drawn as a two-column grid of square swatches, each
 * named only in its accessible label and tooltip. The Graph menu's Colour… and
 * Shape… both open one, so the two panels are one size, one interaction and
 * one marking: the current choice takes the selected treatment and a check.
 *
 * Deviation (shadcn-first-ui):
 * - Existing Hyper component considered: `DropdownMenuRadioGroup` /
 *   `DropdownMenuRadioItem`, and `ToggleGroup`.
 * - shadcn/Base UI component considered: `RadioGroup` (Base UI `RadioGroup`).
 * - Product requirement that cannot be expressed: ADR 0104 and ADR 0105 ask
 *   for a *grid* of swatches — twenty palette colours, and the four head
 *   shapes sized like them — where choosing one completes an Edit and closes
 *   the menu, and where each choice is named only by its label.
 * - Why composition or a variant is insufficient: a menu radio list is one
 *   labelled row per choice, not a swatch grid. Base UI's `RadioGroup`
 *   checks the radio each arrow key lands on, as the radio pattern does, so
 *   arrowing across the grid would complete an Edit and close the menu at the
 *   first press. `ToggleGroup` draws independent pressed states
 *   (`aria-pressed`), not one exclusive choice.
 * - Custom behaviour being introduced: `role="radio"` buttons in a
 *   `role="radiogroup"`, one tab stop (the current choice, else the first),
 *   and focus roving that follows the grid — Left/Right by one, Up/Down by a
 *   row, Home/End, all wrapping — without choosing: Enter, Space or a press
 *   chooses. The keys it moves on stop there, so the menu around it neither
 *   moves its highlight nor closes the submenu on ArrowLeft; Escape still does.
 * - Tests proving the deviation: `SwatchGrid.test.tsx`,
 *   `PaletteColorPicker.test.tsx`, `GraphHeadShapeSwatchGrid.test.tsx`, and
 *   the Dock and application parity tests for recolour and head shape.
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
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = entries.findIndex((entry) => entry.value === value);
  const tabStop = current === -1 ? 0 : current;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('grid grid-cols-2 gap-[0.35rem]', className)}
    >
      {entries.map((entry, index) => {
        const selected = index === current;
        return (
          <button
            key={entry.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={entry.label}
            title={entry.label}
            disabled={disabled}
            tabIndex={index === tabStop ? 0 : -1}
            className={cn(
              'flex cursor-pointer items-center justify-center rounded-chrome-md border border-transparent p-[0.35rem] transition-[background-color,border-color] hover:border-border hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
              selected && 'border-border bg-accent',
            )}
            onClick={() => onValueChange(entry.value)}
            onKeyDown={(event) => {
              const target = rovingTarget(event.key, index, entries.length);
              if (target === null) return;
              event.preventDefault();
              event.stopPropagation();
              buttons.current[target]?.focus();
            }}
          >
            <span aria-hidden className="relative flex size-[1.35rem]">
              {renderSwatch(entry.value)}
              {selected ? (
                <Check
                  aria-hidden
                  size={12}
                  strokeWidth={3}
                  className="absolute inset-0 m-auto text-foreground drop-shadow-[0_0_1px_rgba(0,0,0,0.85)]"
                />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
