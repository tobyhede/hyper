import { Children, forwardRef, type ComponentProps } from 'react';
import type { Resource } from '@project/core';
import { resourceKindName } from './ResourceKindIcon';
import { CommandToolbar } from './CommandSurface';
import { ToolbarButton, ToolbarGroup, type ToolbarButtonProps } from './components/toolbar';
import { cn } from './lib/utils';

/**
 * The command cluster at a Resource rail's trailing edge, as one toolbar (ADR 0073).
 *
 * The rail itself is `ResourceRail` and stays a plain band: it has a kind at one
 * edge and a slot at the other. This is what a Resource that carries several
 * commands puts in that slot.
 *
 * **It is `CommandToolbar`, which is what the Command Dock is** — the one
 * neutral command surface, drawn here over a Resource and there over the canvas
 * (`.scratch/command-dock/issues/12`). A Resource's commands and a Space's commands
 * are both chrome, so sharing the component is what makes them one language
 * rather than two stylesheets that agree today. The Resource used to draw its own
 * box on a Graph-coloured band; both are gone.
 *
 * The keydown stop lives here rather than on each control. React Flow
 * subscribes its own keys on `document`, and an arrow pressed on the rail must
 * not also reach the canvas — but a control that stopped propagation itself
 * would stop the event before the toolbar root, which is where the roving
 * handler sits, so the arrows would move nothing. Base UI merges its handler
 * with this one, so the composite still sees the key first.
 *
 * The row, the gap, the border and the paper are the shared surface's; **when**
 * the cluster is revealed is the mounting Resource's, which is why `className`
 * arrives from the caller and reaches the surface to be merged rather than
 * replaced.
 */
export type ResourceRailActionsProps = ComponentProps<typeof CommandToolbar>;

export const ResourceRailActions = forwardRef<HTMLDivElement, ResourceRailActionsProps>(
  function ResourceRailActions({ onKeyDown, ...props }, ref) {
    return (
      <CommandToolbar
        ref={ref}
        data-slot="resource-rail-actions"
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

/**
 * A group's own row and gap.
 *
 * **Tighter than the gap between groups**, which is the shared command
 * surface's 2px — so a group reads as one run and the boundary between two of
 * them reads as a seam. The Command Dock's clusters are the same pair the other
 * way round from the surface's own gap (`command-dock.css`), and a group spaced
 * *wider* than the boundary would say the opposite of what the grouping means.
 */
const GROUP_LAYOUT = 'inline-flex items-center gap-px';

/**
 * Whose command is this?
 *
 * A rail carries two kinds of command and the difference is not cosmetic.
 * **Shared** commands belong to every Resource whatever it is: Open and Close are
 * Resource-level under ADR 0064, and a Space Resource is as closable as a Markdown one.
 * **Kind** commands belong to one kind of Resource and mean nothing on another:
 * Edit, Save and Cancel are the Markdown front's, and choosing a Map or
 * entering a Space would be a Space Resource's.
 *
 * The two are drawn the same — same box, same glyph vocabulary, one rail and
 * one control treatment — so the distinction lives in the markup rather than in
 * the paint: two `role="group"`s, each named, which assistive technology
 * announces on the way past. Grouping does not divide the keyboard; the roving
 * tabindex is the toolbar root's and the arrows cross the boundary like any
 * other gap.
 *
 * A Space Resource leads with Map and Graph choices, then entity actions,
 * its Read/Edit (or Done) kind command, and Open/Close, with Enter inside the
 * entity menu. Content-edit commands on other kinds sit between the entity
 * actions and Open/Close. The mounting Resource supplies that order.
 *
 * Either group draws nothing when it holds nothing — a Reference Resource offers one
 * kind command and no shared one — so a rail never carries an empty named
 * group for a set of commands this Resource does not have.
 */
export type ResourceRailKindActionsProps = Omit<
  ComponentProps<typeof ToolbarGroup>,
  'className' | 'render'
> & {
  readonly className?: string;
  /** The kind whose commands these are, which is also how the group names itself. */
  readonly kind: Resource['kind'];
};

export const ResourceRailKindActions = forwardRef<HTMLDivElement, ResourceRailKindActionsProps>(
  function ResourceRailKindActions({ className, kind, children, ...props }, ref) {
    if (emptyGroup(children)) return null;
    return (
      <ToolbarGroup
        ref={ref}
        data-slot="resource-rail-kind-actions"
        aria-label={`${resourceKindName(kind)} commands`}
        className={cn(GROUP_LAYOUT, className)}
        {...props}
      >
        {children}
      </ToolbarGroup>
    );
  },
);

export type ResourceRailSharedActionsProps = Omit<
  ComponentProps<typeof ToolbarGroup>,
  'className' | 'render'
> & {
  readonly className?: string;
};

export const ResourceRailSharedActions = forwardRef<HTMLDivElement, ResourceRailSharedActionsProps>(
  function ResourceRailSharedActions({ className, children, ...props }, ref) {
    if (emptyGroup(children)) return null;
    return (
      <ToolbarGroup
        ref={ref}
        data-slot="resource-rail-shared-actions"
        aria-label="Resource commands"
        className={cn(GROUP_LAYOUT, className)}
        {...props}
      >
        {children}
      </ToolbarGroup>
    );
  },
);

/**
 * One command on a Resource rail: the same box, the same glyph treatment and the
 * same trailing cluster, whatever the command is (ADR 0073).
 *
 * `variant` and `size` are deliberately not offered. One rail, one control
 * treatment — a command that carried its own box would read as a different kind
 * of resource to the ones it sits beside — and the treatment is `ToolbarButton`'s
 * own default, which is the quiet icon button every command in the Command Dock
 * is drawn as. The Resource used to override it with a hand-drawn 22px box in
 * `canvas-resource.css`, inked from the Resource's own paper because it sat on a
 * Graph-coloured band; the band is gone and so is the override, so "the Resource's
 * commands look like the Dock's" is now one recipe rather than two
 * (`.scratch/command-dock/issues/12`).
 *
 * `resource__rail-action` survives as the canvas hook this component needs and not
 * as a second appearance.
 *
 * It also owns the three responsibilities every rail control has to sit on a
 * canvas, so no call site restates them:
 *
 * - `nodrag nopan` keep a press on the control off React Flow's pan and drag.
 * - The click and pointer-down stops keep the same press from reaching the
 *   Resource beneath and selecting it.
 * - `holdFocus` suppresses the pointer default so the press does not take the
 *   caret with it. A rail control sits on the Resource's band while the caret sits
 *   in its content, so activating one mid-edit is also a focus leaving the
 *   writing surface — taking the author's selection with it, for a control
 *   that may well be Cancel.
 *
 * A caller's own handler still runs, after the stop.
 */
export type ResourceRailActionProps = Omit<
  ToolbarButtonProps,
  'variant' | 'size' | 'className' | 'render'
> & {
  readonly className?: string;
  /** Keep the caret where it is when this control is pressed with the pointer. */
  readonly holdFocus?: boolean;
};

export const ResourceRailAction = forwardRef<HTMLButtonElement, ResourceRailActionProps>(
  function ResourceRailAction(
    { className, holdFocus = false, onClick, onMouseDown, onPointerDown, ...props },
    ref,
  ) {
    return (
      <ToolbarButton
        ref={ref}
        data-slot="resource-rail-action"
        className={cn('resource__rail-action nodrag nopan', className)}
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
