import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '#lib/utils';

/**
 * The text field, at the two heights this product's surfaces are built at.
 *
 * `compact` is the field a command surface carries — a Sidebar row's title
 * editor, a list's filter — and it is named to match `Button`'s own `compact`,
 * which is the same decision about the same surfaces. The registry ships no
 * size on `input`, so this is an extension rather than a divergence; it exists
 * because `h-7 rounded-md px-2 py-0 text-sm` was open-coded identically in two
 * places, and a third would have been a third chance to disagree.
 */
const inputVariants = cva(
  'w-full min-w-0 border border-input bg-transparent transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
  {
    variants: {
      size: {
        default: 'h-8 rounded-lg px-2.5 py-1 text-base md:text-sm',
        compact: 'h-7 rounded-md px-2 py-0 text-sm',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export type InputProps = Omit<React.ComponentProps<'input'>, 'className' | 'size'> &
  VariantProps<typeof inputVariants> & { className?: string };

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, type, ...props }, ref) => (
    <InputPrimitive
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input, inputVariants };
