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
    // `nokey` here for the other half of the same mechanism: this trigger is
    // not portalled anywhere, it is drawn in a toolbar that was never inside the
    // flow to begin with — and a `document` listener does not care. It is a
    // `button`, so no input tag excludes it, and Backspace pressed on it deleted
    // whichever Edge the canvas had selected.
    className={cn(
      'nokey inline-flex items-center justify-between gap-[0.4rem] rounded-[6px] border border-[var(--border)] bg-[var(--panel-2)] px-[0.5rem] py-[0.35rem] text-[0.85rem] text-[var(--text)] transition-colors outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-[var(--text)]',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon>
      <span className="text-[var(--muted)]">
        <ChevronDownIcon />
      </span>
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

type SelectContentProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Popup> &
  Pick<ComponentPropsWithoutRef<typeof SelectPrimitive.Positioner>, 'align' | 'sideOffset'>;

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Popup>,
  SelectContentProps
>(({ className, children, align, sideOffset = 4, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Positioner align={align} sideOffset={sideOffset} className="z-50">
      <SelectPrimitive.Popup
        ref={ref}
        // The popup is portalled to document.body, so its own `nokey` marker is
        // what keeps React Flow's document-level delete handler out of the list.
        className={cn(
          'nokey max-h-[var(--available-height)] min-w-[8rem] overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] shadow-[0_12px_40px_rgba(0,0,0,0.5)] data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
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
      'relative flex w-full cursor-pointer items-center rounded-[4px] px-[0.5rem] py-[0.35rem] text-[0.85rem] outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--panel-2)] data-[highlighted]:outline-none data-[selected]:text-[var(--accent)]',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';
