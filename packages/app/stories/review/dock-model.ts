import { openSpaceStatusLabel, type OpenSpaceStatus } from '@project/ui';
import type { SpaceSessionState } from '@project/persistence';
import type { GraphId, Layout, LayoutId, SpaceSnapshot, UUID } from '@project/core';
import type { ExitSpaceResult, RejectedExitConfirmation } from '#src/open-spaces';

/**
 * The Command Dock's model: what it derives, with no React and no DOM.
 *
 * It sits beside `command-dock.stories.tsx` rather than inside it because a
 * story module cannot be imported by a test — it draws components, pulls in a
 * stylesheet and depends on Ladle — while everything here is arithmetic and
 * mapping that a node-environment test can hold to an answer. The prototype
 * imports from here; nothing imports the prototype.
 *
 * A plain `.ts` under `stories/` is invisible to both halves of the design
 * system ratchet: `scripts/ui-catalog.ts` reads `.stories.tsx` for stories, and
 * for components it reads the `src` tree of each package rather than this one.
 * `stories/support/spaces.ts` is the same arrangement, tested by
 * `packages/app/test/story-spaces.test.ts`.
 */

/**
 * What a Space's row in the Open Spaces menu owes about its last commit, and nothing
 * more.
 *
 * The three states that need saying are the three `PersistenceControl` and
 * `PersistenceNotice` already draw a surface for — retryable failure, permanent
 * rejection and conflict. `settled` and `pending` answer `null`: **a save that
 * worked is not news**, and a save in flight is over before anyone reads a
 * spinner about it, so neither earns a mark on a row a reader is scanning for
 * names.
 *
 * The words are `openSpaceStatusLabel`'s rather than this module's. `OpenSpaces`
 * — the tab strip this Open Spaces menu is proposed to replace — already reports the
 * same three states over the same open set, and a second vocabulary for one
 * state is how a reader learns that "Save failed" and "Changes not saved" are
 * two different things.
 *
 * **A total record and not a chain of `if`s**, which is the difference between
 * a state this surface has decided about and a state it has never heard of. The
 * chain that stood here answered `null` for anything it did not name, so a
 * sixth persistence arm would have compiled, drawn nothing, and reported
 * nothing — the row would say a Space is fine because the code had not been
 * taught otherwise. Keyed on the discriminant and held to both unions at once,
 * it is a compile error instead, and the two unions cannot drift apart in
 * silence either.
 */
const UNWELL_STATUS = {
  settled: null,
  pending: null,
  failed: 'failed',
  rejected: 'rejected',
  conflicted: 'conflicted',
} as const satisfies Record<SpaceSessionState['persistence']['kind'], OpenSpaceStatus | null>;

export const unwellReport = (persistence: SpaceSessionState['persistence']): string | null => {
  const status = UNWELL_STATUS[persistence.kind];
  return status === null ? null : openSpaceStatusLabel(status);
};

/* ------------------------------------------------------------------ slots */

/**
 * Which edge the Dock is against.
 *
 * The edge decides three things at once and they are not independent: the
 * orientation the Dock draws in, which way its menus open, and how much
 * clearance it needs from the browser's own furniture.
 *
 * **The union is derived from the tuple, not checked against it.** Written the
 * other way — `['top', …] as const satisfies readonly DockEdge[]` — the check
 * proves every element *is* an edge and says nothing about an edge that is
 * missing. Add a fifth and the menu quietly offers twelve slots for fifteen,
 * with nothing red anywhere. Deriving makes the tuple the definition, so the
 * menu and every `Record<DockEdge, …>` in the surface stay total by
 * construction.
 */
export const DOCK_EDGES = ['top', 'right', 'bottom', 'left'] as const;
export type DockEdge = (typeof DOCK_EDGES)[number];

/**
 * Where along its edge the Dock sits: the two ends, and the middle.
 *
 * Quantised rather than free. A dock is furniture, and furniture that can be
 * left at 37% of an edge is furniture the next person has to look for; three
 * stops per edge is enough to get it out of the way of whatever the canvas is
 * doing, and each stop is somewhere a reader can be told to look.
 *
 * **The corners come out of this for free, and are reachable twice.** `end` of
 * the top edge and `start` of the right edge are the same corner, approached
 * from two directions — and which one you dragged from decides whether the Dock
 * is horizontal or vertical there. That is the choice, not an ambiguity: the
 * eight targets a pointer sees are four corners and four edge-middles, and a
 * corner offers two of them. The menu offers twelve rather than eight for the
 * same reason — see `DOCK_SLOTS`.
 */
export const DOCK_ALONGS = ['start', 'center', 'end'] as const;
export type DockAlong = (typeof DOCK_ALONGS)[number];

export interface DockPosition {
  readonly edge: DockEdge;
  readonly along: DockAlong;
}

/** The value one radio item carries, and the only spelling of a slot. */
export type DockSlot = `${DockEdge}:${DockAlong}`;

export const slotValue = ({ edge, along }: DockPosition): DockSlot => `${edge}:${along}`;

/**
 * Every slot, by the value its radio item carries.
 *
 * **Twelve entries written out, and not twelve built by a loop.** A loop needs
 * an assertion to claim its result is total — `Object.fromEntries` answers
 * `Record<string, …>` — and ADR 0062 does not allow one. Written literally the
 * compiler checks each key against `DockSlot` and reports any that is missing,
 * so the table is total because it was proved total rather than because it was
 * generated by something that looked exhaustive.
 */
const DOCK_SLOTS = {
  'top:start': { edge: 'top', along: 'start' },
  'top:center': { edge: 'top', along: 'center' },
  'top:end': { edge: 'top', along: 'end' },
  'right:start': { edge: 'right', along: 'start' },
  'right:center': { edge: 'right', along: 'center' },
  'right:end': { edge: 'right', along: 'end' },
  'bottom:start': { edge: 'bottom', along: 'start' },
  'bottom:center': { edge: 'bottom', along: 'center' },
  'bottom:end': { edge: 'bottom', along: 'end' },
  'left:start': { edge: 'left', along: 'start' },
  'left:center': { edge: 'left', along: 'center' },
  'left:end': { edge: 'left', along: 'end' },
} as const satisfies Record<DockSlot, DockPosition>;

/**
 * The position a menu value names, or `null` for a string that names none.
 *
 * The parameter is `string` because that is what crosses the boundary: Base UI
 * types `MenuRadioGroup`'s `onValueChange` as `any`, so what comes back is
 * untrusted whatever was written on the way in. `null` is therefore honest
 * rather than defensive — and `dock-slots.test.ts` is what says the arm cannot
 * be reached from the menu, by holding every value the menu renders to a round
 * trip.
 *
 * **Two structures for one table, and each does a job the other cannot.** The
 * record above is checked against `DockSlot` and so proves the table total; the
 * `Map` below takes an arbitrary `string` and so needs no assertion to answer
 * for one. Indexing the record directly would have wanted `value as DockSlot`,
 * which is the narrowing ADR 0062 stopped admitting — and it would have been a
 * lie besides, since the whole point of the parameter is that the value may name
 * no slot at all.
 */
const SLOT_BY_VALUE: ReadonlyMap<string, DockPosition> = new Map(Object.entries(DOCK_SLOTS));

export const dockSlot = (value: string): DockPosition | null => SLOT_BY_VALUE.get(value) ?? null;

/**
 * The axis an edge puts the Dock on: left and right stack, top and bottom run.
 *
 * **Named, because the surface asks for it in three shapes.** It was spelled
 * inline as `'horizontal' | 'vertical'` at the two places that needed to say it
 * and nowhere as a type, so `ALONG_LABEL`'s key and this function's return had
 * no relation a compiler could check.
 */
export type DockOrientation = 'horizontal' | 'vertical';

/**
 * **A record, because a ternary answers for an edge it has never met.**
 *
 * `edge === 'left' || edge === 'right' ? 'vertical' : 'horizontal'` was the last
 * edge-keyed thing in the Dock that took a default. Deriving `DockEdge` from its
 * tuple turned a fifth edge into compile errors at `EDGE_INSET`, `MENU_SIDE`,
 * `EDGE_LABEL`, `slotLabel` and `alongStyle` — every one a total record — while
 * this quietly called it horizontal, which is the one answer that then decides
 * how the Dock draws, which way its menus open and how its stops are named. The
 * loudest four failures and the one silent wrong answer were the same change
 * away from each other.
 */
const ORIENTATION = {
  top: 'horizontal',
  bottom: 'horizontal',
  left: 'vertical',
  right: 'vertical',
} as const satisfies Record<DockEdge, DockOrientation>;

export const orientationOf = (edge: DockEdge): DockOrientation => ORIENTATION[edge];

/* --------------------------------------------------------------- geometry */

/**
 * A rectangle, in whatever coordinate space both sides of a comparison share.
 *
 * **`DOMRect` is what the caller measures and not what this asks for.** The
 * arithmetic below needs four numbers; asking for a `DOMRect` would put a DOM
 * in front of every test of it, for a type whose extra members — `x`, `y`,
 * `toJSON` — none of it reads. A `DOMRect` is structurally one of these, so the
 * measuring call sites are unchanged and the geometry becomes something a node
 * test can hand two rectangles to.
 */
export interface DockBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The edge a release lands on: measured from the Dock's **own edges** rather
 * than from its centre.
 *
 * Centre distance made the top-left corner unreachable as a vertical Dock, and
 * the bug was that the Dock's width voted. A horizontal Dock is ~600px wide, so
 * its centre sits ~300px from the left edge however far left it is dragged,
 * while its centre can be 40px from the top — so `top` won every time and there
 * was no gesture that turned a top Dock into a left one near that corner. The
 * same asymmetry ran the other way for a vertical Dock near the top edge.
 *
 * The gap to an edge does not know how big the thing measuring it is, so both
 * corners are reachable from either direction and the orientation follows the
 * direction the reader dragged from — which is what the two-ways-into-a-corner
 * claim always said and did not deliver. `dock-geometry.test.ts` is what holds
 * it to that, with a Dock wide enough for the old rule to fail on.
 */
export const nearestEdge = (bounds: DockBox, box: DockBox): DockEdge => {
  const candidates = [
    { edge: 'top', distance: box.top - bounds.top },
    { edge: 'bottom', distance: bounds.bottom - box.bottom },
    { edge: 'left', distance: box.left - bounds.left },
    { edge: 'right', distance: bounds.right - box.right },
  ] as const satisfies readonly { edge: DockEdge; distance: number }[];
  return candidates.reduce((closest, candidate) =>
    candidate.distance < closest.distance ? candidate : closest,
  ).edge;
};

/**
 * The nearest of the three stops on `edge`, by the Dock's centre.
 *
 * **A stop is a place the Dock ends up, not a point on the edge**, and that is
 * the whole of the arithmetic. `start` puts a 600px-wide Dock's centre 300px
 * in, because the Dock has to fit; measuring that centre against the raw end of
 * the edge asks it to be somewhere it can never be. So the Dock's own width
 * voted, exactly as it did in `nearestEdge` before gaps replaced centres: a
 * Dock shoved hard into the left of a 1200px viewport has its centre at 304,
 * nearer the middle stop at 600 than the start stop at 0, and it snapped back
 * to the centre it had just been dragged out of. `start` and `end` were
 * effectively unreachable for any Dock wider than a third of the container.
 *
 * The comment that stood here claimed this measured "where each stop would
 * actually put the dock". It did not; now it does, and
 * `dock-geometry.test.ts` is what keeps it honest.
 *
 * **The inset is deliberately not part of it.** A stop's real position is
 * `inset + half` rather than `half`, but the three stops are hundreds of pixels
 * apart and the inset is 16, so it cannot change which is nearest — and leaving
 * it out keeps this function free of a placement policy that belongs to
 * `dockStyle`.
 */
export const nearestAlong = (bounds: DockBox, box: DockBox, edge: DockEdge): DockAlong => {
  const horizontal = orientationOf(edge) === 'horizontal';
  const position = horizontal
    ? (box.left + box.right) / 2 - bounds.left
    : (box.top + box.bottom) / 2 - bounds.top;
  const extent = horizontal ? bounds.right - bounds.left : bounds.bottom - bounds.top;
  // Half the Dock's own size along the edge it is on: how far its centre must
  // stand off either end for the Dock to fit inside the container at all.
  const half = (horizontal ? box.right - box.left : box.bottom - box.top) / 2;
  const stops = [
    { along: 'start', at: half },
    { along: 'center', at: extent / 2 },
    { along: 'end', at: extent - half },
  ] as const satisfies readonly { along: DockAlong; at: number }[];
  return stops.reduce((closest, stop) =>
    Math.abs(position - stop.at) < Math.abs(position - closest.at) ? stop : closest,
  ).along;
};

/* ---------------------------------------------------------------- session */

/**
 * One open Space: the document, where it was entered from, and what it is
 * showing.
 */
export interface OpenEntry {
  readonly snapshot: SpaceSnapshot;
  readonly from: UUID | null;
  /**
   * The Layout this entry is showing, or nothing.
   *
   * **Nullable because `defaultLayout` is optional and a Delete can empty it.**
   * ADR 0079 makes the stored `defaultLayout` the durable opening selection and
   * leaves it absent on a stored layoutless Space until first working load
   * initializes one, so "no Layout selected" is a state the entry has to be able
   * to hold. `null` is how it holds it; the render's fallback to the first
   * Layout is what turns it back into something to draw.
   */
  readonly layoutId: LayoutId | null;
  readonly graphId: GraphId | null;
  /**
   * How this Space's last commit went — **per open Space, and not per session**.
   *
   * A commit belongs to the Space it was made in (ADR 0076), and the reader is
   * only ever standing in one of the open set. So a Space whose save failed
   * while the reader was somewhere else has to keep saying so until they come
   * back to it, which a single session-wide field could not express: it would
   * report the Space you are looking at and silently drop the other four.
   */
  readonly persistence: SpaceSessionState['persistence'];
}

/**
 * A Space opened from nothing stored: where it opens is `defaultLayout`, as in
 * the app.
 *
 * **`?? null` and not `String(...)`.** The laundering that stood here answered
 * the five-letter string `"undefined"` for a layoutless Space — an id no Layout
 * can carry, in the field the whole surface reads to decide what is drawing. It
 * compiled because everything downstream was declared `string`; branding
 * `layoutId` is what made it unrepresentable, and `dock-session.test.ts` is what
 * says it stays that way.
 */
export const opened = (snapshot: SpaceSnapshot, from: UUID | null): OpenEntry => ({
  snapshot,
  from,
  layoutId: snapshot.document.defaultLayout ?? null,
  graphId: null,
  persistence: { kind: 'settled' },
});

const storedLayouts = (snapshot: SpaceSnapshot): readonly Layout[] =>
  snapshot.document.layouts ?? [];

/** One Edit on the stored document, which the reload then validates. */
export const editDocument = (
  snapshot: SpaceSnapshot,
  edit: (layouts: readonly Layout[]) => readonly Layout[],
): SpaceSnapshot => ({
  ...snapshot,
  document: { ...snapshot.document, layouts: [...edit(storedLayouts(snapshot))] },
});

/**
 * One Edit on whichever Layout the entry selects.
 *
 * **The entry is the argument because the entry is the only thing that can
 * answer.** The hook resolved this from a `selectedId` read during render and
 * then spent it inside a functional state updater that had correctly gone and
 * fetched the *live* entry — so what was being written and what said where to
 * write it came from two different moments. React flushes discrete events, so
 * it usually agreed; a gesture that selected a Layout and edited it in one tick
 * did not, and wrote into the Layout that had been selected before it.
 *
 * The same stale-closure class the drag gesture had, and the same answer: take
 * the state being written rather than closing over a rendered copy of it. Made
 * an argument, a captured id is not merely wrong — it cannot be expressed.
 *
 * The fallback is the render's: a `layoutId` naming no stored Layout selects
 * the first, which is what `useChrome` draws and so what an Edit must agree
 * with. ADR 0079 keeps at least one Layout, so an empty document is not a state
 * this has to answer for — it edits nothing and says so by changing nothing.
 */
export const editSelectedLayout = (
  entry: OpenEntry,
  edit: (layout: Layout) => Layout,
): OpenEntry => {
  const layouts = storedLayouts(entry.snapshot);
  const selected = layouts.find((each) => each.id === entry.layoutId) ?? layouts[0];
  if (selected === undefined) return entry;
  return {
    ...entry,
    snapshot: editDocument(entry.snapshot, (current) =>
      current.map((each) => (each.id === selected.id ? edit(each) : each)),
    ),
  };
};

/* ------------------------------------------------------------ open Spaces */

/** A Space the Dock names: the parent step, and every row of the Open Spaces menu. */
export interface SpaceStep {
  readonly spaceId: UUID;
  readonly title: string;
}

/**
 * One row of the open-Spaces tree, and how deep it hangs in it.
 *
 * The set of open Spaces is a **tree**, not a path: each entry remembers the
 * Space it was entered from, so `Meta ▸ Platform ▸ Design system` and a second
 * Space opened straight off Meta are both in it at once. `depth` is what the
 * Open Spaces menu indents by, and it is derived from `from` rather than stored, so a
 * row cannot claim a depth its opener does not give it.
 */
export interface OpenRow extends SpaceStep {
  /** What this Space's row has to say about it, which is nothing unless it is unwell. */
  readonly depth: number;
  readonly persistence: SpaceSessionState['persistence'];
}

/** Every Space the session has open, and which of them is on the canvas. */
export interface SessionState {
  readonly open: ReadonlyMap<UUID, OpenEntry>;
  readonly currentId: UUID;
}

/**
 * Every open Space, depth-first from the root, in the order they were opened.
 *
 * A tree because `from` makes one — and drawing it as a tree rather than as a
 * flat list is what lets the Open Spaces menu say *where* a Space is as well as that it
 * is open. A flat list would put a Space three crossings down beside the root
 * with nothing to tell them apart but their names, which is exactly the
 * confusion the bar's parent step exists to remove.
 *
 * `Map` iterates in insertion order, so siblings are listed in the order the
 * reader opened them. Nothing sorts them: a Open Spaces menu that reordered itself as
 * the reader moved would move the row they were aiming at.
 *
 * **Every `from` names a Space that is open**, which is what makes the walk
 * total: entries begin that way and {@link exitSpace} re-homes the rows below
 * the Space it closes. Without that invariant this drops a Space whose opener
 * exited — still open, and not in the list that is the only way back to it.
 */
export const openTree = (session: SessionState): readonly OpenRow[] => {
  const below = (from: UUID | null, depth: number): readonly OpenRow[] =>
    [...session.open]
      .filter(([, entry]) => entry.from === from)
      .flatMap(([spaceId, entry]) => [
        { spaceId, title: entry.snapshot.document.title, depth, persistence: entry.persistence },
        ...below(spaceId, depth + 1),
      ]);
  return below(null, 0);
};

/**
 * What the bar draws above the Space you are in.
 *
 * `none` is the session that has never crossed and has nowhere to go; the
 * other three are the parent step, the Open Spaces menu, or both.
 */
export type TrailControls = 'none' | 'open-spaces-menu' | 'parent' | 'parent-and-open-spaces-menu';

/**
 * **The bar names one step and the Open Spaces menu holds the rest.**
 *
 * Settled against nine candidates drawn at one, three and six crossings in both
 * dock orientations; the sheet that drew them is gone and the reasoning is in
 * `.scratch/command-dock/issues/01-settle-the-three-open-decision-sheets.md`.
 * Depth costs width and the Dock is furniture at the edge of a canvas rather
 * than a page header, so every scheme that spends a mark per crossing loses the
 * same way: by four crossings it is a row of collapsed glyphs saying "two
 * Spaces, and you will have to hover to learn which". One named step — the
 * Space you came from, which is the one a reader actually reaches for — costs a
 * word, and everything above it moves behind the Open Spaces menu.
 *
 * What that buys beyond width is the thing no trail could offer: the Open Spaces menu
 * lists the **open set** rather than the path, so a Space opened from the root
 * and left behind is in it beside the branch you are standing on. A trail can
 * only show what is above you, so an open Space that is not an ancestor had
 * nowhere to be and leaving one meant losing it.
 *
 * **The Open Spaces menu discloses whatever the bar is not already naming**, which is
 * why the count it is compared against is 1 at the root and 2 below it: the bar
 * names this Space always, and the parent step when there is one. So the
 * Open Spaces menu arrives at the Space after those — the third ordinarily, the second
 * at the root. It stays at the root rather than vanishing there, because a
 * Open Spaces menu reachable from everywhere except the top makes the top the one place
 * a reader cannot get back from.
 */
export const trailControls = (
  parent: SpaceStep | null,
  openSpaces: readonly OpenRow[],
): TrailControls => {
  const named = parent === null ? 1 : 2;
  const openSpacesMenu = openSpaces.length > named;
  if (parent === null) return openSpacesMenu ? 'open-spaces-menu' : 'none';
  return openSpacesMenu ? 'parent-and-open-spaces-menu' : 'parent';
};

/**
 * An exit that did not happen, which is the only kind the surface draws.
 *
 * Derived from production's own result rather than restated, so an arm added
 * to `ExitSpaceResult` is a compile error here rather than a silence.
 */
export type ExitOutcome = Exclude<ExitSpaceResult, { kind: 'exited' }>;

export interface SpaceExit {
  readonly result: ExitSpaceResult;
  readonly session: SessionState;
}

type ExitRefusal = Extract<ExitSpaceResult, { kind: 'refused' }>['refusal'];

/**
 * The one thing that distinguishes the sentences: what the reader can do.
 *
 * `persistence-recovery-required` is one code and two situations, and a reader
 * sent to Resolve when the fix is Retry has been sent to the wrong control — so
 * the recovery, not the code, is the key wherever there is one.
 */
type ExitReportKey =
  | Extract<ExitSpaceResult, { kind: 'warning' }>['warning']
  | Extract<ExitRefusal, { code: 'meta-space-permanent' }>['code']
  | Extract<ExitRefusal, { code: 'persistence-recovery-required' }>['recovery'];

const exitReportKey = (outcome: ExitOutcome): ExitReportKey =>
  outcome.kind === 'warning'
    ? outcome.warning
    : outcome.refusal.code === 'meta-space-permanent'
      ? outcome.refusal.code
      : outcome.refusal.recovery;

/**
 * **A total record, for the reason `UNWELL_STATUS` above is one.** A chain of
 * `if`s answers for an arm it has never heard of, and the answer it gives is
 * silence — which for a refusal means a command that does nothing and says
 * nothing about why. ADR 0082 binds the surface to name which open Space is
 * unwell, so silence is the one thing this may not do.
 */
const EXIT_REPORT = {
  'persistence-rejected': (title) =>
    `${title} has changes the server refused, and there is no way to save them. Exiting discards them.`,
  'meta-space-permanent': (title) =>
    `${title} is where navigation starts, so it stays open for the whole session.`,
  retry: (title) => `${title}’s last save failed. Retry the save in that space, then exit it.`,
  'resolve-conflict': (title) =>
    `${title} has changes that conflict with the stored space. Resolve the conflict in that space, then exit it.`,
} as const satisfies Record<ExitReportKey, (title: string) => string>;

/** What an exit that did not happen owes the reader: which Space, and what to do about it. */
export const exitReportSentence = (title: string, outcome: ExitOutcome): string =>
  EXIT_REPORT[exitReportKey(outcome)](title);

/**
 * Exiting one Space — the prototype's stand-in for `openSpaces.exit`.
 *
 * **The rules below are not this file's.** They are `retireOpenSpace`'s
 * (`packages/app/src/open-spaces.ts`), which is `CONTEXT.md`'s Exit verbatim:
 * the root refuses as `meta-space-permanent`, `failed` refuses with the
 * recovery `retry` and `conflicted` with `resolve-conflict`, `rejected` warns
 * once and proceeds only when the warning is handed back, one Space closes and
 * never a second (ADR 0068), and the canvas falls to the first entry still open
 * when the Space it was on is the one that went. The result is production's
 * `ExitSpaceResult` rather than a shape invented here, which is what the three
 * arms the Dock draws are drawn from.
 *
 * **One rule is approximated, and the approximation is stated rather than
 * hidden.** Production refuses `spaceId === metaSpaceId`; this refuses an entry
 * whose Opener is `null`, because a `SessionState` carries no Meta id to
 * compare against. In this fixture the two coincide — Meta is the only entry
 * minted with no Opener — but they are not the same rule: production records a
 * `null` Opener for a Space opened directly and for one reached by URL, so the
 * built Exit closes Spaces this stand-in would refuse. Nothing here is
 * evidence about those, and the seam that removes the approximation is
 * `.scratch/command-dock/issues/07`'s.
 *
 * **It is a stand-in and not the call, and that is a finding rather than a
 * shortcut.** `exit` is a closure over a `SpaceSessionRegistry` of live
 * `SpaceSession`s: it decides by awaiting `waitUntilRetirable` and reading
 * `session.getState().persistence`, then releases the session and disposes a
 * composed app. A story has none of that — this prototype's Spaces are stored
 * snapshots re-derived through `loadSpaceSnapshot`, and its unwell states are
 * fixtures a story hands in, which over a real registry would take a scripted
 * backend to produce. Reaching the built rules from here needs a seam that does
 * not exist: the *decision* — persistence state, Meta, confirmation, in;
 * `ExitSpaceResult` out — separated from the waiting and the disposal that
 * surround it. Ticket 07 is where that is worth cutting, because promoting the
 * Dock puts a real `OpenSpaces` behind it either way.
 *
 * **Where the rows below the closed Space go.** They hang off its opener, which
 * is the nearest Space still open. Nothing acts on it — the field is a picture
 * of the order Spaces were opened in and Exit stays a one-Space operation
 * whichever way it points (ADR 0074 gives a Space no canonical parent anyway).
 * What it buys is that {@link openTree}'s walk stays total, so a Space whose
 * opener exited is still in the list that is the only way back to it.
 */
export const exitSpace = (
  session: SessionState,
  spaceId: UUID,
  confirmation?: RejectedExitConfirmation,
): SpaceExit => {
  const entry = session.open.get(spaceId);
  // Production throws here too: exiting a Space that is not open is a defect in
  // the caller rather than an outcome a reader is owed a sentence about.
  if (entry === undefined) throw new Error(`Space ${spaceId} is not open`);
  const opener = entry.from;
  // Meta is the entry nothing was entered from, and in this fixture that is the
  // one that cannot go — the approximation the doc comment above states.
  if (opener === null) {
    return { result: { kind: 'refused', refusal: { code: 'meta-space-permanent' } }, session };
  }
  const { persistence } = entry;
  if (persistence.kind === 'failed') {
    return {
      result: {
        kind: 'refused',
        refusal: { code: 'persistence-recovery-required', recovery: 'retry' },
      },
      session,
    };
  }
  if (persistence.kind === 'conflicted') {
    return {
      result: {
        kind: 'refused',
        refusal: { code: 'persistence-recovery-required', recovery: 'resolve-conflict' },
      },
      session,
    };
  }
  if (persistence.kind === 'rejected' && confirmation?.warning !== 'persistence-rejected') {
    return { result: { kind: 'warning', warning: 'persistence-rejected' }, session };
  }
  const open = new Map<UUID, OpenEntry>();
  for (const [id, each] of session.open) {
    if (id === spaceId) continue;
    open.set(id, each.from === spaceId ? { ...each, from: opener } : each);
  }
  // The Opener, not the Space just removed, is what an empty set falls back to.
  // `opener` is non-null on this branch and `spaceId` names a Space that is no
  // longer open, so the arm that cannot be reached still says something true.
  const first = [...open.keys()][0] ?? opener;
  return {
    result: { kind: 'exited' },
    session: { open, currentId: session.currentId === spaceId ? first : session.currentId },
  };
};
