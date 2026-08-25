import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '#lib/utils';

const kbdVariants = cva('pointer-events-none select-none', {
  variants: {
    variant: {
      default:
        "inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
      compact:
        'inline h-auto min-w-0 rounded-none bg-transparent p-0 [letter-spacing:inherit] text-[inherit] [font:inherit]',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type KbdProps = React.ComponentProps<'kbd'> & {
  readonly keyName?: 'modifier';
} & VariantProps<typeof kbdVariants>;

const keyLabel = (keyName: KbdProps['keyName']): React.ReactNode => {
  if (keyName !== 'modifier') return undefined;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘' : 'Ctrl';
};

function Kbd({ className, keyName, variant, children, ...props }: KbdProps) {
  return (
    <kbd data-slot="kbd" className={cn(kbdVariants({ variant }), className)} {...props}>
      {keyName === undefined ? children : keyLabel(keyName)}
    </kbd>
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup, kbdVariants };
