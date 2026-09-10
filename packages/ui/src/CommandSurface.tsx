import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { Toolbar } from './components/toolbar';
import { cn } from './lib/utils';
import './command-surface.css';

/** Which way a command surface runs, and so which way its arrow keys run. */
export type CommandSurfaceOrientation = 'horizontal' | 'vertical';

export type CommandToolbarProps = ComponentProps<typeof Toolbar> & {
  readonly className?: string;
  readonly orientation?: CommandSurfaceOrientation;
};

/**
 * A set of commands drawn on the shared command surface, as one toolbar.
 *
 * This is what the Command Dock is and what a Thing's revealed strip is: one
 * `Toolbar` root — so one tab stop, with the arrows moving between its controls
 * (ADR 0073) — wearing the neutral panel `command-surface.css` declares. Both
 * mount this rather than each naming the treatment, because "the Thing's
 * commands look like the Dock's" is a fact about one surface drawn twice and
 * not a pair of stylesheets kept in step by hand.
 *
 * **The orientation is stated once and spent twice.** Base UI takes it to
 * decide which arrows move focus and the stylesheet reads it back off
 * `data-orientation` to decide which way the strip runs, so a column whose
 * arrows ran across it is unrepresentable here.
 *
 * It positions nothing and sizes nothing. Where the surface sits, how large it
 * may grow, whether it scrolls and when it is revealed belong to the surface
 * that mounts one — `command-dock.css` still owns the twelve slots, and
 * `canvas-thing.css` still owns the reveal.
 */
export const CommandToolbar = forwardRef<HTMLDivElement, CommandToolbarProps>(
  function CommandToolbar({ className, orientation = 'horizontal', ...props }, ref) {
    return (
      <Toolbar
        ref={ref}
        orientation={orientation}
        data-orientation={orientation}
        className={cn('command-surface', className)}
        {...props}
      />
    );
  },
);

export type CommandSurfaceProps = ComponentProps<'div'> & {
  readonly orientation?: CommandSurfaceOrientation;
};

/**
 * The same surface, with no toolbar semantics on it.
 *
 * For a cluster of controls that is *drawn* as chrome without being a command
 * toolbar — an Open Space Thing's two choices, which sit in the Thing's own body
 * under the strip that is its toolbar. A second `Toolbar` there would be a
 * second roving container on one Thing, so the Thing would answer the Tab key
 * twice and ADR 0073's one-stop-per-rail rule would hold for neither.
 *
 * The controls inside are therefore ordinary tab stops, which is what a pair of
 * bound choices should be.
 */
export const CommandSurface = forwardRef<HTMLDivElement, CommandSurfaceProps>(
  function CommandSurface({ className, orientation = 'horizontal', ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="command-surface"
        data-orientation={orientation}
        className={cn('command-surface', className)}
        {...props}
      />
    );
  },
);

export interface CommandNameProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * What something is called, drawn on a command surface.
 *
 * A name takes the room it is given and ellipses rather than wrapping or
 * widening the strip it is on — which is the whole of what this is for, and why
 * the Dock's Diagram name and an Open Space Thing's Diagram name are the same
 * component rather than the same three declarations twice.
 */
export function CommandName({ children, className }: CommandNameProps) {
  return (
    <span className={cn('command-name', className)}>
      <span className="command-name__text">{children}</span>
    </span>
  );
}
