/**
 * The Command Dock: the Space's one command surface, floating over the canvas.
 *
 * It is what ADR 0082 asks for and nothing about its shape is that ADR's. What
 * is bound is what the surface owes an author — one exclusive canvas choice with
 * no second control and no empty value; Graph activation kept separate from it;
 * status that is never a command; every command reachable from the keyboard
 * alone; a persistence state reported without being asked, naming which open
 * Space is unwell; the Space being worked in named, and the Spaces open beside
 * it reachable — and one spatial fact: **it takes no layout space from the
 * canvas**. Where it sits, how it is moved, how its commands are grouped and
 * which glyph stands for each are treatment, settled by the stories and
 * behaviour tests beside it rather than by a document (ADR 0052).
 *
 * The command set, in the order containment gives it:
 *
 *   Spaces  — which Space this is, rename it, cross into and out of one
 *   Maps — which is drawing, select another, add/rename/delete
 *   Graphs  — which is active, select another, present, add/rename/delete
 *   Resources   — Create, and the Resources this Space holds
 *
 * **A Resource's own commands are absent on purpose.** Open, Edit, Delete, a Resource's
 * links and taking a Resource back out of a Map belong to the Resource rail (ADR
 * 0073), which draws them on the Resource itself. This surface is *about* the
 * canvas; a Resource is the literal object on it. That is a dependency and not just
 * an exclusion — the Space Sidebar carried a Resource's links and its Delete in a
 * footer, and this arrangement is only complete because the rail carries them
 * now.
 *
 * **A Space is a Space Resource, held by the Meta Space above it.** So the Spaces
 * *inside* a Space are Resources in it and the Resources surface already offers them,
 * while the bar names the Opener and the Open Spaces menu holds the set open
 * beside it — drawn as the tree the Opener makes. Moving between them closes
 * nothing; Exit, in the Space menu, is what takes one out of the set (ADR 0068).
 *
 * **There is no saving cue, and its absence is a decision.** `PersistenceIndicator`
 * is deliberately not called: a commit settles faster than a dot can be read, so
 * a permanent slot in a five-cluster strip spent reporting the expected outcome
 * is a slot spent on nothing. The states worth drawing are the three that need a
 * reader — `failed`, `rejected`, `conflicted` — and those are
 * `PersistenceControl`'s and `PersistenceNotice`'s own surfaces, mounted
 * unchanged. Only their placement is this module's.
 *
 * It replaces `SpaceSidebar` and `OpenSpaceSidebars`, which ADR 0082 retired
 * along with the gutter they stood in
 * (`.scratch/command-dock/issues/07-promote-the-dock-and-retire-the-space-sidebar.md`).
 */
import {
  Fragment,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  ResourceKindIcon,
  resourceKindName,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  GraphColorLine,
  GraphIcon,
  graphColor,
  MapIcon,
  PresentIcon,
  ChoiceMenu,
  MapMenuActions,
  GraphMenuActions,
  CommandToolbar,
  ToolbarButton,
  ToolbarGroup,
} from '@project/ui';
import type { Resource, ResourceId, Graph, GraphId, Map, MapId, UUID } from '@project/core';
import { GRAPH_PALETTE_ENTRIES } from '@project/graph';
import type { SpaceSessionState } from '@project/persistence';
import type { StoredSpaceRefusal } from '../space-authoring';
import type { ResourcesPopoverSpace, SettlePlacement, SettleResource } from '../resources-drag';
import { PersistenceControl, PersistenceNotice } from './PersistenceControl';
import { identityMenuRestoresFocusOnClose } from './identity-menu-focus-restore';
import type { MapMemberships } from '../map-memberships';
import {
  alongLabel,
  DOCK_ALONGS,
  DOCK_EDGES,
  dockSlot,
  dockStyle,
  EDGE_LABEL,
  exceedsDragThreshold,
  MENU_SIDE,
  nearestSlot,
  orientationOf,
  slotLabel,
  slotValue,
  type DockEdge,
  type DockPosition,
  type MenuSide,
} from '../dock-placement';
import { RESOURCES_TRIGGER } from './command-dock-triggers';
import {
  DISCLOSURE_ALIGN,
  DISCLOSURE_SIDE_OFFSET,
  DISCLOSURE_WIDTH,
  DockDisclosureContext,
  DockRenamingContext,
  RESOURCES_DISCLOSURE_ID,
  useDockDisclosure,
  useIdentityCaret,
  type DockIdentity,
  type DockRenaming,
  type IdentityDisclosure,
} from './command-dock-shared';
import { Divider, IdentitySurface, SetTrigger } from './CommandDockParts';
import { SpacesControl, type DockSpace } from './CommandDockSpaces';
import { ResourcesPopover } from './ResourcesPopover';
import './command-dock.css';

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

/* ------------------------------------------------------------------ state */

/**
 * **What the Dock is given, in the groups the surface it replaced was given
 * them in.**
 *
 * It was one flat `Chrome` of thirty-three members, threaded whole into ten
 * components — so `PresentingExit`, which reads four of them, was declared to
 * take every command in the surface, and no signature in the file said what any
 * component actually used. `SpaceSidebar` did not do that: it took `canvas`,
 * `graph`, `addResource`, `createMap`, `persistence`, `selectedResource`,
 * `entityActions` and `titleEdit`, and each of its own pieces took the group it
 * drew.
 *
 * The groups here are named after it wherever there is a counterpart —
 * `canvas` is the Maps and the one that is drawing, `graph` is the Graphs
 * and Present, `persistence` is the report and its recoveries — which is what
 * made promoting this surface a move rather than a translation.
 *
 * Two composition points take the whole of it, and that is the shape rather
 * than a leftover: `App` stands where the application mounts the surface and
 * {@link CommandDock} stands where the surface distributes to its own clusters.
 * Everything below them takes a group.
 */
export interface DockChrome {
  /**
   * That a name in the bar is being renamed right now.
   *
   * **One fact under the whole bar, reported rather than owned.** The editor is
   * `InlineTitleEditor` and which name is open is the bar's own slot
   * ({@link useDockRenaming}) — which is the whole reason the shared draft the
   * Sidebar needed is gone. But the *application* still has to know one is
   * running: a live chrome rename withdraws Create Resource, Present, Delete Resource
   * and the canvas's own title editing, because each of those would re-derive
   * the canvas or take the caret from under it (`authoring-availability.ts`).
   *
   * So the text, the refusal and the focus return stay in the component and only
   * the fact crosses the seam. It is `DockChrome`'s rather than `canvas`'s or
   * `graph`'s because there is one answer for the bar — and because there is one
   * answer, there is one writer: the slot, not each name in turn.
   */
  readonly onRenamingChange: (renaming: boolean) => void;
  /**
   * How many times the Space under this bar has been **replaced** — ADR 0042's
   * epoch, counted by Space Authoring and handed down unchanged.
   *
   * **The one fact that ends a rename which no identity in the bar can see
   * coming.** Every other ending is visible from here: the author presses Enter
   * or Escape, moves to another Map, or the rename stops being available. A
   * replacement is none of those — accepting the stored Space installs a
   * different Space's document under the same ids, so the slot names the same
   * Map, `chromeTitleEdit` is unchanged once placement resolves, and an
   * editor left open goes on standing over a Space that is gone, reseeded from
   * the accepted title. Completing it then writes a name the author typed
   * against a Map they never saw.
   *
   * It is a counter and not a `replaced` flag for the reason `replacementEpoch`
   * is one everywhere else: two replacements in a row are two facts, and a
   * boolean that has to be lowered again is a second message this seam would
   * have to carry. A number the component compares against its own is total.
   *
   * `DockChrome`'s rather than a group's, for the same reason
   * {@link onRenamingChange} is: it is one answer under the whole bar, and the
   * slot that holds the rename is where it is spent.
   */
  readonly replacementEpoch: number;
  readonly space: DockSpace;
  readonly canvas: DockCanvas;
  readonly graph: DockGraph;
  readonly resources: DockResources;
  readonly persistence: DockPersistence;
}

/**
 * The canvas's one exclusive choice: which authored Map is drawing (ADR
 * 0079, ADR 0082).
 *
 * Named `canvas` after the group the Space Sidebar carried for the same purpose,
 * and carrying `selected` as the Map rather than as an id for the same reason
 * that one did — the title belongs to the Map, so a cluster naming what is
 * drawing reads it off the Map instead of deriving a second title.
 */
export interface DockCanvas {
  /** The Space's authored Maps, in the order it declares them. */
  readonly maps: readonly Map[];
  /** The Map that is drawing. */
  readonly selected: Map;
  readonly onSelect: (mapId: MapId) => void;
  /**
   * Rename the drawing Map. Absent while no chrome rename may begin —
   * {@link DockSpace.onRename}'s second arm.
   */
  readonly onRename: ((title: string) => string | null) | null;
  /**
   * Create an empty Map and select it, or `null` while New Map may not run.
   *
   * One field, so the row's unavailable treatment and its press are the one
   * answer Map authoring's capability gave (`map-authoring-commands.ts`,
   * `offered`). Among that answer's terms is one beyond Create Resource's:
   * creating a Map **selects** it, and the created Map is empty — so the
   * canvas re-derives with no nodes and a Resource holding a live title draft
   * unmounts, taking the draft, the announced reason and the caret with it. A
   * valid draft is safe, because pressing the control blurs the input and a
   * valid blur completes the Title (ADR 0065); a refused one is re-focused
   * instead and the press lands anyway.
   */
  readonly onCreate: (() => void) | null;
  /**
   * Whether New Map's rename continuation landed — read when the menu closes.
   *
   * **The answer is the point.** New Map continues in the new Map's name,
   * so this cluster's menu must not take the caret back on close — but only once
   * the rename editor has actually opened. Asking at press time races the
   * post-selection window where rename is withdrawn; reading here keeps the two
   * halves of that decision in one place rather than one per module.
   */
  readonly didCreateMoveCaret: () => boolean;
  /**
   * Delete the drawing Map, or `null` while Delete may not run.
   *
   * One field for the same reason as {@link DockCanvas.onCreate}. The answer
   * holds two rules, and neither is derivable here without restating it: the
   * last Map cannot be deleted (ADR 0079), and every entity Edit is withdrawn
   * while a title editor or a live content edit owns the caret
   * (`authoring-availability.ts`). A row that read only the first used to
   * press cleanly, run nothing, and report nothing.
   */
  readonly onDelete: (() => void) | null;
  /**
   * Copy the drawing Map's address — the one form a Map has.
   *
   * A Map offers no permanent link because it has no second address to be
   * permanent *against*: its own address is the only one there is
   * (`entity-actions.tsx`), where a Graph and a Resource each have a within-Map
   * form as well.
   */
  readonly onCopyLink: () => void;
}

/** The Graphs the selected Map owns, the Active one, and Present. */
export interface DockGraph {
  /** The Graphs the selected Map owns, which are the only ones it draws. */
  readonly graphs: readonly Graph[];
  readonly active: Graph;
  /** Every visible Graph's resolved colour, derived by the production palette. */
  readonly colorByGraphId: Readonly<Record<string, string>>;
  /** The Active Graph's colour, which several controls carry as its identity. */
  readonly activeColor: string;
  readonly onActivate: (graphId: GraphId) => void;
  /** Absent while no chrome rename may begin — {@link DockSpace.onRename}'s second arm. */
  readonly onRename: ((graphId: GraphId, title: string) => string | null) | null;
  /** A Graph's stored colour, which the canvas draws its Edges in. */
  readonly onRecolor: (graphId: GraphId, color: string) => void;
  readonly onCreate: () => void;
  readonly onDelete: (graphId: GraphId) => void;
  /**
   * Whether this cluster's lifecycle commands may run at all.
   *
   * One term for the three of them, because they are withdrawn by one rule and
   * not by three: New Graph, Colour and Delete are entity Edits, and no entity
   * Edit runs while a title editor or a live content edit owns the caret
   * (`authoring-availability.ts`). Delete carries the ADR 0079 rule on top of
   * this one, read off `graphs` here; the Map cluster splits create from
   * delete because creating a Map **selects** it and so has a second reason
   * of its own, which no Graph command has.
   */
  readonly editsDisabled: boolean;
  /**
   * Copy this Graph's within-Map address — "Copy link to Graph" reproduces
   * what is on screen, so a recipient lands where the sender was.
   *
   * A Map **owns** its Graphs (ADR 0040) and a Graph also has its own
   * permanent address, but the Graph menu offers only this one
   * (`.scratch/dock-menu-reorganisation/issues/01`).
   */
  readonly onCopyLink: () => void;
  readonly presenting: boolean;
  readonly onPresent: () => void;
  /**
   * Whether Present may begin a traversal.
   *
   * An empty Graph is legal and ordinary — creating a Map mints one — and it
   * has nothing to traverse, so `present()` would return having changed nothing
   * and an enabled control would swallow the press. Unavailable rather than
   * absent: a control that disappears teaches nothing about why.
   */
  readonly presentDisabled: boolean;
}

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

/** What went wrong, which is the only report persistence ever gives. */
export interface DockPersistence {
  /** How this Space's last commit went. `settled` and `pending` draw nothing. */
  readonly state: SpaceSessionState['persistence'];
  /**
   * Whether this Space is the one on the canvas.
   *
   * A session mounts one Dock per open Space and shows one of them, and both
   * decision surfaces below are portalled `AlertDialog`s that own the viewport —
   * so a hidden Space's conflict would block the Space the reader is actually
   * working in, about a commit made somewhere else. What that Space is owed
   * instead is the mark on its row in the Open Spaces menu, which is where ADR
   * 0082's *"it names which open Space is unwell"* is met.
   */
  readonly active: boolean;
  /** Try the failed commit again, which is the one recovery that is not a decision. */
  readonly onRetry: () => void;
  /** Take the stored Space over the local one, ending a conflict. */
  readonly onAcceptRemote: () => StoredSpaceRefusal | null;
  /** Keep the local Space and commit it again, ending a conflict. */
  readonly onKeepLocal: () => void;
}

/**
 * Map: `[name v]`. Graph: `[name v][>]`.
 *
 * Each is one named `ToolbarGroup` inside the Dock's single `Toolbar` — ADR
 * 0073's pair, the same one a Resource rail is built from — so the controls share a
 * box treatment with the rail, the whole bar is one tab stop, and the arrows
 * cross a group boundary exactly as they cross any other gap. What the grouping
 * says is that these are commands *on* one named entity, which is exactly what a
 * rail says about a Resource.
 *
 * Name and chevron are one disclosure. Rename sits with New, Copy link and
 * Delete on the current identity. Present is the exception on the Graph side:
 * it acts on the Active Graph the cluster is naming.
 */
function MapControls({
  canvas,
  side = 'bottom',
}: {
  readonly canvas: DockCanvas;
  readonly side?: MenuSide;
}) {
  return (
    <ToolbarGroup aria-label="Map" className="command-dock__cluster">
      <IdentitySurface
        icon={<MapIcon />}
        kind="Map"
        testId="selected-canvas"
        title={canvas.selected.title}
        triggerTitle="Switch Map"
        onRename={canvas.onRename}
      >
        {(disclosure) => <MapIdentityMenu canvas={canvas} side={side} disclosure={disclosure} />}
      </IdentitySurface>
    </ToolbarGroup>
  );
}

/**
 * The list, the mark on the Map you are in and every key that moves
 * between them are `ChoiceMenu`'s — the same component an Open Space Resource
 * chooses its Map through. What stays here is what the list *is* and
 * what choosing one does, which on this surface is the canvas moving.
 * The commands below it are this cluster's own.
 */
function MapIdentityMenu({
  canvas,
  side,
  disclosure,
}: {
  readonly canvas: DockCanvas;
  readonly side: MenuSide;
  readonly disclosure: IdentityDisclosure;
}) {
  const { trigger, renameItem, triggerId, open, onOpenChange } = disclosure;
  const { restoresFocusOnClose } = useIdentityCaret();
  return (
    <ChoiceMenu<MapId>
      label="Maps"
      choices={canvas.maps}
      chosen={canvas.selected.id}
      onChoose={canvas.onSelect}
      open={open}
      onOpenChange={onOpenChange}
      triggerId={triggerId}
      side={side}
      align={DISCLOSURE_ALIGN}
      sideOffset={DISCLOSURE_SIDE_OFFSET}
      className={`nokey ${DISCLOSURE_WIDTH}`}
      restoresFocusOnClose={identityMenuRestoresFocusOnClose(
        canvas.didCreateMoveCaret,
        restoresFocusOnClose,
      )}
      trigger={trigger}
    >
      <MapMenuActions
        title={canvas.selected.title}
        renameItem={renameItem}
        onCreate={canvas.onCreate}
        onCopyLink={canvas.onCopyLink}
        onDelete={canvas.onDelete}
      />
    </ChoiceMenu>
  );
}

/**
 * Graph, carrying the colour that identifies it on the canvas and the one
 * command that is a Graph's alone: Present traverses the Active Graph.
 */
function GraphControls({
  graph,
  mapTitle,
  side = 'bottom',
  vertical = false,
}: {
  readonly graph: DockGraph;
  /** Only to caption the list: the Graphs a menu offers are the ones this Map owns. */
  readonly mapTitle: string;
  readonly side?: MenuSide;
  readonly vertical?: boolean;
}) {
  /**
   * **Present leads along a row and trails down a column**, and this is the one
   * resource in the Dock the edge reorders.
   *
   * Along a row it leads: it acts on the named entity the cluster is showing, so
   * it sits at the edge the eye enters from, ahead of the name it acts on.
   *
   * Down a column it cannot, because a column pays for it differently. A
   * leading verb needs a track of its own on *every* row — three of the four
   * rows have no verb, and the 28px sits empty on each — and Resources' Create
   * trails, so a leading Present makes the grid four tracks wide: 84px of a
   * 208px column spent on gutters. Trailing, both verbs share one track and the
   * column is three.
   *
   * It is a **reorder of the JSX and not a second placement rule**, so what the
   * eye reads and what the Tab key visits stay the same order. Placing the
   * button visually while leaving it first in the DOM would have bought the
   * same picture with a focus order that contradicts it.
   */
  const present = (
    <ToolbarButton
      variant="ghost"
      size="icon"
      className="command-dock__verb"
      aria-label={`Present ${graph.active.title}`}
      title={`Present ${graph.active.title}`}
      disabled={graph.presentDisabled}
      onClick={graph.onPresent}
    >
      {/* Filled rather than outlined, which is the transport convention and not
          a decoration: at 12px an outlined triangle is mostly the paper behind
          it, so the one control on this cluster that starts something reads as
          the lightest mark on it. `filled` is the icon's own prop — this used
          to be a rule in `command-dock.css` reaching through the button into
          the `svg` to beat Lucide's `fill="none"` attribute, which is a surface
          overriding a glyph's drawing rather than asking it for one. The
          Sidebar's Present is unfilled still, and stays that way until the
          surface it belongs to is decided. */}
      <PresentIcon color={graph.activeColor} filled />
    </ToolbarButton>
  );

  return (
    <ToolbarGroup aria-label="Graph" className="command-dock__cluster">
      {vertical ? null : present}
      {/* The one identity that carries colour, and it carries it on the glyph
          alone — the stroke the Edges of this Graph are drawn in. A neutral
          swatch stood here and said only "a colour applies"; a Graph glyph
          says which *kind* of entity the colour belongs to, and it is
          `@project/ui`'s own `GraphIcon` rather than a mark this module
          invents. */}
      <IdentitySurface
        icon={<GraphIcon color={graph.activeColor} size={14} />}
        kind="Graph"
        testId="active-graph"
        title={graph.active.title}
        triggerTitle="Switch Graph"
        onRename={
          graph.onRename === null
            ? null
            : (title) => graph.onRename?.(graph.active.id, title) ?? null
        }
      >
        {(disclosure) => (
          <GraphIdentityMenu
            graph={graph}
            mapTitle={mapTitle}
            side={side}
            disclosure={disclosure}
          />
        )}
      </IdentitySurface>
      {vertical ? present : null}
    </ToolbarGroup>
  );
}

/**
 * The same `ChoiceMenu` the Map cluster and an Open Space Resource draw,
 * with each row carrying the colour its Graph is drawn in — a choice's
 * own mark is the choice's, which is why it rides on the choice rather
 * than being rendered here. The mark is `GraphColorLine`, the line the canvas
 * HUD's key draws, rather than a Graph glyph on every row: the list is already
 * a list of Graphs, and the line is what a Graph's colour means on the canvas.
 * The cluster's own identity and Colour… keep the coloured glyph, where it says
 * which kind of entity the colour belongs to.
 */
function GraphIdentityMenu({
  graph,
  mapTitle,
  side,
  disclosure,
}: {
  readonly graph: DockGraph;
  readonly mapTitle: string;
  readonly side: MenuSide;
  readonly disclosure: IdentityDisclosure;
}) {
  const { trigger, renameItem, triggerId, open, onOpenChange } = disclosure;
  const { restoresFocusOnClose } = useIdentityCaret();
  return (
    <ChoiceMenu<GraphId>
      label={`Graphs in ${mapTitle}`}
      choices={graph.graphs.map((each) => ({
        id: each.id,
        title: each.title,
        icon: <GraphColorLine color={graphColor(each, graph.colorByGraphId)} />,
      }))}
      chosen={graph.active.id}
      onChoose={graph.onActivate}
      open={open}
      onOpenChange={onOpenChange}
      triggerId={triggerId}
      side={side}
      align={DISCLOSURE_ALIGN}
      sideOffset={DISCLOSURE_SIDE_OFFSET}
      className={`nokey ${DISCLOSURE_WIDTH}`}
      restoresFocusOnClose={restoresFocusOnClose}
      trigger={trigger}
    >
      <GraphMenuActions
        title={graph.active.title}
        renameItem={renameItem}
        editsDisabled={graph.editsDisabled}
        deleteDisabled={graph.editsDisabled || graph.graphs.length <= 1}
        color={graph.activeColor}
        colors={GRAPH_PALETTE_ENTRIES}
        onRecolor={(color) => {
          graph.onRecolor(graph.active.id, color);
          onOpenChange(false);
        }}
        onCreate={graph.onCreate}
        onCopyLink={graph.onCopyLink}
        onDelete={() => graph.onDelete(graph.active.id)}
      />
    </ChoiceMenu>
  );
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

/** The one identity being renamed, and which entity it named when the rename began. */
interface RenamingSubject {
  readonly name: DockIdentity;
  readonly subject: string;
}

/**
 * The bar's one rename: which name has the slot, and what the application is
 * told about it.
 *
 * **Three rules that were three copies of themselves, answered once.**
 *
 * *A rename cannot outlive its subject.* The slot remembers the Map or Graph
 * the rename was begun against, so a reader who moves to another Map from
 * the menu beside the name releases it — the editor is seeded from a title, and
 * leaving it open would put the caret in a field editing something the reader
 * has already left. Read as a render-time transition rather than an effect,
 * because an effect lets one render draw the stale editor first, and it is this
 * component's own state so nothing is written to a parent from a child's
 * render.
 *
 * *A replacement ends it too, and nothing else can (ADR 0042).* The accepted
 * Space carries the same Map and Graph ids, so the subject is unchanged
 * across the very transition that discards the draft, and the application's own
 * `editingChromeTitle` is the *report* rather than the editor — lowering it
 * neither closes the editor nor stops it being completed. Nor can the
 * availability guard stand in: placement is asynchronous, so a replacement
 * passes through a render where `onRename` is `null` and the name draws
 * unavailable with the slot still taken. That looks like the draft going. It
 * comes back the moment placement resolves, reseeded from the *accepted*
 * Map's title — an editor the author never opened, over a Space they never
 * saw, one Enter away from renaming it. The caret is deliberately not returned
 * on either ending: the author did not end this, and pulling focus onto a name
 * in a Space that has just been replaced under them is taking focus rather than
 * giving it back.
 *
 * *The application is told from an effect, never from a render.*
 * `onRenamingChange` is the App's own `setEditingChromeTitle`, and the
 * transitions above run in this render body. `live` rather than "the slot is
 * taken", because a name whose rename has stopped being available draws
 * unavailable — a state in which no rename is live and the application must not
 * think one is. The cleanup covers the ending no transition sees, an unmount
 * mid-rename, which otherwise left the flag stuck true with nothing able to
 * clear it.
 */
function useDockRenaming(chrome: DockChrome): DockRenaming {
  /**
   * What each name in the bar is naming, and whether the product can rename it
   * at all — the one spelling of both, which is why the identities take neither
   * as a prop. A second copy beside the call sites is what falls behind.
   */
  const identities = {
    Space: { subject: chrome.space.currentSpaceId, renameable: chrome.space.onRename !== null },
    Map: { subject: chrome.canvas.selected.id, renameable: chrome.canvas.onRename !== null },
    Graph: { subject: chrome.graph.active.id, renameable: chrome.graph.onRename !== null },
  } satisfies Record<DockIdentity, { readonly subject: string; readonly renameable: boolean }>;

  const [renaming, setRenaming] = useState<RenamingSubject | null>(null);
  const [renamedUnder, setRenamedUnder] = useState(chrome.replacementEpoch);
  if (renamedUnder !== chrome.replacementEpoch) {
    setRenamedUnder(chrome.replacementEpoch);
    if (renaming !== null) setRenaming(null);
  } else if (renaming !== null && identities[renaming.name].subject !== renaming.subject) {
    setRenaming(null);
  }

  const live = renaming !== null && identities[renaming.name].renameable;
  const { onRenamingChange } = chrome;
  useEffect(() => {
    if (!live) return undefined;
    onRenamingChange(true);
    return () => onRenamingChange(false);
  }, [live, onRenamingChange]);

  return {
    renaming: renaming?.name ?? null,
    onRenaming: (identity) => {
      setRenaming(
        identity === null ? null : { name: identity, subject: identities[identity].subject },
      );
    },
  };
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

function ResourcesControl({
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

/* ---------------------------------------------------------------- docking */

interface DragState {
  /**
   * The pointer that took hold, and the only one this gesture answers.
   *
   * A captured pointer does not make the others go away: `pointermove` and
   * `pointerup` arrive for every pointer over the element, and a handler that
   * reads whichever one fired last is a drag any second finger can take over
   * mid-press. Retained here rather than in a ref beside the gesture because it
   * *is* part of the gesture — there is no moment when one exists without the
   * other.
   */
  readonly pointerId: number;
  /** Surface position in container coordinates while the pointer holds it. */
  readonly x: number;
  readonly y: number;
  /** Where inside the dock the pointer took hold. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** The slot a release would snap to, previewed while dragging. */
  readonly hint: DockPosition;
  /** Where the press began — what the threshold below is measured from. */
  readonly fromX: number;
  readonly fromY: number;
  /** Whether the press has travelled far enough to be a drag rather than a click. */
  readonly moved: boolean;
}

/**
 * An dock that is dragged by its grip and snaps to the nearest edge.
 *
 * There is no free position: releasing always docks. What the drag chooses is
 * an edge and a place along it, and the edge is what the dock then reads to
 * decide how it draws — the caller passes the same children either way.
 *
 * The pointer capture, the snap hint and the edge arithmetic are all here
 * rather than in the dock, which is what let a second docked surface — the
 * Resources panel, while the list surface was still under comparison — be the same
 * drag rather than a second copy of it. That panel is gone with the decision;
 * this stays one component because the arithmetic is the awkward part and a
 * later docked surface should not write it again.
 *
 * **The frame the slots are measured in is a prop, not the DOM parent.** This
 * read `element.parentElement` and docked to whatever it found — a contract on
 * the caller's markup that no signature stated and no reader could see, which
 * a wrapper element inserted between them would have broken silently, moving
 * every slot without a line changing here. Taking the container as a ref is
 * what makes the caller's own frame the answer, and it is what lets this cross
 * into `@project/ui` at all: a component that reaches upward through the DOM
 * cannot be given to a caller whose markup it has never seen.
 */
function Dock({
  dock,
  onDock,
  container,
  presenting,
  label,
  className,
  report,
  children,
}: {
  readonly dock: DockPosition;
  readonly onDock: (next: DockPosition) => void;
  /**
   * The box the Dock docks to: the twelve slots are its edges and stops, and
   * every measurement the drag makes is relative to it.
   */
  readonly container: RefObject<HTMLElement | null>;
  readonly presenting: boolean;
  readonly label: string;
  readonly className?: string;
  /**
   * What the surface has to say without being asked, drawn beside the commands
   * rather than among them.
   *
   * A separate slot and not one more child, because ADR 0082 makes status not a
   * command: everything in `children` is an item of the toolbar the Dock draws,
   * and a standing `Alert` among them is a status region inside `role="toolbar"`.
   * It hangs off the frame instead, which is what lets it follow the dock to any
   * of the twelve slots while belonging to neither the toolbar's roving order
   * nor its announcement.
   */
  readonly report?: ReactNode;
  readonly children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement | null>(null);
  /**
   * The grip, which the slot menu positions against.
   *
   * It is the anchor and not a trigger, which is the whole of the fix below.
   */
  const grip = useRef<HTMLButtonElement | null>(null);
  const { open: slotsOpen, onOpenChange: setSlotsOpen } = useDockDisclosure();
  /**
   * The gesture in flight, held on a **ref** and mirrored into state to draw.
   *
   * **A gesture cannot read itself out of a render.** `pointerdown`,
   * `mousedown`, `pointermove`, `pointerup`, `mouseup` and `click` are six
   * events over one press, and a handler that reads the gesture out of a
   * `useState` closure is asserting that React has re-rendered between each
   * pair of them. It usually has — discrete events flush synchronously — but
   * "usually" is doing real work there: a sequence delivered inside one task
   * batches, every later handler reads `null`, and the press does nothing at
   * all. That is not only a synthetic-events problem. It is the reason the drag
   * could not be driven from a test, which is half of what this control exists
   * to fix, so making the gesture legible to a test and making it correct are
   * the same change.
   *
   * So the ref is the gesture and the state is the picture of it. Nothing reads
   * `drag` but the render.
   */
  const gesture = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const track = (next: DragState | null) => {
    gesture.current = next;
    setDrag(next);
  };
  /**
   * Whether the press in flight has already been spent on something else.
   *
   * **One ref where there were three**, and it is the only state the grip's two
   * roles need to share. A press is spent if it dragged the dock, or if it
   * began while the list was already open — in which case the `click` that
   * follows is the dismissal's, not a request to open again. Anything else is a
   * press that means "show me the slots".
   *
   * A ref rather than state because `click` lands after the release and before
   * any render that could carry the answer, and because a keyboard activation
   * arrives as a `click` with no press in front of it at all — which is why
   * `keydown` clears it, exactly as Base UI's own `useClick` clears the pointer
   * type it recorded.
   */
  const pressSpent = useRef(false);

  const bounds = (): { readonly docked: DOMRect; readonly container: DOMRect } | null => {
    const element = frame.current;
    const box = container.current;
    if (element === null || box === null) return null;
    return {
      docked: element.getBoundingClientRect(),
      container: box.getBoundingClientRect(),
    };
  };

  /**
   * The grip's one activation, and why it is the grip's rather than Base UI's.
   *
   * **The grip is not a `Menu.Trigger` and cannot be one.** Base UI opens a
   * menu on `mousedown` (`useClick` with `event: 'mousedown'`, which is what
   * makes a press-drag-release through a menu one gesture), and at `mousedown`
   * the grip cannot know whether the press is a click or the first pixel of a
   * drag. What stood here deferred that open request on two refs and spent it
   * on `click`, justified by a guard that does not exist: the comment claimed
   * floating-ui's `onClick` is gated on `event.detail === 0`, where the real
   * gate is `if (eventOption === 'mousedown' && pointerType)`. And the
   * `mousedown` open runs inside a `frame.request`, so a press and release
   * inside one animation frame passed the deferral entirely and opened the menu
   * mid-drag.
   *
   * So the trigger is gone. The menu is controlled — as every disclosure in the
   * Dock is — the grip is a plain toolbar button, and the popup positions
   * against `grip` through `MenuPositioner`'s `anchor`, which is what
   * `PopoverContent` already does for a non-trigger anchor. `Enter` and `Space`
   * are then the platform's activation of a button rather than a keyboard path
   * anything here has to arrange.
   *
   * Closing is Base UI's still: a press on the grip while the list is open is
   * an *outside* press now, so the popup dismisses itself, and `pressSpent`
   * records that the `click` behind it has already been answered.
   */
  const onGripClick = () => {
    const spent = pressSpent.current;
    pressSpent.current = false;
    if (!spent) setSlotsOpen(true);
  };

  /**
   * Whether this event belongs to the gesture in flight.
   *
   * The three handlers below all ask the same question and none of them may
   * skip it: pointer capture routes the *captured* pointer's events here, and
   * routes nothing away — a second pointer over the grip still reaches every
   * one of them.
   */
  const holds = (event: ReactPointerEvent<HTMLElement>): boolean =>
    gesture.current?.pointerId === event.pointerId;

  /**
   * A cancel ends the gesture with no `click` behind it — pointer capture lost,
   * or the browser claiming the gesture for itself — so nothing is coming to
   * spend what the press recorded. Left set, it is the *next* genuine press
   * that gets swallowed and the slot list does not open.
   *
   * **This is the cancel path only, and sharing it with the release was a
   * defect.** `click` fires *after* `pointerup`, so on that path the flag is
   * exactly what the `click` is about to read: clearing it there threw away
   * both the drag `onPointerMove` recorded and the dismissal `onPointerDown`
   * did, so a completed drag opened the menu over the slot it had just landed
   * in, and a press on an open list closed it and reopened it in one gesture.
   */
  const cancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (!holds(event)) return;
    track(null);
    pressSpent.current = false;
  };

  /**
   * **The grip owns the semantics a `Menu.Trigger` would have brought, and
   * which press it answers is one of them.**
   *
   * A `pointerdown` fires for every button of every pointer, so with nothing
   * asked the right button took hold of the dock, a right-button drag moved it,
   * and the release docked the whole command surface in whatever slot the
   * pointer had reached — a context-menu request answered by rearranging the
   * chrome. Nothing in the Dock is performed by a secondary button, and a
   * non-primary pointer is a second finger while another one is already doing
   * something else.
   *
   * The third guard is the gesture already in flight. A press cannot begin one
   * over another: with the initiating pointer retained, a second `pointerdown`
   * that overwrote it would hand the drag to a pointer that never took hold and
   * strand the capture of the one that did.
   */
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.isPrimary || gesture.current !== null) return;
    const measured = bounds();
    if (measured === null) return;
    // Read before the dismissal runs: an open list makes this press the one
    // that closes it, and the `click` after must not reopen it.
    pressSpent.current = slotsOpen;
    event.currentTarget.setPointerCapture(event.pointerId);
    track({
      pointerId: event.pointerId,
      x: measured.docked.left - measured.container.left,
      y: measured.docked.top - measured.container.top,
      offsetX: event.clientX - measured.docked.left,
      offsetY: event.clientY - measured.docked.top,
      hint: dock,
      fromX: event.clientX,
      fromY: event.clientY,
      moved: false,
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const held = gesture.current;
    if (held === null || !holds(event)) return;
    const measured = bounds();
    if (measured === null) return;
    // Below the threshold the press is still a click: the dock does not leave
    // its slot and no snap hint is drawn, so nothing about the surface moves
    // under a reader who only meant to press it.
    if (
      !held.moved &&
      !exceedsDragThreshold(
        { x: held.fromX, y: held.fromY },
        { x: event.clientX, y: event.clientY },
      )
    )
      return;
    // Past the threshold this press is a drag, so the `click` that ends it is
    // not a request for the list.
    pressSpent.current = true;
    const left = event.clientX - held.offsetX;
    const top = event.clientY - held.offsetY;
    track({
      ...held,
      moved: true,
      x: left - measured.container.left,
      y: top - measured.container.top,
      hint: nearestSlot(measured.container, {
        left,
        top,
        right: left + measured.docked.width,
        bottom: top + measured.docked.height,
      }),
    });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const held = gesture.current;
    if (held === null || !holds(event)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    // **The release spends the hint, and does not measure again.** The preview
    // is `nearestSlot` of the box the pointer put the dock in; re-measuring the
    // live rect here asked the same question of a different subject and could
    // answer differently, which is exactly the drift the hint's own comment
    // says cannot happen. Now it cannot: one slot is computed, drawn, and
    // landed on.
    //
    // A press that never moved docks nothing; the `click` after it spends the
    // menu request instead.
    if (held.moved) onDock(held.hint);
    // Only the gesture ends here. What it recorded on `pressSpent` belongs to
    // the `click` behind this release, which is the one that spends it.
    track(null);
  };

  const vertical = orientationOf(dock.edge) === 'vertical';
  const dragging = drag?.moved === true;

  return (
    <>
      {dragging ? (
        <div
          className="command-dock__snap-hint"
          data-edge={drag.hint.edge}
          style={dockStyle(drag.hint)}
          aria-hidden="true"
        />
      ) : null}
      {/* **The frame is what docks, and the toolbar is what commands.** The
          two were one element until the persistence report needed somewhere to
          be: it hangs off the dock, so it has to be positioned against the
          docked box — and as a child of the toolbar it was a status region
          inside `role="toolbar"`, which ADR 0082 forbids. The frame carries the
          slot, the drag state and the presenting switch; the surface carries the
          treatment and the roving order. It is measured here rather than on the
          toolbar because it is the element the twelve slots place, and an
          absolutely positioned report contributes nothing to its box. */}
      <div
        ref={frame}
        className="command-dock"
        data-testid="command-dock"
        // Which edge the dock is against, for the one rule outside this frame
        // that has to know: React Flow's own bottom panels move up out of the
        // way, and only while there is something down there to move out of.
        data-edge={dock.edge}
        data-presenting={presenting ? 'true' : 'false'}
        data-dragging={dragging ? 'true' : 'false'}
        style={dragging ? { left: drag.x, top: drag.y } : dockStyle(dock)}
      >
        {/* **One toolbar, and it is the command surface** (ADR 0073). Each cluster
            used to be a `Toolbar` of its own, which made the Dock four roots and
            so four tab stops; the ADR draws one root with named `role="group"`s
            inside it, so the root is here and the clusters are groups. Putting a
            wrapper *inside* the surface would have been the other way to do it and
            is the wrong one: the vertical column's grid places this element's
            direct children, so a layer between them moves every slot. */}
        <CommandToolbar
          aria-label={label}
          // The arrows follow the edge the dock is on: a column whose arrow keys
          // ran left and right would be a toolbar disagreeing with its own shape.
          // `CommandToolbar` spends the one value twice — Base UI takes it for
          // the arrows and `command-surface.css` reads it back for the axis —
          // so the paint and the keyboard cannot drift apart here.
          orientation={vertical ? 'vertical' : 'horizontal'}
          className={`command-dock__surface nokey nodrag nopan ${className ?? ''}`}
        >
          {/* The grip is both the drag handle and the disclosure, which is what a
              grip on a movable panel already reads as. It draws its dots from CSS
              and carries no children, so the two roles cost one control — and it
              is a toolbar item like every other command here, so it is in the
              arrow order rather than beside it. `aria-haspopup` and
              `aria-expanded` are stated because there is no `Menu.Trigger` to
              state them; the Dock's open treatment keys off the second. */}
          <ToolbarButton
            ref={grip}
            variant="ghost"
            size="icon"
            className="command-dock__grip nokey"
            aria-label={`Move ${label}. ${slotLabel(dock)}.`}
            aria-haspopup="menu"
            aria-expanded={slotsOpen}
            title="Drag to another slot, or press for the list"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={cancel}
            onClick={onGripClick}
            // A keyboard activation arrives as a `click` with no press in front of
            // it, so whatever the last press left on `pressSpent` would answer for
            // it. Base UI's own `useClick` clears its recorded pointer type on
            // `keydown` for the same reason.
            onKeyDown={() => {
              pressSpent.current = false;
            }}
          />
          <DropdownMenu open={slotsOpen} onOpenChange={setSlotsOpen}>
            <DropdownMenuContent
              align={DISCLOSURE_ALIGN}
              // The grip, not a trigger. There is no `Menu.Trigger` in this menu
              // at all, so the popup would have nothing to position against and
              // nothing to hand focus back to on the way out.
              anchor={grip}
              finalFocus={grip}
              side={MENU_SIDE[dock.edge]}
              sideOffset={DISCLOSURE_SIDE_OFFSET}
              className={`nokey ${DISCLOSURE_WIDTH}`}
            >
              {/* A radio group, as every other set in the Dock is: which of a set
                  is the one you are in. The edges are labels rather than submenus
                  because twelve rows down one panel is one arrow-key sweep, and
                  four submenus would put the reader's own slot two levels from
                  the mark that says so. */}
              <DropdownMenuRadioGroup
                value={slotValue(dock)}
                onValueChange={(next) => {
                  // A slot is parsed rather than trusted: `next` is the string
                  // this menu's own items carry, and a `DockSlot` is one of
                  // twelve. `dock-slots.test.ts` holds every value this menu
                  // renders to a round trip, which is what says the miss cannot
                  // come from the menu.
                  const slot = dockSlot(next);
                  if (slot !== null) onDock(slot);
                }}
              >
                {DOCK_EDGES.map((edge) => (
                  <Fragment key={edge}>
                    <DropdownMenuLabel>{EDGE_LABEL[edge]}</DropdownMenuLabel>
                    {DOCK_ALONGS.map((along) => (
                      <DropdownMenuRadioItem
                        key={along}
                        value={slotValue({ edge, along })}
                        closeOnClick
                      >
                        {alongLabel(edge, along)}
                      </DropdownMenuRadioItem>
                    ))}
                  </Fragment>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {children}
        </CommandToolbar>
        {report}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- dock */

/**
 * Where a persistence failure goes when the chrome is a strip floating over a
 * canvas.
 *
 * **Nothing here is a new state or a new sentence.** Production settled both
 * long ago and this module spends them unchanged: `PersistenceControl` maps a
 * conflict and a rejection to their `AlertDialog`s, and `PersistenceNotice` is
 * the standing `Alert` with a Retry for the one failure that is neither fine
 * nor final. What had no answer is placement, so placement is all this
 * component decides.
 *
 * **The saving cue is gone, deliberately.** `PersistenceControl` also draws
 * `PersistenceIndicator` for `settled`, `pending` and `saved`, and it is not
 * called for those here — the Dock draws nothing at all while saving is
 * working. A commit settles faster than the cue can be read, so a dot that
 * spends a permanent slot in a five-cluster strip to report the expected
 * outcome is a slot spent on nothing. The states worth a pixel are the three
 * that need a reader: `failed`, `rejected`, `conflicted`. That is the
 * proposal, and it is the one claim here a reviewer should challenge if
 * they disagree — the alternative is a sixth cluster that is blank 99% of the
 * time.
 *
 * **The two dialogs need no placement.** Both are portalled and own the
 * viewport, so a conflict blocks the canvas from wherever the Dock happens to
 * be — which is right: neither has a safe dismissal, and where the furniture
 * sits is not part of that decision.
 *
 * **The notice hangs off the Dock, and that is the answer to question B.** An
 * `Alert` is several times the height of the strip it belongs to, so it cannot
 * go *in* the Dock; and pinned to a fixed corner of the viewport it would
 * collide with the Dock at four of the twelve slots and read as unrelated
 * furniture at the other eight. Hanging it off the Dock on `MENU_SIDE` — the
 * same rule every disclosure already opens by — makes it belong to the surface
 * that owns the Space, follow it to any slot, and never open off the edge it is
 * against. It is not a popover: nothing dismisses it but recovery, and it takes
 * no focus.
 */
function PersistenceReport({
  persistence,
  edge,
}: {
  readonly persistence: DockPersistence;
  readonly edge: DockEdge;
}) {
  const { state } = persistence;
  // An aggregate refusal (`v1-release/17`) draws the same dialog a permanent
  // rejection does — `PersistenceControl` treats the two `Rejection` kinds
  // alike — so it is a decision here too.
  const decision =
    state.kind === 'conflicted' || state.kind === 'rejected' || state.kind === 'refused';

  return (
    <>
      {decision ? (
        <PersistenceControl
          active={persistence.active}
          persistence={state}
          onAcceptRemote={persistence.onAcceptRemote}
          onKeepLocal={persistence.onKeepLocal}
        />
      ) : null}
      {state.kind === 'failed' && persistence.active ? (
        <div className="command-dock__notice" data-side={MENU_SIDE[edge]}>
          <PersistenceNotice persistence={state} onRetry={persistence.onRetry} />
        </div>
      ) : null}
    </>
  );
}

/**
 * The Command Dock, docked to a slot and draggable between them.
 *
 * **The JSX below is the same in every orientation.** The edge derives one
 * boolean — whether the dock stacks — and nothing else branches. One command
 * surface, not a desktop one and a mobile one.
 *
 * On a side edge the clusters stack and each draws `[name] [v]`: a column of
 * named rows with the disclosure at the end of each, which is what the vertical
 * dock is for and why it stays wide enough to hang a popover off.
 */
export function CommandDock({
  chrome,
  container,
  initialEdge,
}: {
  readonly chrome: DockChrome;
  /** The box the Dock docks to, stated by whoever mounts it. */
  readonly container: RefObject<HTMLElement | null>;
  readonly initialEdge: DockEdge;
}) {
  const [dock, setDock] = useState<DockPosition>({ edge: initialEdge, along: 'center' });
  const [openId, setOpenId] = useState<string | null>(
    // The one disclosure the Dock opens for the application rather than for the
    // reader: Add Map makes an empty Map, and the Resources are what fills it.
    // Seeded here so a Space opened into a new Map draws the list on its
    // first frame rather than one after it.
    (chrome.resources.list.disclose ?? null) === null ? null : RESOURCES_DISCLOSURE_ID,
  );
  const renaming = useDockRenaming(chrome);
  const vertical = orientationOf(dock.edge) === 'vertical';
  // A rule divides across the dock's own axis, so it runs the other way.
  const divider = vertical ? 'horizontal' : 'vertical';
  const side = MENU_SIDE[dock.edge];

  return (
    <DockDisclosureContext.Provider value={{ openId, setOpenId }}>
      <DockRenamingContext.Provider value={renaming}>
        <Dock
          dock={dock}
          onDock={setDock}
          container={container}
          presenting={chrome.graph.presenting}
          label="Command Dock"
          report={<PersistenceReport persistence={chrome.persistence} edge={dock.edge} />}
        >
          {/* Space | Map Graph | Resources.
            The three selections first, then the inventory. Which Space, which
            Map and which Graph are one question asked three times — each names
            the current one, discloses the set, and promotes at most one verb — and
            Map and Graph are divided like the rest. They used to run together
            on the grounds that a Graph is authored over a Map and so they are
            one region — which stopped being legible the moment Present moved to
            the head of the Graph cluster: an unseparated `[Collection 1 ⌄][▶ Long
            ⌄]` reads as a Present belonging to the Map beside it. The
            containment is still true and the order still says it; the rule no
            longer has to be carried by an absent line.
            Resources comes last because it is the odd cluster and should read as one:
            it names a set rather than a selection, so it has no name to edit and
            nothing to promote but Create. Between Map and Space it looked like
            a fourth selection that had lost its name. */}
          {/* One open-id under the whole row, spent by every disclosure through
            `useDockDisclosure` — that, and not a convention each control keeps,
            is what makes at most one open. The hook says why the `Menubar` this
            obviously wants cannot be used inside Toolbars. */}
          <SpacesControl space={chrome.space} side={side} vertical={vertical} />
          <Divider orientation={divider} />
          <MapControls canvas={chrome.canvas} side={side} />
          <Divider orientation={divider} />
          <GraphControls
            graph={chrome.graph}
            mapTitle={chrome.canvas.selected.title}
            side={side}
            vertical={vertical}
          />
          <Divider orientation={divider} />
          <ResourcesControl resources={chrome.resources} side={side} />
        </Dock>
      </DockRenamingContext.Provider>
    </DockDisclosureContext.Provider>
  );
}

/**
 * The Command Dock over one Space.
 *
 * **One dock, not two.** A second instance sat on the left edge while the list
 * surface was under comparison, so an anchored popover could be seen under a
 * top dock and beside a side one at the same time. That question is settled, and
 * two docks over one canvas was never the proposal — drag this one by its grip
 * to see any edge, or press the grip and pick a slot, and the orientation
 * follows either way.
 *
 * Drag a Resource out of the Resources popover onto the canvas, or press the row where
 * it stands. Both are real and both are the same Edit: the Resource joins the
 * Map and the popover stays open, so the next one costs nothing either way.
 */
