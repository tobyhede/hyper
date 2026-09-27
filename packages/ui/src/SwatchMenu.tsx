import type { ReactNode } from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Check } from 'lucide-react';
import { DropdownMenuRadioGroup } from './components/dropdown-menu';

/** Panel sizing shared by every surface that hosts swatches: the Graph menu's submenus and `PaletteColorPicker`'s popover. */
export const swatchPanelClassName = 'nokey w-[6.75rem] p-[0.6rem]';

/** One choice a swatch menu offers: the value it chooses and the name it is read by. */
export interface SwatchEntry<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

export interface SwatchMenuRadioGroupProps<Value extends string> {
  readonly entries: readonly SwatchEntry<Value>[];
  readonly value: Value | null | undefined;
  readonly onValueChange: (value: Value) => void;
  /** Draws one choice's swatch, filling the square box the item gives it. */
  readonly renderSwatch: (value: Value) => ReactNode;
  readonly disabled?: boolean;
  readonly 'aria-label': string;
  /**
   * Where the current choice's check sits: over the swatch, for a swatch that
   * is only a fill, or clear of it at the corner, for a swatch drawing a glyph
   * the check would cover.
   */
  readonly checkPlacement?: 'over' | 'corner';
}

/**
 * A closed set of choices drawn as a two-column grid of square swatches inside
 * a menu, each named only by its accessible label, tooltip and typeahead label.
 *
 * It is the menu's own radio group — `menuitemradio` items in a `group` — laid
 * out as a grid and drawn as swatches, so the keyboard, focus and dismissal are
 * Base UI Menu's: the arrows move the highlight without choosing, Enter, Space
 * or a press chooses and closes the menu, ArrowLeft closes a submenu onto its
 * trigger, and typing a label's first letters highlights it
 * (`GraphMenuActions.test.tsx` holds each). The current choice takes the
 * selected treatment and a check — over a fill, and at the corner of a glyph
 * it would otherwise cover.
 *
 * **Deviation from the registry item (shadcn-first-ui).** Considered: the
 * registry's `DropdownMenuRadioItem`, over Base UI `Menu.RadioItem`. It draws
 * a text row with its check fixed at the right edge, and the requirement is a
 * square swatch whose check sits over the fill or at its corner (ADR 0104,
 * ADR 0105) — a variant cannot move an indicator the component renders itself.
 * So each item is Base UI's `Menu.RadioItem` directly, styled as a swatch; no
 * behaviour is added, and every key, focus and dismissal rule stays Base UI
 * Menu's. The registry item's generic exists to hold item values to the
 * group's type; here every item value is read from `entries`, which is typed
 * `Value`, so the group and its items cannot disagree.
 */
export function SwatchMenuRadioGroup<Value extends string>({
  entries,
  value,
  onValueChange,
  renderSwatch,
  disabled = false,
  'aria-label': ariaLabel,
  checkPlacement = 'over',
}: SwatchMenuRadioGroupProps<Value>) {
  return (
    <DropdownMenuRadioGroup<Value | null>
      aria-label={ariaLabel}
      value={value ?? null}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      disabled={disabled}
      className="grid grid-cols-2 gap-[0.35rem]"
    >
      {entries.map((entry) => (
        <MenuPrimitive.RadioItem
          key={entry.value}
          value={entry.value}
          label={entry.label}
          aria-label={entry.label}
          title={entry.label}
          closeOnClick
          data-slot="swatch-menu-radio-item"
          className="relative flex cursor-pointer items-center justify-center rounded-chrome-md border border-transparent p-[0.35rem] outline-hidden transition-[background-color,border-color] select-none hover:border-border hover:bg-secondary data-checked:border-border data-checked:bg-accent data-disabled:cursor-not-allowed data-disabled:opacity-50 data-highlighted:outline-2 data-highlighted:outline-offset-2 data-highlighted:outline-ring"
        >
          <span aria-hidden className="relative flex size-[1.35rem]">
            {renderSwatch(entry.value)}
            {checkPlacement === 'over' ? (
              <MenuPrimitive.RadioItemIndicator
                aria-hidden
                className="absolute inset-0 m-auto flex items-center justify-center"
              >
                <Check
                  size={12}
                  strokeWidth={3}
                  className="text-foreground drop-shadow-[0_0_1px_rgba(0,0,0,0.85)]"
                />
              </MenuPrimitive.RadioItemIndicator>
            ) : null}
          </span>
          {checkPlacement === 'corner' ? (
            <MenuPrimitive.RadioItemIndicator
              aria-hidden
              className="absolute -top-0.75 -right-0.75 flex size-2.5 items-center justify-center rounded-full bg-background text-foreground ring-1 ring-border"
            >
              <Check size={8} strokeWidth={3.5} />
            </MenuPrimitive.RadioItemIndicator>
          ) : null}
        </MenuPrimitive.RadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
