import { Children, forwardRef, type ComponentProps } from 'react';
import type { Card } from '@project/core';
import { cardKindName } from './CardKindIcon';
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  type ToolbarButtonProps,
} from './components/toolbar';
import { cn } from './lib/utils';

/**
 * The command cluster at a Card rail's trailing edge, as one toolbar (ADR 0070).
 *
 * The rail itself is `CardRail` and stays a plain band: it has a kind at one
 * edge and a slot at the other, and the Alias metadata editor mounts that same
 * band with a single Close control and no toolbar at all. This is what a Card
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
 * mounting Card's, which is why `className` arrives from the caller and reaches
 * the toolbar untouched.
 */
export type CardRailActionsProps = ComponentProps<typeof Toolbar>;

export const CardRailActions = forwardRef<HTMLDivElement, CardRailActionsProps>(
  function CardRailActions({ onKeyDown, ...props }, ref) {
    return (
      <Toolbar
        ref={ref}
        data-slot="card-rail-actions"
        onKeyDown={(event) => {
          event.stopPropagation();
          onKeyDown?.(event);
        }}
        {...props}
      />
    );
  },
);

/** Whether a group holds nothing, and so should draw nothing at all. */
const emptyGroup = (children: ComponentProps<typeof ToolbarGroup>['children']): boolean =>
  Children.toArray(children).length === 0;

/** A group's own row and gap; the rail's spacing between groups stays the rail's. */
const GROUP_LAYOUT = 'inline-flex items-center gap-1';

/**
 * Whose command is this?
 *
 * A rail carries two kinds of command and the difference is not cosmetic.
 * **Shared** commands belong to every Card whatever it is: Open and Close are
 * Card-level under ADR 0064, and a Space Card is as closable as a Markdown one.
 * **Kind** commands belong to one kind of Card and mean nothing on another:
 * Edit, Save and Cancel are the Markdown front's, and choosing a Space View or
 * entering a Space would be a Space Card's.
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
 * of Card it is on is the point of calling it shared at all.
 *
 * Either group draws nothing when it holds nothing — an Alias Card offers one
 * kind command and no shared one — so a rail never carries an empty named
 * group for a set of commands this Card does not have.
 */
export type CardRailKindActionsProps = Omit<
  ComponentProps<typeof ToolbarGroup>,
  'className' | 'render'
> & {
  readonly className?: string;
  /** The kind whose commands these are, which is also how the group names itself. */
  readonly kind: Card['kind'];
};

export const CardRailKindActions = forwardRef<HTMLDivElement, CardRailKindActionsProps>(
  function CardRailKindActions({ className, kind, children, ...props }, ref) {
    if (emptyGroup(children)) return null;
    return (
      <ToolbarGroup
        ref={ref}
        data-slot="card-rail-kind-actions"
        aria-label={`${cardKindName(kind)} commands`}
        className={cn(GROUP_LAYOUT, className)}
        {...props}
      >
        {children}
      </ToolbarGroup>
    );
  },
);

export type CardRailSharedActionsProps = Omit<
  ComponentProps<typeof ToolbarGroup>,
  'className' | 'render'
> & {
  readonly className?: string;
};

export const CardRailSharedActions = forwardRef<HTMLDivElement, CardRailSharedActionsProps>(
  function CardRailSharedActions({ className, children, ...props }, ref) {
    if (emptyGroup(children)) return null;
    return (
      <ToolbarGroup
        ref={ref}
        data-slot="card-rail-shared-actions"
        aria-label="Card commands"
        className={cn(GROUP_LAYOUT, className)}
        {...props}
      >
        {children}
      </ToolbarGroup>
    );
  },
);

/**
 * One command on a Card rail: the same box, the same glyph treatment and the
 * same trailing cluster, whatever the command is (ADR 0070).
 *
 * `variant` and `size` are deliberately not offered. One rail, one control
 * treatment — a command that carried its own box would read as a different
 * kind of thing to the ones it sits beside — and `card__rail-action` is where
 * that treatment is written.
 *
 * It also owns the three things every rail control has to do to sit on a
 * canvas, so no call site restates them:
 *
 * - `nodrag nopan` keep a press on the control off React Flow's pan and drag.
 * - The click and pointer-down stops keep the same press from reaching the
 *   Card beneath and selecting it.
 * - `holdFocus` suppresses the pointer default so the press does not take the
 *   caret with it. A rail control sits on the Card's band while the caret sits
 *   in its content, so activating one mid-edit is also a focus leaving the
 *   writing surface — taking the author's selection with it, for a control
 *   that may well be Cancel.
 *
 * A caller's own handler still runs, after the stop.
 */
export type CardRailActionProps = Omit<
  ToolbarButtonProps,
  'variant' | 'size' | 'className' | 'render'
> & {
  readonly className?: string;
  /** Keep the caret where it is when this control is pressed with the pointer. */
  readonly holdFocus?: boolean;
};

export const CardRailAction = forwardRef<HTMLButtonElement, CardRailActionProps>(
  function CardRailAction(
    { className, holdFocus = false, onClick, onMouseDown, onPointerDown, ...props },
    ref,
  ) {
    return (
      <ToolbarButton
        ref={ref}
        data-slot="card-rail-action"
        className={cn('card__rail-action nodrag nopan', className)}
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
