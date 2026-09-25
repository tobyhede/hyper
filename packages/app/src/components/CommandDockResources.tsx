/**
 * The Command Dock's Resources cluster: the Resources trigger and the list it
 * discloses, and the Create peers beside it. `CommandDock` mounts
 * {@link ResourcesControl}.
 */
import { useContext, useEffect, useId, useRef } from 'react';
import { ResourceKindIcon, resourceKindName, ToolbarButton, ToolbarGroup } from '@project/ui';
import type { MenuSide } from '../dock-placement';
import { RESOURCES_TRIGGER } from './command-dock-triggers';
import { DockDisclosureContext, RESOURCES_DISCLOSURE_ID } from './command-dock-shared';
import {
  RESOURCE_KINDS,
  type DockResourceKind,
  type DockResources,
  type DockResourcesList,
} from './command-dock-chrome';
import { SetTrigger } from './CommandDockParts';
import { ResourcesPopover } from './ResourcesPopover';

/**
 * Create Resource, as peer commands in the Resources cluster, one per kind.
 *
 * **The kinds are peers, and they are not disclosed.** They are not a split
 * button with a hidden default: the kind is chosen at creation, so no kind is
 * the default. Nor are they behind a menu: every kind completes its Edit on
 * activation, so a disclosure would cost a press on every creation for a
 * choice it never makes.
 *
 * Create stays *outside* the Resources surface. That list is a long scrolling one
 * an author drags out of, so a New pinned above it is a second region and a New
 * inside it scrolls away.
 *
 * **A glyph is asked to mean a verb here, which it is not asked to do anywhere
 * else in the product.** The same silhouettes mark rows in the Resources
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
       one `Toolbar` root — and it gives `command-dock.css` one element to place.
       Left as loose siblings the vertical column's grid would auto-place them
       onto a row each and the Resources cluster would grow past the Map and
       Graph clusters beside it. */
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
  // disabled trigger. Presenting passes through here, and a list that reopened
  // itself on the way back would take focus with it,
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
   * The cluster, as one of the Dock's named `role="group"`s. The one toolbar
   * root is {@link Dock}'s; the group carries the name, which is what
   * assistive technology announces once on the way past rather than on every
   * item.
   */
  return (
    <ToolbarGroup aria-label="Resources" className="command-dock__cluster command-dock__resources">
      {/* **The list carries no commands, and that is the shape rather than a
          gap in it.** Resources names no one entity — a Resource's own commands are the
          Resource rail's (ADR 0073) and this Dock deliberately carries none — and
          its set commands, the Creates, are the peers beside this trigger. Do
          not repeat Create inside the list: that is a second path to one
          command.

          It offers Space Resources like any other Resource and does nothing special
          with them: entering one is the canvas Resource's gesture (ADR 0068), not a
          list's. */}
      <ResourcesList list={resources.list} side={side} />
      {/* **Trailing, where Present leads**, and the asymmetry is the point.
          Present acts on the named entity the cluster is showing — present *this
          Graph* — so it sits at the edge the eye enters from, ahead of the name
          it acts on. Create acts on the **set**: Resources names no one entity, which
          is why it has no name to edit, and a command about the set reads after
          the disclosure that lists it. `[▢ Resources ⌄][▢][▢↗]` is "the Resources,
          and make one"; leading would be verbs with no subject in front of them.

          **The vertical dock packs this cluster rather than granting it tracks.**
          A verb track per trailing command would sit empty on the rows that
          have one verb or none. Instead the Resources trigger gives up the `1fr` name track it
          never needed: Space, Map and Graph name entities the author renamed,
          so their names take the slack and truncate, while "Resources" is a fixed
          word. See `command-dock.css`. */}
      <CreatePeers onCreate={resources.onCreate} disabled={resources.createDisabled} />
    </ToolbarGroup>
  );
}
