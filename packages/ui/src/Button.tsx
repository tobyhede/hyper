import { forwardRef, type ComponentProps } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/utils';

/**
 * shadcn-style button. Variants map to the command-surface palette (see
 * `styles.css`): `default` is the accent primary, `secondary` the neutral panel
 * button, `destructive` the panel button with the danger border.
 */
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center rounded-[6px] border text-[0.85rem] whitespace-nowrap transition-[color,background-color,border-color,opacity] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default:
          'border-primary bg-primary text-primary-foreground hover:border-accent disabled:opacity-50',
        secondary:
          'border-border bg-secondary text-secondary-foreground hover:border-accent disabled:opacity-50',
        destructive:
          'border-destructive bg-secondary text-destructive hover:border-accent disabled:opacity-50',
        ghost:
          'border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-secondary-foreground disabled:opacity-50',
        commit:
          'border-[3px] border-transparent border-b-primary bg-transparent text-foreground hover:border-primary disabled:opacity-50',
      },
      size: {
        default: 'px-[0.8rem] py-[0.4rem]',
        // The small text button the command surfaces are built from. Named for
        // the shape rather than for a place: `Toolbar` is a component now
        // (ADR 0070), and its own items are `size: 'icon'`, so a size called
        // "toolbar" named neither where it is used nor what a toolbar carries.
        compact: 'px-[11px] py-[6px] text-[13px]',
        icon: 'size-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
);

export type ButtonProps = Omit<ComponentProps<typeof ButtonPrimitive>, 'className'> &
  VariantProps<typeof buttonVariants> & { className?: string };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  return (
    <ButtonPrimitive
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
