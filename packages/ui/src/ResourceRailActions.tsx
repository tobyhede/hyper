import { Children, forwardRef, type ComponentProps } from 'react';
import type { Resource } from '@project/core';
import { resourceKindName } from './ResourceKindIcon';
import {
  CanvasCommand,
  CanvasCommandToolbar,
  type CanvasCommandProps,
  type CanvasCommandToolbarProps,
} from './CanvasCommandToolbar';
import { ToolbarGroup } from './components/toolbar';
import { cn } from './lib/utils';

/**
 * The command cluster at a Resource rail's trailing edge, as one toolbar (ADR 0073).
 *
 * The rail itself is `ResourceRail` and stays a plain band with one slot at its
 * trailing edge. This is what a Resource that carries several commands puts in
 * that slot, trailed by the Resource's kind glyph.
 *
 * It is `CanvasCommandToolbar`, the Command Dock's surface, so a Resource's
 * commands read as the same chrome as the Dock's and an Edge's.
 *
 * The mounting Resource decides when the cluster is revealed, so `className` is
 * merged into the surface rather than replacing it.
 */
export type ResourceRailActionsProps = CanvasCommandToolbarProps;

export const ResourceRailActions = forwardRef<HTMLDivElement, ResourceRailActionsProps>(
  function ResourceRailActions(props, ref) {
    return <CanvasCommandToolbar ref={ref} data-slot="resource-rail-actions" {...props} />;
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
 * The entity actions lead, then a Space Resource's Map and Graph choices, its
 * Edit (or Done) kind command, and Open/Close last, with Enter inside the entity
 * menu. Content-edit commands on other kinds sit between the entity actions and
 * Open/Close. The mounting Resource supplies that order.
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
 * It is `CanvasCommand`, which owns the canvas command treatment and stops.
 * `holdFocus` matters here: the caret may sit in the Resource's content, and
 * pressing a rail control must not take it.
 *
 * `resource__rail-action` is a canvas hook, not a second appearance.
 */
export type ResourceRailActionProps = CanvasCommandProps;

export const ResourceRailAction = forwardRef<HTMLButtonElement, ResourceRailActionProps>(
  function ResourceRailAction({ className, ...props }, ref) {
    return (
      <CanvasCommand
        ref={ref}
        data-slot="resource-rail-action"
        className={cn('resource__rail-action', className)}
        {...props}
      />
    );
  },
);
