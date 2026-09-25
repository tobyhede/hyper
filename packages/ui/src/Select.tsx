import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { ChevronDownIcon } from './icons';
import { cn } from './lib/utils';

/**
 * shadcn-style Select built on Base UI. Styled to match the toolbar palette (dark
 * panels, subtle borders, accent for the selected item). A native `<select>` it
 * is not — it renders a button trigger and a portalled listbox.
 */
export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-between gap-[0.4rem] rounded-chrome-md border border-border bg-secondary px-[0.5rem] py-[0.35rem] text-chrome-sm text-foreground transition-colors outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-foreground',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon>
      <span className="text-muted-foreground">
        <ChevronDownIcon />
      </span>
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

/**
 * `alignItemWithTrigger` is picked alongside the placement props, and that is
 * the whole reason they are not decorative. Base UI defaults it to `true`, and
 * while it is active `SelectPositioner` sets `renderedSide = 'none'` and swaps
 * the computed positioner styles for a constant `{ position: 'fixed' }` — so
 * `align` and `sideOffset` are silently discarded and the list is drawn over
 * the trigger with the selected item under the pointer. Exposing the two
 * without the switch would be a type promising placement the primitive's own
 * default forbids. Forcing `alignItemWithTrigger={false}` instead would have been a
 * deviation from a Base UI default with no product requirement behind it
 * (ADR 0047, ADR 0050) — and shadcn's own `base-nova` select does neither: it
 * picks `align`, `alignOffset`, `side`, `sideOffset` and `alignItemWithTrigger`
 * from `Positioner.Props` and defaults the last to `true`. This matches that,
 * narrowed to the props Hyper's selectors could use. Pinned in
 * `test/Select.test.tsx`.
 */
type SelectContentProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Popup> &
  Pick<
    ComponentPropsWithoutRef<typeof SelectPrimitive.Positioner>,
    'align' | 'sideOffset' | 'alignItemWithTrigger'
  >;

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Popup>,
  SelectContentProps
>(({ className, children, align, sideOffset = 4, alignItemWithTrigger = true, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Positioner
      align={align}
      sideOffset={sideOffset}
      alignItemWithTrigger={alignItemWithTrigger}
      className="z-50"
    >
      <SelectPrimitive.Popup
        ref={ref}
        // `shadow-lg`, which is what `Popover` beside it spends, for the same
        // reason: a token moves with the theme, where an arbitrary value picked
        // to separate a dark popup from a dark canvas is a grey cloud under the
        // list on light paper.
        className={cn(
          'max-h-[var(--available-height)] min-w-[8rem] overflow-hidden rounded-chrome-md border border-border bg-card text-foreground shadow-lg data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.List className="min-w-[var(--anchor-width)] p-[0.25rem]">
          {children}
        </SelectPrimitive.List>
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer items-center rounded-chrome-sm px-[0.5rem] py-[0.35rem] text-chrome-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-secondary data-[highlighted]:outline-none data-[selected]:text-accent',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';
