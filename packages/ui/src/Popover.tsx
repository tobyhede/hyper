import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from './lib/utils';

/**
 * shadcn-style Popover built on Radix, styled to match the toolbar palette.
 *
 * The primitive owns focus trapping, outside-press and Escape dismissal, and
 * returning focus to the trigger — none of which is re-implemented here.
 */
export const Popover = PopoverPrimitive.Root;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      // `nokey` because React Flow subscribes its delete key on `document`, and
      // the one exclusion it makes — `isInputDOMNode` — walks the *event
      // target's* DOM ancestors for that class. A layer portalled to
      // `document.body` therefore sits outside every `.nokey` the app puts
      // inside the flow, so the class has to travel with the portalled content
      // itself. `cn` is `twMerge(clsx(...))`, which leaves a non-Tailwind class
      // alone.
      className={cn(
        'nokey z-50 min-w-[15rem] rounded-[6px] border border-[var(--border)] bg-[var(--panel)] p-[0.6rem] text-[var(--text)] shadow-[0_12px_40px_rgba(0,0,0,0.5)] outline-none',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
