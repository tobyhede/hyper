/**
 * The Command Dock over a real Space, for the catalogue and its behaviour tests.
 *
 * **What it draws is production's.** The Dock is `#components/CommandDock`
 * unchanged, the canvas is `LayoutCanvasFixture` — which owns the real React
 * Flow instance, the production `CardNode` and `RoutedEdge` and the projection
 * every stable canvas story draws through — and every Space in the session is a
 * tracked fixture from `./spaces`. What this module supplies is the one thing
 * `App` supplies in the application and a story cannot: the state behind
 * {@link DockChrome}, and a session of Spaces open beside each other.
 *
 * Every command that changes something writes the stored snapshot and reloads it
 * through `loadSpaceSnapshot`, production's own intake — so a story cannot reach
 * a Space the application would refuse, and switching a Layout, adding and
 * renaming a Layout or a Graph and placing a Card are all real Edits rather than
 * list surgery beside a fixed canvas.
 *
 * **The session is seeded already crossed.** How a Space joins the open set is
 * not the Dock's — entering is a gesture on the Open Space Card (ADR 0068) — so
 * the fixture is handed the crossings a reader would have made, which is what
 * lets the parent step, the Open Spaces menu and the per-Space persistence mark
 * be drawn at all.
 */
import { useMemo, useRef, useState } from 'react';
import {
  newUuid,
  type CardId,
  type CardPlacement,
  type GraphId,
  type Layout,
  type LayoutId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, type Space } from '@project/graph';
import type { SpaceSessionState } from '@project/persistence';
import { FALLBACK_GRAPH_COLOR, ToolbarButton } from '@project/ui';
import {
  CardsTrigger,
  CommandDock,
  type DockChrome,
  type SpaceExitReport,
} from '#components/CommandDock';
import { CARDS_TRIGGER } from '#components/command-dock-triggers';
import { CardsDrawer, CARD_DRAG_TYPE } from '#components/CardsDrawer';
import { graphColorMap } from '#src/colors';
import { nextGraphTitle, nextLayoutTitle } from '#src/titles';
import {
  editDocument,
  editSelectedLayout,
  exitSpace,
  opened,
  openTree,
  type DockEdge,
  type OpenEntry,
  type SessionState,
  type SpaceStep,
} from '#src/dock-model';
import { LayoutCanvasFixture, type DrawnLayout } from './ReactFlowCanvas';
import {
  commandDockSnapshot,
  designSystemSnapshot,
  metaSnapshot,
  platformSnapshot,
  traversalSnapshot,
} from './spaces';

/**
 * The Dock's own seam plus the Layout the canvas beside it draws.
 *
 * `drawn` is deliberately not a member of {@link DockChrome}: what the canvas
 * draws is `SpaceCanvas`'s in the application and the Dock never reads it. It is
 * carried here because one fixture supplies both halves from one Space.
 */
interface DrawnChrome extends DockChrome {
  readonly drawn: DrawnLayout;
  /** The canvas half of Add to Layout, which the drawer's rows are dragged onto. */
  readonly onDropCard: (cardId: string) => void;
}

/** Which Space in the session is the unwell one. */

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
 * `SessionState` they make up, the `openTree` the Open Spaces menu draws and the
 * `exitSpace` that has to keep that tree true are all over there, where a node
 * test can hold them to an answer. What is left here is the fixture the stories
 * open on and the three derivations React spends.
 *
 * `from` is the Space an entry was **entered from**, and it is session state
 * rather than structure. Space Card references form a DAG rooted at Meta (ADR
 * 0074): they may converge and never cycle, so a Space reached two ways has no
 * canonical parent and no canonical path. The parent the Dock names is the
 * crossing that is live, which is why it is kept there and never derived from
 * the documents — and it is what gives the Open Spaces menu's tree its shape.
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
 * path cannot be on the bar, which is the case the Open Spaces menu exists for.
 *
 * **And `Traversal` is open from Meta, off the path**, which is the other half
 * and the one a trail could never show. A set of open Spaces that is only ever
 * a line is a set for which a tree, an indent and a Open Spaces menu are all
 * unnecessary — the bar would already be naming everything there is. One branch
 * is the least that makes the Open Spaces menu answer a question the parent step does
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
 * not express at all, and the whole of question C: the Open Spaces menu lists that
 * Space, and it has to say which one it is without the reader going there to
 * find out.
 */
type Unwell = 'here' | 'elsewhere';

/**
 * The session, opened with one Space in whatever persistence state a story asks
 * for.
 *
 * `elsewhere` puts it on `Design system`, which is the parent the trail already
 * names — so the story shows both a Space that is one press away and a Open Spaces menu
 * that has to mark it.
 */
const initialSession = (
  persistence: SpaceSessionState['persistence'] = { kind: 'settled' },
  unwell: Unwell = 'here',
  alone: SpaceSnapshot | null = null,
): SessionState => {
  // A Space opened directly and never crossed out of: one entry, no Opener, and
  // so neither a parent step nor a Open Spaces menu on the bar. It is the third
  // shape `trailControls` answers, and the only one a session of crossings
  // cannot produce.
  if (alone !== null)
    return {
      open: new Map<UUID, OpenEntry>([[alone.id, { ...opened(alone, null), persistence }]]),
      currentId: alone.id,
      // Meta is not in this session's open set, which is what makes this Space
      // exitable — an Opener of `null` is not the rule Exit reads.
      metaSpaceId: metaSnapshot.id,
    };
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
    metaSpaceId: metaSnapshot.id,
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
 * one above them, and everything further up is in the Open Spaces menu beside it.
 */
const parentOf = (state: SessionState): SpaceStep | null => {
  const from = currentEntry(state).from;
  if (from === null) return null;
  const entry = state.open.get(from);
  return entry === undefined ? null : { spaceId: from, title: entry.snapshot.document.title };
};

/**
 * Moving to an open Space, which is what the parent step and the Open Spaces menu both do.
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
export function useCommandDockChrome(
  persistence: SpaceSessionState['persistence'] = { kind: 'settled' },
  unwell: Unwell = 'here',
  alone: SpaceSnapshot | null = null,
): DrawnChrome {
  const [session, setSession] = useState<SessionState>(() =>
    initialSession(persistence, unwell, alone),
  );
  const [presenting, setPresenting] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
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
  const openSpaces = useMemo(
    () =>
      openTree(
        [...session.open].map(([spaceId, entry]) => ({
          spaceId,
          title: entry.snapshot.document.title,
          from: entry.from,
          persistence: entry.persistence,
        })),
      ),
    [session],
  );

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

  /**
   * Add a Card to the drawing Layout — one Edit, whichever route asked for it.
   *
   * The drawer's own Add and a drag onto the canvas spend this same completion,
   * so nothing downstream knows which of the two got here and there is no second
   * Edit to keep in step.
   */
  const place = (cardId: CardId): void =>
    withinSelected((entry) => ({
      ...entry,
      positions: {
        ...entry.positions,
        [cardId]: dropPlacement(Object.keys(entry.positions).length),
      },
    }));

  /** What the drawer lists: the Cards this Layout does not place. */
  const unplaced = space.cards.filter((card) => layout.positions[card.id] === undefined);

  return {
    // Nothing in a story withdraws on it, but the seam is the application's and
    // a fixture that dropped it would be one field short of the thing it proves.
    onRenamingChange: () => undefined,
    drawn: { space, layoutId: layout.id },
    onDropCard: (cardId) => {
      const dropped = space.cards.find((card) => card.id === cardId);
      if (dropped !== undefined) place(dropped.id);
    },

    space: {
      title: space.title,
      currentSpaceId: session.currentId,
      parent,
      openSpaces,
      // Null, exactly as the application passes it: there is no `renamed-space`
      // Edit, so the name is a label. The fixture drew a rename control here
      // while it was a prototype, which is a command the story would have had
      // and production would not.
      onRename: null,
      onCopyLink: () => {
        document.body.dataset['copyCommand'] = 'space';
      },
      onNewSpace: () => {
        document.body.dataset['createCard'] = 'space';
      },
      // Moving, not exiting: the entry left behind stays open with its Layout and
      // its Graph, so this is a move between Spaces and never a close.
      onSwitchTo: (spaceId) => setSession((current) => switchTo(current, spaceId)),
      // And this is what the Open Spaces menu made necessary. Once nothing closes on its
      // own, exiting is a command, and it is the Space's own — so it sits in the
      // Space menu with New and Copy link rather than on the Open Spaces menu's rows.
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
      exitDisabled: space.id === session.metaSpaceId,
      exitReport,
      onDismissExitReport: () => setExitReport(null),
    },

    canvas: {
      layouts: space.layouts,
      selected: layout,
      onSelect: setLayoutId,
      onRename: (renamed, title) => {
        setSnapshot((current) =>
          editDocument(current, (layouts) =>
            layouts.map((candidate) =>
              candidate.id === renamed ? { ...candidate, title } : candidate,
            ),
          ),
        );
        // The fixture writes an Edit the application would accept, so there is
        // no refusal to report. A blank name is refused by the editor itself.
        return null;
      },
      createDisabled: false,
      deleteDisabled: false,
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
      // What the command *built*, not a word this fixture invented: the story's
      // behaviour test presses the item the application draws and reads which
      // address it produced, so a label of the harness's own choosing would only
      // prove the harness.
      onCopyLink: () => {
        document.body.dataset['copyCommand'] = 'layout';
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
      onRename: (renamed, title) => {
        withinSelected((entry) => ({
          ...entry,
          graphs: entry.graphs.map((candidate) =>
            candidate.id === renamed ? { ...candidate, title } : candidate,
          ),
        }));
        return null;
      },
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
      editsDisabled: false,
      onCopyLink: () => {
        document.body.dataset['copyCommand'] = 'layout-graph';
      },
      onCopyPermanentLink: () => {
        document.body.dataset['copyCommand'] = 'graph';
      },
      presenting,
      onPresent: () => setPresenting(true),
      // The fixture's Graphs are the tracked Space's, so what makes Present
      // unavailable is the same thing the application reads: a Graph with no
      // Edge has nothing to traverse.
      presentDisabled: graph.edges.length === 0,
    },

    cards: {
      /* The production `CardsDrawer`, drawn in the Dock's own name slot exactly
         as the application draws it. A story that stood a list of its own here
         would be showing a Cards surface the application does not have. */
      surface: (
        <CardsDrawer
          open={cardsOpen}
          onOpenChange={setCardsOpen}
          triggerRender={<ToolbarButton variant="ghost" {...CARDS_TRIGGER} />}
          triggerLabel={<CardsTrigger />}
          cards={unplaced}
          allCards={space.cards}
          onAdd={(card) => {
            place(card.id);
            return null;
          }}
          onDragStart={() => undefined}
        />
      ),
      onCreate: (kind) => {
        document.body.dataset['createCard'] = kind;
      },
      createDisabled: false,
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
      // One Space on screen in a story, so its report is always this Space's.
      active: true,
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
 * The canvas the Dock floats over, and the box it docks to.
 *
 * `LayoutCanvasFixture` owns the real React Flow instance, the production
 * `CardNode` and `RoutedEdge`, the projection every stable canvas story draws
 * through and the production `ZoomSlider` — so this module states which Layout
 * to draw and which Graph to emphasise, and nothing about how a canvas is built.
 * The Edge stacking is production's own rather than fixed handle lanes standing
 * in for it.
 *
 * The drop is caught on the wrapper, exactly as the application catches it: the
 * Cards popover floats above the canvas, so a drag out of it crosses chrome on
 * the way down and the drop bubbles here either way.
 *
 * **It also owns the box the Dock docks to, and hands it over as a ref.** The
 * Dock takes its frame as a prop rather than reaching for `parentElement`, so
 * the caller that supplies the surface is the caller that supplies the frame —
 * which is what a wrapper element inserted between them would otherwise have
 * broken silently, moving every slot with no line changing in the component.
 * In the application that element is `.graph-area`.
 */
export function CommandDockFixture({
  chrome,
  initialEdge = 'top',
}: {
  readonly chrome: DrawnChrome;
  readonly initialEdge?: DockEdge;
}) {
  const container = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={container}
      className="relative h-screen w-full overflow-hidden bg-background"
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
        chrome.onDropCard(event.dataTransfer.getData(CARD_DRAG_TYPE));
      }}
    >
      <LayoutCanvasFixture
        drawn={chrome.drawn}
        activeGraphId={chrome.graph.active.id}
        viewport={{ fit: true }}
      />
      <CommandDock chrome={chrome} container={container} initialEdge={initialEdge} />
    </div>
  );
}
