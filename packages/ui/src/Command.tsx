import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { cn } from './lib/utils';

/**
 * shadcn-style Command, built on cmdk — a search field over a list of items,
 * with the list's keyboard model owned by the primitive.
 *
 * cmdk keeps the caret in the input and moves an *active* item with the arrow
 * keys, Home/End and Enter, exposing the pair as `combobox` + `listbox` with
 * `aria-activedescendant`. That is the model this repo starts from (AGENTS.md),
 * and none of it is re-implemented here: these wrappers add the toolbar palette
 * and nothing else.
 *
 * Two things are deliberately left to the caller. **Escape** is not handled —
 * cmdk leaves it to whatever surface contains the list, and the authoring
 * contract makes the field draft consume the first Escape and the surface the
 * second, which only the caller can order. **Filtering** is cmdk's default
 * fuzzy `commandScore` over each item's `value`; a caller whose values are
 * identities rather than prose passes its own `filter`, because scoring a UUID
 * matches hex noise.
 */

export const Command = forwardRef<
  ElementRef<typeof CommandPrimitive>,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn('flex w-full flex-col gap-[0.4rem] overflow-hidden', className)}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

export const CommandInput = forwardRef<
  ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Input
    ref={ref}
    className={cn(
      'w-full rounded-[6px] border border-[var(--border)] bg-[var(--panel-2)] px-[0.5rem] py-[0.4rem] text-[0.85rem] text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]',
      className,
    )}
    {...props}
  />
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

export const CommandList = forwardRef<
  ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn(
      'max-h-[12rem] overflow-x-hidden overflow-y-auto rounded-[6px] border border-[var(--border)] bg-[var(--panel)] p-[0.25rem]',
      className,
    )}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

export const CommandEmpty = forwardRef<
  ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn('px-[0.5rem] py-[0.5rem] text-[0.8rem] text-[var(--muted)]', className)}
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

export const CommandGroup = forwardRef<
  ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      '[&_[cmdk-group-heading]]:px-[0.5rem] [&_[cmdk-group-heading]]:py-[0.3rem] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-[var(--muted)] [&_[cmdk-group-heading]]:uppercase',
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

export const CommandItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'flex w-full cursor-pointer items-center gap-[0.5rem] rounded-[4px] px-[0.5rem] py-[0.35rem] text-[0.85rem] text-[var(--text)] outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-[var(--panel-2)]',
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;
