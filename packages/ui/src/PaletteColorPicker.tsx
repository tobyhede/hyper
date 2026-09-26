import { useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from './lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { SwatchGrid, swatchPanelClassName } from './SwatchGrid';

/** One closed-palette slot the picker may offer. */
export interface PaletteColorEntry {
  readonly color: string;
  readonly label: string;
}

export interface PaletteColorSwatchGridProps {
  readonly entries: readonly PaletteColorEntry[];
  readonly value: string | null | undefined;
  readonly onValueChange: (color: string) => void;
  readonly disabled?: boolean;
  readonly 'aria-label'?: string;
  readonly className?: string;
}

/** A closed palette drawn as a swatch grid — shared by the popover and menu surfaces. */
export function PaletteColorSwatchGrid({
  entries,
  value,
  onValueChange,
  disabled = false,
  'aria-label': ariaLabel = 'Choose colour',
  className,
}: PaletteColorSwatchGridProps) {
  return (
    <SwatchGrid
      entries={entries.map(({ color, label }) => ({ value: color, label }))}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
      renderSwatch={(color) => (
        <span
          className="size-full rounded-chrome-sm border border-border/60"
          style={{ backgroundColor: color }}
        />
      )}
    />
  );
}

export interface PaletteColorPickerProps {
  readonly entries: readonly PaletteColorEntry[];
  readonly value: string | null | undefined;
  readonly onValueChange: (color: string) => void;
  readonly disabled?: boolean;
  /** When omitted, the picker renders its own trigger button. */
  readonly trigger?: ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly 'aria-label'?: string;
  readonly side?: ComponentPropsWithoutRef<typeof PopoverContent>['side'];
  readonly align?: ComponentPropsWithoutRef<typeof PopoverContent>['align'];
  readonly className?: string;
}

/**
 * Choose one colour from a closed palette shown as a swatch grid in a popover.
 *
 * The caller supplies every slot; this component embeds no palette constants.
 * Choosing a swatch invokes `onValueChange` and closes the popover.
 */
export function PaletteColorPicker({
  entries,
  value,
  onValueChange,
  disabled = false,
  trigger,
  open,
  onOpenChange,
  'aria-label': ariaLabel = 'Choose colour',
  side = 'right',
  align = 'start',
  className,
}: PaletteColorPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;
  const setResolvedOpen = (next: boolean): void => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  const handleSelect = (color: string): void => {
    onValueChange(color);
    setResolvedOpen(false);
  };

  return (
    <Popover open={resolvedOpen} onOpenChange={setResolvedOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'inline-flex cursor-pointer items-center gap-[0.35rem] rounded-chrome-md border border-border bg-secondary px-[0.6rem] py-[0.35rem] text-chrome-sm disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        {trigger ?? 'Choose colour'}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className={swatchPanelClassName}>
        <PaletteColorSwatchGrid
          entries={entries}
          value={value}
          onValueChange={handleSelect}
          disabled={disabled}
          aria-label={ariaLabel}
        />
      </PopoverContent>
    </Popover>
  );
}
