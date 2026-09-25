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
 * an exclusion: this surface is only complete because the rail carries them.
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
 */
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  CommandToolbar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  ToolbarButton,
} from '@project/ui';
import { canRetry } from '@project/persistence';
import { PersistenceControl, PersistenceNotice } from './PersistenceControl';
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
} from '../dock-placement';
import {
  DISCLOSURE_ALIGN,
  DISCLOSURE_SIDE_OFFSET,
  DISCLOSURE_WIDTH,
  DockDisclosureContext,
  DockRenamingContext,
  RESOURCES_DISCLOSURE_ID,
  useDockDisclosure,
  type DockIdentity,
  type DockRenaming,
} from './command-dock-shared';
import { Divider } from './CommandDockParts';
import type { DockChrome, DockPersistence } from './command-dock-chrome';
import { SpacesControl } from './CommandDockSpaces';
import { GraphControls, MapControls } from './CommandDockMapGraph';
import { ResourcesControl } from './CommandDockResources';
import './command-dock.css';

/* ------------------------------------------------------------------ state */

/** The one identity being renamed, and which entity it named when the rename began. */
interface RenamingSubject {
  readonly name: DockIdentity;
  readonly subject: string;
}

/**
 * The bar's one rename: which name has the slot, and what the application is
 * told about it.
 *
 * **Three rules, answered once.**
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
 * mid-rename, which would otherwise leave the flag stuck true with nothing able
 * to clear it.
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
 * A dock that is dragged by its grip and snaps to the nearest edge.
 *
 * There is no free position: releasing always docks. What the drag chooses is
 * an edge and a place along it, and the edge is what the dock then reads to
 * decide how it draws — the caller passes the same children either way.
 *
 * The pointer capture, the snap hint and the edge arithmetic are all here
 * rather than in the dock, so a later docked surface is the same drag rather
 * than a second copy of it.
 *
 * **The frame the slots are measured in is a prop, not the DOM parent.** Do not
 * read `element.parentElement`: that is a contract on the caller's markup that
 * no signature states, and a wrapper element inserted between them would move
 * every slot without a line changing here. Taking the container as a ref makes
 * the caller's own frame the answer, and is what lets this cross into
 * `@project/ui` at all.
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
   * all. That is not only a synthetic-events problem: a gesture read from state
   * cannot be driven from a test either.
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
   * It is the only state the grip's two roles need to share. A press is spent if it dragged the dock, or if it
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
   * drag. Deferring that open to `click` does not work either: the `mousedown`
   * open runs inside a `frame.request`, so a press and release inside one
   * animation frame would pass any deferral and open the menu mid-drag.
   *
   * So the menu is controlled — as every disclosure in the
   * Dock is — the grip is a plain toolbar button, and the popup positions
   * against `grip` through `MenuPositioner`'s `anchor`, which is what
   * `PopoverContent` already does for a non-trigger anchor. `Enter` and `Space`
   * are then the platform's activation of a button rather than a keyboard path
   * anything here has to arrange.
   *
   * Closing is Base UI's still: a press on the grip while the list is open is
   * an *outside* press, so the popup dismisses itself, and `pressSpent`
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
   * **This is the cancel path only; do not share it with the release.** `click`
   * fires *after* `pointerup`, so on that path the flag is exactly what the
   * `click` is about to read: clearing it there throws away both the drag
   * `onPointerMove` recorded and the dismissal `onPointerDown` did, so a
   * completed drag would open the menu over the slot it had just landed in,
   * and a press on an open list would close it and reopen it in one gesture.
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
   * asked the right button would take hold of the dock and a right-button drag
   * would dock the whole command surface wherever the pointer reached — a
   * context-menu request answered by rearranging the chrome. Nothing in the Dock is performed by a secondary button, and a
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
    // live rect here would ask the same question of a different subject and
    // could answer differently. One slot is computed, drawn, and landed on.
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
          persistence report hangs off the dock, so it has to be positioned
          against the docked box — and as a child of the toolbar it would be a
          status region inside `role="toolbar"`, which ADR 0082 forbids. The frame carries the
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
        {/* **One toolbar, and it is the command surface** (ADR 0073): one root,
            so one tab stop, with the clusters as named `role="group"`s inside
            it. Do not put a wrapper *inside* the surface: the vertical column's
            grid places this element's direct children, so a layer between them
            moves every slot. */}
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
 * **Nothing here is a new state or a new sentence.** This module spends them
 * unchanged: `PersistenceControl` maps a
 * conflict and a rejection `canRetry` does not admit to their `AlertDialog`s,
 * and `PersistenceNotice` is the standing `Alert` with a Retry for every state
 * `canRetry` admits — a retryable failure, a rejection for size, and a blocked
 * recovery. Placement is all this component decides.
 *
 * **There is no saving cue, deliberately.** `PersistenceControl` also draws
 * `PersistenceIndicator` for `settled`, `pending` and `saved`, and it is not
 * called for those here — the Dock draws nothing at all while saving is
 * working. A commit settles faster than the cue can be read, so a dot that
 * spends a permanent slot in a five-cluster strip to report the expected
 * outcome is a slot spent on nothing. The states worth a pixel are the three
 * that need a reader: `failed`, `rejected`, `conflicted`.
 *
 * **The two dialogs need no placement.** Both are portalled and own the
 * viewport, so a conflict blocks the canvas from wherever the Dock happens to
 * be — which is right: neither has a safe dismissal, and where the furniture
 * sits is not part of that decision.
 *
 * **The notice hangs off the Dock.** An
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
  // An aggregate refusal draws the same dialog a permanent
  // rejection does — `PersistenceControl` treats the two `Rejection` kinds
  // alike — so it is a decision here too, unless `canRetry` admits it (a
  // blocked recovery, or a rejection for size) and the notice takes it over.
  const decision =
    state.kind === 'conflicted' ||
    ((state.kind === 'rejected' || state.kind === 'refused') && !canRetry(state));

  return (
    <>
      {decision ? (
        <PersistenceControl
          active={persistence.active}
          persistence={state}
          onAcceptRemote={persistence.onAcceptRemote}
          onKeepLocal={persistence.onKeepLocal}
          onOpenSpace={persistence.onOpenSpace}
        />
      ) : null}
      {canRetry(state) && persistence.active ? (
        <div className="command-dock__notice" data-side={MENU_SIDE[edge]}>
          <PersistenceNotice
            persistence={state}
            onRetry={persistence.onRetry}
            onOpenSpace={persistence.onOpenSpace}
          />
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
            Map and Graph are divided like the rest: Present heads the Graph
            cluster, and an unseparated `[Collection 1 ⌄][▶ Long ⌄]` reads as a
            Present belonging to the Map beside it. The order still says a Graph
            is authored over a Map.
            Resources comes last because it is the odd cluster and should read as one:
            it names a set rather than a selection, so it has no name to edit and
            nothing to promote but Create. */}
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
 * **One dock.** Drag it by its grip to any edge, or press the grip and pick a
 * slot, and the orientation follows either way.
 *
 * Drag a Resource out of the Resources popover onto the canvas, or press the row where
 * it stands. Both are real and both are the same Edit: the Resource joins the
 * Map and the popover stays open, so the next one costs nothing either way.
 */
