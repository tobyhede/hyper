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
 *   Diagrams — which is drawing, select another, add/rename/delete
 *   Graphs  — which is active, select another, present, add/rename/delete
 *   Things   — Create, and the Things this Space holds
 *
 * **A Thing's own commands are absent on purpose.** Open, Edit, Delete, a Thing's
 * links and taking a Thing back out of a Diagram belong to the Thing rail (ADR
 * 0073), which draws them on the Thing itself. This surface is *about* the
 * canvas; a Thing is the literal object on it. That is a dependency and not just
 * an exclusion — the Space Sidebar carried a Thing's links and its Delete in a
 * footer, and this arrangement is only complete because the rail carries them
 * now.
 *
 * **A Space is a Space Thing, held by the Meta Space above it.** So the Spaces
 * *inside* a Space are Things in it and the Things surface already offers them,
 * while the bar names one step back and the Open Spaces menu holds the set open
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
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  ThingKindIcon,
  thingKindName,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DeleteIcon,
  EditIcon,
  FALLBACK_GRAPH_COLOR,
  GraphIcon,
  InlineTitleEditor,
  DiagramIcon,
  ParentIcon,
  PlusIcon,
  PresentIcon,
  Separator,
  ChoiceMenu,
  ChoiceMenuTrigger,
  CommandName,
  CommandToolbar,
  ToolbarButton,
  ToolbarGroup,
} from '@project/ui';
import type { Thing, ThingId, Graph, GraphId, Diagram, DiagramId, UUID } from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import type { StoredSpaceRefusal } from '../space-authoring';
import { PersistenceControl, PersistenceNotice } from './PersistenceControl';
import { identityMenuRestoresFocusOnClose } from './identity-menu-focus-restore';
import type { RejectedExitConfirmation } from '../open-spaces';
import { GRAPH_PALETTE } from '../colors';
import {
  DOCK_ALONGS,
  DOCK_EDGES,
  dockSlot,
  exitReportSentence,
  nearestAlong,
  nearestEdge,
  orientationOf,
  slotValue,
  trailControls,
  unwellElsewhere,
  unwellReport,
  type DockAlong,
  type DockBox,
  type DockEdge,
  type DockOrientation,
  type DockPosition,
  type ExitOutcome,
  type OpenRow,
  type SpaceStep,
  openSpacesName,
  SPACES_LABEL,
} from '../dock-model';
import { THINGS_TRIGGER, SET_TRIGGER } from './command-dock-triggers';
import { ThingsPopover, type ThingsPopoverSpace } from './ThingsPopover';
import './command-dock.css';

/**
 * The palette a Graph's colour is chosen from, named.
 *
 * `GRAPH_PALETTE` is the application's own — the same six values authoring
 * rotates through when it mints a Graph — so the menu cannot offer a colour the
 * canvas would not draw. The names are this module's, because a swatch with no
 * word beside it is a colour a reader cannot ask anyone else for.
 *
 * **Keyed by the colour and not by its position.** A parallel list zipped by
 * index agrees with the palette exactly as long as nobody reorders it, and
 * reordering a palette is a colour decision taken in `colors.ts` with no reason
 * to look at this menu — after which every swatch is mislabelled, the reader
 * picks Blue and gets amber, and typecheck, lint and every suite stay green
 * because nothing asserted the pairing. Keyed, a reorder cannot say anything
 * and a *new* colour is a compile error here rather than a hex code drawn as
 * its own name, which is what the `??` fallback beside the zip did.
 */
const GRAPH_COLOR_NAMES = {
  '#6ea8fe': 'Blue',
  '#f59e0b': 'Amber',
  '#34d399': 'Green',
  '#f472b6': 'Pink',
  '#c084fc': 'Purple',
  '#f87171': 'Red',
} as const satisfies Record<(typeof GRAPH_PALETTE)[number], string>;

const GRAPH_COLORS: readonly (readonly [string, string])[] = GRAPH_PALETTE.map(
  (color): readonly [string, string] => [GRAPH_COLOR_NAMES[color], color],
);

/**
 * The two kinds Create offers, in the order the cluster draws them.
 *
 * **`alias` left, and it left the Dock rather than the list.** An Alias is
 * always created *from* the Thing it points at, which supplies the Target
 * (ADR 0089), so the gesture is a row in that Thing's own command menu and
 * there is nothing here for it to be a peer of.
 */
const THING_KINDS = ['markdown', 'space'] as const;

/**
 * A kind the Create cluster draws a control for.
 *
 * Named rather than written inline at the prop, because it is the type the
 * *dispatch* is held to: `App.tsx` answers every press through a record over
 * this, so a kind added above has to say what pressing it does before the
 * application compiles.
 */
export type DockThingKind = (typeof THING_KINDS)[number];

/**
 * Every disclosure opens the same way, whichever primitive draws it.
 *
 * A Popover and a Menu are two components because their *content* differs — one
 * scrolls a filtered list you drag out of, the other is a short exclusive set —
 * and which component that is, is an implementation detail. Where a surface
 * appears, how wide it is and how far it sits off its trigger are not: those
 * are the same question asked of every control in the bar, and a reader who
 * learns the answer at one cluster is owed it at the next.
 *
 * Centred on the trigger rather than aligned to its start. Every trigger here
 * is an icon-width chevron, so a start-aligned surface hangs off one edge of a
 * 28px button and reads as belonging to whatever sits beside it.
 */
const DISCLOSURE_ALIGN = 'center' as const;
const DISCLOSURE_SIDE_OFFSET = 6;
const DISCLOSURE_WIDTH = 'w-72';

/**
 * **The one set of branded ids this module still binds by hand.**
 *
 * `DropdownMenuRadioGroup` is generic over its value and `DropdownMenuRadioItem`
 * is generic over its own, and the type does not travel from the group to its
 * children: every JSX expression is `React.JSX.Element`, which is
 * `ReactElement<any, any>`, so even a `children` slot declared as
 * `ReactElement<DropdownMenuRadioItemProps<Value>>` accepts an item of any type
 * at all. TypeScript has no way to carry a parent's type argument into generic
 * JSX children, so a surface that writes both names it — once per set.
 *
 * **What is unbound is not a narrower check but no check.** An item left to
 * infer its own `Value` binds to nothing: `<DropdownMenuRadioItem value="none">`
 * inside a group of `DiagramId`s infers `'none'`, compiles, and comes back out of
 * `onValueChange` wearing the brand — so `onSelect(diagramId: DiagramId)` is
 * handed a string that is not one, and its declared type is a lie the compiler
 * helped tell. Bound, that literal is a `TS2322` where it is written.
 * `ThingsPopover`'s `FilterToggle` binds the same way, and
 * `tools/typing-fixtures/must-fail/mismatched-menu-item.tsx` is the standing
 * evidence that the rule bites.
 *
 * **The Diagram and Graph sets no longer need a name here, and that is the
 * better answer rather than a looser one.** Both are `ChoiceMenu` now, which
 * renders the group *and* its items from one type parameter — so the two halves
 * cannot be named differently because no call site writes the second one.
 * Naming a type twice and trusting the author is what a shared composition
 * removes; `ChoiceMenu<DiagramId>` is the whole of it.
 *
 * **Two of the Dock's remaining radio groups are deliberately absent** and
 * neither wants adding: a Graph's colour is a plain `string` on both sides
 * (`onRecolor(graphId, color: string)`), so there is no narrower type to name;
 * and the dock-slot group re-parses through `dockSlot(next)` before it acts, so
 * the value it trusts is one the parser produced rather than one the JSX
 * claimed.
 */
const SpaceItem = DropdownMenuRadioItem<UUID>;

/* ------------------------------------------------------------------ state */

/**
 * **What the Dock is given, in the groups the surface it replaced was given
 * them in.**
 *
 * It was one flat `Chrome` of thirty-three members, threaded whole into ten
 * components — so `PresentingExit`, which reads four of them, was declared to
 * take every command in the surface, and no signature in the file said what any
 * component actually used. `SpaceSidebar` did not do that: it took `canvas`,
 * `graph`, `addThing`, `createDiagram`, `persistence`, `selectedThing`,
 * `entityActions` and `titleEdit`, and each of its own pieces took the group it
 * drew.
 *
 * The groups here are named after it wherever there is a counterpart —
 * `canvas` is the Diagrams and the one that is drawing, `graph` is the Graphs
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
   * running: a live chrome rename withdraws Create Thing, Present, Delete Thing
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
   * or Escape, moves to another Diagram, or the rename stops being available. A
   * replacement is none of those — accepting the stored Space installs a
   * different Space's document under the same ids, so the slot names the same
   * Diagram, `chromeTitleEdit` is unchanged once placement resolves, and an
   * editor left open goes on standing over a Space that is gone, reseeded from
   * the accepted title. Completing it then writes a name the author typed
   * against a Diagram they never saw.
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
  readonly things: DockThings;
  readonly persistence: DockPersistence;
}

/**
 * The Space you are in, the one you came from, and the set open beside them.
 *
 * One group rather than two because the bar draws them as one region: the
 * parent step and the Open Spaces menu are how you leave this Space, and the name and
 * its menu are what you can do while you are in it.
 */
export interface DockSpace {
  /**
   * This Space's own name — `document.title` of the session the Dock is drawing.
   *
   * **Not the Title of a Space Thing that points here.** The two agree only at
   * creation, which writes one string into both, and either may be renamed
   * afterwards without the other (`CONTEXT.md`); ADR 0083 keeps the target's
   * name off the Thing's front, so nothing propagates in either direction.
   */
  readonly title: string;
  /** Which Space the Dock is in, which is what the Open Spaces menu marks. */
  readonly currentSpaceId: UUID;
  /** The Space this one was entered from, and the only step the bar names. Null at the root. */
  readonly parent: SpaceStep | null;
  /** Every open Space, depth-first from the root — what the Open Spaces menu lists. */
  readonly openSpaces: readonly OpenRow[];
  /**
   * Rename this Space, or `null` while no chrome rename may run.
   *
   * **From inside the Space, and only from inside it.** `renamed-space` writes
   * `document.title` of the session it is completed on and nothing else: no Space
   * Thing pointing at this Space changes with it, because a Space's name and the
   * Title of a Thing that references it are two stored values that agree only at
   * creation, and ADR 0083 keeps the target's name off that Thing's front. So
   * there is nothing here for this surface to keep in step — the Open Spaces
   * rows and the parent step each read their own session's title and redraw on
   * its publication (`open-spaces.ts`). Renaming *another* Space, from a Space
   * Thing or from a row of that menu, is a `SpaceThingLifecycle` operation over
   * a second session (ADR 0076) and is deliberately not this.
   *
   * Nullable rather than optional so both callers state it, and `null` now means
   * the one thing it means for {@link DockCanvas.onRename} and
   * {@link DockGraph.onRename}: the application has withdrawn chrome title
   * editing — a live Thing title editor or content edit owns the caret, or the
   * canvas has no placement to edit against — and all three names go together.
   */
  readonly onRename: ((title: string) => string | null) | null;
  /** Copy this Space's own address — the one link a Space offers (`entity-actions.tsx`). */
  readonly onCopyLink: () => void;
  /** Move to an open Space, closing nothing. The parent step and the Open Spaces menu both spend this. */
  readonly onSwitchTo: (spaceId: UUID) => void;
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
   * can be exited. This read {@link parent} instead — "is there a Space I was
   * opened from" — which answers `null` for every Space reached by its own
   * address as well, and so withheld Exit from a pasted link. The two happen to
   * agree while the reader arrived by pressing Space Things, which is what hid
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
 * The canvas's one exclusive choice: which authored Diagram is drawing (ADR
 * 0079, ADR 0082).
 *
 * Named `canvas` after the group the Space Sidebar carried for the same thing,
 * and carrying `selected` as the Diagram rather than as an id for the same reason
 * that one did — the title belongs to the Diagram, so a cluster naming what is
 * drawing reads it off the Diagram instead of deriving a second title.
 */
export interface DockCanvas {
  /** The Space's authored Diagrams, in the order it declares them. */
  readonly diagrams: readonly Diagram[];
  /** The Diagram that is drawing. */
  readonly selected: Diagram;
  readonly onSelect: (diagramId: DiagramId) => void;
  /** Absent while no chrome rename may begin — {@link DockSpace.onRename}'s second arm. */
  readonly onRename: ((diagramId: DiagramId, title: string) => string | null) | null;
  /** Create an empty Diagram and select it. */
  readonly onCreate: () => void;
  /**
   * Whether New Diagram's rename continuation landed — read when the menu closes.
   *
   * **The answer is the point.** New Diagram continues in the new Diagram's name,
   * so this cluster's menu must not take the caret back on close — but only once
   * the rename editor has actually opened. Asking at press time races the
   * post-selection window where rename is withdrawn; reading here keeps the two
   * halves of that decision in one place rather than one per module.
   */
  readonly didCreateMoveCaret: () => boolean;
  /**
   * Whether New Diagram may run.
   *
   * Its own term beyond Create Thing's: creating a Diagram **selects** it, and the
   * created Diagram is empty — so the canvas re-derives with no nodes and a Thing
   * holding a live title draft unmounts, taking the draft, the announced reason
   * and the caret with it. A valid draft is safe, because pressing the control
   * blurs the input and a valid blur completes the Title (ADR 0065); a refused
   * one is re-focused instead and the press lands anyway.
   */
  readonly createDisabled: boolean;
  readonly onDelete: (diagramId: DiagramId) => void;
  /**
   * Whether Delete Diagram may run, beyond the rule the row already knows.
   *
   * The last Diagram cannot be deleted (ADR 0079) and the surface reads that off
   * `diagrams` itself — but that is one of *two* rules, and the second is not
   * derivable here: every entity Edit is withdrawn while a title editor or a
   * live content edit owns the caret (`authoring-availability.ts`). The command
   * this row dispatches does not exist in that state, so a row that read only
   * the ADR rule pressed cleanly, ran nothing, and reported nothing.
   */
  readonly deleteDisabled: boolean;
  /**
   * Copy the drawing Diagram's address — the one form a Diagram has.
   *
   * A Diagram offers no permanent link because it has no second address to be
   * permanent *against*: its own address is the only one there is
   * (`entity-actions.tsx`), where a Graph and a Thing each have a within-Diagram
   * form as well.
   */
  readonly onCopyLink: () => void;
}

/** The Graphs the selected Diagram owns, the Active one, and Present. */
export interface DockGraph {
  /** The Graphs the selected Diagram owns, which are the only ones it draws. */
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
   * this one, read off `graphs` here; the Diagram cluster splits create from
   * delete because creating a Diagram **selects** it and so has a second reason
   * of its own, which no Graph command has.
   */
  readonly editsDisabled: boolean;
  /**
   * The two addresses a Graph always has, and why both are offered.
   *
   * A Diagram **owns** its Graphs (ADR 0040), so a Graph always has a
   * within-Diagram address as well as its own. "Copy link" reproduces what is on
   * screen — this Graph inside this Diagram, so a recipient lands where the
   * sender was — and "Copy permanent link" is the Graph's own address, which
   * survives the sender's Diagram being renamed, redrawn or deleted.
   */
  readonly onCopyLink: () => void;
  readonly onCopyPermanentLink: () => void;
  readonly presenting: boolean;
  readonly onPresent: () => void;
  /**
   * Whether Present may begin a traversal.
   *
   * An empty Graph is legal and ordinary — creating a Diagram mints one — and it
   * has nothing to traverse, so `present()` would return having changed nothing
   * and an enabled control would swallow the press. Unavailable rather than
   * absent: a control that disappears teaches nothing about why.
   */
  readonly presentDisabled: boolean;
}

/**
 * What the Things list draws and what activating a row does.
 *
 * **Two one-way writes rather than an `open` flag**, and that is what lets the
 * Dock own the slot without a second copy of the answer beside it. The
 * application has exactly two things to say about whether this list is open —
 * `disclose` asks for it and `disabled` withdraws it — and nothing it reads
 * back, so neither is state it keeps. A controlled `open` pair here is the
 * shape that lets the Dock's slot and the application's flag disagree, which is
 * how two disclosures come to be open at once.
 */
export interface DockThingsList {
  /** The Things this Diagram does not place — what the list offers. */
  readonly things: readonly Thing[];
  /** Every Thing in the Space, for resolving an Alias row's Target Title. */
  readonly allThings: readonly Thing[];
  /** The Title of every Space a Space Thing in the list references. */
  readonly spaceTitleById?: ReadonlyMap<UUID, string> | undefined;
  /**
   * Every Space this Meta Space holds bar the one being authored.
   *
   * The list's second source. A Space is not a Thing and is in no Diagram, so it
   * is not filtered against one; placing it authors the Space Thing that frames
   * it, which under ADR 0074 is the only way a Space is referenced at all.
   */
  readonly spaces?: readonly ThingsPopoverSpace[] | undefined;
  /** Place a Space by authoring the Space Thing that frames it, or answer with a refusal. */
  readonly onAddSpace?: ((space: ThingsPopoverSpace) => Promise<string | null>) | undefined;
  /** Returns a refusal that stays on the list, or null after a completed Add. */
  readonly onAdd: (thing: Thing, activation: 'keyboard' | 'pointer') => string | null;
  readonly onDragStart: (thingId: ThingId) => void;
  readonly onDragEnd?: (() => void) | undefined;
  /** The row an addressed Thing marks as current, drawn whether or not it opened the list. */
  readonly revealedThingId?: ThingId | null | undefined;
  /**
   * A request to disclose the list, or `null` for none outstanding.
   *
   * **A request rather than an `open` flag**, which is what lets the Dock own
   * the slot without a second copy of the answer beside it. The application has
   * two moments at which it asks for this list and none at which it reads back
   * whether the list is open: a Diagram just created — by Add Diagram, or by
   * having opened a Space into one — and a Thing addressed that the selected
   * Diagram does not place.
   *
   * The Dock opens on the value **changing identity**, so the application raises
   * a fresh object per request and an unrelated edit recomputing an equal one
   * reopens nothing the reader has just closed. A request outstanding when the
   * Dock first mounts opens it without waiting a frame.
   */
  readonly disclose?: DockThingsDisclosure | null | undefined;
  /** Whether the Diagram can accept membership edits at all. */
  readonly disabled: boolean;
}

/** One request to disclose the Things list, and the Thing it is about. */
export interface DockThingsDisclosure {
  /**
   * The Thing the request is about, which the list marks.
   *
   * Not nullable: every disclosure the application makes is about a Thing. The
   * one caller that asked for the list with nothing to mark was New Diagram
   * revealing it on an empty Diagram, and that command discloses nothing now —
   * it continues in the new Diagram's name (ADR 0089).
   */
  readonly thingId: ThingId;
}

export interface DockThings {
  /**
   * The Things, as a list this Dock draws.
   *
   * **The Dock draws it rather than being handed it, and that is the whole of
   * why the open state lives here.** The prototype's Things cluster disclosed a
   * filtered Popover it drew itself, chosen over a Drawer from the screen edge
   * and a second docked panel in a comparison over twenty-nine unplaced Things;
   * the Popover won, and the reasons are written above {@link ThingsPopover} and
   * in `.scratch/command-dock/issues/10-decide-the-cards-surface.md`. The Dock's
   * promotion shipped the application's `ThingsDrawer` against that decision
   * because the drawer already had parity claims and the prototype's evidence
   * sat in a file marked throwaway; this slot was a `ReactNode` for as long as
   * the surface was a foreign component.
   *
   * It is not one any more. A list the Dock draws takes the Dock's own single
   * open slot, so opening it closes whichever menu was open and opening a menu
   * closes it — which a handed-in surface holding its own `open` could not do.
   */
  readonly list: DockThingsList;
  /**
   * Create a Thing of one kind — the one command about the *set*.
   *
   * The kind is chosen at creation, so the menu offers three peers rather than a
   * split button with a hidden default. This is *Create*, distinct from adding
   * an existing Thing, which is what the surface above is for.
   */
  readonly onCreate: (kind: DockThingKind) => void;
  /** Whether each Create peer may run — the kinds withdraw independently when in flight. */
  readonly createDisabled: Readonly<Record<DockThingKind, boolean>>;
}

/** What went wrong, which is the only thing persistence ever says. */
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
 * Which way a menu opens, decided by the dock rather than the control.
 *
 * A bottom-edge dock's menus must open upward: Base UI's default `bottom`
 * puts the popup below the viewport, where it is open and invisible, which
 * reads exactly like a control that does nothing.
 */
type MenuSide = 'top' | 'bottom' | 'left' | 'right';

/* ----------------------------------------------------------------- pieces */

function Divider({ orientation }: { readonly orientation: 'horizontal' | 'vertical' }) {
  return (
    <Separator
      orientation={orientation}
      align="center"
      className={orientation === 'horizontal' ? 'my-1' : 'mx-1 h-5'}
    />
  );
}

/**
 * The name an identity trigger carries.
 *
 * Always drawn, in every orientation. A narrow dock that collapsed these to
 * icons was compared here and lost: the dock stacks on a side edge, so a row
 * is `[name] [v]` and there is room for the words — and the disclosure hangs
 * off that row, so a row that has shrunk to a glyph has nothing to hang from.
 *
 * **Every name here is ink, the Graph's included.** Carrying the Graph's
 * colour on the name as well as the glyph was tried and reverted: the palette
 * is pastel because it is drawn as a stroke on sand, and the same values set
 * as text on white chrome are too light to read as a name — and a name is the
 * thing on this surface that most has to. The glyph beside it carries the
 * colour instead, where a shape rather than a legibility budget is what has to
 * survive.
 */
function IdentityLabel({ children }: { readonly children: ReactNode }) {
  return <CommandName>{children}</CommandName>;
}

/** Which of the bar's three names a rename can be running on. */
type DockIdentity = 'Space' | 'Diagram' | 'Graph';

const identityDisclosureName = (kind: DockIdentity, title: string): string =>
  kind === 'Graph' ? `Active Graph: ${title}` : `${kind}: ${title}`;

type IdentityDisclosure = {
  readonly trigger: ReactNode;
  readonly renameItem: ReactNode;
  readonly triggerId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

/**
 * Whether a command that closed this identity's list left the caret alone.
 *
 * Held on a ref because it decides nothing that is rendered — it is a note
 * from the press to the close that follows it. The functions that read it
 * are JSX props on the menu, not arguments to this surface's render prop:
 * passing a ref-backed function through a function called during render is
 * what `react-hooks/refs` reports.
 */
const IdentityCaretContext = createContext<{ current: boolean } | null>(null);

function useIdentityCaret() {
  const caretMovedRef = useContext(IdentityCaretContext);
  if (caretMovedRef === null) {
    throw new Error('Identity caret used outside IdentitySurface');
  }
  return {
    noteCaretMoved: () => {
      caretMovedRef.current = true;
    },
    restoresFocusOnClose: () => {
      const moved = caretMovedRef.current;
      caretMovedRef.current = false;
      return !moved;
    },
  };
}

/**
 * The Space, Diagram or Graph cluster: one named disclosure, and Rename in it.
 *
 * The name and the chevron are the named `ChoiceMenuTrigger` an Open Space
 * Thing already uses. Pressing either opens this identity's list. Rename is a
 * row in that list; choosing it closes the menu and continues in
 * `InlineTitleEditor` — the same header editor these identities already used,
 * so Enter, Escape, blur and a refused draft stay as they were. The Edit
 * itself does not change; only how it is begun does
 * (`.scratch/command-dock/issues/26-identity-clusters-disclose-from-the-name.md`).
 *
 * Switching stays reachable while a chrome title edit is withdrawn. Only the
 * Rename row becomes unavailable — the trigger is how the list is reached.
 */
function IdentitySurface({
  icon,
  kind,
  title,
  testId,
  triggerTitle,
  onRename,
  children,
}: {
  readonly icon: ReactNode;
  readonly kind: DockIdentity;
  readonly title: string;
  /**
   * What a behaviour test addresses this identity by.
   *
   * The three identities are one component drawn three times, so an accessible
   * name is the only thing distinguishing them — and a test that reached for
   * the title in the disclosure would have to know the title to find the
   * control that names it, which is the assertion inverted. The id names the
   * slot; the text in it is what is under test.
   */
  readonly testId: string;
  readonly triggerTitle: string;
  /**
   * `null` while this name's rename is unavailable — never because the product
   * has no such Edit. All three identities have one, so every `null` here is a
   * withdrawal the application has made and will lift (see
   * {@link DockSpace.onRename}).
   */
  readonly onRename: ((title: string) => string | null) | null;
  readonly children: (disclosure: IdentityDisclosure) => ReactNode;
}) {
  /**
   * **Whether this name is the one being renamed is the bar's answer, not this
   * component's.**
   *
   * It was `useState(false)` here, once per identity, and the three of them
   * reported into one boolean the App reads as "a chrome rename is running".
   * Two editors could stand at once — a blank draft is refused and
   * `InlineTitleEditor` holds a refused draft open, so pressing a second name
   * left the first one live — and the first cleanup to run then told the App no
   * rename was live at all, handing Create Thing, Present and the canvas's own
   * title editing back underneath an editor still on screen.
   *
   * One slot under the whole bar makes that unrepresentable rather than
   * guarded: at most one name can be the renaming one, so the flag has one
   * writer, and the two endings no gesture can see coming — the reader moving
   * to another Diagram, and ADR 0042's replacement — are the slot's own and are
   * answered once in {@link CommandDock} instead of three times here.
   */
  const { renaming, onRenaming } = useContext(DockRenamingContext);
  const { id: triggerId, open, onOpenChange } = useDockDisclosure();
  const editing = renaming === kind;

  /**
   * **Where the caret goes when the editor closes.**
   *
   * The editor replaces this control rather than expanding inside it, so ending
   * a rename unmounts the element holding the caret and it falls to
   * `document.body` unless something puts it back. The name *is* the disclosure
   * trigger, so the ref lives on that trigger and the editor's own three exits
   * spend it.
   *
   * The endings the slot answers for the bar must not — the reader moved to
   * another Diagram from this list, and pulling the caret onto the name they
   * just moved away from is taking focus, not returning it.
   */
  const nameRef = useRef<HTMLButtonElement>(null);
  /**
   * A ref rather than state, because it decides nothing that is rendered — it
   * is a note from the press to the commit that follows it, and holding it in
   * state would set state from inside the effect that reads it.
   */
  const returningFocus = useRef(false);
  /**
   * Whether the command that closed this list left the caret alone.
   *
   * Rename continues in the editor, and New Diagram continues in the new
   * Diagram's name. Base UI's ordinary restoration would then land on the
   * trigger a frame later — blurring an editor whose blur completes.
   */
  const caretMovedRef = useRef(false);
  // Only the identity holding the slot draws an editor, so only it can reach
  // these — clearing the slot is releasing this component's own rename rather
  // than ending someone else's.
  const endRename = (): void => {
    onRenaming(null);
  };
  /**
   * The two endings that owe the caret a home, and only those.
   *
   * Enter and Escape end the rename from inside the editor's own key handler,
   * so the caret is on an element about to unmount and falls to
   * `document.body` unless this puts it back. A blur completion is the reader
   * having already put the caret where they want it — pulling it onto the name
   * they just left is taking focus, not returning it.
   */
  const endRenameReturningFocus = (): void => {
    returningFocus.current = true;
    endRename();
  };
  useEffect(() => {
    if (editing || !returningFocus.current) return;
    returningFocus.current = false;
    nameRef.current?.focus();
  }, [editing]);

  /**
   * New Diagram continues by pressing a control the visible name is not.
   *
   * The name is the disclosure: a click on it opens the list. The application's
   * continuation still has to begin the editor the way a reader who chose
   * Rename does, without flashing that list, so the press lands on this
   * always-mounted address instead (`continuation.ts`).
   * `waitUntilDiagramContinuationReady` and the New Diagram continuation in
   * `SpaceApp.test.tsx` hold that the address is present and that it begins
   * the editor without opening the list.
   */
  const continuation =
    kind === 'Diagram' ? (
      <button
        type="button"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-continuation-control="diagram-name"
        disabled={onRename === null}
        onClick={() => onRenaming('Diagram')}
      />
    ) : null;

  const renameItem = (
    <DropdownMenuItem
      className="gap-2"
      disabled={onRename === null}
      onClick={() => {
        caretMovedRef.current = true;
        onRenaming(kind);
      }}
    >
      <EditIcon />
      Rename
    </DropdownMenuItem>
  );
  const identity = (trigger: ReactNode): IdentityDisclosure => ({
    trigger,
    renameItem,
    triggerId,
    open,
    onOpenChange,
  });

  if (onRename !== null && editing) {
    return (
      <IdentityCaretContext.Provider value={caretMovedRef}>
        <InlineTitleEditor
          variant="header"
          className="command-dock__name-editor"
          title={title}
          label={`${kind} name`}
          onComplete={(next) => {
            const named = next.trim();
            if (named === '') return `A ${kind} needs a name.`;
            // **The Edit's answer, not the press.** A rename can be refused for
            // more than a blank name — a Diagram that has stopped drawing, a title
            // Authoring will not take — and `InlineTitleEditor` holds a refused
            // draft open and editable for exactly that. Closing on the press
            // instead would drop the author's words on the floor and leave the
            // stored title unchanged with nothing said.
            const refusal = onRename(named);
            if (refusal !== null) return refusal;
            endRename();
            return null;
          }}
          onCancel={endRenameReturningFocus}
          onReturnFocus={endRenameReturningFocus}
        />
        {children(
          identity(
            <ChoiceMenuTrigger
              id={triggerId}
              className="nokey command-dock__disclose"
              aria-label={identityDisclosureName(kind, title)}
              title={triggerTitle}
              render={<ToolbarButton variant="ghost" size="icon" />}
            />,
          ),
        )}
        {continuation}
      </IdentityCaretContext.Provider>
    );
  }

  return (
    <IdentityCaretContext.Provider value={caretMovedRef}>
      {children(
        identity(
          <ChoiceMenuTrigger
            ref={nameRef}
            id={triggerId}
            className="nokey command-dock__name"
            data-testid={testId}
            aria-label={identityDisclosureName(kind, title)}
            title={triggerTitle}
            icon={icon}
            name={title}
            render={<ToolbarButton variant="ghost" size="compact" />}
          />,
        ),
      )}
      {continuation}
    </IdentityCaretContext.Provider>
  );
}

/**
 * Diagram: `[name v]`. Graph: `[name v][>]`.
 *
 * Each is one named `ToolbarGroup` inside the Dock's single `Toolbar` — ADR
 * 0073's pair, the same one a Thing rail is built from — so the controls share a
 * box treatment with the rail, the whole bar is one tab stop, and the arrows
 * cross a group boundary exactly as they cross any other gap. What the grouping
 * says is that these are commands *on* one named entity, which is exactly what a
 * rail says about a Thing.
 *
 * Name and chevron are one disclosure. Rename sits with New, Copy link and
 * Delete on the current identity. Present is the exception on the Graph side:
 * it acts on the Active Graph the cluster is naming.
 */
function DiagramControls({
  canvas,
  side = 'bottom',
}: {
  readonly canvas: DockCanvas;
  readonly side?: MenuSide;
}) {
  return (
    <ToolbarGroup aria-label="Diagram" className="command-dock__cluster">
      <IdentitySurface
        icon={<DiagramIcon />}
        kind="Diagram"
        testId="selected-canvas"
        title={canvas.selected.title}
        triggerTitle="Switch Diagram"
        onRename={
          canvas.onRename === null
            ? null
            : (title) => canvas.onRename?.(canvas.selected.id, title) ?? null
        }
      >
        {(disclosure) => (
          <DiagramIdentityMenu canvas={canvas} side={side} disclosure={disclosure} />
        )}
      </IdentitySurface>
    </ToolbarGroup>
  );
}

/**
 * The list, the mark on the Diagram you are in and every key that moves
 * between them are `ChoiceMenu`'s — the same component an Open Space Thing
 * chooses its Diagram through. What stays here is what the list *is* and
 * what choosing one does, which on this surface is the canvas moving.
 * The commands below it are this cluster's own.
 */
function DiagramIdentityMenu({
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
    <ChoiceMenu<DiagramId>
      label="Diagrams"
      choices={canvas.diagrams}
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
      {/* The same order the Spaces popover pins below its scroll: the set
            first, then the commands on the one it is naming. A Diagram list is
            short enough that nothing scrolls, so the end of the list and the
            pinned position are the same place — which is why one rule covers
            both and neither has to know which case it is. */}
      {renameItem}
      <DropdownMenuItem
        className="gap-2"
        disabled={canvas.createDisabled}
        onClick={() => {
          canvas.onCreate();
        }}
      >
        <PlusIcon />
        New Diagram
      </DropdownMenuItem>
      <DropdownMenuItem className="gap-2" onClick={canvas.onCopyLink}>
        <CopyIcon />
        Copy link
      </DropdownMenuItem>
      {/* The last Diagram cannot be deleted (ADR 0079), so the command is
            present and unavailable rather than absent — a control that
            disappears teaches nothing about why. */}
      {/* Delete is destructive and sits behind its own rule, away from
            the commands above it — the same separation the menu already
            makes between the list and the commands. */}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        className="gap-2"
        disabled={canvas.deleteDisabled || canvas.diagrams.length <= 1}
        onClick={() => canvas.onDelete(canvas.selected.id)}
      >
        <DeleteIcon />
        Delete {canvas.selected.title}
      </DropdownMenuItem>
    </ChoiceMenu>
  );
}

/**
 * Graph, carrying the colour that identifies it on the canvas and the one
 * command that is a Graph's alone: Present traverses the Active Graph.
 */
function GraphControls({
  graph,
  diagramTitle,
  side = 'bottom',
  vertical = false,
}: {
  readonly graph: DockGraph;
  /** Only to caption the list: the Graphs a menu offers are the ones this Diagram owns. */
  readonly diagramTitle: string;
  readonly side?: MenuSide;
  readonly vertical?: boolean;
}) {
  /**
   * **Present leads along a row and trails down a column**, and this is the one
   * thing in the Dock the edge reorders.
   *
   * Along a row it leads: it acts on the named entity the cluster is showing, so
   * it sits at the edge the eye enters from, ahead of the name it acts on.
   *
   * Down a column it cannot, because a column pays for it differently. A
   * leading verb needs a track of its own on *every* row — three of the four
   * rows have no verb, and the 28px sits empty on each — and Things' Create
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
            diagramTitle={diagramTitle}
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
 * The same `ChoiceMenu` the Diagram cluster and an Open Space Thing draw,
 * with each row carrying the colour its Graph is drawn in — a choice's
 * own glyph is the choice's, which is why it rides on the choice rather
 * than being rendered here.
 */
function GraphIdentityMenu({
  graph,
  diagramTitle,
  side,
  disclosure,
}: {
  readonly graph: DockGraph;
  readonly diagramTitle: string;
  readonly side: MenuSide;
  readonly disclosure: IdentityDisclosure;
}) {
  const { trigger, renameItem, triggerId, open, onOpenChange } = disclosure;
  const { restoresFocusOnClose } = useIdentityCaret();
  return (
    <ChoiceMenu<GraphId>
      label={`Graphs in ${diagramTitle}`}
      choices={graph.graphs.map((each) => ({
        id: each.id,
        title: each.title,
        icon: <GraphIcon color={graph.colorByGraphId[each.id] ?? FALLBACK_GRAPH_COLOR} size={14} />,
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
      {renameItem}
      {/* **A submenu, not a control beside Present.** The rule this
                cluster already keeps is frequency: Present earns a permanent
                control because traversing is what a Graph is *for*, and New
                Graph sits in the menu because Graphs are made rarely. Colour is
                rarer still — set once when a Graph is created and then left —
                so a swatch row standing beside Present would spend the Dock's
                scarcest width on its least-used command, and would put four
                controls on the one cluster that already has three.

                It is not in both places either. Two paths to one command is
                what this arrangement keeps removing, and a menu row that
                duplicates a visible control is the second one nobody reviews.

                Radio items rather than a strip of swatches: a Graph has exactly
                one colour, the palette is a closed set, and a menu's own roving
                focus and keyboard selection come free — where a row of buttons
                inside a menu would be a focus manager fighting the menu's. */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2" disabled={graph.editsDisabled}>
          <GraphIcon color={graph.activeColor} size={14} />
          Colour
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="nokey">
          <DropdownMenuRadioGroup
            value={graph.active.color ?? ''}
            onValueChange={(next) => graph.onRecolor(graph.active.id, next)}
          >
            {GRAPH_COLORS.map(([name, color]) => (
              <DropdownMenuRadioItem key={color} value={color} closeOnClick className="gap-2">
                <GraphIcon color={color} size={14} />
                {name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem className="gap-2" disabled={graph.editsDisabled} onClick={graph.onCreate}>
        <PlusIcon />
        New Graph
      </DropdownMenuItem>
      {/* **A copy reports through the application's standing notice**, not
                in the item's own label. `EntityActionsMenu` swaps a pressed
                item's words to "Copied" or "Not copied", and it does that
                because the Sidebar's menus were inside a Sheet drawn over the
                area a pinned notice renders in — on a phone the reader could
                not see the report any other way. This surface has no Sheet and
                covers nothing: "Link not copied" is pinned in the shell at every
                width, so the in-place swap has lost the reason it existed for.
                The Thing rail keeps it, being a menu on the canvas itself. */}
      {/* Both forms, always: a Diagram owns its Graphs (ADR 0040), so a
                Graph always has a within-Diagram address as well as its own —
                which is exactly what `spaceEntityActions` offers on a Graph.

                They are not the same address. "Copy link" reproduces *what is
                on screen*: this Graph inside this Diagram, so a recipient lands
                where the sender was. "Copy permanent link" is the Graph's own
                address and always opens it in whichever Diagram draws it, which
                survives the sender's Diagram being renamed, redrawn or deleted.
                The second form is offered only where it differs from the first,
                which on a Graph is always — a Diagram row shows one link for the
                same reason, having only its own. */}
      <DropdownMenuItem className="gap-2" onClick={graph.onCopyLink}>
        <CopyIcon />
        Copy link
      </DropdownMenuItem>
      <DropdownMenuItem className="gap-2" onClick={graph.onCopyPermanentLink}>
        <CopyIcon />
        Copy permanent link
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        className="gap-2"
        disabled={graph.editsDisabled || graph.graphs.length <= 1}
        onClick={() => graph.onDelete(graph.active.id)}
      >
        <DeleteIcon />
        Delete {graph.active.title}
      </DropdownMenuItem>
    </ChoiceMenu>
  );
}

/**
 * Create Thing, as three peer commands in the Things cluster.
 *
 * **The kinds were always peers; they are no longer disclosed.** The design this
 * replaces put them behind a `+` and recorded why they are peers rather than a
 * split button with a hidden default — the kind is chosen at creation, so none
 * of the three is the default. That reasoning is kept whole here. What is
 * dropped is the disclosure around them, which cost a press on *every*
 * creation, including the one kind that then needed no second decision:
 * `markdown` completed its Edit on activation, while `alias` and `space` opened
 * a pane because a Target and a target Space were still owed. So the menu
 * charged the cheapest command for a choice it never makes. ADR 0089 has since
 * made every kind complete on activation and taken `alias` out of this cluster
 * altogether, which makes the argument stronger rather than weaker.
 *
 * The other half of that recorded design is untouched and still load-bearing:
 * Create stays *outside* the Things surface. That list is a long scrolling one
 * an author drags out of, so a New pinned above it is a second region and a New
 * inside it scrolls away.
 *
 * **A glyph is asked to mean a verb here, which it is not asked to do anywhere
 * else in the product.** The same three silhouettes mark rows in the Things
 * list and Things on the canvas, where they say *what a Thing is*. Each control
 * carries `Create <kind>` as its accessible name and its tooltip, so the
 * keyboard and the pointer are unambiguous; what is accepted is that a silent
 * visual reading could take the kind glyphs in a command slot for filters
 * over the list the trigger opens.
 *
 * They carry no chevron. In the cluster they sit where Present sits on the
 * Graph cluster — bare glyphs after the disclosure — and a second chevron
 * beside `Things ⌄` would read as a second disclosure of the same list.
 */
function CreatePeers({
  onCreate,
  disabled,
}: {
  readonly onCreate: (kind: DockThingKind) => void;
  readonly disabled: Readonly<Record<DockThingKind, boolean>>;
}) {
  return (
    /* **A nested group, and it is what lets the vertical dock pack.** Base UI's
       toolbar group is a plain `role="group"` div with no positional logic, so
       it nests inside the cluster without taking the roving tabindex off the
       one `Toolbar` root — and it gives `command-dock.css` one element to place
       instead of two. Left as loose siblings the vertical column's grid
       auto-places them onto a row each and the Things cluster grows past the
       44px Diagram and 44px Graph beside it. */
    <ToolbarGroup aria-label="Create a Thing" className="command-dock__create">
      {THING_KINDS.map((kind) => (
        <ToolbarButton
          key={kind}
          variant="ghost"
          size="icon"
          className="nokey"
          aria-label={`Create ${thingKindName(kind)}`}
          title={`Create ${thingKindName(kind)}`}
          disabled={disabled[kind]}
          onClick={() => onCreate(kind)}
        >
          {/* Decorative here and nowhere else in the Dock: this button already
              says `Create <kind>`, so a glyph announcing `<kind>` beside it is a
              second node repeating half of it. Both of these are mounted at
              rest, so the duplication is permanent rather than disclosed. */}
          <ThingKindIcon kind={kind} decorative />
        </ToolbarButton>
      ))}
    </ToolbarGroup>
  );
}

/**
 * `Things ⌄` — the same shape as `Diagram ⌄` and `Graph ⌄` beside it, and one
 * trigger whichever surface opens.
 *
 * It carries a chevron because it discloses a list, which is what the chevron
 * says next to it on the other three. Space, Diagram and Graph name one entity
 * each, and that name is the same disclosure — Rename lives in the list.
 * "Things" names a set, and a set has no name to edit — so the word is a label
 * inside the trigger rather than a button of its own, and the cluster is one
 * target instead of two.
 *
 * **It draws the same three parts in the same order as an identity trigger** —
 * an icon, the title through `IdentityLabel`, then the chevron — so the word
 * lands in the column the other three names land in, whichever edge the dock
 * is on.
 */
function SetTrigger({
  icon,
  children,
}: {
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <>
      {icon}
      <IdentityLabel>{children}</IdentityLabel>
      <ChevronDownIcon />
    </>
  );
}

export function ThingsTrigger() {
  return (
    /* The Thing glyph the rows in its own list carry, not `OpenThingIcon`'s
       expand arrows: beside a Space, a Diagram and a Graph's colour, the icon
       slot names what the cluster is about, and "expand" named a gesture this
       cluster does not have. */
    <SetTrigger icon={<ThingKindIcon kind="markdown" />}>Things</SetTrigger>
  );
}

/**
 * Which of the Dock's list disclosures is open, if any.
 *
 * A `Menubar` makes the Dock's *menus* exclusive, but the Things list is a
 * Popover rather than a menu — it holds a filter field and drag sources, and
 * menu semantics would take the arrow keys and typeahead the input needs and
 * would dismiss on activating a row. So the exclusivity a menubar gives its
 * menus is supplied here across both kinds: one open id for the Dock, and
 * whichever control opens next clears whatever was open.
 *
 * A context rather than props threaded through the clusters: each already takes
 * `chrome` and `side`, and a further pair carried through two components purely
 * to reach a leaf is the shape that makes the next person reintroduce local
 * state instead.
 */
interface DockDisclosure {
  readonly openId: string | null;
  readonly setOpenId: (id: string | null) => void;
}

const DockDisclosureContext = createContext<DockDisclosure>({
  openId: null,
  setOpenId: () => undefined,
});

/**
 * Which name in the bar is being renamed, if any.
 *
 * **One slot, exactly as the disclosure above is one open id.** Renaming and
 * disclosing are the same rule twice: at most one at a time, and whichever
 * control begins next clears whatever was open. Each identity used to keep its
 * own `editing` boolean and report into the application's single
 * `editingChromeTitle`, which meant two editors could stand at once and the
 * first of them to close told the application that neither was — handing back
 * the commands the other was still withdrawing. A slot cannot say that: the
 * fact is the bar's, so it is held once and read by every name.
 *
 * A context for the same reason the disclosure is one: threading it through
 * `SpacesControl`, `DiagramControls` and `GraphControls` to reach a leaf is the
 * shape that makes the next person keep it locally instead. The default is an
 * inert slot, so an identity mounted outside a provider draws its name and
 * never opens an editor, rather than opening one nothing can end.
 */
interface DockRenaming {
  readonly renaming: DockIdentity | null;
  /** Take the slot for one identity, or release it. */
  readonly onRenaming: (identity: DockIdentity | null) => void;
}

const DockRenamingContext = createContext<DockRenaming>({
  renaming: null,
  onRenaming: () => undefined,
});

/**
 * The bar's one rename: which name has the slot, and what the application is
 * told about it.
 *
 * **Three rules that were three copies of themselves, answered once.**
 *
 * *A rename cannot outlive its subject.* The slot remembers the Diagram or Graph
 * the rename was begun against, so a reader who moves to another Diagram from
 * the menu beside the name releases it — the editor is seeded from a title, and
 * leaving it open would put the caret in a field editing something the reader
 * has already left. Read as a render-time transition rather than an effect,
 * because an effect lets one render draw the stale editor first, and it is this
 * component's own state so nothing is written to a parent from a child's
 * render.
 *
 * *A replacement ends it too, and nothing else can (ADR 0042).* The accepted
 * Space carries the same Diagram and Graph ids, so the subject is unchanged
 * across the very transition that discards the draft, and the application's own
 * `editingChromeTitle` is the *report* rather than the editor — lowering it
 * neither closes the editor nor stops it being completed. Nor can the
 * availability guard stand in: placement is asynchronous, so a replacement
 * passes through a render where `onRename` is `null` and the name draws
 * unavailable with the slot still taken. That looks like the draft going. It
 * comes back the moment placement resolves, reseeded from the *accepted*
 * Diagram's title — an editor the author never opened, over a Space they never
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
    Diagram: { subject: chrome.canvas.selected.id, renameable: chrome.canvas.onRename !== null },
    Graph: { subject: chrome.graph.active.id, renameable: chrome.graph.onRename !== null },
  } satisfies Record<DockIdentity, { readonly subject: string; readonly renameable: boolean }>;

  const [renaming, setRenaming] = useState<{
    readonly name: DockIdentity;
    readonly subject: string;
  } | null>(null);
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
 * One disclosure's share of the Dock's single open slot.
 *
 * **Base UI's `Menubar` is the documented answer and it cannot be used here.**
 * It is a roving-focus container, and so is `Toolbar` — and the Dock is a
 * Toolbar because ADR 0073 makes a command cluster the component a Thing rail is
 * built from. Nesting them puts `role="menubar"` inside `role="toolbar"` and two
 * focus managers over the same buttons: the menu opens, the toolbar takes focus
 * back, and it closes again within a frame. It fails silently, with nothing in
 * the console, which from the outside is a menu that flashes on click and never
 * opens.
 *
 * So the exclusivity a menubar would have supplied is supplied by controlled
 * open state, which both `Menu.Root` and `Popover.Root` accept. That is not a
 * hand-rolled interaction: every dismissal, focus trap and key belongs to Base
 * UI still, and the only thing owned here is *which one* is open.
 *
 * **The id is also the trigger's.** A controlled Base UI root — `Menu.Root` as
 * much as `Popover.Root` — has to be told which element it belongs to: without
 * `triggerId` on the root and the same `id` on the trigger, `open` opens
 * nothing at all and does it silently, which is the second way this surface has
 * now produced a menu that flashes and never appears.
 *
 * The id is `useId` rather than a caller-chosen string, so two disclosures
 * cannot collide by both calling themselves "things" and adding a control needs
 * no registry kept in step.
 */
interface DisclosureBinding {
  readonly id: string;
  readonly open: boolean;
  readonly onOpenChange: (next: boolean) => void;
}

function useDockDisclosure() {
  const id = useId();
  const { openId, setOpenId } = useContext(DockDisclosureContext);
  return {
    id,
    open: openId === id,
    onOpenChange: (next: boolean) => setOpenId(next ? id : null),
  } satisfies DisclosureBinding;
}

/**
 * The Things disclosure's id, and the one in the Dock that is not a `useId`.
 *
 * Every other disclosure takes an opaque generated id, so two cannot collide by
 * both calling themselves "things" (see {@link useDockDisclosure}). This one is
 * named because it is the one disclosure the Dock itself opens on the
 * application's behalf — a Diagram just created, a Thing addressed that the
 * Diagram does not place — and {@link DockChrome} has to be able to seed the
 * Dock's slot with it before any control has mounted to mint an id.
 */
const THINGS_DISCLOSURE_ID = 'command-dock-things';

/**
 * The Things list in its cluster, holding the Dock's one open slot.
 *
 * The three things the application says about whether this is open are applied
 * here rather than mirrored into a second flag: `initiallyOpen` seeds the slot
 * in {@link CommandDock}, `disabled` closes it, and `reveal` opens it on the
 * change rather than on the value. Each is a one-way write into the slot, so
 * there is no state here that can come to disagree with the application's.
 */
function ThingsList({ list, side }: { readonly list: DockThingsList; readonly side: MenuSide }) {
  const { openId, setOpenId } = useContext(DockDisclosureContext);
  const open = openId === THINGS_DISCLOSURE_ID;
  const disclosed = useRef(list.disclose ?? null);
  // The slot key is stable and the trigger's DOM id is not, because they answer
  // different questions: the Dock has to be able to name this slot before a
  // control exists, and every open Space keeps its Dock mounted, so a literal
  // `id` would be in the document more than once the moment a second Space is
  // open.
  const triggerId = useId();

  // Withdrawing the list *closes* it rather than leaving it open behind a
  // disabled trigger. Presenting and creating an Alias both pass through here,
  // and a list that reopened itself on the way back would take focus with it,
  // landing the reader in the Things rather than on the canvas they returned to.
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
    if (next !== null) setOpenId(THINGS_DISCLOSURE_ID);
  }, [list.disclose, setOpenId]);

  return (
    <ThingsPopover
      open={open && !list.disabled}
      onOpenChange={(next) => setOpenId(next ? THINGS_DISCLOSURE_ID : null)}
      triggerId={triggerId}
      side={side}
      disabled={list.disabled}
      triggerRender={<ToolbarButton variant="ghost" {...THINGS_TRIGGER} />}
      triggerLabel={<ThingsTrigger />}
      things={list.things}
      allThings={list.allThings}
      spaceTitleById={list.spaceTitleById}
      spaces={list.spaces}
      onAddSpace={list.onAddSpace}
      onAdd={list.onAdd}
      onDragStart={list.onDragStart}
      onDragEnd={list.onDragEnd}
      revealedThingId={list.revealedThingId}
    />
  );
}

function ThingsControl({
  things,
  side = 'bottom',
}: {
  readonly things: DockThings;
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
    <ToolbarGroup aria-label="Things" className="command-dock__cluster command-dock__things">
      {/* **The list carries no commands, and that is the shape rather than a
          gap in it.** Things names no one entity — a Thing's own commands are the
          Thing rail's (ADR 0073) and this Dock deliberately carries none — and
          its set commands, the three Creates, are the peers beside this trigger.
          Repeating Create inside the list as well would be the second path to
          one command that the Sidebar's own actions menu was built to remove.

          It offers Space Things like any other Thing and does nothing special
          with them: entering one is the canvas Thing's gesture (ADR 0068), not a
          list's. */}
      <ThingsList list={things.list} side={side} />
      {/* **Trailing, where Present leads**, and the asymmetry is the point.
          Present acts on the named entity the cluster is showing — present *this
          Graph* — so it sits at the edge the eye enters from, ahead of the name
          it acts on. Create acts on the **set**: Things names no one entity, which
          is why it has no name to edit, and a command about the set reads after
          the disclosure that lists it. `[▢ Things ⌄][▢][▣][▢↗]` is "the Things,
          and make one"; leading would be verbs with no subject in front of them.

          **The vertical dock packs this cluster rather than granting it tracks.**
          Three trailing commands would need three verb tracks, empty on the three
          rows that have one verb or none — 84px of a 208px column spent on
          gutters. Instead the Things trigger gives up the `1fr` name track it
          never needed: Space, Diagram and Graph name entities the author renamed,
          so their names take the slack and truncate, while "Things" is a fixed
          word. See `command-dock.css`. */}
      <CreatePeers onCreate={things.onCreate} disabled={things.createDisabled} />
    </ToolbarGroup>
  );
}

/**
 * The Space's chevron: an ordinary menu, the same one Diagram and Graph carry.
 *
 * **It used to disclose a list of Spaces and that list is gone.** A Space is a
 * Space Thing, so the Spaces in this Space are Things in it, and the surface that
 * offers Things already offers them. Two disclosures over overlapping sets was
 * the duplication, and the one that had to go is the one whose set was a
 * subset.
 *
 * What is left is what a Diagram and a Graph disclose minus the part that names
 * a set: New and Copy link, in that order, in one group. The list of Spaces
 * this control does *not* draw is the **open** set, and that belongs to the
 * Open Spaces menu beside the parent step, where the question is which Space you are
 * looking at rather than what you can do to it.
 *
 * **Exit is the one command the Open Spaces menu made necessary.** While pressing an
 * ancestor was Exit, leaving and closing were the same gesture and neither
 * needed a name; now that moving closes nothing, the open set only grows unless
 * something takes from it. It sits behind its own separator for the reason
 * Delete does on the other two menus — the commands above it make something and
 * this one takes something away — and it is disabled on the meta Space, which
 * cannot be exited.
 *
 * **It is `openSpaces.exit`'s rules and not this module's.** `CONTEXT.md`'s Exit
 * — wait on an in-flight commit, refuse for `failed` and `conflicted` naming the
 * recovery each has, warn and permit for `rejected` — is implemented there, and
 * `ExitReport` below draws the three arms of the `ExitSpaceResult` it answers.
 *
 * There is still no **Delete**, which a Diagram and a Graph both offer: deleting
 * the Space you are standing in has nowhere to leave you, and this surface does
 * not answer that. Exit is not it — exiting discards a session's place in a
 * Space, and the Space is untouched.
 */
function SpaceMenu({
  space,
  side = 'bottom',
  disclosure,
}: {
  readonly space: DockSpace;
  readonly side?: MenuSide;
  readonly disclosure: IdentityDisclosure;
}) {
  const { trigger, renameItem, triggerId, open, onOpenChange } = disclosure;
  const { restoresFocusOnClose } = useIdentityCaret();
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
      {trigger}
      <DropdownMenuContent
        align={DISCLOSURE_ALIGN}
        side={side}
        sideOffset={DISCLOSURE_SIDE_OFFSET}
        className={`nokey ${DISCLOSURE_WIDTH}`}
        finalFocus={restoresFocusOnClose}
      >
        <DropdownMenuGroup>
          {renameItem}
          <DropdownMenuItem className="gap-2" onClick={space.onCopyLink}>
            <CopyIcon />
            Copy link
          </DropdownMenuItem>
          {/* Behind its own rule, like Delete on the Diagram and Graph menus:
              the commands above make something, this one takes something away.
              It is **not** destructive though, and does not draw as it — exiting
              a Space discards a session's place in it, not the Space, and
              re-entering costs one press on a Thing. Meta cannot be exited, so
              there the row is present and unavailable rather than gone — and
              that is the *only* case, which `exitDisabled` is named for and
              `space.parent` was not.

              **Exit, because the glossary says Exit.** `CONTEXT.md` gives the
              word to the one action that closes an entered Space, and
              `openSpaces.exit` is spelled that way too; this drew "Close Space"
              and so named a fourth thing beside Open, Close and Exit. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2"
            disabled={space.exitDisabled}
            onClick={() => space.onExit(space.currentSpaceId)}
          >
            <CloseIcon />
            Exit Space
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The two exits that did not happen, drawn where production's own refusals are:
 * in a portalled `AlertDialog` that owns the viewport.
 *
 * **The arms are `ExitSpaceResult`'s and there are three.** `exited` draws
 * nothing — the Space is gone from the Open Spaces menu and the canvas has moved, which
 * is the whole of the report. `warning` is a question, because ADR 0068 makes
 * `rejected` the one bad state Exit permits: the work is certainly lost and
 * there is no recovery to name, so refusing would trap the entry. Answering it
 * hands the same `RejectedExitConfirmation` token back to the exit, which is
 * production's own second call rather than a second command. `refused` is a
 * statement, and it names the recovery that already exists — Retry, or Resolve —
 * because ADR 0068 only makes a refusal worth making when it names an action.
 *
 * **It names the Space.** ADR 0082 binds the surface to say which open Space is
 * unwell, so a silent refusal is not an option — and it is the sentence that
 * says it, rather than the reader inferring it from where the dialog opened.
 *
 * No placement, for `PersistenceControl`'s reason: the dialog is portalled and
 * owns the viewport, so where the Dock is sitting is not part of the decision.
 */
function ExitReport({ space }: { readonly space: DockSpace }) {
  const report = space.exitReport;
  if (report === null) return null;

  const sentence = exitReportSentence(report.title, report.outcome);
  const dismiss = (open: boolean): void => {
    if (!open) space.onDismissExitReport();
  };

  if (report.outcome.kind === 'warning') {
    return (
      <AlertDialog open onOpenChange={dismiss}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exit {report.title} anyway?</AlertDialogTitle>
            <AlertDialogDescription>{sentence}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay in {report.title}</AlertDialogCancel>
            {/* The same command with the warning handed back, which is exactly
                what `openSpaces.exit(spaceId, { warning: 'persistence-rejected' })`
                is for. */}
            <AlertDialogAction
              onClick={() => space.onExit(report.spaceId, { warning: 'persistence-rejected' })}
            >
              Exit {report.title}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open onOpenChange={dismiss}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Can’t exit {report.title}</AlertDialogTitle>
          <AlertDialogDescription>{sentence}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Stay in {report.title}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * `[Parent] [⌄]` — where you came from, and every other Space you have open.
 *
 * **The bar names one step, and the Open Spaces menu holds the rest.** Depth costs
 * width and the Dock is furniture at the edge of a canvas, so drawing the whole
 * path was always going to lose: at four crossings it was a row of collapsed
 * glyphs saying "two Spaces, and you will have to hover to learn which". One
 * named step — the Space you came from, the one a reader actually reaches for —
 * costs a word, and everything else moves behind the Open Spaces menu's `⌄`.
 *
 * **The Open Spaces menu is not the path.** It lists the *open* Spaces as the tree they
 * are, so a Space opened from Meta and left behind is in it beside the branch
 * you are standing on, indented under the Space it was entered from. That is
 * the gap a trail could not close: a trail can only offer what is above you, so
 * a Space open but not an ancestor had nowhere to be, and leaving one meant
 * losing it. Selecting a row moves to it and closes nothing, so the list a
 * reader learns stays the list they come back to — the shape of the menu does
 * not change under them when they use it.
 *
 * **The Open Spaces menu appears only when it has something to disclose**, and what it has is
 * whatever the bar is not already naming. The bar names the Space you are in,
 * and the parent step when there is one, so the Open Spaces menu arrives at the Space
 * after those: the third, ordinarily, and the second at the root, where there
 * is no parent step to spend one on.
 *
 * At the root the shape is therefore `[⌄] [⬡ Space ⌄]`, or the cluster alone in
 * a session that has never crossed. Keeping the Open Spaces menu there is what stops the root
 * being the one place a reader cannot get back from — a Open Spaces menu reachable from
 * everywhere except the top would send them back down the way they came.
 */
function ParentSpace({
  space,
  side = 'bottom',
}: {
  readonly space: DockSpace;
  readonly side?: MenuSide;
}) {
  const { id: triggerId, open, onOpenChange } = useDockDisclosure();
  const parent = space.parent;
  /**
   * **The open Spaces that are unwell, counted on the bar rather than inside
   * the menu.**
   *
   * The rows say *which* one and that is the whole of the detail — but ADR 0082
   * puts the announcement before the disclosure: "a standing failure announces
   * itself rather than waiting to be opened — a report you have to go and find
   * is not a report". A mark that exists only under the chevron is exactly that
   * report, and the vertical strip this replaced badged the set permanently.
   *
   * The Space the reader is *in* is excluded, because it reports for itself:
   * its own persistence control and standing notice are on this same bar, with
   * the recovery in them. What this mark is for is the Space you are not
   * looking at.
   *
   * Derived in the model and read here, because the trail decision below now
   * reads the same number: the control this mark rides on is withheld while the
   * bar is already naming the whole set, so a count taken twice could withhold
   * the control that draws it.
   */
  const unwell = unwellElsewhere(space.openSpaces, space.currentSpaceId);
  // The trail decision, held in the model rather than in this JSX: which of the
  // parent step and the Open Spaces menu the bar draws, and when it draws neither.
  const controls = trailControls(parent, space.openSpaces, unwell);
  if (controls === 'none') return null;
  const openSpacesMenu =
    controls === 'open-spaces-menu' || controls === 'parent-and-open-spaces-menu';

  return (
    <Breadcrumb>
      {/* The Dock has one type scale and the trail is in it. `BreadcrumbList`
          defaults to `text-sm`, which is a page's scale: the crumb inside it
          drew its own 13px and took its line height from the list, so the
          Open Spaces menu came out a pixel shorter than every other named control.
          `compact` is the 13px the rest of the surface is at. */}
      <BreadcrumbList size="compact" className="command-dock__trail-list">
        {parent === null ? null : (
          <BreadcrumbItem className="command-dock__crumb">
            <BreadcrumbLink
              // A `ToolbarButton`, because the Dock is one `Toolbar` now: a
              // plain `Button` in here is a control the roving tabindex does not
              // know about, so it takes a tab stop of its own and the bar stops
              // being one. `BreadcrumbLink` renders whatever it is given —
              // that is what the component is for — and the two buttons draw
              // identically, `ToolbarButton` being this same `Button`.
              render={
                <ToolbarButton
                  // **The step back is a shared variant and not a rule here.**
                  // The parent recedes below the bar's own tone so the two rows
                  // read as a place and the volume it sits inside, and that is
                  // a Button's ink: declared over this class, it made an
                  // application stylesheet a second owner of the shared
                  // recipe's appearance, and won only by being loaded later.
                  variant="receded"
                  size="compact"
                  className="command-dock__crumb nokey"
                  aria-label={`Go to ${parent.title}`}
                  title={`Go to ${parent.title}`}
                  onClick={() => space.onSwitchTo(parent.spaceId)}
                />
              }
            >
              {/* A name and never an editor. A Space is renamed from inside it;
                  this one is somewhere you are not, so the one thing it offers
                  is going there. */}
              <ParentIcon />
              <CommandName>{parent.title}</CommandName>
            </BreadcrumbLink>
          </BreadcrumbItem>
        )}
        {/* The grid places the list's items, so the track a row belongs in is a
            class on the `li` — and a placement class of its own, not the name
            control's borrowed. At the root the Open Spaces menu carries the word and
            stands in the name track; below it, it is a bare chevron in the
            disclosure track. */}
        {openSpacesMenu ? (
          <BreadcrumbItem
            className={parent === null ? 'command-dock__name-item' : 'command-dock__disclose'}
          >
            <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
              <DropdownMenuTrigger
                id={triggerId}
                className={
                  parent === null
                    ? `command-dock__spaces-trigger ${SET_TRIGGER.className}`
                    : 'nokey command-dock__more command-dock__disclose'
                }
                // The Dock's words, and {@link openSpacesName} is where they
                // and the reason for them live — the visible word and the
                // accessible name are one token, so the pair cannot drift.
                aria-label={openSpacesName(space.openSpaces.length, unwell)}
                title="Switch Space"
                // A `ToolbarButton` like every other control in the bar. It sits
                // in a breadcrumb rather than in a cluster, which used to mean a
                // plain `Button` — Base UI's toolbar button throws outside a
                // `Toolbar.Root`, and each cluster was its own root. The Dock is
                // one root now, so this is inside it and takes no tab stop of
                // its own.
                render={
                  <ToolbarButton
                    variant="ghost"
                    size={parent === null ? SET_TRIGGER.size : 'icon'}
                  />
                }
              >
                {/* **At the root the chevron says what it discloses**, and it
                    says it the way Things does — the same `SetTrigger`, so the
                    two cannot space themselves differently. Below the root the
                    parent's name stands beside the chevron and the pair reads
                    as a place and a way out of it; at the top there is no
                    parent, and a bare chevron left the region opening with a
                    mark that names nothing.

                    No glyph. The Space glyph is the one mark this region has
                    just decided cannot sit beside the Space you are in, and
                    "Spaces" is a set rather than one of them. */}
                {parent === null ? <SetTrigger>{SPACES_LABEL}</SetTrigger> : <ChevronDownIcon />}
                {/* The same dot the unwell row carries, on the control that
                    discloses it — one treatment for one meaning, so the mark on
                    the bar and the mark in the list read as the same thing. It
                    is `aria-hidden` because the count above already says it;
                    two announcements of one state is the `title`-beside-`sr-only`
                    duplication the row below was fixed for. */}
                {unwell === 0 ? null : (
                  <span className="command-dock__unwell" data-unwell aria-hidden="true" />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={DISCLOSURE_ALIGN}
                side={side}
                sideOffset={DISCLOSURE_SIDE_OFFSET}
                className={`nokey ${DISCLOSURE_WIDTH}`}
              >
                {/* A radio group, as Diagram and Graph both use, because this is
                    the same question those ask: which of a set is the one you
                    are looking at. What differs is only that the set is nested,
                    and the indent is the whole of that difference. */}
                <DropdownMenuRadioGroup
                  value={space.currentSpaceId}
                  onValueChange={(next) => space.onSwitchTo(next)}
                >
                  <DropdownMenuLabel>Open Spaces</DropdownMenuLabel>
                  {space.openSpaces.map((row) => {
                    const report = unwellReport(row.persistence);
                    return (
                      <SpaceItem key={row.spaceId} value={row.spaceId} closeOnClick>
                        {/* The indent is **drawn**, and there is no glyph.
                          Six Space glyphs down the left edge of a six-row menu
                          said "a Space" once and nothing the other five times,
                          while the indent — the only thing carrying structure —
                          was the quietest mark on the panel. A hairline per
                          level puts the ink where the meaning is: `Traversal`
                          and `Platform` are visibly siblings, and the row you
                          are on is three rules deep without anyone counting
                          pixels. Compared against seven other schemes, and why
                          this one won is in
                          `.scratch/command-dock/issues/01-...`. */}
                        {row.depth === 0 ? null : (
                          <span className="command-dock__guides" aria-hidden="true">
                            {Array.from({ length: row.depth }, (_, level) => (
                              <span key={level} className="command-dock__guide" />
                            ))}
                          </span>
                        )}
                        {row.title}
                        {/* **The regression `OpenSpaces` did not have.** The
                          vertical tab strip this Open Spaces menu replaced —
                          deleted since, by
                          `.scratch/command-dock/issues/08` — drew a badge
                          per open Space for `conflicted`, `failed` and
                          `rejected`; a list that says nothing makes a Space
                          whose commit conflicted while the reader was elsewhere
                          look exactly like one that is fine.

                          A dot and not a word: the row's job is to be picked,
                          and the sentence explaining a failure belongs to the
                          surface that offers the recovery — which is the Space's
                          own Dock, once you are in it. What the row owes is only
                          *which one*, and it says that to a screen reader too
                          rather than in colour alone. */}
                        {report === null ? null : (
                          <span className="command-dock__unwell" data-state={row.persistence.kind}>
                            {/* The `sr-only` span is the whole announcement. A
                              native `title` beside it said the same sentence a
                              second time — announced twice by a screen reader,
                              and reachable by neither keyboard nor touch. If
                              this mark ever earns a pointer affordance it is
                              `Tooltip`'s, which `@project/ui` exports; a bare
                              `title` is a second, unstyled tooltip layer. */}
                            <span className="sr-only">{report}</span>
                          </span>
                        )}
                      </SpaceItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * `[↰ Parent] [⌄] │ [⬡ Rendering ⌄]` — where you came from, and where you are.
 *
 * Three shapes and nothing else, decided by how many Spaces are open:
 *
 *   one    `[⬡ Space ⌄]`                  — the root, or a session that has not crossed
 *   two    `[↰ Parent] │ [⬡ Space ⌄]`     — the parent names everything else there is
 *   many   `[↰ Parent] [⌄] │ [⬡ Space ⌄]` — and the rest are in the Open Spaces menu
 *
 * Two parts, and the split is the arrangement. The **parent** is one step back,
 * marked with a direction rather than the Space glyph because both are Spaces
 * and only their position differs, and the `⌄` beside it switches among every
 * open Space (`ParentSpace` above).
 * The **cluster** is the Space you are in — a Diagram or Graph cluster in every
 * respect: a named disclosure, and Rename a command in that list.
 *
 * **The Spaces inside this one are not in either.** They are Space Things, so
 * they are in the Things list with every other Thing — as Things, with nothing on
 * the row that goes into one. That is the difference the two surfaces keep: the Open Spaces menu
 * lists the Spaces already **open**, and the Things list holds Things. At the top
 * — the Meta Space — that list is every Space there is, which is the "All
 * Spaces" every comparable tool builds a separate screen for.
 *
 * **Only the Space you are in is authorable.** The parent step draws a name and
 * never an editor: a Space is renamed from inside it, and two equally weighted
 * editable names would say you are in both.
 *
 * **Three things this removed rather than added.** There is no Exit button on
 * the bar — Exit is in the Space menu — no
 * separate list of open Spaces beside a trail of ancestors, and no tooltip
 * carrying depth — the Open Spaces menu's indent carries it. The Sidebar's tab strip
 * (`OpenSpaces`, deleted by `.scratch/command-dock/issues/08`) is not carried
 * over as a strip, but this is what it modelled: the *set* of open Spaces. What
 * it could not model is the crossing, and the parent step is that.
 *
 * **What depth costs is width, and the two parts are how it is paid.** Only one
 * step is ever a word, so a fourth crossing costs nothing at all on the bar; and
 * in a vertical dock, where width is the scarce axis, the parent takes a line
 * of its own above the cluster instead of running along beside it.
 */
function SpacesControl({
  space,
  side = 'bottom',
  vertical = false,
}: {
  readonly space: DockSpace;
  readonly side?: MenuSide;
  readonly vertical?: boolean;
}) {
  return (
    /* Two parts rather than one group, because they are two things: the way
       back with the Open Spaces menu on it, and the commands on the Space you are in.
       The split is what lets the vertical dock put them on separate lines, and
       it costs no tab stop — the toolbar root is the Dock's, so both parts'
       controls are items in the one roving order. */
    <div className="command-dock__space">
      <ParentSpace space={space} side={side} />
      {/* Whenever the region above drew anything — the parent, the Open Spaces menu, or
          both. At the root there is no parent and the Open Spaces menu carries the word
          "Spaces", which is a cluster like any other and wants the line beside
          it; in a session that has never crossed there is neither, and a line
          would divide the Space cluster from nothing. */}
      {space.parent === null && space.openSpaces.length <= 1 ? null : (
        <Divider orientation={vertical ? 'horizontal' : 'vertical'} />
      )}
      <ToolbarGroup aria-label="Space" className="command-dock__cluster">
        <IdentitySurface
          icon={<ThingKindIcon kind="space" />}
          kind="Space"
          testId="space-title"
          title={space.title}
          triggerTitle="Space commands"
          onRename={space.onRename}
        >
          {(disclosure) => <SpaceMenu space={space} side={side} disclosure={disclosure} />}
        </IdentitySurface>
      </ToolbarGroup>
      {/* Outside the menu that spends it: the menu closes on the press, and a
          dialog mounted inside its content would go with it. */}
      <ExitReport space={space} />
    </div>
  );
}

/* ---------------------------------------------------------------- docking */

/**
 * How far each edge holds the dock off.
 *
 * The bottom is not the same as the others and this asymmetry is the point:
 * the macOS Dock, its reveal strip and the window resize handle all live in the
 * last few dozen pixels, and the OS takes the pointer before the page does.
 */
const EDGE_INSET = {
  top: 16,
  right: 16,
  bottom: 44,
  left: 16,
} satisfies Record<DockEdge, number>;

/** A menu opens into the canvas, never off the edge the dock is against. */
const MENU_SIDE = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
} satisfies Record<DockEdge, MenuSide>;

/**
 * The twelve slots, as something other than a drag can offer them.
 *
 * **A drag cannot be the only way to move the Dock**, on two independent
 * grounds that happen to have one answer. It is not reachable from a keyboard
 * at all — the grip was a `button` carrying four pointer handlers and no
 * `onKeyDown`, so the Dock's own position was the one command in the surface a
 * keyboard could not reach. And it is not reachable from a test either: a
 * synthetic pointer sequence carries no pointer capture, and stubbing capture
 * to force one freezes the renderer, which is the whole reason `DockedLeft`
 * exists as a second story rather than as an assertion inside the first.
 *
 * So the grip discloses the set, and the drag becomes the shortcut rather than
 * the mechanism. That is the ordinary reading of a grip on a movable panel, and
 * it costs nothing the drag was providing.
 *
 * **Twelve rows in four labelled groups, and not eight.** The eight *targets* —
 * four corners and four edge-middles — are what the geometry offers a pointer,
 * because a corner is one place two edges both reach. A menu is not a place,
 * and a reader choosing from it is choosing the two things the drag chooses
 * separately: the edge, which decides the orientation, and the stop along it.
 * Collapsing them to eight would make the two corners that carry an orientation
 * choice indistinguishable from the two that do not.
 */
const EDGE_LABEL = {
  top: 'Top edge',
  right: 'Right edge',
  bottom: 'Bottom edge',
  left: 'Left edge',
} satisfies Record<DockEdge, string>;

/**
 * A stop is named for the direction its edge runs, not for the enum.
 *
 * `start` of the top edge is the left of the screen and `start` of the left
 * edge is the top of it, and a reader picking a slot is picking a place rather
 * than a coordinate. One name for both would have to be the enum's, which names
 * neither.
 */
const ALONG_LABEL = {
  horizontal: { start: 'Left', center: 'Centre', end: 'Right' },
  vertical: { start: 'Top', center: 'Middle', end: 'Bottom' },
} satisfies Record<DockOrientation, Record<DockAlong, string>>;

/** Where the Dock is, said the way the grip's label says it. */
const slotLabel = (position: DockPosition): string =>
  `${EDGE_LABEL[position.edge]}, ${ALONG_LABEL[orientationOf(position.edge)][position.along].toLowerCase()}`;

/**
 * The slot a release lands in: an edge, then a stop along it.
 *
 * Two independent questions rather than one list of eight, because the edge is
 * what decides the dock's orientation and which way its menus open, and the
 * stop only decides where along that edge it sits. Asking them separately is
 * also what makes a corner reachable from either side with a different
 * orientation, which a flat list of eight positions could not express.
 */
const nearestSlot = (bounds: DockBox, box: DockBox): DockPosition => {
  const edge = nearestEdge(bounds, box);
  return { edge, along: nearestAlong(bounds, box, edge) };
};

/**
 * The two insets a docked position spends: one holding it off its own edge, one
 * holding it off the edge it is aligned to at a corner.
 *
 * `center` is the only stop that translates, because it is the only one
 * positioned by its own midpoint. `start` and `end` are pinned to a corner, and
 * a translate there would hang the dock half off the container — which is what
 * a single centred rule did when every stop was a fraction.
 */
const alongStyle = (edge: DockEdge, along: DockAlong): CSSProperties => {
  const cross = EDGE_INSET[edge === 'bottom' ? 'top' : edge === 'right' ? 'left' : edge];
  if (orientationOf(edge) === 'horizontal') {
    if (along === 'start') return { left: cross };
    if (along === 'end') return { right: cross };
    return { left: '50%', transform: 'translateX(-50%)' };
  }
  if (along === 'start') return { top: cross };
  if (along === 'end') return { bottom: EDGE_INSET.bottom };
  return { top: '50%', transform: 'translateY(-50%)' };
};

const dockStyle = ({ edge, along }: DockPosition): CSSProperties => {
  const inset = EDGE_INSET[edge];
  const anchor =
    edge === 'top'
      ? { top: inset }
      : edge === 'bottom'
        ? { bottom: inset }
        : edge === 'left'
          ? { left: inset }
          : { right: inset };
  return { ...anchor, ...alongStyle(edge, along) };
};

/**
 * How far a press travels before it stops being a click.
 *
 * Without it every press on the grip is a drag of zero pixels, and a reader who
 * clicks the grip with an unsteady hand redocks the surface instead of opening
 * the slots. Four pixels is what a browser's own click tolerance is worth.
 */
const DRAG_THRESHOLD = 4;

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
 * Things panel, while the list surface was still under comparison — be the same
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
      Math.abs(event.clientX - held.fromX) <= DRAG_THRESHOLD &&
      Math.abs(event.clientY - held.fromY) <= DRAG_THRESHOLD
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
                        {ALONG_LABEL[orientationOf(edge)][along]}
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
 * proposal, and it is the one thing here a reviewer should push back on if
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
  const decision = state.kind === 'conflicted' || state.kind === 'rejected';

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
    // reader: Add Diagram makes an empty Diagram, and the Things are what fills it.
    // Seeded here so a Space opened into a new Diagram draws the list on its
    // first frame rather than one after it.
    (chrome.things.list.disclose ?? null) === null ? null : THINGS_DISCLOSURE_ID,
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
          {/* Space | Diagram Graph | Things.
            The three selections first, then the inventory. Which Space, which
            Diagram and which Graph are one question asked three times — each names
            the current one, discloses the set, and promotes at most one verb — and
            Diagram and Graph are divided like the rest. They used to run together
            on the grounds that a Graph is authored over a Diagram and so they are
            one region — which stopped being legible the moment Present moved to
            the head of the Graph cluster: an unseparated `[Collection 1 ⌄][▶ Long
            ⌄]` reads as a Present belonging to the Diagram beside it. The
            containment is still true and the order still says it; the rule no
            longer has to be carried by an absent line.
            Things comes last because it is the odd cluster and should read as one:
            it names a set rather than a selection, so it has no name to edit and
            nothing to promote but Create. Between Diagram and Space it looked like
            a fourth selection that had lost its name. */}
          {/* One open-id under the whole row, spent by every disclosure through
            `useDockDisclosure` — that, and not a convention each control keeps,
            is what makes at most one open. The hook says why the `Menubar` this
            obviously wants cannot be used inside Toolbars. */}
          <SpacesControl space={chrome.space} side={side} vertical={vertical} />
          <Divider orientation={divider} />
          <DiagramControls canvas={chrome.canvas} side={side} />
          <Divider orientation={divider} />
          <GraphControls
            graph={chrome.graph}
            diagramTitle={chrome.canvas.selected.title}
            side={side}
            vertical={vertical}
          />
          <Divider orientation={divider} />
          <ThingsControl things={chrome.things} side={side} />
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
 * Drag a Thing out of the Things popover onto the canvas, or press the row where
 * it stands. Both are real and both are the same Edit: the Thing joins the
 * Diagram and the popover stays open, so the next one costs nothing either way.
 */
