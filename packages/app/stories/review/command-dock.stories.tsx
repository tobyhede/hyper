/**
 * THROWAWAY UX PROTOTYPE — not a production component and not an ADR proof.
 *
 * One arrangement of floating chrome over a full-bleed canvas: a **Command
 * Dock** snapped to an edge, which draws itself from the edge it is on. Four
 * others were compared here first — three horizontal docks, a vertical rail
 * beside a context dock, one bottom-centre dock, and a summoned context menu —
 * and they have been deleted. The Command Dock is the candidate; the other
 * four were context, not competition.
 *
 * **Two questions this file used to hold open are now closed**, and what is
 * left is the answer rather than the comparison. A list — Cards or Spaces — is
 * a **Popover** anchored to the control that opened it; the Drawer and the
 * second docked panel are gone with their switch. And there is **one Dock**,
 * not one per orientation: the second instance existed so a popover could be
 * seen anchored under a top dock and beside a side one at once, which is a
 * thing to look at rather than a thing to propose. Drag the one that remains
 * to any edge; the orientation follows on release.
 *
 * A dock on a side edge keeps its names rather than collapsing to icons. The
 * three modes that question was compared through are gone: a vertical dock is
 * wide enough for `[name] [v]` per row, and it has to be, because the row is
 * what a disclosure hangs off.
 *
 * **The grip both drags and discloses.** Dragging is the shortcut; pressing it
 * opens the twelve slots as an ordinary radio menu, marked at the one the dock
 * is in. A drag was never enough on its own — it is unreachable from a
 * keyboard, which made the dock's own position the single command in this
 * surface a keyboard could not spend — and it was unreachable from a test,
 * which is why a second story existed only to start in the vertical
 * arrangement. Both are gone.
 *
 * The command set the Dock covers:
 *
 *   Spaces  — which Space this is, rename it, cross into and out of one
 *   Cards   — Create (Markdown/Space/Alias), and the list of existing Cards,
 *             the Space Cards among them the way into the Spaces inside this one
 *   Layouts — which is active, select another, add/rename/delete
 *   Graphs  — which is active, select another, present, add/rename/delete
 *
 * The organising rule under test: a Card is the literal object on the canvas,
 * and everything here is *about* the canvas. So Card operations are absent —
 * they belong to the Card rail (ADR 0073) — and the Dock reads as a layer
 * over the paper rather than as more paper.
 *
 * That is a **dependency and not just an exclusion**, and it is worth writing
 * down because the audit of this surface turns on it: Open, Edit, Delete, a
 * Card's links and taking a Card back out of a Layout all have no home here on
 * purpose, and the Space Sidebar carried the last two in its footer. The
 * arrangement is only complete when the rail lands with it — and Delete in
 * particular is expected to answer to `Del` on the selected Card, which is a
 * canvas key rather than anything the Dock would draw.
 *
 * **A Space is a Space Card, held by the Meta Space above it.** That is the
 * revision this arrangement is built on, and it decides two things at once. The
 * Spaces a Space offers are the Space Cards *in* it, so at the top level the
 * list is every Space there is and the phrase "All Spaces" needs no separate
 * construct. And the surface that offers them is therefore **the Cards surface,
 * the one there is** — one disclosure, one list, one drag. There was a second
 * disclosure drawing the same list over the Space Cards alone; folding it away
 * is what makes the claim structural rather than stated.
 *
 * **That list does not enter a Space, and cannot.** It is a list you choose a
 * Card from and drag one out of, and a control on its rows that went *into* one
 * of them would be a third thing a row means. Entering is the Open Space Card's
 * on the canvas (ADR 0068) — the Card front is production's and out of this
 * prototype's reach, so the Dock does not stand in for it.
 *
 * The Space cluster's own chevron is then an ordinary menu like Layout's and
 * Graph's, carrying the two commands about the Space itself: New Space and Copy
 * link. New Space sits there against the rule that creating a Space is Create
 * Card → Space, and it is the one item in the Dock that has not been
 * reconciled.
 *
 * The order follows the containment: Spaces hold Cards, a Layout places some
 * of those Cards, and a Graph connects what a Layout placed.
 *
 * **What it draws is real.** The Space is `commandDockSpace`
 * (`../support/spaces`) and the canvas is `LayoutCanvasFixture`
 * (`../support/ReactFlowCanvas`), so the Cards, the Edge stacking, the Graph
 * colours and the placement are production's rather than this file's — which
 * matters most for the identity question, whose whole premise is that the
 * canvas already says which Graph is active. Every command that changes
 * something writes the stored snapshot and reloads it through
 * `loadSpaceSnapshot`: switching a Layout, adding and renaming a Layout or a
 * Graph, and dragging a Card out of a list onto the canvas are all real Edits.
 *
 * **The Dock carries the open set, not the crossing.** The bar names one step
 * back and the Space you are in — `[Design system] [\u22ef] │ [\u2b21 Rendering][\u2304]` —
 * and the `\u22ef` beside the parent switches among **every open Space**, drawn as
 * the tree that `from` makes. Moving closes nothing, so a Space opened and left
 * is still there with the Layout and Graph it was left on, and Exit Space in
 * the Space menu is what takes one out of the set — **one** Space, never a
 * second (ADR 0068), with the rows below it moving up a level rather than going
 * with it.
 *
 * Every Space in it is a tracked fixture, so the Layouts, Graphs and Cards in
 * the Dock all change under you when you move — which is the thing the
 * arrangement had to be judged against and could not be while there was one
 * Space. **How a Space joins the set is not the Dock's**: entering is a gesture
 * on the Open Space Card (ADR 0068), so the session is seeded with what a reader
 * would have crossed rather than crossed here.
 *
 * The Sidebar's answer was `OpenSpaces`, a strip of vertical tabs. It is not
 * carried over as a strip: a tab strip needs a permanent column to stand beside
 * and a Dock has none. What it modelled — the *set* of open Spaces — is what the
 * switcher models, with the crossing that a flat strip lost drawn as the tree's
 * indent.
 *
 * **What it says when something goes wrong is production's, and only the
 * placement is proposed.** `PersistenceControl` maps a conflict and a rejection
 * to their `AlertDialog`s and `PersistenceNotice` is the standing `Alert` with
 * a Retry; both are mounted here unchanged. Two placements follow from that and
 * neither is a new state: the dialogs are portalled and own the viewport, so
 * they need no placement at all, and the notice hangs off the dock on the same
 * `MENU_SIDE` its disclosures open on, so it follows the dock to any of the
 * twelve slots and never opens off the edge it is against.
 *
 * **There is no saving cue, and its absence is the proposal.** Production's
 * `PersistenceIndicator` is deliberately not called: a commit settles faster
 * than a dot can be read, so a permanent slot in a five-cluster strip spent
 * reporting the expected outcome is a slot spent on nothing. The states worth
 * drawing are the three that need a reader — `failed`, `rejected`,
 * `conflicted`. Disagreeing with that is disagreeing with a sixth cluster that
 * is blank almost always.
 *
 * **And the switcher says which Space is the unwell one.** That was a
 * regression rather than a gap: `OpenSpaces`, the tab strip the switcher
 * replaces, badged each open Space for `conflicted`, `failed` and `rejected`,
 * and a switcher listing the same set in silence makes a Space that needs a
 * decision look like one that does not. The row says only *which* — the
 * recovery belongs to that Space's own dock, one press away.
 *
 * Deliberately not built: real Card creation and traversal. Presenting only
 * hides the chrome, which is the part that bears on the arrangement. Delete
 * this surface once the UX decision is made.
 */
import {
  createContext,
  Fragment,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Story } from '@ladle/react';
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
  Button,
  CardKindIcon,
  cardKindName,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
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
  Input,
  FALLBACK_GRAPH_COLOR,
  GraphIcon,
  InlineTitleEditor,
  DropdownMenu,
  LayoutIcon,
  ParentIcon,
  PlusIcon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PresentIcon,
  Separator,
  StopPresentingIcon,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
} from '@project/ui';
import {
  newUuid,
  type Card,
  type CardId,
  type CardPlacement,
  type Graph,
  type GraphId,
  type Layout,
  type LayoutId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, type Space } from '@project/graph';
import type { SpaceSessionState } from '@project/persistence';
import { PersistenceControl, PersistenceNotice } from '#components/PersistenceControl';
import type { RejectedExitConfirmation } from '#src/open-spaces';
import { GRAPH_PALETTE, graphColorMap } from '#src/colors';
import {
  DOCK_ALONGS,
  DOCK_EDGES,
  dockSlot,
  editDocument,
  editSelectedLayout,
  exitReportSentence,
  exitSpace,
  nearestAlong,
  nearestEdge,
  openTree,
  opened,
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
  type OpenEntry,
  type OpenRow,
  type SessionState,
  type SpaceStep,
} from './dock-model';
import { nextGraphTitle, nextLayoutTitle } from '#src/titles';
import { LayoutCanvasFixture, type DrawnLayout } from '../support/ReactFlowCanvas';
import {
  commandDockSnapshot,
  designSystemSnapshot,
  metaSnapshot,
  platformSnapshot,
  traversalSnapshot,
} from '../support/spaces';
import './command-dock.css';

export default { title: 'Review/Command Dock' };

/* ------------------------------------------------------------------ model */

/**
 * The Space is `commandDockSpace` (`../support/spaces`) and everything drawn
 * here is derived from it — the canvas through the production projection, the
 * lists and the menus off the same aggregate.
 *
 * Nothing about Layouts, Graphs, Cards or Graph colour is declared in this
 * file. An earlier draft carried its own `PrototypeLayout`, `PrototypeGraph`,
 * `PrototypeCard`, a hand-rolled `CardNode` with three fixed handle lanes and
 * three hex literals for the palette. Every one of those was a second answer to
 * a question the repository already answers, free to drift from it — and the
 * lanes in particular were a stand-in for the Edge stacking production does,
 * which is exactly the thing the identity question turns on.
 *
 * An Edit is expressed on the stored `SpaceSnapshot` and reloaded through
 * `loadSpaceSnapshot`, production's own intake. So the prototype cannot reach a
 * Space the application would refuse, and Add Layout, Add Graph, renaming and
 * placing a Card are all real rather than list surgery beside a fixed canvas.
 */

/**
 * The palette a Graph's colour is chosen from, named.
 *
 * `GRAPH_PALETTE` is the application's own — the same six values authoring
 * rotates through when it mints a Graph — so the menu cannot offer a colour the
 * canvas would not draw. The names are this file's, because a swatch with no
 * word beside it is a colour a reader cannot ask anyone else for.
 */
const GRAPH_COLOR_NAMES = ['Blue', 'Amber', 'Green', 'Pink', 'Purple', 'Red'] as const;

const GRAPH_COLORS: readonly (readonly [string, string])[] = GRAPH_PALETTE.map(
  (color, index): readonly [string, string] => [GRAPH_COLOR_NAMES[index] ?? color, color],
);

/** The three kinds Create offers, in the order the menu lists them. */
const CARD_KINDS = ['markdown', 'space', 'alias'] as const;

const MIME_CARD_ID = 'text/plain';

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
 * The class every disclosure surface carries, and the reason it exists.
 *
 * A portalled panel is not inside `.dock-proto` — in Ladle's catalogue UI it is
 * not even in the same document, because the story runs in an iframe and the
 * popup is appended to the top document's body. So the story's palette travels
 * on the panel itself rather than being inherited from an ancestor that may not
 * be there. See `command-dock.css`.
 */
const DISCLOSURE_PANEL = 'dock-proto__panel';

/**
 * Where a Card dragged out of a list lands.
 *
 * A second row under the placed Cards rather than the point under the pointer.
 * The claim the list surfaces are compared on is that a drag *out of* a surface
 * survives that surface's own dismissal and leaves the list — where exactly it
 * lands is the Edit's business, and converting a client point into canvas
 * coordinates would mean reaching past `LayoutCanvasFixture` into the React
 * Flow instance it owns.
 */
const dropPlacement = (placed: number): CardPlacement => ({
  x: (placed % 5) * 420,
  y: 420 * Math.floor(placed / 5),
  open: false,
});

/* ---------------------------------------------------------------- session */

/**
 * **The session itself is `dock-model`'s.** `OpenEntry` and `opened`, the
 * `SessionState` they make up, the `openTree` the switcher draws and the
 * `exitSpace` that has to keep that tree true are all over there, where a node
 * test can hold them to an answer. What is left here is the fixture the stories
 * open on and the three derivations React spends.
 *
 * `from` is the Space an entry was **entered from**, and it is session state
 * rather than structure. Space Card references form a DAG rooted at Meta (ADR
 * 0074): they may converge and never cycle, so a Space reached two ways has no
 * canonical parent and no canonical path. The parent the Dock names is the
 * crossing that is live, which is why it is kept there and never derived from
 * the documents — and it is what gives the switcher's tree its shape.
 *
 * The selections are per entry because ADR 0068 makes them so — leave a Space
 * and come back and the selection is the one you left, because the entry behind
 * it stayed alive. Exit it and the selections go with the entry.
 */

const META_ENTRY = opened(metaSnapshot, null);

/**
 * The session starts **three crossings in, with a branch beside it**, and that
 * is the fixture's claim.
 *
 * A prototype that opened at Meta would draw a Dock with nothing above it and
 * settle nothing, and one crossing in settles only the easy half. So it opens
 * on `Meta ▸ Platform ▸ Design system ▸ Rendering`: deep enough that the whole
 * path cannot be on the bar, which is the case the switcher exists for.
 *
 * **And `Traversal` is open from Meta, off the path**, which is the other half
 * and the one a trail could never show. A set of open Spaces that is only ever
 * a line is a set for which a tree, an indent and a switcher are all
 * unnecessary — the bar would already be naming everything there is. One branch
 * is the least that makes the switcher answer a question the parent step does
 * not.
 *
 * Every entry is a crossing a reader could make: each Space above holds a Space
 * Card naming the next, and Meta holds one naming `Traversal`. The Space it
 * arrives in is still `Rendering`, the fixture with two Layouts, three Graphs
 * and thirty-four Cards, so nothing else the Dock is judged on is traded for
 * the depth.
 */
const CROSSED = [platformSnapshot, designSystemSnapshot, commandDockSnapshot] as const;

/**
 * Which of the open Spaces a story puts in trouble.
 *
 * **Two cases, and they are different questions.** `here` is a commit that
 * failed on the Space you are looking at: the Dock is already pointed at it, so
 * what is under review is *where the report goes* on a strip of furniture with
 * no column to pin it down. `elsewhere` is a Space that went wrong while you
 * were somewhere else — the case a single session-wide persistence field could
 * not express at all, and the whole of question C: the switcher lists that
 * Space, and it has to say which one it is without the reader going there to
 * find out.
 */
type Unwell = 'here' | 'elsewhere';

/**
 * The session, opened with one Space in whatever persistence state a story asks
 * for.
 *
 * `elsewhere` puts it on `Design system`, which is the parent the trail already
 * names — so the story shows both a Space that is one press away and a switcher
 * that has to mark it.
 */
const initialSession = (
  persistence: SpaceSessionState['persistence'] = { kind: 'settled' },
  unwell: Unwell = 'here',
): SessionState => {
  const path = CROSSED.reduce(
    (open, snapshot, index) =>
      open.set(snapshot.id, opened(snapshot, (CROSSED[index - 1] ?? metaSnapshot).id)),
    new Map<UUID, OpenEntry>([[metaSnapshot.id, META_ENTRY]]),
  );
  const troubled = (unwell === 'here' ? commandDockSnapshot : designSystemSnapshot).id;
  const entry = path.get(troubled);
  if (entry !== undefined) path.set(troubled, { ...entry, persistence });
  return {
    open: path.set(traversalSnapshot.id, opened(traversalSnapshot, metaSnapshot.id)),
    currentId: commandDockSnapshot.id,
  };
};

/** Total by construction: Meta is opened first and can never be closed. */
const currentEntry = (state: SessionState): OpenEntry =>
  state.open.get(state.currentId) ?? META_ENTRY;

/** The Spaces crossed to reach the current one, root first — the current one excluded. */
/**
 * The Space this one was entered from, which is the only step the bar names.
 *
 * One rather than the whole path, and that is the arrangement's answer to the
 * width question rather than an omission: the step a reader reaches for is the
 * one above them, and everything further up is in the switcher beside it.
 */
const parentOf = (state: SessionState): SpaceStep | null => {
  const from = currentEntry(state).from;
  if (from === null) return null;
  const entry = state.open.get(from);
  return entry === undefined ? null : { spaceId: from, title: entry.snapshot.document.title };
};

/**
 * Moving to an open Space, which is what the parent step and the switcher both do.
 *
 * **Nothing closes.** This is the change ADR 0068 has to answer to: Exit used
 * to close the entry outright, so leaving a Space took its selections with it
 * and a Space open but not above you had nowhere to be. Making the open set a
 * tree you move around is what gives it somewhere — and it is why every entry
 * keeps its Layout and Graph, so coming back to one arrives where you left it.
 *
 * What it costs is that the set only grows unless something takes from it, which
 * is why Exit is a command of its own, in the Space menu. Exit used to be both
 * the move and the close, and separating them is what lets a reader leave a
 * Space without losing it — and, when they do mean to lose it, say so.
 */
const switchTo = (state: SessionState, spaceId: UUID): SessionState =>
  state.open.has(spaceId) ? { ...state, currentId: spaceId } : state;

/* ------------------------------------------------------------------ state */

/**
 * **What the Dock is given, in the groups `SpaceSidebar` already gives them
 * in.**
 *
 * It was one flat `Chrome` of thirty-three members, threaded whole into ten
 * components — so `PresentingExit`, which reads four of them, was declared to
 * take every command in the surface, and no signature in the file said what any
 * component actually used. `SpaceSidebar` is the promoted sibling doing this
 * same job and it does not do that: it takes `canvas`, `graph`, `addCard`,
 * `createLayout`, `persistence`, `selectedCard`, `entityActions` and `titleEdit`
 * (`packages/app/src/components/SpaceSidebar.tsx`), and each of its own pieces
 * takes the group it draws.
 *
 * The groups here are named after it wherever there is a counterpart —
 * `canvas` is the Layouts and the one that is drawing, `graph` is the Graphs
 * and Present, `persistence` is the report and its recoveries — so that ticket
 * 07, which promotes this component and deletes that one, is a move rather
 * than a translation.
 *
 * Two composition points still take the whole of it, and that is the shape
 * rather than a leftover: `PrototypeCanvas` stands where the application mounts
 * the surface and `CommandDock` stands where the surface distributes to its own
 * clusters, exactly as `App` and `SpaceSidebar` do. Everything below them takes
 * a group.
 */
interface DockChrome {
  /** What the canvas draws, in the shape `LayoutCanvasFixture` takes. */
  readonly drawn: DrawnLayout;
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
 * parent step and the switcher are how you leave this Space, and the name and
 * its menu are what you can do while you are in it.
 */
interface DockSpace {
  /** This Space's name — a Space Card's title, seen from inside it. */
  readonly title: string;
  /** Which Space the Dock is in, which is what the switcher marks. */
  readonly currentSpaceId: UUID;
  /** The Space this one was entered from, and the only step the bar names. Null at the root. */
  readonly parent: SpaceStep | null;
  /** Every open Space, depth-first from the root — what the switcher lists. */
  readonly openSpaces: readonly OpenRow[];
  readonly onRename: (title: string) => void;
  /** Move to an open Space, closing nothing. The parent step and the switcher both spend this. */
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
interface SpaceExitReport {
  readonly spaceId: UUID;
  readonly title: string;
  readonly outcome: ExitOutcome;
}

/**
 * The canvas's one exclusive choice: which authored Layout is drawing (ADR
 * 0079, ADR 0082).
 *
 * Named `canvas` after `SpaceSidebar`'s own group for the same thing, and
 * carrying `selected` as the Layout rather than as an id for the same reason
 * that one does — the title belongs to the Layout, so a cluster naming what is
 * drawing reads it off the Layout instead of deriving a second title.
 */
interface DockCanvas {
  /** The Space's authored Layouts, in the order it declares them. */
  readonly layouts: readonly Layout[];
  /** The Layout that is drawing. */
  readonly selected: Layout;
  readonly onSelect: (layoutId: LayoutId) => void;
  readonly onRename: (layoutId: LayoutId, title: string) => void;
  readonly onCreate: () => void;
  readonly onDelete: (layoutId: LayoutId) => void;
}

/** The Graphs the selected Layout owns, the Active one, and Present. */
interface DockGraph {
  /** The Graphs the selected Layout owns, which are the only ones it draws. */
  readonly graphs: readonly Graph[];
  readonly active: Graph;
  /** Every visible Graph's resolved colour, derived by the production palette. */
  readonly colorByGraphId: Readonly<Record<string, string>>;
  /** The Active Graph's colour, which several controls carry as its identity. */
  readonly activeColor: string;
  readonly onActivate: (graphId: GraphId) => void;
  readonly onRename: (graphId: GraphId, title: string) => void;
  /** A Graph's stored colour, which the canvas draws its Edges in. */
  readonly onRecolor: (graphId: GraphId, color: string) => void;
  readonly onCreate: () => void;
  readonly onDelete: (graphId: GraphId) => void;
  readonly presenting: boolean;
  readonly onPresent: () => void;
  readonly onExitPresenting: () => void;
}

interface DockCards {
  /**
   * Every Card this Space holds, of every kind, placed or not.
   *
   * **One list, because a Space Card is a Card.** This used to be the Cards the
   * selected Layout had not placed, with the Space Cards drawn a second time in
   * a Spaces surface of their own — two disclosures over overlapping sets, and
   * a Space Card that appeared in both or in neither depending on where it had
   * been put. Filtering by Layout membership is what made the second surface
   * necessary: the Spaces you can cross into are not the Spaces this Layout
   * happens to place, so a list that hid the placed ones hid crossings.
   *
   * What the Layout does not place is still the common case and still what the
   * drag is for; a Card already on the canvas simply moves when it is dropped
   * again.
   */
  readonly cards: readonly Card[];
  /** A Card dropped on the canvas joins the Layout, so it leaves the list. */
  readonly onPlace: (cardId: CardId) => void;
}

/** What went wrong, which is the only thing persistence ever says. */
interface DockPersistence {
  /** How this Space's last commit went. `settled` and `pending` draw nothing. */
  readonly state: SpaceSessionState['persistence'];
  /** Try the failed commit again, which is the one recovery that is not a decision. */
  readonly onRetry: () => void;
  /** Take the stored Space over the local one, ending a conflict. */
  readonly onAcceptRemote: () => string | null;
  /** Keep the local Space and commit it again, ending a conflict. */
  readonly onKeepLocal: () => void;
}

/**
 * Layouts, Graphs and placement are edits on a stored snapshot rather than
 * three lists of local state.
 *
 * A prototype whose rename control refuses an empty name and then changes
 * nothing is lying about the part under review — and one whose Add Layout
 * appended to an array the canvas never read would be lying about a larger
 * part. Each operation writes the snapshot; `loadSpaceSnapshot` re-derives the
 * Space, and the canvas, the lists and the menus all follow from that one
 * value.
 *
 * Identities come from `newUuid` at the call site because this story is its own
 * composition root, exactly as `newSpaceFixture` is in `../support/spaces`
 * (ADR 0016).
 */
function useChrome(
  persistence: SpaceSessionState['persistence'] = { kind: 'settled' },
  unwell: Unwell = 'here',
): DockChrome {
  const [session, setSession] = useState<SessionState>(() => initialSession(persistence, unwell));
  const [presenting, setPresenting] = useState(false);
  const [exitReport, setExitReport] = useState<SpaceExitReport | null>(null);

  const entry = currentEntry(session);
  const { snapshot, layoutId, graphId } = entry;

  /**
   * One Edit on the current entry, leaving every other entry as it was left.
   *
   * The three setters below keep the signatures the body already had, so
   * everything under them is unchanged by the session: an Edit is still one
   * write to a stored snapshot that `loadSpaceSnapshot` then re-derives. What
   * changed is only *which* snapshot, and that the other open ones are still
   * there when you come back to them.
   */
  const write = (next: (live: OpenEntry) => OpenEntry): void =>
    setSession((current) => {
      const live = current.open.get(current.currentId);
      if (live === undefined) return current;
      return { ...current, open: new Map(current.open).set(current.currentId, next(live)) };
    });

  const setSnapshot = (edit: (current: SpaceSnapshot) => SpaceSnapshot): void =>
    write((live) => ({ ...live, snapshot: edit(live.snapshot) }));
  const setLayoutId = (id: LayoutId | null): void => write((live) => ({ ...live, layoutId: id }));
  const setGraphId = (id: GraphId | null): void => write((live) => ({ ...live, graphId: id }));

  const parent = parentOf(session);
  const openSpaces = useMemo(() => openTree(session), [session]);

  /**
   * The Space, derived once per snapshot rather than once per render.
   *
   * **The comment that stood here said the React Compiler was memoizing this,
   * and the React Compiler is not enabled.** Neither pipeline runs it: the
   * application's `vite.config.ts` uses a plain `react()`, the catalogue's
   * `ladle-vite.config.ts` adds only Tailwind and says in its own comment that
   * Ladle supplies the React pipeline, and no manifest or lockfile entry names
   * `babel-plugin-react-compiler`. So the claim was not a description of a
   * build step, and what it was actually justifying was a full Zod parse,
   * reference validation and indexing of a thirty-four-Card Space on every
   * render — twice per render under StrictMode, and once for every keystroke of
   * an inline rename.
   *
   * The objection it raised is real and is about the compiler, which is absent:
   * plain React's `useMemo` has no opinion about immutability, and `snapshot`
   * is a stable reference between Edits because the session holds the same
   * `OpenEntry` until one replaces it. So the dependency is exactly right and
   * the memo does what it says.
   *
   * Enabling the compiler instead is a defensible answer and a larger one — it
   * is a toolchain decision for the whole repository, not a fix to this
   * surface — so it is left as a decision rather than taken here.
   */
  const result = useMemo(() => loadSpaceSnapshot(snapshot), [snapshot]);
  // The prototype only ever writes Edits the application would accept, so a
  // refusal here is a defect in this file rather than a state to draw.
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('\n'));
  const space: Space = result.space;

  const colors = useMemo(() => graphColorMap(space), [space]);

  const layout = space.layouts.find((candidate) => candidate.id === layoutId) ?? space.layouts[0];
  // ADR 0079 keeps the last Layout undeletable and gives a new one an empty
  // Active Graph, so both of these hold for every Edit this file makes.
  if (layout === undefined) throw new Error('The Command Dock fixture has no Layout to draw.');
  const graph = layout.graphs.find((candidate) => candidate.id === graphId) ?? layout.graphs[0];
  if (graph === undefined) throw new Error(`${layout.title} owns no Graph.`);

  /**
   * One Edit on the Layout the **live** entry selects.
   *
   * It used to close over `layout.id` read during this render and spend it
   * inside a functional updater that had already gone and fetched the live
   * entry, so the write and the thing saying where to write it came from two
   * different moments. `editSelectedLayout` takes the entry instead, which is
   * what makes a captured id unrepresentable rather than merely wrong.
   */
  const withinSelected = (edit: (layout: Layout) => Layout): void =>
    write((live) => editSelectedLayout(live, edit));

  return {
    drawn: { space, layoutId: layout.id },

    space: {
      title: space.title,
      currentSpaceId: session.currentId,
      parent,
      openSpaces,
      onRename: (title) =>
        setSnapshot((current) => ({ ...current, document: { ...current.document, title } })),
      // Moving, not exiting: the entry left behind stays open with its Layout and
      // its Graph, which is what makes the switcher a switcher.
      onSwitchTo: (spaceId) => setSession((current) => switchTo(current, spaceId)),
      // And this is what the switcher made necessary. Once nothing closes on its
      // own, exiting is a command, and it is the Space's own — so it sits in the
      // Space menu with New and Copy link rather than on the switcher's rows.
      //
      // **Computed whole, then installed.** `exitSpace` answers the next session
      // and the outcome together, so both come from one reading of the session
      // rather than from a captured id spent inside an updater that had gone and
      // fetched a later one — the stale-closure shape `editSelectedLayout` and
      // the drag gesture were both fixed for. React flushes discrete events, so
      // the `session` this closes over is the one the press was made against.
      onExit: (spaceId, confirmation) => {
        const exited = exitSpace(session, spaceId, confirmation);
        setSession(exited.session);
        setExitReport(
          exited.result.kind === 'exited'
            ? null
            : {
                spaceId,
                title: session.open.get(spaceId)?.snapshot.document.title ?? space.title,
                outcome: exited.result,
              },
        );
      },
      exitReport,
      onDismissExitReport: () => setExitReport(null),
    },

    canvas: {
      layouts: space.layouts,
      selected: layout,
      onSelect: setLayoutId,
      onRename: (renamed, title) =>
        setSnapshot((current) =>
          editDocument(current, (layouts) =>
            layouts.map((candidate) =>
              candidate.id === renamed ? { ...candidate, title } : candidate,
            ),
          ),
        ),
      // One Edit that creates and selects an empty Layout owning one empty
      // Active Graph, which is what ADR 0079 makes Add Layout mean.
      onCreate: () => {
        const added = newUuid();
        setSnapshot((current) =>
          editDocument(current, (layouts) => [
            ...layouts,
            {
              id: added,
              title: nextLayoutTitle(current),
              kind: 'positioned',
              positions: {},
              graphs: [{ id: newUuid(), title: 'Graph 1', edges: [] }],
            },
          ]),
        );
        setLayoutId(added);
        setGraphId(null);
      },
      onDelete: (deleted) => {
        setSnapshot((current) =>
          editDocument(current, (layouts) =>
            layouts.filter((candidate) => candidate.id !== deleted),
          ),
        );
        // **`null` and not `''`.** Deleting the Layout the entry selects leaves
        // it selecting nothing until the render's fallback picks the first, and
        // an empty string was a stand-in for that with no type to say so — the
        // same laundering `defaultLayout` was doing one field over.
        // `LayoutId | null` spells it, so the sentinel is gone.
        setLayoutId(layoutId === deleted ? null : layoutId);
        setGraphId(null);
      },
    },

    graph: {
      graphs: layout.graphs,
      active: graph,
      colorByGraphId: colors,
      activeColor: colors[graph.id] ?? FALLBACK_GRAPH_COLOR,
      onActivate: setGraphId,
      onRename: (renamed, title) =>
        withinSelected((entry) => ({
          ...entry,
          graphs: entry.graphs.map((candidate) =>
            candidate.id === renamed ? { ...candidate, title } : candidate,
          ),
        })),
      // Stored on the Graph rather than held beside it: `graphColorMap` resolves a
      // Graph's own colour ahead of the palette slot its order would give it, so
      // writing it is the whole of the change and the canvas, the glyph and the
      // menu all follow from the one value.
      onRecolor: (recolored, color) =>
        withinSelected((entry) => ({
          ...entry,
          graphs: entry.graphs.map((candidate) =>
            candidate.id === recolored ? { ...candidate, color } : candidate,
          ),
        })),
      onCreate: () => {
        const added = newUuid();
        withinSelected((entry) => ({
          ...entry,
          graphs: [...entry.graphs, { id: added, title: nextGraphTitle(entry.graphs), edges: [] }],
        }));
        setGraphId(added);
      },
      onDelete: (deleted) => {
        withinSelected((entry) => ({
          ...entry,
          graphs: entry.graphs.filter((candidate) => candidate.id !== deleted),
        }));
        setGraphId(graphId === deleted ? null : graphId);
      },
      presenting,
      onPresent: () => setPresenting(true),
      onExitPresenting: () => setPresenting(false),
    },

    cards: {
      cards: space.cards,
      onPlace: (cardId) =>
        withinSelected((entry) => ({
          ...entry,
          positions: {
            ...entry.positions,
            [cardId]: dropPlacement(Object.keys(entry.positions).length),
          },
        })),
    },

    // Recovery writes the entry's own persistence, which is what makes it this
    // Space's rather than the session's. Each is what production's own
    // `PersistenceControl` and `PersistenceNotice` call: Retry re-attempts the
    // commit, and the two conflict answers each end it. What the prototype does
    // not model is the commit that follows — it settles, because what is under
    // review is where the report goes rather than whether the second attempt
    // works.
    persistence: {
      state: entry.persistence,
      onRetry: () => write((live) => ({ ...live, persistence: { kind: 'settled' } })),
      onAcceptRemote: () => {
        write((live) => ({ ...live, persistence: { kind: 'settled' } }));
        return null;
      },
      onKeepLocal: () => write((live) => ({ ...live, persistence: { kind: 'settled' } })),
    },
  };
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

/** A control group that stays where it is put. Only a `Dock` moves. */
function ControlGroup({
  children,
  presenting = false,
}: {
  readonly children: ReactNode;
  readonly presenting?: boolean;
}) {
  return (
    <div
      className="dock-proto__surface nokey nodrag nopan"
      data-orientation="horizontal"
      data-presenting={presenting ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}

/**
 * The line between two regions of the Dock.
 *
 * **The prop names the line's own axis**, which is the opposite of the dock's:
 * a horizontal dock is separated by vertical rules. Every other control here
 * takes `vertical` meaning *the dock is a column*, so a `Divider` taking the
 * same word meant `vertical` at a call site drew a horizontal line, and the one
 * component in the file with an axis of its own was the one whose axis the
 * reader had to invert. It takes `orientation` and passes it straight through.
 *
 * A vertical rule is centred rather than stretched — `Separator`'s own `align`
 * variant, which exists because the alternative was a stylesheet outranking the
 * component from outside.
 */
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
    <span className="dock-proto__ident">
      <span className="dock-proto__ident-text">{children}</span>
    </span>
  );
}

/**
 * The Space, Layout or Graph name, renamed in place by clicking it.
 *
 * This is `InlineTitleEditor` — the component Cards and the Space Sidebar
 * already rename through — in its `header` variant, which exists for named
 * chrome rather than a Card's own title. Reusing it buys the whole edit
 * lifecycle the prototype would otherwise fake and get wrong: select on entry,
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
  onRename,
}: {
  readonly icon: ReactNode;
  readonly kind: 'Space' | 'Layout' | 'Graph';
  readonly title: string;
  readonly onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <InlineTitleEditor
        variant="header"
        className="dock-proto__name-editor"
        title={title}
        label={`${kind} name`}
        onComplete={(next) => {
          const named = next.trim();
          if (named === '') return `A ${kind} needs a name.`;
          onRename(named);
          setEditing(false);
          return null;
        }}
        onCancel={() => setEditing(false)}
        onReturnFocus={() => setEditing(false)}
      />
    );
  }

  return (
    <ToolbarButton
      variant="ghost"
      size="compact"
      className="dock-proto__name"
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
    <ToolbarGroup aria-label="Layout" className="dock-proto__cluster">
      <IdentityName
        icon={<LayoutIcon />}
        kind="Layout"
        title={canvas.selected.title}
        onRename={(title) => canvas.onRename(canvas.selected.id, title)}
      />
      <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
        <DropdownMenuTrigger
          id={triggerId}
          className="nokey dock-proto__disclose"
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
          className={`${DISCLOSURE_PANEL} nokey ${DISCLOSURE_WIDTH}`}
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
            <DropdownMenuItem className="gap-2" onClick={canvas.onCreate}>
              <PlusIcon />
              New Layout
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
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
              disabled={canvas.layouts.length <= 1}
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
      className="dock-proto__verb"
      aria-label={`Present ${graph.active.title}`}
      title={`Present ${graph.active.title}`}
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
    <ToolbarGroup aria-label="Graph" className="dock-proto__cluster">
      {vertical ? null : present}
      {/* The one identity that carries colour, and it carries it on the glyph
          alone — the stroke the Edges of this Graph are drawn in. A neutral
          swatch stood here and said only "a colour applies"; a Graph glyph
          says which *kind* of thing the colour belongs to, and it is
          `@project/ui`'s own `GraphIcon` rather than a mark this file
          invents. */}
      <IdentityName
        icon={<GraphIcon color={graph.activeColor} size={14} />}
        kind="Graph"
        title={graph.active.title}
        onRename={(title) => graph.onRename(graph.active.id, title)}
      />
      <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
        <DropdownMenuTrigger
          id={triggerId}
          className="nokey dock-proto__disclose"
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
          className={`${DISCLOSURE_PANEL} nokey ${DISCLOSURE_WIDTH}`}
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
              <DropdownMenuSubTrigger className="gap-2">
                <GraphIcon color={graph.activeColor} size={14} />
                Colour
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={`${DISCLOSURE_PANEL} nokey`}>
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
            <DropdownMenuItem className="gap-2" onClick={graph.onCreate}>
              <PlusIcon />
              New Graph
            </DropdownMenuItem>
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
            <DropdownMenuItem className="gap-2">
              <CopyIcon />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <CopyIcon />
              Copy permanent link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="gap-2"
              disabled={graph.graphs.length <= 1}
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
function CreateMenu({ side = 'top' }: { readonly side?: MenuSide }) {
  const { id: triggerId, open, onOpenChange } = useDockDisclosure();
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
      <DropdownMenuTrigger
        id={triggerId}
        className="nokey dock-proto__set-verb"
        aria-label="Create Card"
        title="Create Card"
        render={<ToolbarButton variant="ghost" size="icon" />}
      >
        <PlusIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={DISCLOSURE_ALIGN}
        side={side}
        sideOffset={DISCLOSURE_SIDE_OFFSET}
        className={`${DISCLOSURE_PANEL} nokey ${DISCLOSURE_WIDTH}`}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Create Card</DropdownMenuLabel>
          {CARD_KINDS.map((kind) => (
            <DropdownMenuItem key={kind} className="gap-2">
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
 * **The list is a Popover, and that is decided.**
 *
 * Three surfaces were compared here — a Drawer from the screen edge, a Popover
 * anchored to its trigger, and a second dock of its own — over a Space with
 * twenty-nine unplaced Cards, which is the scale that separates them. The
 * Popover won on the two things the comparison was for: it is anchored to the
 * control that opened it the way the menus beside it are, so the Dock reads as
 * one surface rather than a bar that sometimes summons a panel; and a drag out
 * of it survives its own dismissal, so adding several Cards costs one
 * disclosure rather than one each.
 *
 * What the other two cost is why they went. The Drawer occludes the edge of
 * the canvas you are dropping onto, and it is a screen-level surface answering
 * a control-level question. The panel is furniture: it has to be positioned,
 * it stays until closed, and choosing it means choosing that once per list —
 * two docked docks plus two panels was more than the canvas could carry.
 */

/**
 * The dotted grip a row is dragged by.
 *
 * Three answers to "how does a Card offer itself to be dragged" were compared
 * here — this strip-with-a-grip, the production Card at row scale two to a
 * line, and a strip that raised into paper on hover. The grip won: a Card at
 * row scale was mostly empty paper with a title too small to read at 117x66,
 * and an affordance that only arrives on hover arrives after the reader has
 * decided the list is not draggable. The switch that compared them is gone
 * with them.
 */

function RowGrip() {
  return <span className="dock-proto__row-grip" aria-hidden="true" />;
}

/**
 * The list every surface draws: a filter, then Cards as grips.
 *
 * The drag is real here rather than decorative. It is the whole question — the
 * claim under test is that a drag out of an anchored popover survives the
 * popover's own dismissal, and a row that only *looks* draggable proves
 * nothing about it. The canvas takes the drop and the Card leaves the list.
 *
 * The filter is here because twenty-nine Cards is the scale objection, and a
 * surface that cannot be narrowed answers it by scrolling forever.
 *
 * **One list of every Card, of every kind.** There was a Spaces popover beside
 * this one drawing the same component over the Space Cards, and it is gone: a
 * Space Card is a Card, so the surface that offers Cards offers it, and a
 * second disclosure over a subset of the same set was a place for the two to
 * disagree. Every row is draggable and none is annotated — an earlier draft
 * marked a Space Card the Layout already held with "In <Layout>", which is a
 * distinction this surface has no business drawing.
 *
 * **A row is a button, and the drag is the shortcut.** ADR 0082 binds that
 * everything the surface offers is operable from the keyboard alone, and names
 * this case: a drag may be *a* way to place a Card into a Layout and is never
 * the only one. The rows were bare `<div draggable>` — no role, no tab stop, no
 * activation — so the one command in the Dock that adds a Card to the canvas
 * was the one a keyboard could not reach.
 *
 * The route is the **same completion**, not a second one: activating a row
 * spends `onPlace`, which is exactly what {@link PrototypeCanvas}'s `onDrop`
 * spends when a row is dragged onto the canvas. Nothing here knows which of the
 * two got here, and there is no second Edit to keep in step.
 *
 * A native button rather than a `div` with a role and a `tabIndex`: Enter and
 * Space activating a control is the platform's, and the three attributes it
 * would take to reproduce that are three chances to reproduce it wrong. The
 * popover stays open either way, so adding several Cards costs one disclosure.
 */
function CardList({
  cards,
  onPlace,
}: {
  readonly cards: readonly Card[];
  readonly onPlace: (cardId: CardId) => void;
}) {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown =
    needle === '' ? cards : cards.filter((card) => card.title.toLowerCase().includes(needle));

  return (
    <div>
      <Input
        size="compact"
        className="mb-2"
        aria-label="Filter Cards"
        placeholder={`Filter ${cards.length} Cards`}
        value={filter}
        onChange={(event) => setFilter(event.currentTarget.value)}
      />
      {shown.length === 0 ? (
        <p className="px-1 py-4 text-center text-[13px] text-muted-foreground">No Card matches.</p>
      ) : (
        <ul className="dock-proto__card-list">
          {shown.map((card) => (
            <li key={card.id}>
              <Button
                variant="ghost"
                draggable
                // The row's own sheet decides its box bar two things `Button`
                // decides differently. `justify-start` because `Button`
                // centres and the title would drift off the grip; `w-full`
                // because a `<button>` shrink-to-fits whatever its `display`,
                // where the `<div>` this replaced filled its `<li>`. Without
                // it the rows are ragged, the hover fill covers only the
                // words, and `dock-proto__row-title` has no width to
                // ellipsise against, so a long title widens the row and
                // overflows the list sideways.
                className="dock-proto__row w-full justify-start"
                aria-label={`Add ${card.title} to Layout`}
                title="Add to Layout, or drag it onto the canvas"
                onClick={() => onPlace(card.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(MIME_CARD_ID, card.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
              >
                <RowGrip />
                <CardKindIcon kind={card.kind} />
                <span className="dock-proto__row-title">{card.title}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
/**
 * A control that names a **set** and discloses it: `[glyph] Name ⌄`, in one
 * button.
 *
 * **One construction, because there are two of these and they drifted.** Cards
 * and the switcher-at-the-root are the same shape and were built twice: one
 * carried `gap-1.5` from `ListControl` and the other carried none, so the same
 * arrangement of glyph, word and chevron came out spaced two different ways.
 * That is the sort of difference nobody writes down and everybody sees.
 *
 * The button itself is the caller's, because the two sit in different
 * containers — Cards is in a `Toolbar` and takes a `ToolbarButton`, the
 * switcher is in a `Breadcrumb` and cannot, since Base UI's toolbar button
 * throws outside a `Toolbar.Root`. What has to match is the size, the classes
 * and the order of the parts, so those are {@link SET_TRIGGER} and this, and a
 * caller supplies neither.
 *
 * A set has no name to edit, so the word lives inside the trigger rather than
 * as a control beside it — which is what separates these two from the three
 * identities, where the name is a rename target and the chevron is its own
 * button.
 */
const SET_TRIGGER = {
  className: 'nokey dock-proto__name',
  size: 'compact',
} as const satisfies { className: string; size: 'compact' };

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

function CardsTrigger() {
  return (
    /* The Card glyph the rows in its own list carry, not `OpenCardIcon`'s
       expand arrows: beside a Space, a Layout and a Graph's colour, the icon
       slot names what the cluster is about, and "expand" named a gesture this
       cluster does not have. */
    <SetTrigger icon={<CardKindIcon kind="markdown" />}>Cards</SetTrigger>
  );
}

/**
 * One disclosure of one list, anchored to the control that opened it.
 *
 * **One list, and it scrolls.** There is nothing pinned under it any more: the
 * two commands that used to sit there — New Space and Copy link — are commands
 * about the Space, not about its Cards, and they have gone to the Space
 * cluster's menu where the same two commands sit for a Layout and a Graph. What
 * is left is the inventory and the filter that narrows it, so the surface has
 * one region and no question about which of them a control belongs to.
 *
 * **It carries no label**, because there is one list in it and the trigger
 * already names it. There were two disclosures here, Cards and Spaces, each
 * drawing this component — and the second had to label its regions to say which
 * subset of Cards it was showing. One list needs no such caption.
 */
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

function ListControl({
  side,
  label,
  hint,
  className,
  trigger,
  children,
}: {
  readonly side: MenuSide;
  readonly label: string;
  readonly hint: string;
  /** For the Cards cluster, whose trigger stands in the name slot. */
  readonly className?: string;
  readonly trigger: ReactNode;
  readonly children: ReactNode;
}) {
  // A **controlled** Base UI Popover has to be told which trigger it belongs
  // to; without `triggerId` the root has no trigger association and `open`
  // opens nothing at all, silently.
  // The open state belongs to the Dock rather than to this control, which is
  // the whole point: two of these side by side each holding their own `open`
  // is how both come to be open at once, covering each other.
  const { id: triggerId, open, onOpenChange } = useDockDisclosure();

  return (
    <Popover open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
      <PopoverTrigger
        id={triggerId}
        className={`${SET_TRIGGER.className} ${className ?? ''}`}
        aria-label={label}
        title={hint}
        // Every disclosure trigger is a plain ghost button, and the open
        // treatment is one CSS rule over `aria-expanded` rather than a variant
        // swapped here. Branching in one of the five is how the Cards trigger
        // came to fill dark on open while the three menus did not.
        render={<ToolbarButton variant="ghost" size={SET_TRIGGER.size} />}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={DISCLOSURE_ALIGN}
        sideOffset={DISCLOSURE_SIDE_OFFSET}
        className={`${DISCLOSURE_PANEL} ${DISCLOSURE_WIDTH}`}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
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
    <ToolbarGroup aria-label="Cards" className="dock-proto__cluster">
      {/* **The list carries no commands, and that is the shape rather than a
          gap in it.** Cards names no one thing — a Card's own commands are the
          Card rail's (ADR 0073) and this Dock deliberately carries none — and
          its one set command, Create, is the `+` beside this trigger.
          Repeating Create inside the list as well would be the second path to
          one command that the Sidebar's own actions menu was built to remove.

          It offers Space Cards like any other Card and does nothing special
          with them: entering one is the canvas Card's gesture (ADR 0068), not a
          list's. */}
      <ListControl
        side={side}
        label="Cards"
        hint="Cards in this Space"
        // Two classes rather than one: it stands in the name slot like the other
        // three, and it is the one trigger that carries its own disclosure
        // inside it — which the vertical dock's column grid has to know, because
        // that chevron has to land in the column the others' chevrons are in.
        className="dock-proto__name dock-proto__cards-trigger"
        trigger={<CardsTrigger />}
      >
        <CardList cards={cards.cards} onPlace={cards.onPlace} />
      </ListControl>
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
      <CreateMenu side={side} />
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
 * switcher beside the parent step, where the question is which Space you are
 * looking at rather than what you can do to it.
 *
 * **Exit is the one command the switcher made necessary.** While pressing an
 * ancestor was Exit, leaving and closing were the same gesture and neither
 * needed a name; now that moving closes nothing, the open set only grows unless
 * something takes from it. It sits behind its own separator for the reason
 * Delete does on the other two menus — the commands above it make something and
 * this one takes something away — and it is disabled at the root, which cannot
 * be exited.
 *
 * **It is the built Exit's rules and not this file's.** The prototype used to
 * invent both halves — a cascade that closed a whole subtree, and refusals of
 * its own — while `openSpaces.exit` had implemented `CONTEXT.md`'s Exit all
 * along under the name `close`. `exitSpace` in `dock-model` now follows those
 * rules and answers production's `ExitSpaceResult`, and `ExitReport` below is
 * the three arms drawn. What it still is not is the *call*: see that function's
 * comment for the seam that is missing.
 *
 * There is still no **Delete**, which a Layout and a Graph both offer: deleting
 * the Space you are standing in has nowhere to leave you, and the prototype does
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
        className="nokey dock-proto__disclose"
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
        className={`${DISCLOSURE_PANEL} nokey ${DISCLOSURE_WIDTH}`}
      >
        <DropdownMenuGroup>
          {/* Against the rule stated at the top of this file: creating a Space
              is Create Card → Space, so this is a second path to one command.
              Drawn because the arrangement asked for it; it is the one item
              here that has not been reconciled. */}
          <DropdownMenuItem className="gap-2">
            <PlusIcon />
            New Space
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2">
            <CopyIcon />
            Copy link
          </DropdownMenuItem>
          {/* Behind its own rule, like Delete on the Layout and Graph menus:
              the commands above make something, this one takes something away.
              It is **not** destructive though, and does not draw as it — exiting
              a Space discards a session's place in it, not the Space, and
              re-entering costs one press on a Card. Meta cannot be exited, so
              at the root the row is present and unavailable rather than gone.

              **Exit, because the glossary says Exit.** `CONTEXT.md` gives the
              word to the one action that closes an entered Space, and
              `openSpaces.exit` is spelled that way too; this drew "Close Space"
              and so named a fourth thing beside Open, Close and Exit. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2"
            disabled={space.parent === null}
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
 * nothing — the Space is gone from the switcher and the canvas has moved, which
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
 * The word the switcher shows, and the word it is named by.
 *
 * One token spent twice rather than two strings that agree today. Every
 * control's accessible name has to contain its visible label (WCAG 2.5.3, ADR
 * 0082), and the switcher is the control in this surface where the two were
 * written independently and had already drifted apart. A token cannot drift: a
 * reader who renames the set renames both.
 */
const SPACES_LABEL = 'Spaces';

/**
 * `[Parent] [⌄]` — where you came from, and every other Space you have open.
 *
 * **The bar names one step, and the switcher holds the rest.** Depth costs
 * width and the Dock is furniture at the edge of a canvas, so drawing the whole
 * path was always going to lose: at four crossings it was a row of collapsed
 * glyphs saying "two Spaces, and you will have to hover to learn which". One
 * named step — the Space you came from, the one a reader actually reaches for —
 * costs a word, and everything else moves behind the switcher's `⌄`.
 *
 * **The switcher is not the path.** It lists the *open* Spaces as the tree they
 * are, so a Space opened from Meta and left behind is in it beside the branch
 * you are standing on, indented under the Space it was entered from. That is
 * the gap a trail could not close: a trail can only offer what is above you, so
 * a Space open but not an ancestor had nowhere to be, and leaving one meant
 * losing it. Selecting a row moves to it and closes nothing, so the list a
 * reader learns stays the list they come back to — the shape of the menu does
 * not change under them when they use it.
 *
 * **The switcher appears only when it has something to disclose**, and what it has is
 * whatever the bar is not already naming. The bar names the Space you are in,
 * and the parent step when there is one, so the switcher arrives at the Space
 * after those: the third, ordinarily, and the second at the root, where there
 * is no parent step to spend one on.
 *
 * At the root the shape is therefore `[⌄] [⬡ Space ⌄]`, or the cluster alone in
 * a session that has never crossed. Keeping the switcher there is what stops the root
 * being the one place a reader cannot get back from — a switcher reachable from
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
  // parent step and the switcher the bar draws, and when it draws neither.
  const controls = trailControls(parent, space.openSpaces);
  if (controls === 'none') return null;
  const switcher = controls === 'switcher' || controls === 'parent-and-switcher';

  return (
    <Breadcrumb className="dock-proto__trail">
      {/* The Dock has one type scale and the trail is in it. `BreadcrumbList`
          defaults to `text-sm`, which is a page's scale: the crumb inside it
          drew its own 13px and took its line height from the list, so the
          switcher came out a pixel shorter than every other named control.
          `compact` is the 13px the rest of the surface is at. */}
      <BreadcrumbList size="compact" className="dock-proto__trail-list">
        {parent === null ? null : (
          <BreadcrumbItem className="dock-proto__crumb">
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
                  className="dock-proto__crumb nokey"
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
              <span className="dock-proto__ident-text">{parent.title}</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
        )}
        {/* The grid places the list's items, so the track a row belongs in is a
            class on the `li` — and a placement class of its own, not the name
            control's borrowed. At the root the switcher carries the word and
            stands in the name track; below it, it is a bare chevron in the
            disclosure track. */}
        {switcher ? (
          <BreadcrumbItem
            className={parent === null ? 'dock-proto__name-item' : 'dock-proto__disclose'}
          >
            <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
              <DropdownMenuTrigger
                id={triggerId}
                className={
                  parent === null
                    ? `${SET_TRIGGER.className} dock-proto__spaces-trigger`
                    : 'nokey dock-proto__more dock-proto__disclose'
                }
                // **The name is built from the visible word, not matched to
                // it.** This read `Switch Space. N open.` while the trigger
                // showed `Spaces`, so the accessible name did not contain the
                // visible label — WCAG 2.5.3, and ADR 0082's naming clause,
                // which is what speech input reaches a control by. Writing the
                // word twice and keeping the two in step is the fix that stops
                // working the first time either side is edited; sharing
                // {@link SPACES_LABEL} is the one that cannot come apart.
                aria-label={`${SPACES_LABEL}. ${space.openSpaces.length} open.`}
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
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align={DISCLOSURE_ALIGN}
                side={side}
                sideOffset={DISCLOSURE_SIDE_OFFSET}
                className={`${DISCLOSURE_PANEL} nokey ${DISCLOSURE_WIDTH}`}
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
                          <span className="dock-proto__guides" aria-hidden="true">
                            {Array.from({ length: row.depth }, (_, level) => (
                              <span key={level} className="dock-proto__guide" />
                            ))}
                          </span>
                        )}
                        {row.title}
                        {/* **The regression `OpenSpaces` did not have.** The
                          vertical tab strip this switcher replaces drew a badge
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
                          <span className="dock-proto__unwell" data-state={row.persistence.kind}>
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
 *   many   `[↰ Parent] [⌄] │ [⬡ Space ⌄]` — and the rest are in the switcher
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
 * the row that goes into one. That is the difference the two surfaces keep: the switcher
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
 * carrying depth — the switcher's indent carries it. The Sidebar's tab strip
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
       back with the switcher on it, and the commands on the Space you are in.
       The split is what lets the vertical dock put them on separate lines, and
       it costs no tab stop — the toolbar root is the Dock's, so both parts'
       controls are items in the one roving order. */
    <div className="dock-proto__space">
      <ParentSpace space={space} side={side} />
      {/* Whenever the region above drew anything — the parent, the switcher, or
          both. At the root there is no parent and the switcher carries the word
          "Spaces", which is a cluster like any other and wants the line beside
          it; in a session that has never crossed there is neither, and a line
          would divide the Space cluster from nothing. */}
      {space.parent === null && space.openSpaces.length <= 1 ? null : (
        <Divider orientation={vertical ? 'horizontal' : 'vertical'} />
      )}
      <ToolbarGroup aria-label="Space" className="dock-proto__cluster">
        <IdentityName
          icon={<CardKindIcon kind="space" />}
          kind="Space"
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

/**
 * The one control presenting leaves standing.
 *
 * Positioned by the prototype's own stylesheet rather than by React Flow's
 * `Panel`: the canvas is `LayoutCanvasFixture`'s now, and reaching inside it to
 * mount a Panel would mean this file owning a React Flow instance again. It is
 * chrome over the paper, which is what the whole arrangement claims.
 */
function PresentingExit({ graph }: { readonly graph: DockGraph }) {
  if (!graph.presenting) return null;
  return (
    <div className="dock-proto__presenting-exit">
      <ControlGroup>
        <Button variant="ghost" size="compact" className="gap-2" onClick={graph.onExitPresenting}>
          <StopPresentingIcon color={graph.activeColor} />
          Stop presenting {graph.active.title}
        </Button>
      </ControlGroup>
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
  readonly children: ReactNode;
}) {
  const surface = useRef<HTMLDivElement | null>(null);
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

  const bounds = (): { readonly surface: DOMRect; readonly container: DOMRect } | null => {
    const element = surface.current;
    const frame = container.current;
    if (element === null || frame === null) return null;
    return {
      surface: element.getBoundingClientRect(),
      container: frame.getBoundingClientRect(),
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

  const release = () => {
    track(null);
    // A cancel ends the gesture with no `click` behind it — pointer capture
    // lost, or the browser claiming the gesture for itself — so nothing is
    // coming to spend what the press recorded. Left set, it is the *next*
    // genuine press that gets swallowed and the slot list does not open.
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
      x: measured.surface.left - measured.container.left,
      y: measured.surface.top - measured.container.top,
      offsetX: event.clientX - measured.surface.left,
      offsetY: event.clientY - measured.surface.top,
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
        right: left + measured.surface.width,
        bottom: top + measured.surface.height,
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
    release();
  };

  const vertical = orientationOf(dock.edge) === 'vertical';
  const dragging = drag?.moved === true;

  return (
    <>
      {dragging ? (
        <div
          className="dock-proto__snap-hint"
          data-edge={drag.hint.edge}
          style={dockStyle(drag.hint)}
          aria-hidden="true"
        />
      ) : null}
      {/* **One toolbar, and it is the surface itself** (ADR 0073). Each cluster
          used to be a `Toolbar` of its own, which made the Dock four roots and
          so four tab stops; the ADR draws one root with named `role="group"`s
          inside it, so the root is here and the clusters are groups. Putting a
          wrapper *inside* the surface would have been the other way to do it and
          is the wrong one: the vertical column's grid places this element's
          direct children, so a layer between them moves every slot. */}
      <Toolbar
        ref={surface}
        aria-label={label}
        // The arrows follow the edge the dock is on: a column whose arrow keys
        // ran left and right would be a toolbar disagreeing with its own shape.
        orientation={vertical ? 'vertical' : 'horizontal'}
        className={`dock-proto__docked dock-proto__surface nokey nodrag nopan ${className ?? ''}`}
        data-orientation={vertical ? 'vertical' : 'horizontal'}
        data-presenting={presenting ? 'true' : 'false'}
        data-dragging={dragging ? 'true' : 'false'}
        style={dragging ? { left: drag.x, top: drag.y } : dockStyle(dock)}
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
          className="dock-proto__grip nokey"
          aria-label={`Move ${label}. ${slotLabel(dock)}.`}
          aria-haspopup="menu"
          aria-expanded={slotsOpen}
          title="Drag to another slot, or press for the list"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={release}
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
            className={`${DISCLOSURE_PANEL} nokey ${DISCLOSURE_WIDTH}`}
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
    </>
  );
}

/* ----------------------------------------------------------------- canvas */

/**
 * The prototype's canvas is `LayoutCanvasFixture` (`../support/ReactFlowCanvas`).
 *
 * That fixture owns the real React Flow instance, the production `CardNode` and
 * `RoutedEdge`, the projection every stable canvas story draws through, and the
 * production `ZoomSlider` — so this file states which Layout to draw and which
 * Graph to emphasise, and nothing about how a canvas is built. The Edge
 * stacking is production's own rather than three fixed handle lanes standing
 * in for it.
 *
 * The drop is caught on the wrapper, exactly as `ApplicationChromeFixture`
 * catches it: the Cards surfaces float above the canvas, so a drag out of one
 * crosses chrome on the way down, and drop events bubble to here either way.
 *
 * **It also owns the box the Dock docks to, and hands it over as a ref.** The
 * Dock used to reach for `element.parentElement` and measure whatever it found
 * — an unwritten DOM contract on whichever element a caller happened to mount
 * it inside, which no signature stated, no test could hold and nothing would
 * report if a wrapper were added between them. This element is the container by
 * declaration now: it is the surface the twelve slots are slots *of*, and the
 * `overlay` prop that let a story mount the Dock from outside is gone with the
 * guesswork, because a caller that supplies the surface has to be the caller
 * that supplies the frame.
 */
function PrototypeCanvas({
  chrome,
  initialEdge,
}: {
  readonly chrome: DockChrome;
  readonly initialEdge: DockEdge;
}) {
  const container = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={container}
      className="dock-proto"
      // A drop is Add to Layout, which is a real Edit on the stored snapshot:
      // the Card joins the selected Layout and so leaves the list that served
      // the drag. That surface is deliberately left open — adding Cards is
      // repetitive, and whether a surface survives the drag it just served is
      // the comparison.
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData(MIME_CARD_ID);
        const placed = chrome.cards.cards.find((card) => card.id === id);
        if (placed !== undefined) chrome.cards.onPlace(placed.id);
      }}
    >
      <LayoutCanvasFixture
        drawn={chrome.drawn}
        activeGraphId={chrome.graph.active.id}
        viewport={{ fit: true }}
      />
      <PresentingExit graph={chrome.graph} />
      <CommandDock chrome={chrome} container={container} initialEdge={initialEdge} />
    </div>
  );
}

/* ------------------------------------------------------------------- dock */

/**
 * Where a persistence failure goes when the chrome is a strip floating over a
 * canvas.
 *
 * **Nothing here is a new state or a new sentence.** Production settled both
 * long ago and this file spends them unchanged: `PersistenceControl` maps a
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
          persistence={state}
          onAcceptRemote={persistence.onAcceptRemote}
          onKeepLocal={persistence.onKeepLocal}
        />
      ) : null}
      {state.kind === 'failed' ? (
        <div className="dock-proto__notice" data-side={MENU_SIDE[edge]}>
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
function CommandDock({
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
      <Dock
        dock={dock}
        onDock={setDock}
        container={container}
        presenting={chrome.graph.presenting}
        label="Command Dock"
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
        <PersistenceReport persistence={chrome.persistence} edge={dock.edge} />
      </Dock>
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
export const Default: Story = () => {
  const chrome = useChrome();

  return <PrototypeCanvas chrome={chrome} initialEdge="top" />;
};

/**
 * The Dock is the whole viewport's furniture — it docks to the *container's*
 * edges — so it draws in its own frame rather than inside the catalogue's
 * layout, where Ladle's own toolbar lands on top of it.
 */
Default.meta = { iframed: true };

/**
 * The same Dock on a side edge, which is the arrangement worth looking at
 * rather than dragging to.
 *
 * A second story and not a second dock: the JSX is the same, `initialEdge` is
 * the only difference, and the point is that a vertical dock is a column of
 * `[name] [v]` rows rather than a rail of icons. Its disclosures open into the
 * canvas, away from the edge it is against.
 *
 * **It no longer exists because the drag is untestable.** It used to: a
 * synthetic pointer sequence could not drive the old drag, so starting in the
 * orientation was the only way to see it. That was a defect in the drag rather
 * than a fact about pointers — the handlers read the gesture out of a render
 * closure, so a sequence delivered inside one task found `null` at every step
 * after the first. The gesture is a ref now, the grip discloses the twelve
 * slots to a keyboard as well as a pointer, and either route reaches this
 * arrangement from `Default`. What the story is for now is only the standing
 * view of it.
 */
export const DockedLeft: Story = () => {
  const chrome = useChrome();

  return <PrototypeCanvas chrome={chrome} initialEdge="left" />;
};

DockedLeft.meta = { iframed: true };

/* ------------------------------------------------------------- when it fails */

/**
 * **A commit that failed on the Space you are looking at.**
 *
 * `PersistenceNotice` unchanged — production's own standing `Alert`, its own
 * sentence, its own Retry — hung off the Dock on the side its menus open on, so
 * it follows the surface to any of the twelve slots. Drag the Dock, or press
 * the grip and pick another slot, and the notice goes with it.
 *
 * The canvas stays live behind it on purpose: a retryable failure leaves the
 * local work intact and the next commit may succeed on its own, so blocking the
 * paper would overstate it.
 *
 * And **there is no saving cue anywhere in the Dock**, in this story or any
 * other. That is the proposal: a commit settles faster than a spinner can be
 * read, so the states worth drawing are the three that need a reader.
 */
export const SaveFailed: Story = () => {
  const chrome = useChrome({
    kind: 'failed',
    failure: {
      kind: 'retryable-failure',
      code: 'network',
      message: 'The space could not be reached.',
    },
  });

  return <PrototypeCanvas chrome={chrome} initialEdge="top" />;
};

SaveFailed.meta = { iframed: true };

/**
 * **A rejection, which is final and has to be acknowledged.**
 *
 * `PersistenceControl`'s `AlertDialog`, portalled and owning the viewport — so
 * unlike the notice it needs no placement at all, and where the Dock is sitting
 * is not part of the decision.
 */
export const SaveRejected: Story = () => {
  const chrome = useChrome({
    kind: 'rejected',
    failure: { kind: 'permanent-failure', code: 'forbidden', message: 'Permission denied' },
  });

  return <PrototypeCanvas chrome={chrome} initialEdge="top" />;
};

SaveRejected.meta = { iframed: true };

/**
 * **A conflict, which blocks until local or stored work is chosen.**
 *
 * The same production `AlertDialog`, and the same reason it needs no placement:
 * a conflict has no safe dismissal, so it owns the viewport wherever the
 * furniture is.
 */
export const SaveConflict: Story = () => {
  const chrome = useChrome({
    kind: 'conflicted',
    current: {
      snapshot: { ...commandDockSnapshot, document: { version: 1, title: 'Rendering' } },
      revision: 5n,
      exportedRevision: null,
    },
    baseline: undefined,
  });

  return <PrototypeCanvas chrome={chrome} initialEdge="top" />;
};

SaveConflict.meta = { iframed: true };

/**
 * **A Space that went wrong while the reader was somewhere else.**
 *
 * This is question C, and it is the one the Dock could not answer at all. The
 * strip is over `Rendering`, which is fine; `Design system` — the Space one step
 * up the trail — is the one whose commit failed. Nothing about the Dock says so
 * until the switcher is opened, and then the row that names it carries the mark.
 *
 * **It is a regression the Sidebar did not have.** `OpenSpaces`, the vertical
 * tab strip the switcher replaces, drew a badge per open Space for `conflicted`,
 * `failed` and `rejected`. A switcher that lists the same set and says nothing
 * makes a Space that needs a decision look exactly like one that does not.
 *
 * The row says *which*, and nothing else: a dot at the trailing edge, its
 * sentence in the row's title and in an `sr-only` span so the state is never
 * colour alone. The recovery itself belongs to that Space's own Dock, which is
 * one press away — the switcher is a way to Spaces, not a place to repair one.
 */
export const SaveFailedElsewhere: Story = () => {
  const chrome = useChrome(
    {
      kind: 'failed',
      failure: {
        kind: 'retryable-failure',
        code: 'network',
        message: 'The space could not be reached.',
      },
    },
    'elsewhere',
  );

  return <PrototypeCanvas chrome={chrome} initialEdge="top" />;
};

SaveFailedElsewhere.meta = { iframed: true };
