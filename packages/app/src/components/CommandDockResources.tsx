/**
 * The Command Dock's Resources cluster: the Resources trigger and the list it
 * discloses, and the Create peers beside it. `CommandDock` mounts
 * {@link ResourcesControl}.
 */
import { useContext, useEffect, useId, useRef } from 'react';
import { ResourceKindIcon, resourceKindName, ToolbarButton, ToolbarGroup } from '@project/ui';
import type { Resource, ResourceId, UUID } from '@project/core';
import type { ResourcesPopoverSpace, SettlePlacement, SettleResource } from '../resources-drag';
import type { MapMemberships } from '../map-memberships';
import type { MenuSide } from '../dock-placement';
import { RESOURCES_TRIGGER } from './command-dock-triggers';
import { DockDisclosureContext, RESOURCES_DISCLOSURE_ID } from './command-dock-shared';
import { SetTrigger } from './CommandDockParts';
import { ResourcesPopover } from './ResourcesPopover';

/**
 * The two kinds Create offers, in the order the cluster draws them.
 *
 * **`reference` left, and it left the Dock rather than the list.** A Reference Resource is
 * always created *from* the Resource it points at, which supplies the Target
 * (ADR 0089), so the gesture is a row in that Resource's own command menu and
 * there is nothing here for it to be a peer of.
 */
const RESOURCE_KINDS = ['markdown', 'space'] as const;

/**
 * A kind the Create cluster draws a control for.
 *
 * Named rather than written inline at the prop, because it is the type the
 * *dispatch* is held to: `dock-chrome.ts` answers every press through a record over
 * this, so a kind added above has to say what pressing it does before the
 * application compiles.
 */
export type DockResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * What the Resources list draws and what activating a row does.
 *
 * **Two one-way writes rather than an `open` flag**, and that is what lets the
 * Dock own the slot without a second copy of the answer beside it. The
 * application has exactly two facts to report about whether this list is open —
 * `disclose` asks for it and `disabled` withdraws it — and nothing it reads
 * back, so neither is state it keeps. A controlled `open` pair here is the
 * shape that lets the Dock's slot and the application's flag disagree, which is
 * how two disclosures come to be open at once.
 */
export interface DockResourcesList {
  /** The Resources this Map does not place — what the list offers. */
  readonly resources: readonly Resource[];
  /** Every Resource in the Space, for resolving a Reference Resource row's Target Title. */
  readonly allResources: readonly Resource[];
  /** The Title of every Space a Space Resource in the list references. */
  readonly spaceTitleById?: ReadonlyMap<UUID, string> | undefined;
  /**
   * Every Space this Meta Space holds bar the one being authored.
   *
   * The list's second source. A Space is not a Resource and is in no Map, so it
   * is not filtered against one; placing it authors the Space Resource that frames
   * it, which under ADR 0074 is the only way a Space is referenced at all.
   */
  readonly spaces?: readonly ResourcesPopoverSpace[] | undefined;
  /** Place a Space by authoring the Space Resource that frames it, or answer with a refusal. */
  readonly onAddSpace?: ((space: ResourcesPopoverSpace) => Promise<string | null>) | undefined;
  /** Where each listed Resource is placed outside this Map, drawn as a capsule per Map. */
  readonly memberships?: MapMemberships | undefined;
  /** Returns a refusal that stays on the list, or null after a completed Add. */
  readonly onAdd: (resource: Resource, activation: 'keyboard' | 'pointer') => string | null;
  /** A Resource row left the list on a drag; `settle` takes the drop's answer back to that list. */
  readonly onDragStart: (resourceId: ResourceId, settle: SettleResource) => void;
  /** A Space row left the list on a drag; `settle` takes the drop's answer back to that list. */
  readonly onSpaceDragStart?:
    ((space: ResourcesPopoverSpace, settle: SettlePlacement) => void) | undefined;
  readonly onDragEnd?: (() => void) | undefined;
  /** The row an addressed Resource marks as current, drawn whether or not it opened the list. */
  readonly revealedResourceId?: ResourceId | null | undefined;
  /**
   * A request to disclose the list, or `null` for none outstanding.
   *
   * **A request rather than an `open` flag**, which is what lets the Dock own
   * the slot without a second copy of the answer beside it. The application has
   * two moments at which it asks for this list and none at which it reads back
   * whether the list is open: a Map just created — by Add Map, or by
   * having opened a Space into one — and a Resource addressed that the selected
   * Map does not place.
   *
   * The Dock opens on the value **changing identity**, so the application raises
   * a fresh object per request and an unrelated edit recomputing an equal one
   * reopens nothing the reader has just closed. A request outstanding when the
   * Dock first mounts opens it without waiting a frame.
   */
  readonly disclose?: DockResourcesDisclosure | null | undefined;
  /** Whether the Map can accept membership edits at all. */
  readonly disabled: boolean;
}

/** One request to disclose the Resources list, and the Resource it is about. */
export interface DockResourcesDisclosure {
  /**
   * The Resource the request is about, which the list marks.
   *
   * Not nullable: every disclosure the application makes is about a Resource. The
   * one caller that asked for the list with nothing to mark was New Map
   * revealing it on an empty Map, and that command discloses nothing now —
   * it continues in the new Map's name (ADR 0089).
   */
  readonly resourceId: ResourceId;
}

export interface DockResources {
  /**
   * The Resources, as a list this Dock draws.
   *
   * **The Dock draws it rather than being handed it, and that is the whole of
   * why the open state lives here.** The prototype's Resources cluster disclosed a
   * filtered Popover it drew itself, chosen over a Drawer from the screen edge
   * and a second docked panel in a comparison over twenty-nine unplaced Resources;
   * the Popover won, and the reasons are written above {@link ResourcesPopover} and
   * in `.scratch/command-dock/issues/10-decide-the-cards-surface.md`. The Dock's
   * promotion shipped the application's `ResourcesDrawer` against that decision
   * because the drawer already had parity claims and the prototype's evidence
   * sat in a file marked throwaway; this slot was a `ReactNode` for as long as
   * the surface was a foreign component.
   *
   * It is not one any more. A list the Dock draws takes the Dock's own single
   * open slot, so opening it closes whichever menu was open and opening a menu
   * closes it — which a handed-in surface holding its own `open` could not do.
   */
  readonly list: DockResourcesList;
  /**
   * Create a Resource of one kind — the one command about the *set*.
   *
   * The kind is chosen at creation, so the menu offers three peers rather than a
   * split button with a hidden default. This is *Create*, distinct from adding
   * an existing Resource, which is what the surface above is for.
   */
  readonly onCreate: (kind: DockResourceKind) => void;
  /** Whether each Create peer may run — the kinds withdraw independently when in flight. */
  readonly createDisabled: Readonly<Record<DockResourceKind, boolean>>;
}

/**
 * Create Resource, as three peer commands in the Resources cluster.
 *
 * **The kinds were always peers; they are no longer disclosed.** The design this
 * replaces put them behind a `+` and recorded why they are peers rather than a
 * split button with a hidden default — the kind is chosen at creation, so none
 * of the three is the default. That reasoning is kept whole here. What is
 * dropped is the disclosure around them, which cost a press on *every*
 * creation, including the one kind that then needed no second decision:
 * `markdown` completed its Edit on activation, while `reference` and `space` opened
 * a pane because a Target and a target Space were still owed. So the menu
 * charged the cheapest command for a choice it never makes. ADR 0089 has since
 * made every kind complete on activation and taken `reference` out of this cluster
 * altogether, which makes the argument stronger rather than weaker.
 *
 * The other half of that recorded design is untouched and still load-bearing:
 * Create stays *outside* the Resources surface. That list is a long scrolling one
 * an author drags out of, so a New pinned above it is a second region and a New
 * inside it scrolls away.
 *
 * **A glyph is asked to mean a verb here, which it is not asked to do anywhere
 * else in the product.** The same three silhouettes mark rows in the Resources
 * list and Resources on the canvas, where they say *what a Resource is*. Each control
 * carries `Create <kind>` as its accessible name and its tooltip, so the
 * keyboard and the pointer are unambiguous; what is accepted is that a silent
 * visual reading could take the kind glyphs in a command slot for filters
 * over the list the trigger opens.
 *
 * They carry no chevron. In the cluster they sit where Present sits on the
 * Graph cluster — bare glyphs after the disclosure — and a second chevron
 * beside `Resources ⌄` would read as a second disclosure of the same list.
 */
function CreatePeers({
  onCreate,
  disabled,
}: {
  readonly onCreate: (kind: DockResourceKind) => void;
  readonly disabled: Readonly<Record<DockResourceKind, boolean>>;
}) {
  return (
    /* **A nested group, and it is what lets the vertical dock pack.** Base UI's
       toolbar group is a plain `role="group"` div with no positional logic, so
       it nests inside the cluster without taking the roving tabindex off the
       one `Toolbar` root — and it gives `command-dock.css` one element to place
       instead of two. Left as loose siblings the vertical column's grid
       auto-places them onto a row each and the Resources cluster grows past the
       44px Map and 44px Graph beside it. */
    <ToolbarGroup aria-label="Create a Resource" className="command-dock__create">
      {RESOURCE_KINDS.map((kind) => (
        <ToolbarButton
          key={kind}
          variant="ghost"
          size="icon"
          className="nokey"
          aria-label={`Create ${resourceKindName(kind)}`}
          title={`Create ${resourceKindName(kind)}`}
          disabled={disabled[kind]}
          onClick={() => onCreate(kind)}
        >
          {/* Decorative here and nowhere else in the Dock: this button already
              says `Create <kind>`, so a glyph announcing `<kind>` beside it is a
              second node repeating half of it. Both of these are mounted at
              rest, so the duplication is permanent rather than disclosed. */}
          <ResourceKindIcon kind={kind} decorative />
        </ToolbarButton>
      ))}
    </ToolbarGroup>
  );
}

function ResourcesTrigger() {
  return (
    /* The Resource glyph the rows in its own list carry, not `OpenResourceIcon`'s
       expand arrows: beside a Space, a Map and a Graph's colour, the icon
       slot names what the cluster is about, and "expand" named a gesture this
       cluster does not have. */
    <SetTrigger icon={<ResourceKindIcon kind="markdown" />}>Resources</SetTrigger>
  );
}

/**
 * The Resources list in its cluster, holding the Dock's one open slot.
 *
 * The three states the application reports about whether this is open are applied
 * here rather than mirrored into a second flag: `initiallyOpen` seeds the slot
 * in {@link CommandDock}, `disabled` closes it, and `reveal` opens it on the
 * change rather than on the value. Each is a one-way write into the slot, so
 * there is no state here that can come to disagree with the application's.
 */
function ResourcesList({
  list,
  side,
}: {
  readonly list: DockResourcesList;
  readonly side: MenuSide;
}) {
  const { openId, setOpenId } = useContext(DockDisclosureContext);
  const open = openId === RESOURCES_DISCLOSURE_ID;
  const disclosed = useRef(list.disclose ?? null);
  // The slot key is stable and the trigger's DOM id is not, because they answer
  // different questions: the Dock has to be able to name this slot before a
  // control exists, and every open Space keeps its Dock mounted, so a literal
  // `id` would be in the document more than once the moment a second Space is
  // open.
  const triggerId = useId();

  // Withdrawing the list *closes* it rather than leaving it open behind a
  // disabled trigger. Presenting and creating a Reference Resource both pass through here,
  // and a list that reopened itself on the way back would take focus with it,
  // landing the reader in the Resources rather than on the canvas they returned to.
  useEffect(() => {
    if (list.disabled && open) setOpenId(null);
  }, [list.disabled, open, setOpenId]);

  // On the identity changing rather than on the value: an unrelated edit
  // elsewhere in the Space recomputes an equal request, and reopening on that
  // alone would reopen a list the reader has just closed.
  useEffect(() => {
    const next = list.disclose ?? null;
    if (next === disclosed.current) return;
    disclosed.current = next;
    if (next !== null) setOpenId(RESOURCES_DISCLOSURE_ID);
  }, [list.disclose, setOpenId]);

  return (
    <ResourcesPopover
      open={open && !list.disabled}
      onOpenChange={(next) => setOpenId(next ? RESOURCES_DISCLOSURE_ID : null)}
      triggerId={triggerId}
      side={side}
      disabled={list.disabled}
      triggerRender={<ToolbarButton variant="ghost" {...RESOURCES_TRIGGER} />}
      triggerLabel={<ResourcesTrigger />}
      resources={list.resources}
      allResources={list.allResources}
      spaceTitleById={list.spaceTitleById}
      spaces={list.spaces}
      onAddSpace={list.onAddSpace}
      memberships={list.memberships}
      onAdd={list.onAdd}
      onDragStart={list.onDragStart}
      onSpaceDragStart={list.onSpaceDragStart}
      onDragEnd={list.onDragEnd}
      revealedResourceId={list.revealedResourceId}
    />
  );
}

export function ResourcesControl({
  resources,
  side = 'bottom',
}: {
  readonly resources: DockResources;
  readonly side?: MenuSide;
}) {
  /**
   * The cluster, as one of the Dock's named `role="group"`s.
   *
   * It was a `Toolbar` of its own, as each of the four clusters was — which
   * made the Dock four toolbars and so four tab stops, where ADR 0073 draws
   * one toolbar with named groups inside it. The root moved to {@link Dock};
   * what is left here is the name, which is what assistive technology
   * announces once on the way past rather than on every item.
   */
  return (
    <ToolbarGroup aria-label="Resources" className="command-dock__cluster command-dock__resources">
      {/* **The list carries no commands, and that is the shape rather than a
          gap in it.** Resources names no one entity — a Resource's own commands are the
          Resource rail's (ADR 0073) and this Dock deliberately carries none — and
          its set commands, the three Creates, are the peers beside this trigger.
          Repeating Create inside the list as well would be the second path to
          one command that the Sidebar's own actions menu was built to remove.

          It offers Space Resources like any other Resource and does nothing special
          with them: entering one is the canvas Resource's gesture (ADR 0068), not a
          list's. */}
      <ResourcesList list={resources.list} side={side} />
      {/* **Trailing, where Present leads**, and the asymmetry is the point.
          Present acts on the named entity the cluster is showing — present *this
          Graph* — so it sits at the edge the eye enters from, ahead of the name
          it acts on. Create acts on the **set**: Resources names no one entity, which
          is why it has no name to edit, and a command about the set reads after
          the disclosure that lists it. `[▢ Resources ⌄][▢][▣][▢↗]` is "the Resources,
          and make one"; leading would be verbs with no subject in front of them.

          **The vertical dock packs this cluster rather than granting it tracks.**
          Three trailing commands would need three verb tracks, empty on the three
          rows that have one verb or none — 84px of a 208px column spent on
          gutters. Instead the Resources trigger gives up the `1fr` name track it
          never needed: Space, Map and Graph name entities the author renamed,
          so their names take the slack and truncate, while "Resources" is a fixed
          word. See `command-dock.css`. */}
      <CreatePeers onCreate={resources.onCreate} disabled={resources.createDisabled} />
    </ToolbarGroup>
  );
}
