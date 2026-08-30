import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '#lib/utils';

/**
 * A set of panels of which one shows at a time, and the tabs that choose it.
 *
 * `@shadcn/tabs` on `base-nova`. It is Base UI underneath (ADR 0050), so it
 * carries no `radix-ui` dependency and adds none.
 *
 * Taken as generated bar the import paths and **one correction**: the registry
 * item selects orientation as `data-vertical` and `data-horizontal`, and
 * `@base-ui/react@1.7.0` emits neither — it writes `data-orientation`, which is
 * what the tree already reads elsewhere (`components/separator.tsx`). Left as
 * generated, every orientation rule in the file is inert and a vertical set
 * silently draws as a row. So the selectors are respelled and nothing else is:
 * same rules, same intent, the attribute this version actually has. Re-check
 * this on a Base UI upgrade, and re-check it when regenerating from the
 * registry, which will bring the unmatched spelling back.
 *
 * Base UI supplies the whole ARIA tabs pattern: the `tablist`/`tab`/`tabpanel`
 * roles, `aria-selected`, the `aria-controls`/`id` pairing between a tab and
 * its panel, and a roving tabindex over the list — one tab stop for the set,
 * the arrow keys between tabs, `Home`/`End` to the ends. `orientation`
 * turns both the layout and which arrow keys move: `vertical` puts the list in
 * a column and gives it up and down.
 *
 * Two list props are worth knowing because their defaults decide behaviour
 * rather than appearance. `activateOnFocus` is `false`, so arrowing to a tab
 * highlights it and `Enter` or `Space` selects — which is what a surface whose
 * panels are expensive wants, and the opposite of what a cheap set of panels
 * wants. `loopFocus` is `true`, so the arrows wrap at the ends.
 */
function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn('group/tabs flex gap-2 data-[orientation=horizontal]:flex-col', className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none',
  {
    variants: {
      variant: {
        default: 'bg-muted',
        line: 'gap-1 bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function TabsList({
  className,
  variant = 'default',
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
        'data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground',
        'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

/**
 * One panel, shown while its tab is the active one.
 *
 * `keepMounted` is the prop that decides whether a panel's own state survives
 * being looked away from: hidden panels are unmounted by default, and a panel
 * that must keep live state — a mounted surface with its own selections —
 * passes `keepMounted` and is hidden with `hidden` instead.
 */
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('flex-1 text-sm outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
