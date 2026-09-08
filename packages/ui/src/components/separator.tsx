import { Separator as SeparatorPrimitive } from '@base-ui/react/separator';

import { cn } from '#lib/utils';

/**
 * How a vertical rule sits on the cross axis of the flex line holding it.
 *
 * `stretch` is the registry's own behaviour and stays the default: a rule
 * between two full-height regions runs their full height. `center` is for a
 * bar whose items are centred — a toolbar, a command strip — where a stretched
 * rule runs to the top of the line box and sits there off-centre.
 *
 * Centring is what stops the flex line giving the rule its height, so `center`
 * brings a default one (`h-4`) that a caller's own `h-*` overrides. Without it
 * the variant hands back a rule that is zero-tall and invisible unless every
 * call site remembers to size it.
 *
 * It is a variant rather than something a caller passes as a class because
 * `data-[orientation=vertical]:self-stretch` compiles to a class *and* an
 * attribute selector, so a plain `self-center` loses to it whatever the sheet
 * order and a caller who does not know that reaches for a stylesheet. Passing
 * the matching `data-[orientation=vertical]:self-center` does work — `cn` is
 * `twMerge(clsx(...))` and resolves the pair — but that is a caller having to
 * know how this component's own base string is written.
 */
type SeparatorAlign = 'stretch' | 'center';

function Separator({
  align = 'stretch',
  className,
  orientation = 'horizontal',
  ...props
}: SeparatorPrimitive.Props & { readonly align?: SeparatorAlign }) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px',
        align === 'center'
          ? [
              'data-[orientation=vertical]:self-center',
              // A plain height, and only for the orientation that needs one.
              // Plain, because a caller's own `h-*` has to win and `cn` is
              // `twMerge`, which resolves two plain heights and would not
              // resolve one against a `data-[orientation=vertical]:` variant —
              // that variant compiles to a class *and* an attribute selector
              // and would outrank the caller. Conditional on the orientation
              // rather than variant-scoped for the same reason in reverse: a
              // horizontal rule's `h-px` is one of those attribute-qualified
              // rules and a plain `h-4` reaching it would be an accident of
              // specificity rather than a decision.
              orientation === 'vertical' && 'h-4',
            ]
          : 'data-[orientation=vertical]:self-stretch',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
