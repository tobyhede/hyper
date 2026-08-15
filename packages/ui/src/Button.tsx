import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/utils';

/**
 * shadcn-style button. Variants map to the existing toolbar palette (see
 * `styles.css`): `default` is the accent primary, `secondary` the neutral panel
 * button, `destructive` the panel button with the danger border.
 */
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center rounded-[6px] border text-[0.85rem] whitespace-nowrap transition-colors transition-opacity duration-200 focus-visible:outline-none disabled:cursor-not-allowed data-[state=exiting]:opacity-0',
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
      },
      size: {
        default: 'px-[0.8rem] py-[0.4rem]',
        /**
         * A control standing in the toolbar row, beside `SelectorTrigger`.
         *
         * It exists because `default` and the selectors disagree about height,
         * and the disagreement is invisible in isolation and obvious in the
         * row: `default` inherits the base `text-[0.85rem]` and pads
         * `0.4rem`, which resolves to 13.6px text on 20.4px leading inside
         * 6.4px padding — 35.2px tall — while a selector is the pixel scale
         * `SelectorTrigger` overrides it to, 13px on 19.5px inside 6px, or
         * 33.5px. Toolbar controls came out 1.7px apart and each landed on a
         * half pixel, so the row read as fuzz rather than as a line.
         *
         * The horizontal padding is deliberately not matched to the selectors'
         * `9px`: this is a labelled button and wants the Present button's
         * `11px`. Only the two properties that decide height — font size and
         * vertical padding — are held to the selectors' numbers.
         */
        toolbar: 'px-[11px] py-[6px] text-[13px]',
        icon: 'size-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

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
