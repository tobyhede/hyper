import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from './lib/utils';

/**
 * Hyper's styled Base UI Popover composition.
 *
 * Positioning belongs to Base UI's Positioner, while popup semantics and the
 * portalled surface belong to Popup. Keeping that division here stops callers
 * from accidentally putting position props on the visible surface.
 */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

type PopoverPositionerProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Positioner>;
type PopoverPopupProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup>;

export type PopoverContentProps = Omit<PopoverPopupProps, 'className'> &
  Pick<
    PopoverPositionerProps,
    | 'align'
    | 'alignOffset'
    | 'anchor'
    | 'arrowPadding'
    | 'collisionAvoidance'
    | 'collisionBoundary'
    | 'collisionPadding'
    | 'disableAnchorTracking'
    | 'positionMethod'
    | 'side'
    | 'sideOffset'
    | 'sticky'
  > & {
    readonly className?: string;
  };

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Popup>,
  PopoverContentProps
>(
  (
    {
      align = 'center',
      alignOffset,
      anchor,
      arrowPadding,
      className,
      collisionAvoidance,
      collisionBoundary,
      collisionPadding,
      disableAnchorTracking,
      positionMethod,
      side,
      sideOffset = 6,
      sticky,
      ...popupProps
    },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        arrowPadding={arrowPadding}
        collisionAvoidance={collisionAvoidance}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        disableAnchorTracking={disableAnchorTracking}
        positionMethod={positionMethod}
        side={side}
        sideOffset={sideOffset}
        sticky={sticky}
      >
        <PopoverPrimitive.Popup
          ref={ref}
          // React Flow's live Space-key pan activation subscription reaches
          // this portalled popup, so its own `.nokey` ancestor excludes it.
          // The shadow is the theme's `shadow-lg`, which is what
          // `DropdownMenuSubContent` beside it already spends — the Menu's
          // outer popup takes `shadow-md` with a ring, so the sibling this
          // matches is the nested one rather than every Menu surface. It was
          // `shadow-[0_12px_40px_rgba(0,0,0,0.5)]` — half the black there is,
          // written in numbers no theme can reach — which is a value chosen
          // against a dark face and reads as a smudge on a light one. A token
          // moves with the theme; an arbitrary value has to be fought by
          // whichever surface the popover lands on.
          className={cn(
            'nokey z-50 min-w-[15rem] rounded-[6px] border border-[var(--border)] bg-[var(--card)] p-[0.6rem] text-[var(--foreground)] shadow-lg outline-none',
            className,
          )}
          {...popupProps}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = 'PopoverContent';
