import type * as React from 'react';
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';

import { cn } from '#lib/utils';
import { Button } from '../Button';
import { XIcon } from 'lucide-react';

/**
 * A panel that slides in from an edge of the screen.
 *
 * Composed from Base UI's own `Drawer` rather than the shadcn registry's, which
 * is vaul and therefore Radix: `packages/ui` depends on `@base-ui/react` alone,
 * so taking it would stand a second dialog, focus and animation stack beside
 * the one every other surface here uses. Base UI supplies the primitive, so
 * this is the smallest shadcn-shaped wrapper over it.
 *
 * Only the parts this repository composes are wrapped. There is no backdrop
 * part: the one consumer is non-modal by requirement, and a part nothing
 * composes is a part nothing tests.
 */
function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

/**
 * The positioning container the popup sits against an edge of.
 *
 * It spans the screen, so it is inert by default and the popup restores
 * pointer events for itself. Without that, a non-modal drawer would swallow
 * every press on the surface behind it and be a modal one in all but name.
 *
 * `z-40` rather than the `z-50` every other portalled surface in this package
 * carries, and deliberately: a drawer is the one overlay the rest of the
 * application stays live behind, so a menu opened *inside* it and a modal
 * dialog raised *over* it both have to outrank it.
 */
function DrawerViewport({ className, ...props }: DrawerPrimitive.Viewport.Props) {
  return (
    <DrawerPrimitive.Viewport
      data-slot="drawer-viewport"
      className={cn('pointer-events-none fixed inset-0 z-40 flex', className)}
      {...props}
    />
  );
}

export type DrawerSide = 'left' | 'right';

/**
 * How wide a drawer is, as a CSS length.
 *
 * Exported because a surface the drawer overlays has to yield exactly this much
 * to stay clear of it (`AppShell`'s `insetEnd`), and a second copy of the number
 * is a second copy that can disagree. `DrawerPopup` is the only thing that
 * applies it as a width.
 */
export const DRAWER_WIDTH = '20rem';

export interface DrawerPopupProps extends DrawerPrimitive.Popup.Props {
  /** Which edge the drawer sits against. Drives its border, slide and swipe axis. */
  side?: DrawerSide;
}

/**
 * The panel itself.
 *
 * `--drawer-swipe-movement-x` is Base UI's live swipe offset, so the resting
 * transform is the gesture's own and the closed transform is a full width off
 * the edge. `data-swiping` drops the transition to zero for the duration, which
 * is what lets the panel track the pointer rather than chase it.
 */
function DrawerPopup({ className, side = 'right', ...props }: DrawerPopupProps) {
  return (
    <DrawerPrimitive.Popup
      data-slot="drawer-popup"
      data-side={side}
      // The width is inline rather than a utility class so `DRAWER_WIDTH` is the
      // only place the number is written. `props` is spread after it, so a
      // caller that passes its own `style` still wins.
      style={{ width: DRAWER_WIDTH }}
      className={cn(
        'pointer-events-auto flex h-full max-w-[calc(100vw-3rem)] flex-col bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg outline-none',
        'translate-x-(--drawer-swipe-movement-x) transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0',
        'data-[side=right]:ml-auto data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-full data-[side=right]:data-starting-style:translate-x-full',
        'data-[side=left]:mr-auto data-[side=left]:border-r data-[side=left]:data-ending-style:-translate-x-full data-[side=left]:data-starting-style:-translate-x-full',
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({ className, ...props }: DrawerPrimitive.Content.Props) {
  return (
    <DrawerPrimitive.Content
      data-slot="drawer-content"
      className={cn('flex min-h-0 flex-1 flex-col', className)}
      {...props}
    />
  );
}

export interface DrawerHeaderProps extends React.ComponentProps<'div'> {
  /** Whether the header carries a close control of its own. */
  showCloseButton?: boolean;
}

function DrawerHeader({
  className,
  children,
  showCloseButton = true,
  ...props
}: DrawerHeaderProps) {
  return (
    <div
      data-slot="drawer-header"
      className={cn('flex shrink-0 items-center gap-2 border-b p-4', className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DrawerPrimitive.Close
          data-slot="drawer-close"
          className="ml-auto"
          render={<Button variant="ghost" size="icon" />}
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </DrawerPrimitive.Close>
      )}
    </div>
  );
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('text-base font-medium text-foreground', className)}
      {...props}
    />
  );
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerPopup,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
  DrawerViewport,
};
