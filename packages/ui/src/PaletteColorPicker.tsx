import { useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from './lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

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
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('grid grid-cols-4 gap-[0.35rem]', className)}
    >
      {entries.map(({ color, label }) => {
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            disabled={disabled}
            data-testid={`palette-swatch-${label.replace(/\s+/g, '-').toLowerCase()}`}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-[0.25rem] rounded-[6px] border border-transparent px-[0.25rem] py-[0.35rem] text-[11px] text-muted-foreground transition-[background-color,border-color,color] hover:border-border hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
              selected && 'border-border bg-accent text-foreground',
            )}
            onClick={() => onValueChange(color)}
          >
            <span
              aria-hidden
              className="relative h-[1.25rem] w-[1.25rem] rounded-[4px] border border-border/60"
              style={{ backgroundColor: color }}
            >
              {selected ? (
                <Check
                  aria-hidden
                  size={12}
                  strokeWidth={3}
                  className="absolute inset-0 m-auto text-foreground drop-shadow-[0_0_1px_rgba(0,0,0,0.85)]"
                />
              ) : null}
            </span>
            <span className="max-w-full truncate">{label}</span>
          </button>
        );
      })}
    </div>
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
  const resolvedOpen = open ?? internalOpen;
  const setResolvedOpen = onOpenChange ?? setInternalOpen;

  const handleSelect = (color: string): void => {
    onValueChange(color);
    setResolvedOpen(false);
  };

  return (
    <Popover open={resolvedOpen} onOpenChange={setResolvedOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'inline-flex cursor-pointer items-center gap-[0.35rem] rounded-[6px] border border-border bg-secondary px-[0.6rem] py-[0.35rem] text-[13px] disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        {trigger ?? 'Choose colour'}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="nokey w-[15.5rem] p-[0.6rem]">
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
