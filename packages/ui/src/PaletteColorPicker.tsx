import { useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from './lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { swatchPanelClassName } from './SwatchMenu';
import { ToggleGroup, ToggleGroupItem } from './components/toggle-group';

/** One closed-palette slot the picker may offer. */
export interface PaletteColorEntry {
  readonly color: string;
  readonly label: string;
}

/** One palette colour drawn as a swatch, filling the box it is given. */
export function PaletteColorSwatch({ color }: { readonly color: string }) {
  return (
    <span
      className="size-full rounded-chrome-sm border border-border/60"
      style={{ backgroundColor: color }}
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

  // A single-select group hands back what is pressed now: the colour pressed,
  // or nothing when the current colour was pressed again, which keeps it.
  const handlePressed = (pressed: string[]): void => {
    const [color] = pressed;
    if (color !== undefined) onValueChange(color);
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
        <ToggleGroup
          aria-label={ariaLabel}
          value={value == null ? [] : [value]}
          onValueChange={handlePressed}
          disabled={disabled}
          className="grid grid-cols-2 gap-[0.35rem]"
        >
          {entries.map(({ color, label }) => (
            <ToggleGroupItem
              key={color}
              value={color}
              aria-label={label}
              title={label}
              className="p-[0.35rem]"
            >
              <span aria-hidden className="relative flex size-[1.35rem]">
                <PaletteColorSwatch color={color} />
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  );
}
