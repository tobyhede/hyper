import { Children, forwardRef, type ComponentProps } from 'react';
import type { Thing } from '@project/core';
import { thingKindName } from './ThingKindIcon';
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  type ToolbarButtonProps,
} from './components/toolbar';
import { cn } from './lib/utils';

/**
 * The command cluster at a Thing rail's trailing edge, as one toolbar (ADR 0073).
 *
 * The rail itself is `ThingRail` and stays a plain band: it has a kind at one
 * edge and a slot at the other, and the Alias metadata editor mounts that same
 * band with a single Close control and no toolbar at all. This is what a Thing
 * that carries several commands puts in that slot.
 *
 * The keydown stop lives here rather than on each control. React Flow
 * subscribes its own keys on `document`, and an arrow pressed on the rail must
 * not also reach the canvas — but a control that stopped propagation itself
 * would stop the event before the toolbar root, which is where the roving
 * handler sits, so the arrows would move nothing. Base UI merges its handler
 * with this one, so the composite still sees the key first.
 *
 * It draws nothing: the row, the gap and when the cluster is revealed are the
 * mounting Thing's, which is why `className` arrives from the caller and reaches
 * the toolbar untouched.
 */
export type ThingRailActionsProps = ComponentProps<typeof Toolbar>;

export const ThingRailActions = forwardRef<HTMLDivElement, ThingRailActionsProps>(
  function ThingRailActions({ onKeyDown, ...props }, ref) {
    return (
      <Toolbar
        ref={ref}
        data-slot="thing-rail-actions"
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
 * Whether a group has no direct React children, and so should draw nothing.
 * An empty Fragment is still one direct child even though it renders no controls.
 */
const emptyGroup = (children: ComponentProps<typeof ToolbarGroup>['children']): boolean =>
  Children.toArray(children).length === 0;

/** A group's own row and gap; the rail's spacing between groups stays the rail's. */
const GROUP_LAYOUT = 'inline-flex items-center gap-1';

/**
 * Whose command is this?
 *
 * A rail carries two kinds of command and the difference is not cosmetic.
 * **Shared** commands belong to every Thing whatever it is: Open and Close are
 * Thing-level under ADR 0064, and a Space Thing is as closable as a Markdown one.
 * **Kind** commands belong to one kind of Thing and mean nothing on another:
 * Edit, Save and Cancel are the Markdown front's, and choosing a Diagram or
 * entering a Space would be a Space Thing's.
 *
 * The two are drawn the same — same box, same glyph vocabulary, one rail and
 * one control treatment — so the distinction lives in the markup rather than in
 * the paint: two `role="group"`s, each named, which assistive technology
 * announces on the way past. Grouping does not divide the keyboard; the roving
 * tabindex is the toolbar root's and the arrows cross the boundary like any
 * other gap.
 *
 * **Kind commands lead and shared commands trail.** A rail is read from the
 * particular to the general, and Close staying in the same place whatever kind
 * of Thing it is on is the point of calling it shared at all.
 *
 * Either group draws nothing when it holds nothing — an Alias Thing offers one
 * kind command and no shared one — so a rail never carries an empty named
 * group for a set of commands this Thing does not have.
 */
export type ThingRailKindActionsProps = Omit<
  ComponentProps<typeof ToolbarGroup>,
  'className' | 'render'
> & {
  readonly className?: string;
  /** The kind whose commands these are, which is also how the group names itself. */
  readonly kind: Thing['kind'];
};

export const ThingRailKindActions = forwardRef<HTMLDivElement, ThingRailKindActionsProps>(
  function ThingRailKindActions({ className, kind, children, ...props }, ref) {
    if (emptyGroup(children)) return null;
    return (
      <ToolbarGroup
        ref={ref}
        data-slot="thing-rail-kind-actions"
        aria-label={`${thingKindName(kind)} commands`}
        className={cn(GROUP_LAYOUT, className)}
        {...props}
      >
        {children}
      </ToolbarGroup>
    );
  },
);

export type ThingRailSharedActionsProps = Omit<
  ComponentProps<typeof ToolbarGroup>,
  'className' | 'render'
> & {
  readonly className?: string;
};

export const ThingRailSharedActions = forwardRef<HTMLDivElement, ThingRailSharedActionsProps>(
  function ThingRailSharedActions({ className, children, ...props }, ref) {
    if (emptyGroup(children)) return null;
    return (
      <ToolbarGroup
        ref={ref}
        data-slot="thing-rail-shared-actions"
        aria-label="Thing commands"
        className={cn(GROUP_LAYOUT, className)}
        {...props}
      >
        {children}
      </ToolbarGroup>
    );
  },
);

/**
 * One command on a Thing rail: the same box, the same glyph treatment and the
 * same trailing cluster, whatever the command is (ADR 0073).
 *
 * `variant` and `size` are deliberately not offered. One rail, one control
 * treatment — a command that carried its own box would read as a different
 * kind of thing to the ones it sits beside — and `thing__rail-action` is where
 * that treatment is written.
 *
 * It also owns the three things every rail control has to do to sit on a
 * canvas, so no call site restates them:
 *
 * - `nodrag nopan` keep a press on the control off React Flow's pan and drag.
 * - The click and pointer-down stops keep the same press from reaching the
 *   Thing beneath and selecting it.
 * - `holdFocus` suppresses the pointer default so the press does not take the
 *   caret with it. A rail control sits on the Thing's band while the caret sits
 *   in its content, so activating one mid-edit is also a focus leaving the
 *   writing surface — taking the author's selection with it, for a control
 *   that may well be Cancel.
 *
 * A caller's own handler still runs, after the stop.
 */
export type ThingRailActionProps = Omit<
  ToolbarButtonProps,
  'variant' | 'size' | 'className' | 'render'
> & {
  readonly className?: string;
  /** Keep the caret where it is when this control is pressed with the pointer. */
  readonly holdFocus?: boolean;
};

export const ThingRailAction = forwardRef<HTMLButtonElement, ThingRailActionProps>(
  function ThingRailAction(
    { className, holdFocus = false, onClick, onMouseDown, onPointerDown, ...props },
    ref,
  ) {
    return (
      <ToolbarButton
        ref={ref}
        data-slot="thing-rail-action"
        className={cn('thing__rail-action nodrag nopan', className)}
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
