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
          ? 'data-[orientation=vertical]:self-center'
          : 'data-[orientation=vertical]:self-stretch',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
