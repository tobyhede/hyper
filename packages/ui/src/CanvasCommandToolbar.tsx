import { forwardRef, type ComponentProps } from 'react';
import { CommandToolbar } from './CommandSurface';
import { ToolbarButton, type ToolbarButtonProps } from './components/toolbar';
import { cn } from './lib/utils';

/**
 * `CommandToolbar` drawn on the canvas, which stops keydown at its root so
 * React Flow's `document` key handlers do not also see it. Do not move the stop
 * onto each control: that stops the key before the root's roving handler, and
 * the arrows move nothing.
 */
export type CanvasCommandToolbarProps = ComponentProps<typeof CommandToolbar>;

export const CanvasCommandToolbar = forwardRef<HTMLDivElement, CanvasCommandToolbarProps>(
  function CanvasCommandToolbar({ onKeyDown, ...props }, ref) {
    return (
      <CommandToolbar
        ref={ref}
        data-slot="canvas-command-toolbar"
        onKeyDown={(event) => {
          event.stopPropagation();
          onKeyDown?.(event);
        }}
        {...props}
      />
    );
  },
);

/**
 * One command in a {@link CanvasCommandToolbar}, always `ToolbarButton`'s
 * default treatment. `nodrag nopan` and the click and pointer-down stops keep a
 * press off React Flow and the entity beneath.
 */
export type CanvasCommandProps = Omit<
  ToolbarButtonProps,
  'variant' | 'size' | 'className' | 'render'
> & {
  readonly className?: string;
  /** Keep the caret where it is on a pointer press, e.g. Cancel beside an editor. */
  readonly holdFocus?: boolean;
};

export const CanvasCommand = forwardRef<HTMLButtonElement, CanvasCommandProps>(
  function CanvasCommand(
    { className, holdFocus = false, onClick, onMouseDown, onPointerDown, ...props },
    ref,
  ) {
    return (
      <ToolbarButton
        ref={ref}
        data-slot="canvas-command"
        className={cn(className, 'nodrag nopan')}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(event);
        }}
        onMouseDown={(event) => {
          if (holdFocus) event.preventDefault();
          onMouseDown?.(event);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown?.(event);
        }}
        {...props}
      />
    );
  },
);
