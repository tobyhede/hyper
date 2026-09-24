/**
 * What the Command Dock is given: `DockChrome` and the group each of its
 * clusters draws. The application builds it (`dock-chrome.ts`) and the Dock's
 * modules draw it, and both read the one declaration here.
 */
import type { Graph, GraphId, Map, MapId, Resource, ResourceId, UUID } from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import type { ExitOutcome } from '../dock-model';
import type { MapMemberships } from '../map-memberships';
import type { ListingRow, NamedSpace, RejectedExitConfirmation } from '../open-spaces';
import type { ResourcesPopoverSpace, SettlePlacement, SettleResource } from '../resources-drag';
import type { StoredSpaceRefusal } from '../space-authoring';

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
 * `CommandDock` stands where the surface distributes to its own clusters.
 * Everything below them takes a group.
 */
export interface DockChrome {
  /**
   * That a name in the bar is being renamed right now.
   *
   * **One fact under the whole bar, reported rather than owned.** The editor is
   * `InlineTitleEditor` and which name is open is the bar's own slot
   * (`useDockRenaming` in `CommandDock.tsx`) — which is the whole reason the shared draft the
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
 * The Space you are in, the one you came from, and the set open beside them.
 *
 * One group rather than two because the bar draws them as one region: the
 * Opener control and the Open Spaces menu are how you leave this Space, and the name and
 * its menu are what you can do while you are in it.
 */
export interface DockSpace {
  /**
   * This Space's own name — `document.title` of the session the Dock is drawing.
   *
   * **Not the Title of a Space Resource that points here.** The two agree only at
   * creation, which writes one string into both, and either may be renamed
   * afterwards without the other (`CONTEXT.md`); ADR 0083 keeps the target's
   * name off the Resource's front, so nothing propagates in either direction.
   */
  readonly title: string;
  /** Which Space the Dock is in, which is what the Open Spaces menu marks. */
  readonly currentSpaceId: UUID;
  /** The Space this one was entered from, and the only Space the bar names. Null at the root. */
  readonly opener: NamedSpace | null;
  /**
   * Every row the Open Spaces menu draws, Meta first whether or not it is
   * open (`OpenSpaces.listing`) — `[]` only where the App is drawn outside
   * Open Spaces, which is what knows Meta.
   */
  readonly listing: readonly ListingRow[];
  /**
   * Rename this Space, or `null` while no chrome rename may run.
   *
   * **From inside the Space, and only from inside it.** `renamed-space` writes
   * `document.title` of the session it is completed on and nothing else: no Space
   * Resource pointing at this Space changes with it, because a Space's name and the
   * Title of a Resource that references it are two stored values that agree only at
   * creation, and ADR 0083 keeps the target's name off that Resource's front. So
   * there is nothing here for this surface to keep in step — the Open Spaces
   * rows and the Opener control each read their own session's title and redraw on
   * its publication (`open-spaces.ts`). Renaming *another* Space, from a Space
   * Resource or from a row of that menu, is a `SpaceResourceLifecycle` operation over
   * a second session (ADR 0076) and is deliberately not this.
   *
   * Nullable rather than optional so both callers state it, and `null` now means
   * the one guarantee it makes for {@link DockCanvas.onRename} and
   * {@link DockGraph.onRename}: the application has withdrawn chrome title
   * editing — a live Resource title editor or content edit owns the caret, or the
   * canvas has no placement to edit against — and all three names go together.
   */
  readonly onRename: ((title: string) => string | null) | null;
  /** Copy this Space's own address — the one link a Space offers (`entity-actions.tsx`). */
  readonly onCopyLink: () => void;
  /**
   * Choose a row of the listing: move to an open Space, closing nothing, or to
   * the Meta Space, which is opened if it is not open yet. The Opener control
   * and the Open Spaces menu both spend this.
   *
   * `title` travels with the choice rather than being looked up again once the
   * command answers — `OpenSpaces.select`'s own refusal carries none, being
   * only ever a race the reader cannot see coming, and by the time a thrown
   * failure is caught the row that was chosen may no longer be in
   * {@link listing} at all. The Dock already holds the title of the row it
   * drew and the reader chose, so it hands it over rather than making the
   * caller keep a last-known one (`.scratch/command-dock/issues/28`, decision
   * 10).
   */
  readonly onSelect: (spaceId: UUID, title: string) => void;
  /**
   * Exit this Space — one Space, never a second (ADR 0068). Never the root.
   *
   * The confirmation is production's `RejectedExitConfirmation` and is how the
   * warning arm is spent: the surface asks, and the answer comes back in as the
   * same token `openSpaces.exit` takes, rather than as a second command that
   * means "and I mean it".
   */
  readonly onExit: (spaceId: UUID, confirmation?: RejectedExitConfirmation) => void;
  /**
   * Whether this Space can be left at all, which is one question and not two.
   *
   * The meta Space is permanent (`open-spaces.ts`), and every other open Space
   * can be exited. This read {@link opener} instead — "is there a Space I was
   * opened from" — which answers `null` for every Space reached by its own
   * address as well, and so withheld Exit from a pasted link. The two happen to
   * agree while the reader arrived by pressing Space Resources, which is what hid
   * it.
   */
  readonly exitDisabled: boolean;
  /** The exit that did not happen, which is the only kind there is anything to draw about. */
  readonly exitReport: SpaceExitReport | null;
  readonly onDismissExitReport: () => void;
}

/**
 * What an exit that was refused or warned about has to say, and about which
 * Space.
 *
 * The title is carried rather than read back off the session, because by the
 * time the report is drawn the Space it names may no longer be the one on the
 * canvas — and ADR 0082 binds the surface to name which open Space is unwell,
 * not to describe wherever the reader has since ended up.
 *
 * The Id travels for the same reason: answering the warning re-calls the exit,
 * and it must re-call it on the Space the warning was about rather than on
 * whichever one is current when the answer arrives.
 */
export interface SpaceExitReport {
  readonly spaceId: UUID;
  readonly title: string;
  readonly outcome: ExitOutcome;
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
 * The two kinds Create offers, in the order the cluster draws them.
 *
 * **`reference` left, and it left the Dock rather than the list.** A Reference Resource is
 * always created *from* the Resource it points at, which supplies the Target
 * (ADR 0089), so the gesture is a row in that Resource's own command menu and
 * there is nothing here for it to be a peer of.
 */
export const RESOURCE_KINDS = ['markdown', 'space'] as const;

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
   * the Popover won, and the reasons are written above `ResourcesPopover` and
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
