/**
 * The Command Dock's Spaces cluster: the Opener and the Open Spaces menu, the
 * Space you are in with its menu, and the report of an Exit that did not
 * happen. `CommandDock` mounts {@link SpacesControl}.
 */
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
  ChevronDownIcon,
  CloseIcon,
  CommandName,
  CopyIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ParentIcon,
  ResourceKindIcon,
  ToolbarButton,
  ToolbarGroup,
} from '@project/ui';
import type { UUID } from '@project/core';
import type { ListingRow, NamedSpace, RejectedExitConfirmation } from '../open-spaces';
import {
  exitReportSentence,
  openCount,
  openSpacesName,
  SPACES_LABEL,
  unwellElsewhere,
  unwellReport,
  type ExitOutcome,
} from '../dock-model';
import type { MenuSide } from '../dock-placement';
import { SET_TRIGGER } from './command-dock-triggers';
import {
  DISCLOSURE_ALIGN,
  DISCLOSURE_SIDE_OFFSET,
  DISCLOSURE_WIDTH,
  useDockDisclosure,
  useIdentityCaret,
  type IdentityDisclosure,
} from './command-dock-shared';
import { Divider, IdentitySurface, SetTrigger } from './CommandDockParts';

/**
 * **The one set of branded ids the Dock still binds by hand.**
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
 * inside a group of `MapId`s infers `'none'`, compiles, and comes back out of
 * `onValueChange` wearing the brand — so `onSelect(mapId: MapId)` is
 * handed a string that is not one, and its declared type is a lie the compiler
 * helped tell. Bound, that literal is a `TS2322` where it is written.
 * `ResourcesPopover`'s `FilterToggle` binds the same way, and
 * `tools/typing-fixtures/must-fail/mismatched-menu-item.tsx` is the standing
 * evidence that the rule bites.
 *
 * **The Map and Graph sets no longer need a name here, and that is the
 * better answer rather than a looser one.** Both are `ChoiceMenu` now, which
 * renders the group *and* its items from one type parameter — so the two halves
 * cannot be named differently because no call site writes the second one.
 * Naming a type twice and trusting the author is what a shared composition
 * removes; `ChoiceMenu<MapId>` is the whole of it.
 *
 * **Two of the Dock's remaining radio groups are deliberately absent** and
 * neither wants adding: a Graph's colour is a plain `string` on both sides
 * (`onRecolor(graphId, color: string)`), so there is no narrower type to name;
 * and the dock-slot group re-parses through `dockSlot(next)` before it acts, so
 * the value it trusts is one the parser produced rather than one the JSX
 * claimed.
 */
const SpaceItem = DropdownMenuRadioItem<UUID>;

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
 * The Space's chevron: an ordinary menu, the same one Map and Graph carry.
 *
 * **It used to disclose a list of Spaces and that list is gone.** A Space is a
 * Space Resource, so the Spaces in this Space are Resources in it, and the surface that
 * offers Resources already offers them. Two disclosures over overlapping sets was
 * the duplication, and the one that had to go is the one whose set was a
 * subset.
 *
 * **The same grouping grammar as `MapMenuActions` and `GraphMenuActions`
 * minus the part that names a set** (`.scratch/dock-menu-reorganisation/issues/02`):
 * Rename beside Copy link to Space, then Exit Space — one separator between
 * the two groups. The list of Spaces this control does *not* draw is the
 * **open** set, and that belongs to the Open Spaces menu beside the Opener
 * control, where the question is which Space you are looking at rather than what
 * you can do to it.
 *
 * **Exit is the one command the Open Spaces menu made necessary.** While pressing an
 * ancestor was Exit, leaving and closing were the same gesture and neither
 * needed a name; now that moving closes nothing, the open set only grows unless
 * something takes from it. It sits in its own trailing group, separated by a
 * rule — the same position Delete holds on the Map and Graph menus — and
 * it is disabled on the meta Space, which cannot be exited.
 *
 * **It is `openSpaces.exit`'s rules and not this module's.** `CONTEXT.md`'s Exit
 * — wait on an in-flight commit, refuse for `failed` and `conflicted` naming the
 * recovery each has, warn and permit for `rejected` — is implemented there, and
 * `ExitReport` below draws the three arms of the `ExitSpaceResult` it answers.
 *
 * There is still no **Delete**, which a Map and a Graph both offer: deleting
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
            Copy link to Space
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {/* Its own trailing group, separated by a rule — the same position
              Delete holds on the Map and Graph menus. It is **not**
              destructive though, and does not draw as it — exiting a Space
              discards a session's place in it, not the Space, and
              re-entering costs one press on a Resource. Meta cannot be exited,
              so there the row is present and unavailable rather than gone —
              and that is the *only* case, which `exitDisabled` is named for
              and `space.opener` was not.

              **Exit, because the glossary says Exit.** `CONTEXT.md` gives the
              word to the one action that closes an entered Space, and
              `openSpaces.exit` is spelled that way too; this drew "Close Space"
              and so named a fourth resource beside Open, Close and Exit. */}
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
 * `[Opener] [⌄]` — where you came from, and every other Space you have open.
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
 * **The Open Spaces menu is always drawn, and Meta always tops it**, open or
 * not, so where navigation starts is reachable from every Space.
 *
 * At the root the shape is therefore `[∞ Spaces ⌄] [⬡ Space ⌄]`.
 */
function OpenerAndOpenSpaces({
  space,
  side = 'bottom',
}: {
  readonly space: DockSpace;
  readonly side?: MenuSide;
}) {
  const { id: triggerId, open, onOpenChange } = useDockDisclosure();
  const opener = space.opener;
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
   * Derived in the model and read here, because the trigger's accessible name
   * (`openSpacesName`) reads the same number, and a count taken twice could
   * have the dot and the name disagree.
   */
  const unwell = unwellElsewhere(space.listing, space.currentSpaceId);
  /**
   * Meta's own row, whichever arm of {@link ListingRow} it is — `listing`
   * draws it first whether or not it is open (`open-spaces.ts`), so the first
   * row is always Meta's and nothing here has to ask which Space it names.
   * `null` only for the empty listing `SpaceApp`'s isolated mount draws.
   */
  const metaId = space.listing[0]?.spaceId ?? null;
  const selectRow = (spaceId: UUID): void => {
    const row = space.listing.find((candidate) => candidate.spaceId === spaceId);
    if (row !== undefined) space.onSelect(row.spaceId, row.title);
  };

  return (
    // Named for the surface it draws: the primitive's own default is a word
    // CONTEXT.md retires for it (`dock-commands.test.tsx` holds the name).
    <Breadcrumb aria-label="Open Spaces">
      {/* The Dock has one type scale and the trail is in it. `BreadcrumbList`
          defaults to `text-sm`, which is a page's scale: the crumb inside it
          drew its own 13px and took its line height from the list, so the
          Open Spaces menu came out a pixel shorter than every other named control.
          `compact` is the 13px the rest of the surface is at. */}
      <BreadcrumbList size="compact" className="command-dock__trail-list">
        {opener === null ? null : (
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
                  // **The Opener's ink is a shared variant and not a rule here.**
                  // The Opener recedes below the bar's own tone so the two rows
                  // read as a place and the volume it sits inside, and that is
                  // a Button's ink: declared over this class, it made an
                  // application stylesheet a second owner of the shared
                  // recipe's appearance, and won only by being loaded later.
                  variant="receded"
                  size="compact"
                  className="command-dock__crumb nokey"
                  aria-label={`Go to ${opener.title}`}
                  title={`Go to ${opener.title}`}
                  onClick={() => space.onSelect(opener.spaceId, opener.title)}
                />
              }
            >
              {/* A name and never an editor. A Space is renamed from inside it;
                  this one is somewhere you are not, so the one action it offers
                  is going there. */}
              <ParentIcon />
              <CommandName>{opener.title}</CommandName>
            </BreadcrumbLink>
          </BreadcrumbItem>
        )}
        {/* The grid places the list's items, so the track a row belongs in is a
            class on the `li` — and a placement class of its own, not the name
            control's borrowed. At the root the Open Spaces menu carries the word and
            stands in the name track; below it, it is a bare chevron in the
            disclosure track. */}
        <BreadcrumbItem
          className={opener === null ? 'command-dock__name-item' : 'command-dock__disclose'}
        >
          <DropdownMenu open={open} onOpenChange={onOpenChange} triggerId={triggerId}>
            <DropdownMenuTrigger
              id={triggerId}
              className={
                opener === null
                  ? `command-dock__spaces-trigger ${SET_TRIGGER.className}`
                  : 'nokey command-dock__more command-dock__disclose'
              }
              // The Dock's words, and {@link openSpacesName} is where they
              // and the reason for them live — the visible word and the
              // accessible name are one token, so the pair cannot drift.
              aria-label={openSpacesName(openCount(space.listing), unwell)}
              title="Switch Space"
              // A `ToolbarButton` like every other control in the bar. It sits
              // in a breadcrumb rather than in a cluster, which used to mean a
              // plain `Button` — Base UI's toolbar button throws outside a
              // `Toolbar.Root`, and each cluster was its own root. The Dock is
              // one root now, so this is inside it and takes no tab stop of
              // its own.
              render={
                <ToolbarButton variant="ghost" size={opener === null ? SET_TRIGGER.size : 'icon'} />
              }
            >
              {/* **At the root the chevron says what it discloses**, and it
                    says it the way Resources does — the same `SetTrigger`, so the
                    two cannot space themselves differently. Below the root the
                    Opener's name stands beside the chevron and the pair reads
                    as a place and a way out of it; at the top there is no
                    Opener, and a bare chevron left the region opening with a
                    mark that names nothing.

                    The OPEN mark: the Spaces set starts at Meta, while the
                    Space you are in carries the cube whichever Space it is. */}
              {opener === null ? (
                <SetTrigger icon={<ParentIcon />}>{SPACES_LABEL}</SetTrigger>
              ) : (
                <ChevronDownIcon />
              )}
              {/* The same dot the unwell row carries, on the control that
                    discloses it — one treatment for one meaning, so the mark on
                    the bar and the mark in the list read as one mark. It
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
              {/* A radio group, as Map and Graph both use, because this is
                    the same question those ask: which of a set is the one you
                    are looking at. What differs is only that the set is nested,
                    and the indent is the whole of that difference. */}
              <DropdownMenuRadioGroup value={space.currentSpaceId} onValueChange={selectRow}>
                <DropdownMenuLabel>Open Spaces</DropdownMenuLabel>
                {/* Meta tops the list whether or not it is open (`listing`'s
                      own rule), so where navigation starts is one choice away
                      from every Space — including one reached by its own
                      address, which has no Opener. */}
                {space.listing.map((row) => {
                  if (!row.open) {
                    return (
                      <SpaceItem key={row.spaceId} value={row.spaceId} closeOnClick>
                        <ParentIcon />
                        {row.title}
                      </SpaceItem>
                    );
                  }
                  const report = unwellReport(row.persistence);
                  return (
                    <SpaceItem key={row.spaceId} value={row.spaceId} closeOnClick>
                      {/* The indent is **drawn**: a hairline per level, so
                          `Traversal` and `Platform` are visibly siblings and
                          the row you are on is three rules deep without anyone
                          counting pixels (`.scratch/command-dock/issues/01-...`).
                          After the guides, each row carries its Space's mark —
                          OPEN for Meta, the cube for every other Space, as the
                          Space cluster draws it. */}
                      {row.depth === 0 ? null : (
                        <span className="command-dock__guides" aria-hidden="true">
                          {Array.from({ length: row.depth }, (_, level) => (
                            <span key={level} className="command-dock__guide" />
                          ))}
                        </span>
                      )}
                      {row.spaceId === metaId ? (
                        <ParentIcon />
                      ) : (
                        <ResourceKindIcon kind="space" decorative />
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
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * `[↰ Opener] [⌄] │ [⬡ Rendering ⌄]` — where you came from, and where you are.
 *
 * Two shapes, decided by whether this Space was entered from another:
 *
 *   opened directly   `[∞ Spaces ⌄] │ [⬡ Space ⌄]`
 *   entered           `[↰ Opener] [⌄] │ [⬡ Space ⌄]`
 *
 * Two parts, and the split is the arrangement. The **Opener** is the Space
 * this one was Entered from, marked with a direction rather than the Space glyph because both are Spaces
 * and only their position differs, and the `⌄` beside it switches among every
 * open Space (`OpenerAndOpenSpaces` above).
 * The **cluster** is the Space you are in — a Map or Graph cluster in every
 * respect: a named disclosure, and Rename a command in that list.
 *
 * **The Spaces inside this one are not in either.** They are Space Resources, so
 * they are in the Resources list with every other Resource — as Resources, with nothing on
 * the row that goes into one. That is the difference the two surfaces keep: the Open Spaces menu
 * lists the Spaces already **open**, and the Resources list holds Resources. At the top
 * — the Meta Space — that list is every Space there is, which is the "All
 * Spaces" every comparable tool builds a separate screen for.
 *
 * **Only the Space you are in is authorable.** The Opener control draws a name and
 * never an editor: a Space is renamed from inside it, and two equally weighted
 * editable names would say you are in both.
 *
 * **Three elements this removed rather than added.** There is no Exit button on
 * the bar — Exit is in the Space menu — no
 * separate list of open Spaces beside a trail of ancestors, and no tooltip
 * carrying depth — the Open Spaces menu's indent carries it. The Sidebar's tab strip
 * (`OpenSpaces`, deleted by `.scratch/command-dock/issues/08`) is not carried
 * over as a strip, but this is what it modelled: the *set* of open Spaces. What
 * it could not model is the crossing, and the Opener control is that.
 *
 * **What depth costs is width, and the two parts are how it is paid.** Only one
 * step is ever a word, so a fourth crossing costs nothing at all on the bar; and
 * in a vertical dock, where width is the scarce axis, the Opener takes a line
 * of its own above the cluster instead of running along beside it.
 */
export function SpacesControl({
  space,
  side = 'bottom',
  vertical = false,
}: {
  readonly space: DockSpace;
  readonly side?: MenuSide;
  readonly vertical?: boolean;
}) {
  return (
    /* Two parts rather than one group, because they have two jobs: the way
       back with the Open Spaces menu on it, and the commands on the Space you are in.
       The split is what lets the vertical dock put them on separate lines, and
       it costs no tab stop — the toolbar root is the Dock's, so both parts'
       controls are items in the one roving order. */
    <div className="command-dock__space">
      <OpenerAndOpenSpaces space={space} side={side} />
      {/* Always, because the region above always draws the Open Spaces menu. */}
      <Divider orientation={vertical ? 'horizontal' : 'vertical'} />
      <ToolbarGroup aria-label="Space" className="command-dock__cluster">
        <IdentitySurface
          icon={<ResourceKindIcon kind="space" decorative />}
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
