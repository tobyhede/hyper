'use client';

import * as React from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';

import { cn } from '#lib/utils';
import { ChevronRightIcon, CheckIcon } from 'lucide-react';

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, MenuPrimitive.Trigger.Props>(
  function DropdownMenuTrigger(props, ref) {
    return <MenuPrimitive.Trigger ref={ref} data-slot="dropdown-menu-trigger" {...props} />;
  },
);

function DropdownMenuContent({
  align = 'start',
  alignOffset = 0,
  anchor,
  side = 'bottom',
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'anchor' | 'side' | 'sideOffset'
  >) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        // `z-50`, as every other portalled surface in this package carries.
        // What a popup has to clear is the Command Dock, which floats over the
        // canvas: `packages/app/src/components/command-dock.css` puts
        // `.command-dock` at `position: absolute; z-index: 20`, its drag snap
        // hint at `19` and the standing persistence notice it hangs off itself
        // at `21`. So the number to beat is the *highest* thing the Dock puts
        // on screen and not the Dock's own frame — a popup left at the auto
        // stacking level opens behind all of it, and one re-derived down to
        // `z-20` from the frame's number alone would open under the notice.
        className="z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        // The element the menu positions against when it is not the trigger's —
        // `PopoverContent` forwards the same Positioner prop for the same
        // reason. A surface whose control both drags and discloses cannot be a
        // `Menu.Trigger` at all (Base UI opens one on `mousedown`, which is the
        // first pixel of the drag), so it hands its own ref over here instead.
        anchor={anchor}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          // React Flow's live Space-key pan activation subscription reaches
          // this portalled popup, so its own `.nokey` ancestor excludes it.
          className={cn(
            'nokey data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-closed:overflow-hidden',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      // A destructive item's glyph follows the row rather than being coloured
      // separately. The registry drop carried
      // `data-[variant=destructive]:*:[svg]:text-destructive`, which paints
      // `color` directly on the child `svg` — and a declared colour is not
      // overridden by an ancestor's, however specific that ancestor's rule is,
      // so a surface restating the row's colour had to restate the glyph's too
      // and reach for `!important` to be sure of it. The utility bought nothing:
      // Lucide draws on `currentColor`, and the `**:text-accent-foreground` rule
      // above excludes destructive rows precisely so their descendants keep it.
      //
      // **A destructive row is ink at rest and red where the reader is** — the
      // registry's `data-[variant=destructive]:text-destructive` is gone with
      // the glyph rule, and only the `focus:` pair below survives. A row that is
      // already red before it is reached spends the alarm on merely being in the
      // list, so the menu reads as a warning about itself rather than about the
      // one command that removes something; the colour lands where a reader is
      // about to act instead. Base UI gives a menu item `:focus` on hover as
      // well as from the keyboard, so both routes get it.
      //
      // Settled here rather than by each surface. It was a consumer rule in the
      // Command Dock's prototype sheet (`.scratch/command-dock/issues/03`, `/07`);
      // at promotion that would have become a production stylesheet contradicting
      // the primitive, which is the second design system this package exists to
      // prevent. `EntityActionsMenu`'s Delete rows change with it, deliberately.
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = 'start',
  alignOffset = -3,
  side = 'right',
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 w-auto min-w-[96px] rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100',
        className,
      )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

/**
 * Which one of a set the reader is looking at, chosen from a menu.
 *
 * Generic over the value, which Base UI declares as `any` on all three of
 * `value`, `defaultValue` and `onValueChange`. That `any` is the group's to
 * absorb, not each caller's: without this every consumer took an untyped
 * `next` back out of a group it had just handed typed values to, and laundered
 * it — `String(next)` five times over in one surface — which is a cast written
 * as a conversion. Naming the type here means the value a caller gets back is
 * the type it put in, and nothing downstream needs an assertion to say so.
 *
 * `Value` is inferred from `value` or `defaultValue` where a caller passes one,
 * and can be named explicitly where the group is uncontrolled.
 */
type DropdownMenuRadioGroupProps<Value> = Omit<
  MenuPrimitive.RadioGroup.Props,
  'defaultValue' | 'onValueChange' | 'value'
> & {
  readonly value?: Value;
  readonly defaultValue?: Value;
  readonly onValueChange?: (
    value: Value,
    eventDetails: MenuPrimitive.RadioGroup.ChangeEventDetails,
  ) => void;
};

function DropdownMenuRadioGroup<Value>({
  defaultValue,
  onValueChange,
  value,
  ...props
}: DropdownMenuRadioGroupProps<Value>) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      value={value}
      {...props}
    />
  );
}

/**
 * One of the set, and the thing that makes the group's generic true.
 *
 * Base UI types `value` as `any` here too, which left `DropdownMenuRadioGroup`
 * promising a `Value` nothing was holding the items to: an item value the
 * group could not produce still rendered, and still came back out of
 * `onValueChange` wearing the group's type. Naming the type on the item is
 * what closes that — a surface that renders several binds it once with an
 * instantiation expression (`const Item = DropdownMenuRadioItem<Kind>`) rather
 * than repeating the argument, and a typo is then a compile error where it is
 * written instead of a value the group hands on unchallenged.
 *
 * The type does not travel from the group through JSX children — TypeScript
 * has no way to carry it there — so the caller names it, once, on both.
 */
type DropdownMenuRadioItemProps<Value> = Omit<MenuPrimitive.RadioItem.Props, 'value'> & {
  readonly value: Value;
  readonly inset?: boolean;
};

function DropdownMenuRadioItem<Value>({
  className,
  children,
  inset,
  ...props
}: DropdownMenuRadioItemProps<Value>) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
