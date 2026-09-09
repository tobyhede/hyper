import type * as React from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';

import { cn } from '#lib/utils';

/**
 * The trail of containers a reader crossed to reach where they are.
 *
 * `@shadcn/breadcrumb` on `base-nova`. Taken as generated bar the imports — `cn`
 * from `#lib/utils`, and React's namespace as `import type`, which the registry
 * writes as a value import and `ui-component-type-imports` refuses in a file
 * that only names its types — and bar `BreadcrumbList`'s `size`, which the
 * registry does not ship and which is documented on the variant below. It
 * carries no `radix-ui` dependency, being Base UI's `useRender` underneath
 * (ADR 0050).
 *
 * It is markup and spacing rather than behaviour: a `nav` naming itself a
 * breadcrumb, an ordered list, and one item per step. `BreadcrumbLink` renders
 * as whatever it is given, so a step that navigates in-process is a `Button`
 * or a `ToolbarButton` in the list rather than an `<a href>` that reloads.
 *
 * `BreadcrumbPage` is the step you are on: a span rather than a link, carrying
 * `aria-current="page"`. Where a surface needs that step to stay authorable —
 * a name you click to rename, a disclosure hanging off it — it draws its own
 * control instead, and the list ends at the step above.
 */
function Breadcrumb({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav aria-label="breadcrumb" data-slot="breadcrumb" className={cn(className)} {...props} />
  );
}

/**
 * The trail's own type scale.
 *
 * `default` is the registry's `text-sm`, which is a page's scale. `compact` is
 * the 13px the command surfaces are drawn at — the same size `Button` names
 * `compact` — and it exists because the list is what sets the scale for every
 * step inside it: a crumb rendered as a `compact` control took its font size
 * from itself and its line height from this element, so a trail dropped into a
 * command surface came out a pixel shorter than every control beside it.
 */
const breadcrumbListVariants = cva(
  'flex flex-wrap items-center gap-1.5 wrap-break-word text-muted-foreground',
  {
    variants: {
      size: {
        default: 'text-sm',
        compact: 'text-[13px]',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

function BreadcrumbList({
  className,
  size,
  ...props
}: Omit<React.ComponentProps<'ol'>, 'className'> &
  VariantProps<typeof breadcrumbListVariants> & { className?: string }) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(breadcrumbListVariants({ size }), className)}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  );
}

function BreadcrumbLink({ className, render, ...props }: useRender.ComponentProps<'a'>) {
  return useRender({
    defaultTagName: 'a',
    props: mergeProps<'a'>(
      {
        className: cn('transition-colors hover:text-foreground', className),
      },
      props,
    ),
    render,
    state: {
      slot: 'breadcrumb-link',
    },
  });
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn('font-normal text-foreground', className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn('[&>svg]:size-3.5', className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  );
}

function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn('flex size-5 items-center justify-center [&>svg]:size-4', className)}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">More</span>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
