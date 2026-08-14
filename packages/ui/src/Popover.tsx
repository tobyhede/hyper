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
          // `nokey` because React Flow subscribes its delete key on `document`,
          // while a portalled popup is outside the canvas's own guard.
          className={cn(
            'nokey z-50 min-w-[15rem] rounded-[6px] border border-[var(--border)] bg-[var(--panel)] p-[0.6rem] text-[var(--text)] shadow-[0_12px_40px_rgba(0,0,0,0.5)] outline-none',
            className,
          )}
          {...popupProps}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = 'PopoverContent';
