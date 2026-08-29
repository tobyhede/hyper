import * as React from 'react';
import { Toolbar as ToolbarPrimitive } from '@base-ui/react/toolbar';

import { Button } from '../Button';

/**
 * A collection of command controls that share one tab stop.
 *
 * Base UI supplies the roving-tabindex behaviour the ARIA toolbar pattern
 * asks for: the toolbar itself is the single tab stop, the arrow keys move
 * between its items, and `Home`/`End` reach the ends. The shadcn registry
 * carries no toolbar, so this is the smallest wrapper over the primitive that
 * gives Hyper the component in its own vocabulary.
 *
 * It supplies no layout of its own. A toolbar is drawn by the surface that
 * owns it — the Card rail's row and gap are the Card's, not the toolbar's —
 * so this contributes semantics and keyboard behaviour and nothing visual.
 * With no classes of its own to merge, `className` reaches the primitive
 * untouched, which is what keeps Base UI's state-callback form usable through
 * the wrapper; `cn` would quietly drop a callback and leave the element bare.
 *
 * Both halves stay `forwardRef` although neither takes a ref here. Base UI's
 * prop types include `ref`, and a plain function component under React 18
 * would advertise one and then drop it — silently, and at the call site that
 * needed it most (`CanvasCard` returns focus to its Edit control this way).
 */
const Toolbar = React.forwardRef<HTMLDivElement, ToolbarPrimitive.Root.Props>(
  function Toolbar(props, ref) {
    return <ToolbarPrimitive.Root ref={ref} data-slot="toolbar" {...props} />;
  },
);

/**
 * A set of related commands inside a toolbar, as `role="group"`.
 *
 * Grouping is semantic and does not divide the keyboard: the roving tabindex
 * belongs to the root, so the arrows cross a group boundary exactly as they
 * cross any other gap between two commands. What a group buys is that
 * assistive technology announces the boundary once on the way past it, and
 * that `disabled` can be spent on a whole set at once.
 */
const ToolbarGroup = React.forwardRef<HTMLDivElement, ToolbarPrimitive.Group.Props>(
  function ToolbarGroup(props, ref) {
    return <ToolbarPrimitive.Group ref={ref} data-slot="toolbar-group" {...props} />;
  },
);

/**
 * One command in a toolbar, drawn by the shared {@link Button}.
 *
 * `disabled` here is **not** the native attribute. Base UI's
 * `focusableWhenDisabled` defaults to `true` for a toolbar item, so an
 * unavailable command keeps its place in the arrow order and announces itself
 * as unavailable, rather than disappearing from the keyboard while remaining
 * on screen. Style it through `[aria-disabled='true']`; `:disabled` will not
 * match.
 */
export type ToolbarButtonProps = ToolbarPrimitive.Button.Props &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>;

const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton({ variant = 'ghost', size = 'icon', ...props }, ref) {
    return (
      <ToolbarPrimitive.Button
        ref={ref}
        data-slot="toolbar-button"
        render={<Button variant={variant} size={size} />}
        {...props}
      />
    );
  },
);

export { Toolbar, ToolbarButton, ToolbarGroup };
