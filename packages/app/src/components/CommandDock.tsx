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
 *   Layouts — which is drawing, select another, add/rename/delete
 *   Graphs  — which is active, select another, present, add/rename/delete
 *   Cards   — Create, and the Cards this Space holds
 *
 * **A Card's own commands are absent on purpose.** Open, Edit, Delete, a Card's
 * links and taking a Card back out of a Layout belong to the Card rail (ADR
 * 0073), which draws them on the Card itself. This surface is *about* the
 * canvas; a Card is the literal object on it. That is a dependency and not just
 * an exclusion — the Space Sidebar carried a Card's links and its Delete in a
 * footer, and this arrangement is only complete because the rail carries them
 * now.
 *
 * **A Space is a Space Card, held by the Meta Space above it.** So the Spaces
 * *inside* a Space are Cards in it and the Cards surface already offers them,
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
  CardKindIcon,
  cardKindName,
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
  FALLBACK_GRAPH_COLOR,
  GraphIcon,
  InlineTitleEditor,
  LayoutIcon,
  ParentIcon,
  PlusIcon,
  PresentIcon,
  Separator,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
} from '@project/ui';
import type { Graph, GraphId, Layout, LayoutId, UUID } from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import type { StoredSpaceRefusal } from '../space-authoring';
import { PersistenceControl, PersistenceNotice } from './PersistenceControl';
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
  unwellReport,
  type DockAlong,
  type DockBox,
  type DockEdge,
  type DockOrientation,
  type DockPosition,
  type ExitOutcome,
  type OpenRow,
  type SpaceStep,
} from '../dock-model';
import { SET_TRIGGER } from './command-dock-triggers';
import './command-dock.css';

/**
 * The palette a Graph's colour is chosen from, named.
 *
 * `GRAPH_PALETTE` is the application's own — the same six values authoring
 * rotates through when it mints a Graph — so the menu cannot offer a colour the
 * canvas would not draw. The names are this module's, because a swatch with no
 * word beside it is a colour a reader cannot ask anyone else for.
 */
const GRAPH_COLOR_NAMES = ['Blue', 'Amber', 'Green', 'Pink', 'Purple', 'Red'] as const;

const GRAPH_COLORS: readonly (readonly [string, string])[] = GRAPH_PALETTE.map(
  (color, index): readonly [string, string] => [GRAPH_COLOR_NAMES[index] ?? color, color],
);

/** The three kinds Create offers, in the order the menu lists them. */
const CARD_KINDS = ['markdown', 'space', 'alias'] as const;

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

/* ------------------------------------------------------------------ state */

/**
 * **What the Dock is given, in the groups the surface it replaced was given
 * them in.**
 *
 * It was one flat `Chrome` of thirty-three members, threaded whole into ten
 * components — so `PresentingExit`, which reads four of them, was declared to
 * take every command in the surface, and no signature in the file said what any
 * component actually used. `SpaceSidebar` did not do that: it took `canvas`,
 * `graph`, `addCard`, `createLayout`, `persistence`, `selectedCard`,
 * `entityActions` and `titleEdit`, and each of its own pieces took the group it
 * drew.
 *
 * The groups here are named after it wherever there is a counterpart —
 * `canvas` is the Layouts and the one that is drawing, `graph` is the Graphs
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
   * `InlineTitleEditor` and the open/closed state is the name control's own —
   * which is the whole reason the shared draft the Sidebar needed is gone. But
   * the *application* still has to know one is running: a live chrome rename
   * withdraws Create Card, Present, Delete Card and the canvas's own title
   * editing, because each of those would re-derive the canvas or take the
   * caret from under it (`authoring-availability.ts`).
   *
   * So the text, the refusal and the focus return stay in the component and only
   * the fact crosses the seam. It is `DockChrome`'s rather than `canvas`'s or
   * `graph`'s because there is one answer for the bar: two fields would let a
   * Layout rename and a Graph rename disagree about whether a rename is running.
   */
  readonly onRenamingChange: (renaming: boolean) => void;
  readonly space: DockSpace;
  readonly canvas: DockCanvas;
  readonly graph: DockGraph;
  readonly cards: DockCards;
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
  /** This Space's name — a Space Card's title, seen from inside it. */
  readonly title: string;
  /** Which Space the Dock is in, which is what the Open Spaces menu marks. */
  readonly currentSpaceId: UUID;
  /** The Space this one was entered from, and the only step the bar names. Null at the root. */
  readonly parent: SpaceStep | null;
  /** Every open Space, depth-first from the root — what the Open Spaces menu lists. */
  readonly openSpaces: readonly OpenRow[];
  /**
   * Rename this Space, or `null` while the product has no such Edit.
   *
   * **Null in the application today, and that is a fact rather than a gap this
   * surface can close.** Space Authoring's completion union has
   * `renamed-layout` and `renamed-graph` and no `renamed-space`: a Space's title
   * lives on the stored document, and a Space is named from outside by the Space
   * Card that references it (ADR 0074), so what a rename from *inside* does to
   * that Card is a domain question rather than a control this component can
   * answer by drawing a field. Until it is answered, the name is a label.
   *
   * Nullable rather than optional so both callers state it: the catalogue
   * fixture passes the same `null` the application does, which is what keeps the
   * story parity evidence instead of a surface showing a command production has
   * not got.
   */
  readonly onRename: ((title: string) => string | null) | null;
  /** Copy this Space's own address — the one link a Space offers (`entity-actions.tsx`). */
  readonly onCopyLink: () => void;
  /**
   * Create a Space, which is Create Card → Space.
   *
   * It sits in the Space menu against that rule, and it is the one item in the
   * Dock that has not been reconciled: the arrangement asked for a way to make a
   * Space from the Space you are in, and Create Card offers the same command one
   * cluster along. Both spend the same operation, so the duplication is a second
   * path rather than a second behaviour.
   */
  readonly onNewSpace: () => void;
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
   * agree while the reader arrived by pressing Space Cards, which is what hid
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
 * The canvas's one exclusive choice: which authored Layout is drawing (ADR
 * 0079, ADR 0082).
 *
 * Named `canvas` after the group the Space Sidebar carried for the same thing,
 * and carrying `selected` as the Layout rather than as an id for the same reason
 * that one did — the title belongs to the Layout, so a cluster naming what is
 * drawing reads it off the Layout instead of deriving a second title.
 */
export interface DockCanvas {
  /** The Space's authored Layouts, in the order it declares them. */
  readonly layouts: readonly Layout[];
  /** The Layout that is drawing. */
  readonly selected: Layout;
  readonly onSelect: (layoutId: LayoutId) => void;
  /** Absent while no chrome rename may begin — {@link DockSpace.onRename}'s second arm. */
  readonly onRename: ((layoutId: LayoutId, title: string) => string | null) | null;
  readonly onCreate: () => void;
  /**
   * Whether New Layout may run.
   *
   * Its own term beyond Create Card's: creating a Layout **selects** it, and the
   * created Layout is empty — so the canvas re-derives with no nodes and a Card
   * holding a live title draft unmounts, taking the draft, the announced reason
   * and the caret with it. A valid draft is safe, because pressing the control
   * blurs the input and a valid blur completes the Title (ADR 0065); a refused
   * one is re-focused instead and the press lands anyway.
   */
  readonly createDisabled: boolean;
  readonly onDelete: (layoutId: LayoutId) => void;
  /**
   * Whether Delete Layout may run, beyond the rule the row already knows.
   *
   * The last Layout cannot be deleted (ADR 0079) and the surface reads that off
   * `layouts` itself — but that is one of *two* rules, and the second is not
   * derivable here: every entity Edit is withdrawn while a title editor or a
   * live content edit owns the caret (`authoring-availability.ts`). The command
   * this row dispatches does not exist in that state, so a row that read only
   * the ADR rule pressed cleanly, ran nothing, and reported nothing.
   */
  readonly deleteDisabled: boolean;
  /**
   * Copy the drawing Layout's address — the one form a Layout has.
   *
   * A Layout offers no permanent link because it has no second address to be
   * permanent *against*: its own address is the only one there is
   * (`entity-actions.tsx`), where a Graph and a Card each have a within-Layout
   * form as well.
   */
  readonly onCopyLink: () => void;
}

/** The Graphs the selected Layout owns, the Active one, and Present. */
export interface DockGraph {
  /** The Graphs the selected Layout owns, which are the only ones it draws. */
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
   * this one, read off `graphs` here; the Layout cluster splits create from
   * delete because creating a Layout **selects** it and so has a second reason
   * of its own, which no Graph command has.
   */
  readonly editsDisabled: boolean;
  /**
   * The two addresses a Graph always has, and why both are offered.
   *
   * A Layout **owns** its Graphs (ADR 0040), so a Graph always has a
   * within-Layout address as well as its own. "Copy link" reproduces what is on
   * screen — this Graph inside this Layout, so a recipient lands where the
   * sender was — and "Copy permanent link" is the Graph's own address, which
   * survives the sender's Layout being renamed, redrawn or deleted.
   */
  readonly onCopyLink: () => void;
  readonly onCopyPermanentLink: () => void;
  readonly presenting: boolean;
  readonly onPresent: () => void;
  /**
   * Whether Present may begin a traversal.
   *
   * An empty Graph is legal and ordinary — creating a Layout mints one — and it
   * has nothing to traverse, so `present()` would return having changed nothing
   * and an enabled control would swallow the press. Unavailable rather than
   * absent: a control that disappears teaches nothing about why.
   */
  readonly presentDisabled: boolean;
}

export interface DockCards {
  /**
   * The Cards surface itself — its trigger and its panel, supplied whole.
   *
   * **A slot rather than a list, because there is one Cards surface and it is
   * not this one's.** The prototype drew its own filtered popover here and it
   * was compared against a Drawer and a second dock at the scale that separates
   * them; the Popover won that comparison. What settled it the other way is that
   * the application already had `CardsDrawer` — a production surface with its
   * own stable story, its own behaviour tests and seven parity claims — and two
   * surfaces offering "add an existing Card to this Layout" is the second place
   * commands live that ADR 0082 rules out. So the Dock offers the *way* to the
   * Cards and the drawer is what it opens; re-deciding which of the two the
   * product wants is a promotion of its own rather than a side effect of this
   * one.
   *
   * The caller supplies trigger and panel together because they are one
   * component: a toggle whose `disabled` and whose surface are decided in two
   * places is a toggle that comes to disagree with what it names. It draws in
   * the Dock's own name slot through {@link CARDS_TRIGGER} and
   * {@link CardsTrigger}, so it lands in the column the other three names land
   * in, whichever edge the dock is on.
   */
  readonly surface: ReactNode;
  /**
   * Create a Card of one kind — the one command about the *set*.
   *
   * The kind is chosen at creation, so the menu offers three peers rather than a
   * split button with a hidden default. This is *Create*, distinct from adding
   * an existing Card, which is what the surface above is for.
   */
  readonly onCreate: (kind: (typeof CARD_KINDS)[number]) => void;
  /** Whether creating is available at all — presenting and an open pane both withdraw it. */
  readonly createDisabled: boolean;
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
  return (
    <span className="command-dock__ident">
      <span className="command-dock__ident-text">{children}</span>
    </span>
  );
}

/**
 * The Space, Layout or Graph name, renamed in place by clicking it.
 *
 * This is `InlineTitleEditor` — the component Cards and the Space Sidebar
 * already rename through — in its `header` variant, which exists for named
 * chrome rather than a Card's own title. Reusing it buys the whole edit
 * lifecycle a hand-rolled rename would otherwise fake and get wrong: select on entry,
 * Enter and blur complete, Escape cancels, focus returns to the control, and a
 * refused draft stays open and editable.
 *
 * The refusal is real rather than decorative. A rename control that cannot
 * refuse is not the control the product needs, and an empty name is the one
 * refusal every one of these entities already has.
 *
 * The name is a `ToolbarButton` at rest, so the thing you click to rename and
 * the controls beside it are one treatment. The editor replaces it rather than
 * expanding inside it, which is also what makes renaming reachable in the
 * vertical icon dock: the label collapses there, the editor does not.
 */
function IdentityName({
  icon,
  kind,
  title,
  testId,
  subject,
  onRename,
}: {
  readonly icon: ReactNode;
  readonly kind: 'Space' | 'Layout' | 'Graph';
  readonly title: string;
  /**
   * What a behaviour test addresses this identity by.
   *
   * The three identities are one component drawn three times, so an accessible
   * name is the only thing distinguishing them — and a test that reached for
   * `Rename Layout: Collection 1` would have to know the title to find the
   * control that names it, which is the assertion inverted. The id names the
   * slot; the text in it is what is under test.
   */
  readonly testId: string;
  /**
   * Which thing this name is naming, so a rename cannot outlive its subject.
   *
   * The editor is seeded from `title` and its open state is this component's, so
   * a Layout or Graph changing underneath a live rename would leave the caret in
   * a field editing something the reader has already left — a Back onto another
   * Layout is exactly that, and it moves the whole cluster without unmounting
   * it. Read as a render-time transition rather than an effect, because an
   * effect would let one render draw the stale editor first.
   */
  readonly subject: string;
  /** Absent for an entity the product cannot rename — see {@link DockSpace.onRename}. */
  readonly onRename: ((title: string) => string | null) | null;
}) {
  const [editing, setEditing] = useState(false);
  const [renaming, setRenamingSubject] = useState(subject);
  const reportRenaming = useContext(DockRenamingContext);
  if (renaming !== subject) {
    setRenamingSubject(subject);
    if (editing) setEditing(false);
  }

  /**
   * **The App is told from an effect, never from this render.**
   *
   * `reportRenaming` is the App's own `setEditingChromeTitle`, and the subject
   * transition above runs in the render body — so calling it there wrote a
   * *parent's* state while a child rendered, which React reports out loud and
   * which under concurrent rendering can fire for a render that is thrown away.
   * The transition keeps its own state and the notification follows the commit.
   *
   * `live` rather than `editing`, and silent while it is false, for two reasons
   * that are one rule: three identities share this one flag, so an instance
   * that is *not* renaming must never write it, and an editor whose rename
   * stops being available renders as a static label with `editing` still true —
   * a state in which no rename is live and the App must not think one is. The
   * cleanup covers the third case, an unmount mid-rename, which otherwise left
   * the flag stuck true with nothing able to clear it.
   */
  const live = editing && onRename !== null;
  useEffect(() => {
    if (!live) return undefined;
    reportRenaming(true);
    return () => reportRenaming(false);
  }, [live, reportRenaming]);

  /**
   * **Where the caret goes when the editor closes.**
   *
   * The editor replaces this control rather than expanding inside it, so ending
   * a rename unmounts the element holding the caret and it falls to
   * `document.body` unless something puts it back. The Sidebar had a
   * continuation for this because the rename could be *begun* from either of
   * two surfaces and had to return to whichever began it; here there is one
   * name and it is right there, so a ref is the whole of it.
   *
   * Only the editor's own three exits spend this. The subject transition above
   * ends a rename too, and it must not — the reader moved to another Layout
   * from the menu beside this name, and pulling the caret onto the name they
   * just moved away from is taking focus, not returning it.
   */
  const nameRef = useRef<HTMLButtonElement>(null);
  /**
   * A ref rather than state, because it decides nothing that is rendered — it
   * is a note from the press to the commit that follows it, and holding it in
   * state would set state from inside the effect that reads it.
   */
  const returningFocus = useRef(false);
  const endRename = (): void => {
    returningFocus.current = true;
    setEditing(false);
  };
  useEffect(() => {
    if (editing || !returningFocus.current) return;
    returningFocus.current = false;
    nameRef.current?.focus();
  }, [editing]);

  /**
   * A name with no rename behind it is a **label**, not a disabled button.
   *
   * A control that is present and unavailable teaches that the command exists
   * and is out of reach now, which is right for Delete on the last Layout. This
   * is the other case: the product has no such Edit at all, so a greyed-out
   * name would be advertising a command nobody can ever run. It keeps the
   * treatment and the `testId` either way, so the surface reads the same and a
   * behaviour test addresses the same slot.
   */
  if (onRename === null) {
    return (
      <span className="command-dock__name command-dock__name--static" data-testid={testId}>
        {icon}
        <IdentityLabel>{title}</IdentityLabel>
      </span>
    );
  }

  if (editing) {
    return (
      <InlineTitleEditor
        variant="header"
        className="command-dock__name-editor"
        title={title}
        label={`${kind} name`}
        onComplete={(next) => {
          const named = next.trim();
          if (named === '') return `A ${kind} needs a name.`;
          // **The Edit's answer, not the press.** A rename can be refused for
          // more than a blank name — a Layout that has stopped drawing, a title
          // Authoring will not take — and `InlineTitleEditor` holds a refused
          // draft open and editable for exactly that. Closing on the press
          // instead would drop the author's words on the floor and leave the
          // stored title unchanged with nothing said.
          const refusal = onRename(named);
          if (refusal !== null) return refusal;
          endRename();
          return null;
        }}
        onCancel={endRename}
        onReturnFocus={endRename}
      />
    );
  }

  return (
    <ToolbarButton
      variant="ghost"
      size="compact"
      ref={nameRef}
      className="command-dock__name"
      data-testid={testId}
      aria-label={`Rename ${kind}: ${title}`}
      title={`Rename ${kind}`}
      onClick={() => setEditing(true)}
    >
      {icon}
      <IdentityLabel>{title}</IdentityLabel>
    </ToolbarButton>
  );
}

/**
 * Layout: `[name][v]`. Graph: `[name][v][>]`.
 *
 * Each is one named `ToolbarGroup` inside the Dock's single `Toolbar` — ADR
 * 0073's pair, the same one a Card rail is built from — so the controls share a
 * box treatment with the rail, the whole bar is one tab stop, and the arrows
 * cross a group boundary exactly as they cross any other gap. What the grouping
 * says is that these are commands *on* one named thing, which is exactly what a
 * rail says about a Card.
 *
 * Only Rename left the menu, because the name is right there and clicking a
 * name to change it needs no menu at all. Everything else stays behind the
 * chevron — including New, which is a command about the *set* rather than
 * about the named thing the cluster is showing, and so belongs with the list
 * of that set rather than beside its current member. Present is the exception
 * on the Graph side: it acts on the Active Graph the cluster is naming.
 */
function LayoutControls({
  canvas,
  side = 'bottom',
}: {
  readonly canvas: DockCanvas;
  readonly side?: MenuSide;
}) {
  const { id: triggerId, open, onOpenChange } = useDockDisclosure();
  return (
    <ToolbarGroup aria-label="Layout" className="command-dock__cluster">
      <IdentityName
        icon={<LayoutIcon />}
        kind="Layout"
        testId="selected-canvas"
        subject={canvas.selected.id}
        title={canvas.selected.title}
        onRename={
          canvas.onRename === null
            ? null
            : (title) => canvas.onRename?.(canvas.selected.id, title) ?? null
        }
      />
      <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
        <DropdownMenuTrigger
          id={triggerId}
          className="nokey command-dock__disclose"
          aria-label={`Layout: ${canvas.selected.title}`}
          title="Switch Layout"
          render={<ToolbarButton variant="ghost" size="icon" />}
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={DISCLOSURE_ALIGN}
          side={side}
          sideOffset={DISCLOSURE_SIDE_OFFSET}
          className={`nokey ${DISCLOSURE_WIDTH}`}
        >
          <DropdownMenuRadioGroup
            value={canvas.selected.id}
            onValueChange={(next) => canvas.onSelect(next)}
          >
            <DropdownMenuLabel>Layouts</DropdownMenuLabel>
            {canvas.layouts.map((layout) => (
              <DropdownMenuRadioItem key={layout.id} value={layout.id} closeOnClick>
                {layout.title}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {/* The same order the Spaces popover pins below its scroll: the set
              first, then the commands on the one it is naming. A Layout list is
              short enough that nothing scrolls, so the end of the list and the
              pinned position are the same place — which is why one rule covers
              both and neither has to know which case it is. */}
          <DropdownMenuGroup>
            <DropdownMenuItem
              className="gap-2"
              disabled={canvas.createDisabled}
              onClick={canvas.onCreate}
            >
              <PlusIcon />
              New Layout
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={canvas.onCopyLink}>
              <CopyIcon />
              Copy link
            </DropdownMenuItem>
            {/* The last Layout cannot be deleted (ADR 0079), so the command is
                present and unavailable rather than absent — a control that
                disappears teaches nothing about why. */}
            {/* Delete is destructive and sits behind its own rule, away from
                the commands above it — the same separation the menu already
                makes between the list and the commands. */}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="gap-2"
              disabled={canvas.deleteDisabled || canvas.layouts.length <= 1}
              onClick={() => canvas.onDelete(canvas.selected.id)}
            >
              <DeleteIcon />
              Delete {canvas.selected.title}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ToolbarGroup>
  );
}

/**
 * Graph, carrying the colour that identifies it on the canvas and the one
 * command that is a Graph's alone: Present traverses the Active Graph.
 */
function GraphControls({
  graph,
  layoutTitle,
  side = 'bottom',
  vertical = false,
}: {
  readonly graph: DockGraph;
  /** Only to caption the list: the Graphs a menu offers are the ones this Layout owns. */
  readonly layoutTitle: string;
  readonly side?: MenuSide;
  readonly vertical?: boolean;
}) {
  const { id: triggerId, open, onOpenChange } = useDockDisclosure();
  /**
   * **Present leads along a row and trails down a column**, and this is the one
   * thing in the Dock the edge reorders.
   *
   * Along a row it leads: it acts on the named thing the cluster is showing, so
   * it sits at the edge the eye enters from, ahead of the name it acts on.
   *
   * Down a column it cannot, because a column pays for it differently. A
   * leading verb needs a track of its own on *every* row — three of the four
   * rows have no verb, and the 28px sits empty on each — and Cards' Create
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
          says which *kind* of thing the colour belongs to, and it is
          `@project/ui`'s own `GraphIcon` rather than a mark this module
          invents. */}
      <IdentityName
        icon={<GraphIcon color={graph.activeColor} size={14} />}
        kind="Graph"
        testId="active-graph"
        subject={graph.active.id}
        title={graph.active.title}
        onRename={
          graph.onRename === null
            ? null
            : (title) => graph.onRename?.(graph.active.id, title) ?? null
        }
      />
      <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
        <DropdownMenuTrigger
          id={triggerId}
          className="nokey command-dock__disclose"
          aria-label={`Active Graph: ${graph.active.title}`}
          title="Switch Graph"
          render={<ToolbarButton variant="ghost" size="icon" />}
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={DISCLOSURE_ALIGN}
          side={side}
          sideOffset={DISCLOSURE_SIDE_OFFSET}
          className={`nokey ${DISCLOSURE_WIDTH}`}
        >
          <DropdownMenuRadioGroup
            value={graph.active.id}
            onValueChange={(next) => graph.onActivate(next)}
          >
            <DropdownMenuLabel>Graphs in {layoutTitle}</DropdownMenuLabel>
            {graph.graphs.map((each) => {
              const color = graph.colorByGraphId[each.id] ?? FALLBACK_GRAPH_COLOR;
              return (
                <DropdownMenuRadioItem key={each.id} value={each.id} closeOnClick className="gap-2">
                  <GraphIcon color={color} size={14} />
                  {each.title}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
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
            <DropdownMenuItem
              className="gap-2"
              disabled={graph.editsDisabled}
              onClick={graph.onCreate}
            >
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
                The Card rail keeps it, being a menu on the canvas itself. */}
            {/* Both forms, always: a Layout owns its Graphs (ADR 0040), so a
                Graph always has a within-Layout address as well as its own —
                which is exactly what `spaceEntityActions` offers on a Graph.

                They are not the same address. "Copy link" reproduces *what is
                on screen*: this Graph inside this Layout, so a recipient lands
                where the sender was. "Copy permanent link" is the Graph's own
                address and always opens it in whichever Layout draws it, which
                survives the sender's Layout being renamed, redrawn or deleted.
                The second form is offered only where it differs from the first,
                which on a Graph is always — a Layout row shows one link for the
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
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {vertical ? present : null}
    </ToolbarGroup>
  );
}

/**
 * Create Card, as three commands behind one trigger, in the Cards cluster.
 *
 * The kind is chosen at creation, so the menu offers three peers rather than a
 * split button with a hidden default — and this is *Create*, distinct from
 * adding an existing Card, which is the list's drag.
 *
 * **This is the one New that stayed a control**, against the rule that put New
 * Layout and New Graph inside their menus, and it is an exception on two
 * stated grounds. Frequency: Layouts and Graphs are made rarely and Cards
 * constantly, which is the same thing that earns Present its own control on
 * the Graph cluster rather than a menu row. And shape: the other two disclose
 * a short exclusive list, so a New at the end of it costs nothing, while the
 * Cards surface is a long scrolling list you drag out of — a New pinned above
 * or below it is a second region to build and reason about, and a New inside
 * it scrolls away.
 *
 * It carries no chevron of its own. In the cluster it sits in the slot Present
 * holds on the Graph cluster — a bare glyph after the disclosure — and a
 * second chevron beside `Cards ⌄` would read as a second disclosure of the
 * same list.
 */
function CreateMenu({
  side = 'top',
  onCreate,
  disabled,
}: {
  readonly side?: MenuSide;
  readonly onCreate: (kind: (typeof CARD_KINDS)[number]) => void;
  readonly disabled: boolean;
}) {
  const { id: triggerId, open, onOpenChange } = useDockDisclosure();
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
      <DropdownMenuTrigger
        id={triggerId}
        className="nokey command-dock__set-verb"
        aria-label="Create Card"
        title="Create Card"
        // Where a cancelled creation pane puts the caret back. The pane is modal
        // and unmounts on cancel, so there is no element to have held on to —
        // the continuation names this control by address instead, and one
        // adapter resolves it (`continuation.ts`, `ChromeContinuation`).
        data-continuation-control="add-card"
        disabled={disabled}
        render={<ToolbarButton variant="ghost" size="icon" />}
      >
        <PlusIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={DISCLOSURE_ALIGN}
        side={side}
        sideOffset={DISCLOSURE_SIDE_OFFSET}
        className={`nokey ${DISCLOSURE_WIDTH}`}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Create Card</DropdownMenuLabel>
          {CARD_KINDS.map((kind) => (
            <DropdownMenuItem key={kind} className="gap-2" onClick={() => onCreate(kind)}>
              <CardKindIcon kind={kind} />
              {cardKindName(kind)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * `Cards ⌄` — the same shape as `Layout ⌄` and `Graph ⌄` beside it, and one
 * trigger whichever surface opens.
 *
 * It carries a chevron because it discloses a list, which is what the chevron
 * says next to it on the other three. What it does **not** carry is the name as
 * a control: Space, Layout and Graph name one thing each, so clicking that
 * name to rename it is the whole of `IdentityName`. "Cards" names a set, and a
 * set has no name to edit — so the word is a label inside the trigger rather
 * than a button of its own, and the cluster is one target instead of two.
 *
 * **It draws the same three parts in the same order as `IdentityName`** — an
 * icon, the title through `IdentityLabel`, then the disclosure — so the word
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

export function CardsTrigger() {
  return (
    /* The Card glyph the rows in its own list carry, not `OpenCardIcon`'s
       expand arrows: beside a Space, a Layout and a Graph's colour, the icon
       slot names what the cluster is about, and "expand" named a gesture this
       cluster does not have. */
    <SetTrigger icon={<CardKindIcon kind="markdown" />}>Cards</SetTrigger>
  );
}

/**
 * Which of the Dock's list disclosures is open, if any.
 *
 * A `Menubar` makes the Dock's *menus* exclusive, but the Cards list is a
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
 * How a name control tells the application it is being renamed.
 *
 * A context for the same reason the disclosure above is one: the fact belongs to
 * the bar rather than to any cluster, and threading a reporter through two
 * components to reach a leaf is the shape that makes the next person keep it
 * locally instead.
 */
const DockRenamingContext = createContext<(renaming: boolean) => void>(() => undefined);

/**
 * One disclosure's share of the Dock's single open slot.
 *
 * **Base UI's `Menubar` is the documented answer and it cannot be used here.**
 * It is a roving-focus container, and so is `Toolbar` — and the Dock is a
 * Toolbar because ADR 0073 makes a command cluster the component a Card rail is
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
 * cannot collide by both calling themselves "cards" and adding a control needs
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

function CardsControl({
  cards,
  side = 'bottom',
}: {
  readonly cards: DockCards;
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
    <ToolbarGroup aria-label="Cards" className="command-dock__cluster">
      {/* **The surface carries no commands, and that is the shape rather than a
          gap in it.** Cards names no one thing — a Card's own commands are the
          Card rail's (ADR 0073) and this Dock deliberately carries none — and
          its one set command, Create, is the `+` beside this trigger.
          Repeating Create inside the list as well would be the second path to
          one command that the Sidebar's own actions menu was built to remove.

          It offers Space Cards like any other Card and does nothing special
          with them: entering one is the canvas Card's gesture (ADR 0068), not a
          list's. */}
      {cards.surface}
      {/* **Trailing, where Present leads**, and the asymmetry is the point.
          Present acts on the named thing the cluster is showing — present *this
          Graph* — so it sits at the edge the eye enters from, ahead of the name
          it acts on. Create acts on the **set**: Cards names no one thing, which
          is why it has no name to edit, and a command about the set reads after
          the disclosure that lists it. `[▢ Cards ⌄][+]` is "the Cards, and add
          one"; `[+][▢ Cards ⌄]` would be a verb with no subject in front of it.

          It costs the vertical dock a fourth track — see the grid in
          `command-dock.css` — because this is the one cluster with a control on
          both sides of its name. */}
      <CreateMenu side={side} onCreate={cards.onCreate} disabled={cards.createDisabled} />
    </ToolbarGroup>
  );
}

/**
 * The Space's chevron: an ordinary menu, the same one Layout and Graph carry.
 *
 * **It used to disclose a list of Spaces and that list is gone.** A Space is a
 * Space Card, so the Spaces in this Space are Cards in it, and the surface that
 * offers Cards already offers them. Two disclosures over overlapping sets was
 * the duplication, and the one that had to go is the one whose set was a
 * subset.
 *
 * What is left is what a Layout and a Graph disclose minus the part that names
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
 * There is still no **Delete**, which a Layout and a Graph both offer: deleting
 * the Space you are standing in has nowhere to leave you, and this surface does
 * not answer that. Exit is not it — exiting discards a session's place in a
 * Space, and the Space is untouched.
 */
function SpaceMenu({
  space,
  side = 'bottom',
}: {
  readonly space: DockSpace;
  readonly side?: MenuSide;
}) {
  const { id: triggerId, open, onOpenChange } = useDockDisclosure();
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
      <DropdownMenuTrigger
        id={triggerId}
        className="nokey command-dock__disclose"
        aria-label={`Space: ${space.title}`}
        title="Space commands"
        render={<ToolbarButton variant="ghost" size="icon" />}
      >
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={DISCLOSURE_ALIGN}
        side={side}
        sideOffset={DISCLOSURE_SIDE_OFFSET}
        className={`nokey ${DISCLOSURE_WIDTH}`}
      >
        <DropdownMenuGroup>
          {/* Against the rule stated at the top of this module: creating a Space
              is Create Card → Space, so this is a second path to one command.
              Drawn because the arrangement asked for it; it is the one item
              here that has not been reconciled. */}
          <DropdownMenuItem className="gap-2" onClick={space.onNewSpace}>
            <PlusIcon />
            New Space
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={space.onCopyLink}>
            <CopyIcon />
            Copy link
          </DropdownMenuItem>
          {/* Behind its own rule, like Delete on the Layout and Graph menus:
              the commands above make something, this one takes something away.
              It is **not** destructive though, and does not draw as it — exiting
              a Space discards a session's place in it, not the Space, and
              re-entering costs one press on a Card. Meta cannot be exited, so
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
 * The word the Open Spaces menu shows, and the word it is named by.
 *
 * One token spent twice rather than two strings that agree today. Every
 * control's accessible name has to contain its visible label (WCAG 2.5.3, ADR
 * 0082), and the Open Spaces menu is the control in this surface where the two were
 * written independently and had already drifted apart. A token cannot drift: a
 * reader who renames the set renames both.
 */
const SPACES_LABEL = 'Spaces';

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
  // The trail decision, held in the model rather than in this JSX: which of the
  // parent step and the Open Spaces menu the bar draws, and when it draws neither.
  const controls = trailControls(parent, space.openSpaces);
  if (controls === 'none') return null;
  const openSpacesMenu =
    controls === 'open-spaces-menu' || controls === 'parent-and-open-spaces-menu';

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
   */
  const unwellElsewhere = space.openSpaces.filter(
    (row) => row.spaceId !== space.currentSpaceId && unwellReport(row.persistence) !== null,
  ).length;

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
                  variant="ghost"
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
              <span className="command-dock__ident-text">{parent.title}</span>
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
                // **The name is built from the visible word, not matched to
                // it.** This read `Switch Space. N open.` while the trigger
                // showed `Spaces`, so the accessible name did not contain the
                // visible label — WCAG 2.5.3, and ADR 0082's naming clause,
                // which is what speech input reaches a control by. Writing the
                // word twice and keeping the two in step is the fix that stops
                // working the first time either side is edited; sharing
                // {@link SPACES_LABEL} is the one that cannot come apart.
                // The count of unwell Spaces joins the name rather than riding
                // on the glyph alone, so the state is never colour alone and a
                // reader who never opens the menu is still told.
                aria-label={
                  unwellElsewhere === 0
                    ? `${SPACES_LABEL}. ${space.openSpaces.length} open.`
                    : `${SPACES_LABEL}. ${space.openSpaces.length} open, ${unwellElsewhere} needs attention.`
                }
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
                    says it the way Cards does — the same `SetTrigger`, so the
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
                {unwellElsewhere === 0 ? null : (
                  <span className="command-dock__unwell" data-unwell aria-hidden="true" />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={DISCLOSURE_ALIGN}
                side={side}
                sideOffset={DISCLOSURE_SIDE_OFFSET}
                className={`nokey ${DISCLOSURE_WIDTH}`}
              >
                {/* A radio group, as Layout and Graph both use, because this is
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
                      <DropdownMenuRadioItem key={row.spaceId} value={row.spaceId} closeOnClick>
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
                          vertical tab strip this Open Spaces menu replaces drew a badge
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
                      </DropdownMenuRadioItem>
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
 * The **cluster** is the Space you are in — a Layout or Graph cluster in every
 * respect: a name you click to rename, and a chevron opening an ordinary menu.
 *
 * **The Spaces inside this one are not in either.** They are Space Cards, so
 * they are in the Cards list with every other Card — as Cards, with nothing on
 * the row that goes into one. That is the difference the two surfaces keep: the Open Spaces menu
 * lists the Spaces already **open**, and the Cards list holds Cards. At the top
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
 * (`OpenSpaces`) is not carried over as a strip, but this is what it modelled:
 * the *set* of open Spaces. What it could not model is the crossing, and the
 * parent step is that.
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
        <IdentityName
          icon={<CardKindIcon kind="space" />}
          kind="Space"
          testId="space-title"
          subject={space.currentSpaceId}
          title={space.title}
          onRename={space.onRename}
        />
        <SpaceMenu space={space} side={side} />
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
 * Cards panel, while the list surface was still under comparison — be the same
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
  const cancel = () => {
    track(null);
    pressSpent.current = false;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const measured = bounds();
    if (measured === null) return;
    // Read before the dismissal runs: an open list makes this press the one
    // that closes it, and the `click` after must not reopen it.
    pressSpent.current = slotsOpen;
    event.currentTarget.setPointerCapture(event.pointerId);
    track({
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
    if (held === null) return;
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
    if (held === null) return;
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
        <Toolbar
          aria-label={label}
          // The arrows follow the edge the dock is on: a column whose arrow keys
          // ran left and right would be a toolbar disagreeing with its own shape.
          orientation={vertical ? 'vertical' : 'horizontal'}
          className={`command-dock__surface nokey nodrag nopan ${className ?? ''}`}
          data-orientation={vertical ? 'vertical' : 'horizontal'}
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
        </Toolbar>
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
  const [openId, setOpenId] = useState<string | null>(null);
  const vertical = orientationOf(dock.edge) === 'vertical';
  // A rule divides across the dock's own axis, so it runs the other way.
  const divider = vertical ? 'horizontal' : 'vertical';
  const side = MENU_SIDE[dock.edge];

  return (
    <DockDisclosureContext.Provider value={{ openId, setOpenId }}>
      <DockRenamingContext.Provider value={chrome.onRenamingChange}>
        <Dock
          dock={dock}
          onDock={setDock}
          container={container}
          presenting={chrome.graph.presenting}
          label="Command Dock"
          report={<PersistenceReport persistence={chrome.persistence} edge={dock.edge} />}
        >
          {/* Space | Layout Graph | Cards.
          The three selections first, then the inventory. Which Space, which
          Layout and which Graph are one question asked three times — each names
          the current one, discloses the set, and promotes at most one verb — and
          Layout and Graph are divided like the rest. They used to run together
          on the grounds that a Graph is authored over a Layout and so they are
          one region — which stopped being legible the moment Present moved to
          the head of the Graph cluster: an unseparated `[Collection 1 ⌄][▶ Long
          ⌄]` reads as a Present belonging to the Layout beside it. The
          containment is still true and the order still says it; the rule no
          longer has to be carried by an absent line.
          Cards comes last because it is the odd cluster and should read as one:
          it names a set rather than a selection, so it has no name to edit and
          nothing to promote but Create. Between Layout and Space it looked like
          a fourth selection that had lost its name. */}
          {/* One open-id under the whole row, spent by every disclosure through
          `useDockDisclosure` — that, and not a convention each control keeps,
          is what makes at most one open. The hook says why the `Menubar` this
          obviously wants cannot be used inside Toolbars. */}
          <SpacesControl space={chrome.space} side={side} vertical={vertical} />
          <Divider orientation={divider} />
          <LayoutControls canvas={chrome.canvas} side={side} />
          <Divider orientation={divider} />
          <GraphControls
            graph={chrome.graph}
            layoutTitle={chrome.canvas.selected.title}
            side={side}
            vertical={vertical}
          />
          <Divider orientation={divider} />
          <CardsControl cards={chrome.cards} side={side} />
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
 * Drag a Card out of the Cards popover onto the canvas, or press the row where
 * it stands. Both are real and both are the same Edit: the Card joins the
 * Layout and the popover stays open, so the next one costs nothing either way.
 */
