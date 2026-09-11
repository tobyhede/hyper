import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';

import { cn } from '../lib/utils';

/**
 * A row of toggle buttons sharing one state, over Base UI's primitive.
 *
 * The shadcn registry's `toggle-group` is Radix, and ADR 0050 puts this
 * repository on Base UI — so this is the smallest shadcn-shaped wrapper over
 * the primitive the registry's Base UI variant documents, written in Hyper's
 * own vocabulary rather than adapted from a Radix item that would drag
 * `radix-ui` in behind it.
 *
 * **Generic over its value, and the type does not travel through JSX.** Base UI
 * types both the group and the item over `Value extends string`, but a child's
 * generic is not inferred from its parent's — so a surface with a union to
 * enforce binds the item once, `const Item = ToggleGroupItem<MyUnion>`, the way
 * `DropdownMenuRadioItem` is bound beside it. Without that, `onValueChange`
 * hands back `string[]` and the narrowing has to be re-done at runtime.
 *
 * Multi-select is the caller's choice and off by default, matching the
 * primitive: `multiple` makes the group a set of independent pressed states
 * rather than an exclusive choice.
 *
 * **Neither half forwards a ref, deliberately.** `Toolbar` beside this one does,
 * because `CanvasThing` returns focus to a toolbar item and a generic function
 * component under React 18 would advertise a ref and silently drop it. Nothing
 * reaches for a toggle that way, and the generic `forwardRef` that would keep
 * the type accurate needs a narrowing assertion to survive — which ADR 0062
 * caps. So the types say what is true: no ref here. A caller that needs one
 * adds it deliberately, and pays for it then.
 */
function ToggleGroup<Value extends string>({
  className,
  ...props
}: ToggleGroupPrimitive.Props<Value>) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn('inline-flex items-center gap-[2px]', className)}
      {...props}
    />
  );
}

/**
 * One toggle in a group: pressed or not, and never a choice among its siblings.
 *
 * `aria-pressed` is the primitive's, and so is the group's roving tabindex — a
 * reader arrows between the toggles and the group is one tab stop, exactly as
 * `Toolbar` beside it works. What is here is the treatment: a quiet control at
 * rest, and the theme's `--accent` when pressed, so "on" reads as a state of
 * this control rather than as a selection among the row.
 *
 * A caller that draws a glyph and no text owes the item an `aria-label`; the
 * component cannot name a mark it did not choose.
 */
function ToggleGroupItem<Value extends string>({
  className,
  ...props
}: TogglePrimitive.Props<Value>) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-[0.35rem] rounded-[6px] border border-transparent bg-transparent px-[0.5rem] py-[0.3rem] text-[13px] whitespace-nowrap text-muted-foreground transition-[color,background-color,border-color] hover:border-border hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
        'data-[pressed]:border-border data-[pressed]:bg-accent data-[pressed]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
