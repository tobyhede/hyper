import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/utils';

/**
 * shadcn-style button. Variants map to the existing toolbar palette (see
 * `styles.css`): `default` is the accent primary, `secondary` the neutral panel
 * button, `destructive` the panel button with the danger border.
 */
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center rounded-[6px] border text-[0.85rem] whitespace-nowrap transition-colors focus-visible:outline-none disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default:
          'border-[var(--accent-strong)] bg-[var(--accent-strong)] text-white hover:border-[var(--accent)] disabled:opacity-50',
        secondary:
          'border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50',
        destructive:
          'border-[#7f1d1d] bg-[var(--panel-2)] text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50',
      },
      size: {
        default: 'px-[0.8rem] py-[0.4rem]',
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
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
