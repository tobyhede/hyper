import { forwardRef, type ComponentProps } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/utils';

const quietAppearance = 'border-transparent bg-transparent text-muted-foreground';

/**
 * What a quiet button does when it is pointed at, disclosing, or unavailable.
 *
 * Shared by `ghost` and `receded`, which differ in resting ink and in nothing
 * else — a treatment written twice is a treatment that gets changed once.
 *
 * **The open state belongs here and not to the surface that mounts one.** A
 * trigger with something open should read as open, and `aria-expanded` is the
 * attribute every disclosing control already carries: Base UI sets it on any
 * trigger that discloses, so a control added later is covered without being
 * told. It is a step above the hover fill and no more — an open disclosure is
 * already announced by the surface hanging off it, and a trigger that also
 * inverted would read as a selected mode — which is why it takes the hover
 * fill and the hover ink and leaves the border alone. The Command Dock's own
 * stylesheet used to declare this over its whole surface, which made an
 * application sheet a second owner of a shared Button's appearance.
 */
const quietFeedback =
  'hover:border-border hover:bg-secondary hover:text-secondary-foreground aria-expanded:bg-secondary aria-expanded:text-secondary-foreground disabled:opacity-50';

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
        ghost: `${quietAppearance} ${quietFeedback}`,
        // A ghost at one step less ink, for a command that names somewhere the
        // reader is *not* — the Command Dock's parent crumb beside the Space
        // they are in. Every quiet control measures identically, so two of them
        // at the same tone read as one list rather than as a place and the
        // volume it sits inside; the step back is the difference, and a glyph
        // beside it owes a little more stroke to hold it. The mix is against
        // `transparent` rather than a second ink token so the step is taken
        // from whatever `--muted-foreground` is, in either theme.
        receded: `border-transparent bg-transparent text-[color-mix(in_oklab,var(--muted-foreground)_72%,transparent)] ${quietFeedback}`,
        // For non-interactive labels beside commands: consume buttonVariants
        // on a span, retaining the shared type and box without button semantics
        // or hover feedback.
        label: `${quietAppearance} cursor-default`,
        commit:
          'border-[3px] border-transparent border-b-primary bg-transparent text-foreground hover:border-primary disabled:opacity-50',
      },
      size: {
        default: 'px-[0.8rem] py-[0.4rem]',
        // The small text button the command surfaces are built from. Named for
        // the shape rather than for a place: `Toolbar` is a component now
        // (ADR 0073), and its own items are `size: 'icon'`, so a size called
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
