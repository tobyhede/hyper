import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  AppShell,
  DeleteIcon,
  FALLBACK_GRAPH_COLOR,
  type EntityActionGroup,
  type EntityActionOutcome,
} from '@project/ui';
import {
  type Thing,
  type ThingId,
  type DiagramId,
  type DiagramPosition,
  type UUID,
} from '@project/core';
import type { ProductDestination } from '@project/http';
import { createNonThrowingReporter, type SpaceSummary } from '@project/persistence';
import { graphThingIds, Placement, positionedStrategy } from '@project/graph';
import type { BrowserLocation } from './browser-location';
import type { OpenSpace, OpenSpacesState, RejectedExitConfirmation } from './open-spaces';
import type { AuthoringRefusal, AuthoringResult } from './space-authoring';
import { authoringAvailability } from './authoring-availability';
import { selectedThingOf, type EdgeSubject } from './render-adapter';
import { canvasProjection } from './canvas-projection';
import { canvasContent } from './canvas-content';
import {
  describeAuthoringRefusal,
  describeSpaceThingBreak,
  describeSpaceThingRefusal,
  presentNewAliasRefusal,
  presentNewSpaceThingRefusal,
} from './authoring-refusal';
import { useThingCreation } from './thing-creation-react';
import { thingCreationMessage } from './thing-creation';
import type {
  ThingCreationInput,
  ThingCreationOutcome,
  ThingCreationRead,
  ThingCreationSeams,
} from './thing-creation';
import { useSpaceThingTargets } from './space-thing-targets';
import { usePlacementRendering } from './placement-rendering';
import { thingSizeVars } from './thing';
import { canRetreat } from './navigation';
import { copyLink } from './clipboard';
import {
  COPY_LINK_ACTION_ID,
  COPY_PERMANENT_LINK_ACTION_ID,
  DELETE_DIAGRAM_ACTION_ID,
  spaceEntityActions,
  type EntityCommandId,
  type SpaceChromeTitleSubject,
  type SpaceEntity,
} from './entity-actions';
import { usePresentingKeys } from './presenting-keys';
import { nextThingTitle } from './titles';
import { diagramThings, resolveDiagram } from './diagram-resolution';
import type { DestinationOpening } from './destination-opening';
import { SpaceCanvas } from './components/SpaceCanvas';
import { CanvasCentre, type VisibleCentre } from './components/CanvasCentre';
import { CanvasContinuation } from './components/CanvasContinuation';
import { ChromeContinuation } from './components/ChromeContinuation';
import { DeleteThingConfirmation } from './components/DeleteThingConfirmation';
import { CommandDock, type DockChrome, type SpaceExitReport } from './components/CommandDock';
import { NewAlias } from './components/NewAlias';
import { NewSpaceThing } from './components/NewSpaceThing';
import { PlacementFailure } from './components/PlacementFailure';
import { PlacementPending } from './components/PlacementPending';
import { PresentingChrome } from './components/PresentingChrome';
import { ShellNotice } from './components/ShellNotice';
import { useOpenSpaces } from './open-spaces-context';
import { openTree } from './dock-model';

/**
 * What an isolated single-Space mount reads in place of the session's open set.
 *
 * `SpaceApp` mounts one Space with no `OpenSpacesContext` above it, and
 * `useSyncExternalStore` can be called neither conditionally nor with a
 * snapshot that is a fresh object each render — so the absent store is one
 * frozen empty state and one subscription that never publishes. Nothing is
 * derived from it: `active` answers `true` off the null context itself, an
 * isolated mount always being the Space on the canvas.
 */
const NO_OPEN_SPACES: OpenSpacesState = {
  activeSpaceId: null,
  entries: [],
  openedFrom: new Map(),
};
const noOpenSpaces = (): OpenSpacesState => NO_OPEN_SPACES;
const noOpenSpacesChanges = (): (() => void) => () => undefined;

export const createApp = (
  { app: composition, session: spaceSession, spaceThings, initialization }: OpenSpace,
  browserLocation: BrowserLocation,
  opening?: DestinationOpening,
) => {
  const {
    readWorkingSpace,
    currentSpace,
    navigation,
    authoring,
    adapter: useRenderAdapter,
    continuation,
    edgeAuthoring,
    reportObserverError,
  } = composition;
  /**
   * The composed sink, guarded at this point of use.
   *
   * `readReferenceableSpaces` below reports and *then* answers, so a sink that
   * threw would leave the pane on a list that says it is still being read. The
   * repository wraps where it consumes rather than where it publishes —
   * `createObservableState` does the same with the sink it is handed — so the
   * guard is here rather than on `ComposedApp`.
   */
  const reportBreak = createNonThrowingReporter(reportObserverError);
  /**
   * The Spaces a Space Thing may reference, or the fact that they could not be
   * read.
   *
   * Answers rather than rejects, which is what lets the pane word the failure
   * the way the coordination words it. That also means the shell's own
   * reporting arm never runs for this path, so the rejection is reported here
   * — without it, a transport failure is the one failure on this pane that
   * is shown to the author and then discarded.
   */
  const readReferenceableSpaces = async (): Promise<ThingCreationRead> => {
    // Outside the `try`, because this reads the working snapshot rather than
    // the repository: `currentSpace` throws for a snapshot that fails intake,
    // and catching that here would word it as a stored-Spaces read that was
    // never attempted. Left to reject, it takes the same arm the Alias pane's
    // own `currentSpace` read takes, so one failure is said one way.
    const containingSpaceId = currentSpace().id;
    try {
      const spaces = await spaceThings.referenceableSpaces(containingSpaceId);
      return { choices: { kind: 'space', targets: { kind: 'read', spaces } }, listing: null };
    } catch (failure) {
      reportBreak(failure);
      return {
        choices: { kind: 'space', targets: { kind: 'unreadable' } },
        listing: presentNewSpaceThingRefusal({ code: 'persistence-read-failed' }),
      };
    }
  };
  const openingGraphId = opening?.graphId ?? null;
  const openingPresentationThingId = opening?.presentationThingId ?? null;
  if (openingGraphId !== null && openingPresentationThingId !== null) {
    navigation.openPresentation(
      navigation.getState().selectedDiagramId,
      openingGraphId,
      openingPresentationThingId,
    );
  } else if (openingGraphId !== null) {
    navigation.openGraph(navigation.getState().selectedDiagramId, openingGraphId);
  }

  function App() {
    const authoringState = useSyncExternalStore(authoring.subscribe, authoring.getState);
    const sessionState = authoringState.session;
    /**
     * The session's open set, read through a subscription like every other
     * observable collaborator here.
     *
     * Both things taken off it decide what a *hidden* Space does — `active`
     * withholds the `window`-level Presenting keys and the portalled persistence
     * dialogs, and the entries are the rows the Dock's Open Spaces menu draws,
     * which is how a hidden Space that has gone unwell is still reportable on
     * the showing one. (`active` withheld the shell's `Ctrl/Cmd-B` too, until
     * ADR 0082 retired the Sidebar that shortcut opened.) Reading `getState()`
     * during render
     * answered both correctly only while every mounted `App` happened to
     * re-render on each publish, which is `OpenSpacesApplication` rebuilding
     * every entry's element rather than anything this component asks for:
     * memoize either and a hidden Space stays `active` and takes back the
     * global keys this prop exists to withhold.
     */
    const spaces = useOpenSpaces();
    const openSpacesState = useSyncExternalStore(
      spaces?.subscribe ?? noOpenSpacesChanges,
      spaces?.getState ?? noOpenSpaces,
    );
    const active = spaces === null || openSpacesState.activeSpaceId === sessionState.working.id;
    const navigationState = authoringState.navigation;
    const selectedDiagramId = navigationState.selectedDiagramId;
    /**
     * The two things the browser's location tells this component (ADR 0081).
     *
     * Read rather than owned: the location follows one Space, is answered by
     * `browser-location.ts`, and outlives any one mount. What is *not* here is
     * the position that module last synced to — publishing it would let this
     * decide about a position twice.
     */
    const { addressedThingId, destinationNotFound } = useSyncExternalStore(
      browserLocation.subscribe,
      browserLocation.getState,
    );
    // Keyed on the Diagram as well as the Thing: a deliberate move clears the
    // published selection, and moving between two Diagrams that address
    // the *same* Thing leaves `addressedThingId` untouched, so keying on the Thing
    // alone would let React bail out and never restore it. Clearing on `null` is
    // the other half — an address that stops naming a Thing must stop selecting
    // one, or the Thing's rail keeps offering copy commands for a Thing the URL
    // has left behind.
    useEffect(() => {
      const adapter = useRenderAdapter.getState();
      if (addressedThingId === null) {
        adapter.clearSelection();
        return;
      }
      adapter.selectThing(addressedThingId);
      // Centred and focused once its projection exists — the one member that
      // touches the camera, because a Thing arrived at by URL is somewhere the
      // reader has never been. The wait is the canvas adapter's, which is what
      // replaced the component that polled the live projection for it.
      continuation.request({
        target: { kind: 'thing', thingId: addressedThingId },
        select: false,
        then: 'reveal',
      });
    }, [addressedThingId, selectedDiagramId]);
    /**
     * Whether a Thing's content edit is running, reported up by the canvas.
     *
     * Read by one control. Presenting draws the active Thing's content *instead
     * of* the Thing (`showActiveThingContent`), so a live editor cannot survive it
     * and the draft would go without one of ADR 0064's four exits being spent.
     * The two modal surfaces need nothing here: `ThingPane` owns its own
     * modality, and the editor is still there when it closes.
     */
    const [editingThingBody, setEditingThingBody] = useState(false);
    const [editingThingTitle, setEditingThingTitle] = useState(false);
    const [createDiagramRefusal, setCreateDiagramRefusal] = useState<AuthoringRefusal | null>(null);
    const [diagramManagementRefusal, setDiagramManagementRefusal] =
      useState<AuthoringRefusal | null>(null);
    /**
     * A Space command that broke rather than refusing, in words.
     *
     * Switching and exiting are the two commands that reach *another* Space's
     * session, and either can fail for a reason that is not a refusal — a Space
     * that cannot be re-composed, a backend that will not answer. Both used to
     * be reported: `OpenSpacesApplication` drew a "Space could not be opened"
     * panel and `ExitSpaceControl` an `Alert`. Both surfaces went with the
     * Sidebar and the failures went to `console.error` with them, which leaves
     * the reader pressing a row that does nothing. `reportBreak` still runs —
     * a broken command is a diagnostic as well as a report.
     */
    const [spaceCommandBreak, setSpaceCommandBreak] = useState<string | null>(null);
    /** Why the last Graph Edit did not run, or `null` — see `reportGraphEdit`. */
    const [graphRefusal, setGraphRefusal] = useState<AuthoringRefusal | null>(null);
    const [clipboardFailure, setClipboardFailure] = useState<string | null>(null);
    /**
     * Why the last Delete Thing did not run, or `null`.
     *
     * The Thing rail's menu reports *that* the command failed in its own label,
     * which is all a two-word report can say; the reason has to be somewhere,
     * and the canvas is where the author who pressed it is looking. Same shape
     * and same place as the clipboard failure above, for the same reason: a
     * command that did not do what its label says owes the reader words.
     */
    const [thingDeletionRefusal, setThingDeletionRefusal] = useState<string | null>(null);
    /**
     * The Thing a confirmation is standing over, and the deletion it would run.
     *
     * The operation travels with the Thing rather than being rebuilt when the
     * answer comes: which Edit a deletion is depends on the kind of Thing, and
     * deciding that twice — once to arm the question, once to answer it — is two
     * places to get it wrong about a command with no undo behind it.
     */
    const [pendingThingDeletion, setPendingThingDeletion] = useState<{
      readonly thing: Thing;
      readonly remove: () => string | null | Promise<string | null>;
    } | null>(null);
    /**
     * Copy one address, answering whether it reached the clipboard.
     *
     * The answer is what a menu item reports on. This was fire-and-forget past
     * a `then`, so the press and the outcome were two moments and the item
     * swapped its label at the first one — "Copied" over a link the browser had
     * refused, with the refusal rendering as an alert the reader might not even
     * be able to see — the Sidebar was a Sheet over that area on a phone, and
     * the report was behind it.
     *
     * The clipboard half of Copy link, and only that. What a destination's URL
     * *is* belongs to the browser location (ADR 0081); what happens to it after
     * is this surface's.
     */
    const copyProductDestination = useCallback(
      async (destination: ProductDestination): Promise<boolean> => {
        setClipboardFailure(null);
        const failure = await copyLink(browserLocation.href(destination));
        setClipboardFailure(failure);
        return failure === null;
      },
      [],
    );
    /**
     * The outstanding request that the Dock disclose its Things list, if any.
     *
     * **A request, not the open state** — the Dock owns whether the list is
     * open, because it owns the one slot that keeps its disclosures exclusive
     * (`DockThingsList`). A fresh object per request is the signal; an equal one
     * recomputed by an unrelated edit reopens nothing the reader has closed.
     */
    const [discloseThings, setDiscloseThings] = useState<{
      readonly thingId: ThingId | null;
    } | null>(initialization === 'created-diagram' ? { thingId: null } : null);
    const thingsDrag = useRef<{
      readonly thingId: ThingId;
      readonly diagramId: DiagramId;
    } | null>(null);
    const renderedSpace = useMemo(
      () => readWorkingSpace(sessionState.working),
      [sessionState.working],
    );

    /**
     * Where a Thing created from a control rather than a pointer goes.
     *
     * Read at the gesture, never captured earlier: an author who pans between
     * opening the Alias picker and choosing a Target is looking somewhere else
     * by the time the Thing is placed, and the whole point of the visible centre
     * is that it is where they are looking now.
     */
    /**
     * **State rather than a ref, and the difference is a lint rule with a point
     * behind it.** The reporter is installed once when the canvas's `things`
     * branch mounts and withdrawn once when it unmounts (`CanvasCentre`), so
     * there is no per-frame write to keep out of React's hands — and a ref read
     * by a handler that the Command Dock's chrome object carries makes that
     * whole object a ref value to React's compiler, which then refuses the
     * object's use in render. What the ref was buying was nothing this needs;
     * what it cost was the surface below being unrenderable without a
     * suppression.
     *
     * Set through the updater form because the value *is* a function: passing
     * it directly would have React call it as an updater and store a
     * `DiagramPosition` where a getter belongs.
     */
    const [visibleCentre, setVisibleCentre] = useState<VisibleCentre | null>(null);
    /**
     * The box the Command Dock docks to.
     *
     * The canvas's own element, so the twelve slots are the slots of the paper
     * rather than of the window: a drawer opening at the end edge narrows the
     * area and the Dock's right-edge stops move with it, which is what a reader
     * would expect of furniture sitting on the canvas.
     */
    const graphArea = useRef<HTMLDivElement | null>(null);
    const reportVisibleCentre = useCallback((centre: VisibleCentre | null) => {
      setVisibleCentre(() => centre);
    }, []);
    // The origin is unreachable in practice — the control is withdrawn until Things
    // are on the canvas, and the reporter is mounted with them — but a created
    // Thing must land *somewhere*, and a refusal would be the wrong answer to a
    // question about geometry.
    const centreAnchor = useCallback(
      (): DiagramPosition => visibleCentre?.() ?? { x: 0, y: 0 },
      [visibleCentre],
    );

    /**
     * Making an Alias: the Target choice *is* the creation (ADR 0009's storyboard).
     *
     * A refusal keeps the surface open with its reason, because the two the
     * creation can raise are about the Target the author just chose — it has
     * left the Space, or it is an Alias itself — and closing would take away the
     * field that answers them. Handed on whole rather than checked against that
     * pair first: the check was a string comparison ending in a `throw`, which
     * is a crash inside a React event callback for the one case it was written
     * to catch, and the pane places every refusal it is given.
     *
     * `queued` and `unchanged` are `none`. `queued` is an Edit that lands later
     * from the drain and cannot honour "the caret lands on the Alias that now
     * exists", so it must not take the pane with it either; `unchanged` this
     * operation cannot answer, because it mints or it refuses. Neither is
     * reachable from here today — named rather than trusted to stay that way.
     */
    const createAlias = useCallback(
      ({ target, title }: Extract<ThingCreationInput, { kind: 'alias' }>): ThingCreationOutcome => {
        const created = authoring.complete({
          kind: 'created-alias',
          target,
          // Exactly as typed, the empty string included. The default is
          // Authoring's: an empty title mints the same neutral `Thing N` any
          // other created Thing gets (ADR 0083), so nothing here guesses a name
          // — and normalization is the schema's rule, which Authoring applies.
          title,
          anchor: centreAnchor(),
        });
        if (created.kind === 'refused')
          return { kind: 'refused', errors: presentNewAliasRefusal(created.refusal) };
        // Each arm named rather than narrowed in one comparison, so the
        // compiler asks again the day a fifth joins the union.
        if (created.kind === 'queued') return { kind: 'none' };
        if (created.kind === 'unchanged') return { kind: 'none' };
        if (created.createdThingId === undefined) return { kind: 'none' };
        return { kind: 'created', thingId: created.createdThingId };
      },
      [centreAnchor],
    );

    /**
     * Making a Space Thing: one coordinated Edit across Spaces (ADR 0076).
     *
     * There is no naming continuation. The lifecycle answers `completed` and
     * nothing else, so the created Thing has no id to select from the result,
     * and it needs none: the title was typed on the pane before the Edit ran,
     * which is why this pane has a title field where Add Thing has an inline
     * editor. So it continues the way a cancelled pane does, at Add Thing,
     * rather than leaving focus on `<body>` when the modal unmounts.
     *
     * The Things the Space held before the Edit are what recognise the one it
     * added: the Edit is atomic and installs every participant at once, so
     * exactly one Thing can have appeared in this Space.
     */
    /**
     * The Spaces the Things list offers, and when they are re-read.
     *
     * **A repository read rather than a derivation of this Space**, because the
     * Meta Space's Spaces are not this Space's Things — ADR 0074 makes a Space
     * reachable through the Space Things that reference it, and the list offers
     * the Spaces themselves so a reader can frame one that nothing here points
     * at yet. `referenceableSpaces` withholds the containing Space, which is
     * the one target that cannot work whatever else is stored.
     *
     * Re-read on an epoch rather than on every working snapshot: the set only
     * changes when a Space is created or destroyed, which happens through the
     * coordinated lifecycle, so one bump per such Edit costs one read where
     * keying on the snapshot would cost one per keystroke.
     *
     * **The epoch is the lifecycle's and not this component's**, because the
     * Edit that moves it is the *session's*: it is coordinated across Spaces,
     * and every open Space stays mounted with its own list (ADR 0074, ADR 0076,
     * `OpenSpacesApplication`). Local state here was re-read only where the Edit
     * was made, so a Space framed or destroyed in one open Space left every
     * other one offering the set as it was.
     *
     * **And the epoch invalidates rather than fetches.** One shared epoch with
     * every mounted `App` reading on it is the same defect the other way round:
     * one Edit becomes N repository reads and N state updates, for N−1 lists
     * that cannot be opened — a hidden Space's Things trigger is not merely
     * unread, it is unreachable. So only the drawn Space subscribes, `read`
     * compares the epoch it last answered before spending anything, and a
     * Space that was hidden across an Edit reads once, when it is shown. The
     * guarantee is unchanged and the cost is back to one read per Edit.
     */
    const [metaSpaces, setMetaSpaces] = useState<readonly SpaceSummary[]>([]);
    // Last read wins, by token rather than by a cancelled flag: two reads can
    // be in flight across a quick pair of Edits, and the one that started first
    // may answer last.
    const latestSpacesRead = useRef(0);
    /**
     * The epoch `metaSpaces` answers, or `null` for a list never read.
     *
     * A ref rather than state, because it decides whether to read and never
     * what to draw — as state it would be a second render per read, and the
     * render that matters is `setMetaSpaces`'s.
     */
    const readSpacesEpoch = useRef<number | null>(null);
    useEffect(() => {
      // Not subscribed at all while hidden, rather than subscribed and
      // returning early: a subscriber that decides to do nothing has still
      // woken every hidden Space on every Edit.
      if (!active) return;
      const read = (): void => {
        const epoch = spaceThings.spaceSet.getState();
        if (readSpacesEpoch.current === epoch) return;
        readSpacesEpoch.current = epoch;
        const token = latestSpacesRead.current + 1;
        latestSpacesRead.current = token;
        void (async () => {
          try {
            const spaces = await spaceThings.referenceableSpaces(currentSpace().id);
            if (latestSpacesRead.current === token) setMetaSpaces(spaces);
          } catch (failure) {
            // Reported rather than drawn: the list's own empty state says what
            // it has, and a Spaces read that failed is not a refusal of
            // anything the reader asked for.
            reportBreak(failure);
            // The epoch goes back, so the next showing retries rather than
            // standing on an empty list until another Space is framed.
            readSpacesEpoch.current = null;
            if (latestSpacesRead.current === token) setMetaSpaces([]);
          }
        })();
      };
      read();
      return spaceThings.spaceSet.subscribe(read);
    }, [active]);

    /**
     * Placing a Space: the Space Thing that frames it, authored in this Diagram.
     *
     * The same `link` the creation pane spends, from the surface that offers
     * the Space — so a reader who found it in the list never meets a second
     * picker asking which Space they meant. The Title defaults to the Space's
     * own, which is the name they just read on the row; renaming it afterwards
     * is the ordinary inline Title edit every Thing has (ADR 0083).
     */
    const addSpaceThingFor = useCallback(
      async (space: { readonly id: UUID; readonly title: string }): Promise<string | null> => {
        // Answers rather than rejects, for `readReferenceableSpaces`'s reason
        // and one more: the list spends this on a press, so a rejection left to
        // travel is a row that visibly does nothing. `resolveDiagram` is inside
        // the `try` because it is the likeliest break on this path — the list
        // has been open across renders and the Diagram it resolves is the one
        // drawing now.
        try {
          const resolved = resolveDiagram(currentSpace(), navigation.getState().selectedDiagramId);
          const result = await spaceThings.link({
            containingSpaceId: currentSpace().id,
            diagramId: resolved.diagram.id,
            title: space.title,
            position: centreAnchor(),
            targetSpaceId: space.id,
          });
          return result.kind === 'refused' ? describeSpaceThingRefusal(result.refusal) : null;
        } catch (failure) {
          // Both: the reader gets the sentence on the list that asked, and the
          // diagnostic still reaches the operational channel.
          reportBreak(failure);
          return describeSpaceThingBreak(failure);
        }
      },
      [centreAnchor],
    );

    const createSpaceThing = useCallback(
      async ({
        targetSpaceId,
        title,
      }: Extract<ThingCreationInput, { kind: 'space' }>): Promise<ThingCreationOutcome> => {
        // Resolved here rather than closed over: the Diagram a Space Thing is added
        // to is the one drawing when the author confirms, and the pane has been
        // open across renders. `create` still refuses `diagram-not-found` on its
        // own account, against the Diagram the coordinated Edit actually sees.
        const resolved = resolveDiagram(currentSpace(), navigation.getState().selectedDiagramId);
        const input = {
          containingSpaceId: currentSpace().id,
          diagramId: resolved.diagram.id,
          title,
          position: centreAnchor(),
        };
        const before = new Set(spaceSession.getState().working.things.map(({ id }) => id));
        const result = await (targetSpaceId === null
          ? spaceThings.create(input)
          : spaceThings.link({ ...input, targetSpaceId }));
        if (result.kind === 'refused')
          return { kind: 'refused', errors: presentNewSpaceThingRefusal(result.refusal) };
        // Named rather than narrowed to "not refused", the way `createAlias`
        // names its own arms: a lifecycle that changed nothing made no Thing, so
        // closing the pane on it would return the author to Add Thing believing
        // one exists. Not reachable from `create` or `link` today.
        if (result.kind === 'unchanged') return { kind: 'none' };
        const created = spaceSession.getState().working.things.find(({ id }) => !before.has(id));
        if (created !== undefined) useRenderAdapter.getState().selectThing(created.id);
        // Nothing bumps the Spaces epoch here: a created Space joins the Meta
        // Space for *every* open Space, so the lifecycle that made it is what
        // announces it (`space-thing-lifecycle.ts`).
        // `null` rather than the Thing just selected: there is nothing to
        // continue *at*, because the title was typed on the pane before the
        // Edit ran, so the author goes back to Add Thing.
        return { kind: 'created', thingId: null };
      },
      [centreAnchor],
    );

    /**
     * The two ways the kinds differ, and the only two (`thing-creation.ts`).
     *
     * An Alias filters the Space it is already holding, so its read is
     * synchronous and its Edit is over before anything could draw a disabled
     * control. A Space Thing reads the repository and completes across Spaces,
     * so both of its seams answer a promise and the pane goes busy for the
     * second. Everything else about the two panes is one state machine.
     *
     * A failed listing is not an empty repository, and the list on its own
     * cannot tell the author which it was — "A new Space" alone reads as "there
     * are no others", and creating a duplicate of a Space they meant to
     * reference is the mistake that follows. Said with the refusal the
     * coordination itself uses for an unreadable repository, so one failure is
     * not worded two ways.
     */
    const thingCreationSeams = useMemo<ThingCreationSeams>(
      () => ({
        readChoices: (kind) =>
          kind === 'alias'
            ? {
                choices: {
                  kind: 'alias',
                  // The single-hop rule read forwards (ADR 0009): a Target must
                  // own its Markdown content. The Space's own Things, not the
                  // Diagram's — an Alias points at content, and content is not
                  // something a Diagram owns.
                  targets: currentSpace().things.filter((thing) => thing.kind === 'markdown'),
                },
                listing: null,
              }
            : readReferenceableSpaces(),
        submit: (input) => (input.kind === 'alias' ? createAlias(input) : createSpaceThing(input)),
        reportBreak,
        continuation,
      }),
      [createAlias, createSpaceThing],
    );
    const thingCreation = useThingCreation(thingCreationSeams);
    const creationPane = thingCreation.state.pane;
    /**
     * A creation pane is open, whichever kind it is creating.
     *
     * The condition every surface outside the pane reads. Both are modal — a
     * focus trap and a backdrop over the whole graph area — so "one authoring
     * surface at a time" is one rule, and writing it as a disjunction at each
     * of its call sites is how a third kind would come to be withdrawn from
     * some of them.
     */
    const creatingThing = creationPane.status !== 'closed';
    // A refusal describes the attempt; a failed listing describes the list. The
    // pane draws whichever is current on one channel, and which that is belongs
    // to the module that owns the arms.
    const creationRefusal = thingCreationMessage(creationPane);

    const selectedDiagram = useMemo(
      () => resolveDiagram(renderedSpace, selectedDiagramId),
      [renderedSpace, selectedDiagramId],
    );
    // The positioned strategy that draws this Diagram, built where it is used:
    // its one consumer is the placement rendering below (ADR 0025, ADR 0041).
    const strategy = useMemo(
      () => positionedStrategy(Placement.fromDiagram(selectedDiagram.diagram)),
      [selectedDiagram],
    );
    // The Things this Diagram places. Memoized on the same two values the Diagram
    // is: it is the sole dependency of Edge Authoring's Thing-title map and its
    // endpoint choices, and a fresh array per render would rebuild both on every
    // intermediate drag frame — which is the identity churn
    // `edge-authoring-react.tsx` says its commands object must not have.
    const placedThings = useMemo(
      () => diagramThings(renderedSpace, selectedDiagram.diagram),
      [renderedSpace, selectedDiagram],
    );
    // Everything the canvas draws, derived once from the Space and the Diagram.
    // Memoized on those two alone: the interaction state below changes far more
    // often, and it is `project` that reads it rather than this.
    const projection = useMemo(
      () => canvasProjection(renderedSpace, selectedDiagram),
      [renderedSpace, selectedDiagram],
    );

    const { activeGraphId } = navigationState;
    const presenting = navigationState.mode === 'presenting';
    useEffect(() => {
      thingsDrag.current = null;
    }, [selectedDiagramId, presenting, authoringState.replacementEpoch]);
    // There is a Thing to go back to only once a traversal has left its first, and only
    // presenting has Traversal history at all — the same narrowing the alias above already
    // makes, spent here on the value behind it rather than on the mode.
    const selectBranch = navigation.selectBranch;
    const activeThingId = navigation.activeThingId();
    // Derived here rather than in a store selector: the array is rebuilt on every
    // call, so a selector would hand Zustand a new identity each render — a
    // re-render producing a new value producing a re-render, until React gives up.
    // That is still the rule; what is deliberate is that this is a plain render
    // computation and **not** memoized.
    //
    // Navigation reads the session's current working Space. Authoring an Edge from
    // the Thing being presented leaves the navigation values unchanged, so deriving
    // moves during render makes the newly authored Edge immediately traversable.
    // A render-time call is not the selector case above — nothing subscribes to
    // this identity, so a fresh array cannot feed a re-render — and the work is a
    // filter and a map over one Graph's Edges, or nothing at all outside presentation.
    const moves = navigation.moves();

    // Read at the point of use, like `moves` above and for the same reason: the
    // placement is not published state, and subscribing to it through the
    // render adapter — a store that knows nothing about either the placement or
    // the selected Diagram — only worked because every install happened to be
    // followed by an unrelated notification. This component already re-renders
    // on both stores, and a render-time read cannot be stale at the render that
    // uses it. `replacePlacement` keeps the map's identity when the value is
    // unchanged, so this does not defeat the memo below.
    const authoredPositions = authoring.authoredPlacement();
    const resizeDraft = useRenderAdapter((s) => s.resizeDraft);
    const selection = useRenderAdapter((s) => s.selection);
    const selectedThingId = selectedThingOf(selection);

    const thingsOutsideSelectedDiagram = useMemo(
      () =>
        renderedSpace.things.filter(
          (thing) => selectedDiagram.diagram.positions[thing.id] === undefined,
        ),
      [selectedDiagram, renderedSpace.things],
    );
    const liveProjection = useRenderAdapter((s) => s.projection);
    // Reported by the canvas, which is the only place it can be seen: an
    // embedded Diagram publishes its live edits from inside the React Flow
    // subtree. Read back out of the store the canvas wrote it into, so the
    // answers derived from it reach the command surface and the canvas in one
    // render rather than an effect apart.
    const editingEmbeddedDiagram = useRenderAdapter((s) => s.editingEmbeddedDiagram);
    // There are Things on the canvas to interact with once placement resolves
    // and the store has taken it.
    const hasThingsOnCanvas = liveProjection !== null;
    /**
     * Whether a chrome name is being renamed in place.
     *
     * A boolean where this was a whole draft — subject, text, error and the
     * surface it began on. The draft existed because a Diagram's name was drawn
     * **twice**, in a Sidebar row and in the canvas header, and one rename had
     * to be live in both at once and return the caret to whichever began it.
     * The Command Dock draws each name once and `InlineTitleEditor` owns the
     * text, the refusal and the focus return, so all that is left for the
     * application to know is that one is open — which is what withdraws the
     * canvas's own title editing beside it (`authoring-availability.ts`).
     */
    const [editingChromeTitle, setEditingChromeTitle] = useState(false);
    const thingIsOpen = Object.values(selectedDiagram.diagram.positions).some(
      (at) => at?.open === true,
    );
    /**
     * What may be authored right now — one question, answered once, spent by
     * every surface below and by the canvas (`CONTEXT.md`, Availability).
     *
     * The reasons each answer carries live in `authoring-availability.ts`,
     * beside the answer they govern, rather than at the call sites that spend
     * them: two surfaces reading the same operation cannot disagree about it,
     * and a term added for one of them is added for all of them.
     */
    const availability = authoringAvailability({
      editable: hasThingsOnCanvas,
      presenting,
      creatingThing,
      editingThingBody,
      editingThingTitle,
      thingIsOpen,
      editingChromeTitle,
      spaceOnCanvas: active,
      editingEmbeddedDiagram,
    });
    // A withdrawn list takes its outstanding request with it. Closing is the
    // Dock's, from the same `disabled` answer that withdraws the trigger; what
    // has to be dropped here is a request that would otherwise reopen the list
    // the moment authoring came back — presenting and creating an Alias both
    // pass through here, and a list that reopened itself on the way back would
    // take focus with it, landing the reader in the Things rather than on the
    // canvas they returned to.
    //
    // Read during render rather than in an effect, like the rename guards below:
    // an effect drops it one frame after the presentation has already started
    // drawing over it. `thingsView` is `!presenting && !creatingThing` and carries
    // nothing derived from this value, so clearing it here settles in one pass.
    if (discloseThings !== null && !availability.thingsView) setDiscloseThings(null);
    // Reveals the list once per (Diagram, address) rather than on every
    // dependency change: an unrelated edit elsewhere in the Space still
    // recomputes `thingsOutsideSelectedDiagram` with a fresh array identity, and
    // re-running on that alone would reopen a list the reader just closed.
    // The Diagram is part of the key, not just the Thing id — a canonical Thing
    // link addresses no Diagram of its own, so the same Thing can be
    // revealed once in one Diagram and then adopt a different default Diagram
    // that omits it, and that is a second reveal rather than a repeat.
    const [revealedAddress, setRevealedAddress] = useState<{
      readonly diagramId: DiagramId;
      readonly thingId: ThingId;
    } | null>(null);
    if (addressedThingId === null) {
      // Only a real navigation clears the address — choosing a Diagram,
      // activating a Graph, or restoring a destination that names no Thing — so
      // leaving it is the reader moving on rather than the incidental
      // recomputation this guard absorbs. Arriving back at the same address
      // afterwards is a fresh reveal, not the repeat being suppressed.
      if (revealedAddress !== null) setRevealedAddress(null);
    } else if (
      revealedAddress?.diagramId !== selectedDiagramId ||
      revealedAddress.thingId !== addressedThingId
    ) {
      setRevealedAddress({ diagramId: selectedDiagramId, thingId: addressedThingId });
      if (thingsOutsideSelectedDiagram.some(({ id }) => id === addressedThingId)) {
        setDiscloseThings({ thingId: addressedThingId });
      }
    }
    const placement = usePlacementRendering(
      projection.strategyGraph,
      strategy,
      resizeDraft?.placement ?? authoredPositions,
    );
    const laidOut = placement.kind === 'ready' ? placement.strategyGraph : null;

    // Nothing is worth projecting before a strategy resolves — every thing would
    // sit at the origin — and `project` will not take a null `LayoutStrategyGraph`,
    // so this is the whole of that gate rather than a rule the sync effect
    // remembers.
    const projected = useMemo(
      () =>
        laidOut === null
          ? null
          : projection.project(laidOut, {
              activeGraphId,
              activeThingId,
              selectedThingId,
              presenting,
            }),
      [projection, laidOut, activeGraphId, activeThingId, selectedThingId, presenting],
    );

    // Hand the complete projection to the render adapter as one state change.
    // A Thing keeps its live position, measured size and drag state, while an Edge
    // can never become visible before the endpoint nodes declare its handles.
    const syncProjection = useRenderAdapter((s) => s.syncProjection);
    useEffect(() => {
      if (projected) syncProjection(projected.nodes, projected.edges);
    }, [projected, syncProjection]);

    const changeNodes = useRenderAdapter((s) => s.changeNodes);
    const changeEdges = useRenderAdapter((s) => s.changeEdges);
    const thingResize = useRenderAdapter((s) => s.thingResize);
    const reportEmbeddedDiagramEditing = useRenderAdapter((s) => s.reportEmbeddedDiagramEditing);
    const canvas = canvasContent(placement, hasThingsOnCanvas);
    // Every standing refusal is about the Diagram that was selected when it was
    // refused — the Edit New Diagram would have made, the Rename or Delete on
    // the one it named, the Graph Edit inside it, the Thing it would not remove
    // from it. None of them says anything about the Diagram the reader has moved
    // to, so the move clears them together, during the render that moves rather
    // than one frame after it.
    //
    // The Thing deletion refusal was outside this and cleared only when the next
    // Delete Thing was armed, so a refused deletion stayed pinned to the shell
    // through Diagram switches and unrelated Edits until someone pressed Delete
    // again.
    const [refusedUnder, setRefusedUnder] = useState(selectedDiagramId);
    if (refusedUnder !== selectedDiagramId) {
      setRefusedUnder(selectedDiagramId);
      setCreateDiagramRefusal(null);
      setDiagramManagementRefusal(null);
      setGraphRefusal(null);
      setThingDeletionRefusal(null);
    }
    /**
     * The two facts that end a chrome rename that is not the author ending it,
     * read as **render-time transitions rather than effects**.
     *
     * An effect runs after the render it reacts to, so each of these drew one
     * frame of a rename that had already stopped being available — an editor
     * over a Diagram the reader has left, or over a Space that was replaced under
     * them. The Dock's rename slot reads the same two facts the same way and
     * for the same reason (`useDockRenaming` in `components/CommandDock.tsx`),
     * so the surface and the composition agree about when a draft ends.
     *
     * They stay two conditions rather than one, and that separation is older
     * than this shape: the availability guard reads only whether a chrome title
     * edit may run, and listing the replacement epoch beside it re-ran a body
     * that could then do nothing, which is how the two rules came to look like
     * one. **A replacement discards every open Interaction draft (ADR 0042)**,
     * and this draft lives outside the canvas subtree `replacementEpoch` keys,
     * so the remount does not reach it.
     *
     * **This clears the report and not the editor** — the two are different
     * things and reading them as one is what left the defect. The editor is the
     * bar's own rename slot, so the epoch is *also* handed to the Dock
     * (`replacementEpoch` below) and the slot ends the rename on it. What
     * this branch still owes is that the withdrawal it drives — Create Thing,
     * Present, Delete Thing, the canvas's own title editing — comes back in the
     * same render as the replacement rather than on the commit after, when the
     * name control's effect cleanup would otherwise report it.
     */
    const [renameEpoch, setRenameEpoch] = useState(authoringState.replacementEpoch);
    if (renameEpoch !== authoringState.replacementEpoch) {
      setRenameEpoch(authoringState.replacementEpoch);
      if (editingChromeTitle) setEditingChromeTitle(false);
    } else if (editingChromeTitle && !availability.chromeTitleEdit) {
      setEditingChromeTitle(false);
    }

    /**
     * One chrome rename, answered rather than performed twice.
     *
     * The editor is `InlineTitleEditor`, mounted by the Dock's own name control,
     * and it holds a refused draft open and editable — so this returns the
     * refusal's sentence rather than swallowing it, and `null` for an Edit that
     * landed. `unchanged` is `null` too: renaming a Diagram to the title it
     * already has is the value the author already authored, and closing the
     * editor is the right answer to it (`space-authoring.ts`).
     *
     * **Three subjects through one seam, not three seams.** The Space joined the
     * Diagram and the Graph here rather than beside them, because every part of
     * this that is worth writing down is the same for all three: which Edit the
     * name completes is the only difference, and the answer — a sentence or
     * `null` — is what the editor spends. A second callback for the Space would
     * have been a second place for the refusal-versus-`unchanged` reading to
     * drift, and the Dock has one rename slot under the whole bar precisely so
     * that there is one of these.
     */
    const renameChromeTitle = useCallback(
      (subject: SpaceChromeTitleSubject, title: string): string | null => {
        const result =
          subject.kind === 'space'
            ? // No id: the Edit writes `document.title` on the session this
              // composition is closed over, which is the Space the Dock draws.
              authoring.complete({ kind: 'renamed-space', title })
            : subject.kind === 'diagram'
              ? authoring.complete({ kind: 'renamed-diagram', diagramId: subject.id, title })
              : authoring.complete({ kind: 'renamed-graph', graphId: subject.id, title });
        return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
      },
      [],
    );

    /**
     * **Stable, and the churn it replaced was paying for nothing.**
     *
     * `thingRailActions` below hangs off this and is a dependency of the
     * node-decoration memo in `canvas-thing-authoring.ts`, so a fresh builder
     * rebuilt every node object, re-rendered every `ThingNode` and ran
     * `spaceEntityActions` once per Thing on every render of this component.
     *
     * **What used to stand here was hearsay, and it did not reproduce.** The
     * comment claimed that memoizing these builders makes six embedded-Diagram
     * tests stop drawing their target at all, and that the decoration memo's
     * dependency list is therefore incomplete. Neither half survived being
     * checked (`.scratch/command-dock/issues/14`). The audit stabilised these
     * three builders two ways — exhaustive dependencies, and then `[]` with the
     * state read live, so the identities are constant for the component's whole
     * life — and ran the app suite serially both times: 895 tests pass, the
     * sixteen in `space-thing-embedded-diagram.test.tsx` among them. The six
     * failures were timeouts on a machine running several suites at once, where
     * the *unmodified* tree failed twelve.
     *
     * Two things make the claim structurally impossible as well as unobserved.
     * Every identifier the decoration memo reads is in its dependency list, and
     * the one input whose contents can change behind a stable identity —
     * `spaceThingTargets`, which reads another Space live — is refreshed at its
     * source, `open-spaces.ts` minting a fresh `entries` array on every session
     * change of every open Space. And an embedded Diagram never receives this
     * builder at all: `EmbeddedDiagramAuthoring` calls `useCanvasThingAuthoring`
     * without `thingEntityActions`, and its canvases are driven by the raw
     * projection nodes rather than the decorated ones.
     *
     * Measured over the Dock's `Default` story from `render()` to a settled
     * canvas: 40 builds became 20, 20 decoration-memo runs became 10, and 72
     * decorated node objects became 36 — half the mount-time decoration work
     * was the churn alone, and fifteen of those twenty runs re-ran over a
     * `nodes` array whose identity had not changed. Selection and drag see no
     * change, because `nodes` moves there anyway.
     *
     * **The per-node cache the old note named is not this fix.** Keyed on the
     * builder it never hits while the builder churns; keyed without it, it hands
     * back a decorated node carrying a builder closed over a stale Space. The
     * builder identity was the input, and the input is what is fixed here.
     */
    const entityActions = useMemo(
      () =>
        spaceEntityActions({
          spaceId: renderedSpace.id,
          spaceTitle: renderedSpace.title,
          onCopy: copyProductDestination,
          // No Rename item: the Dock renames a Diagram and a Graph by clicking the
          // name it already draws, so a menu row that opened the same editor would
          // be the second path to one command this arrangement keeps removing. The
          // Thing rail is this builder's other consumer and a Thing has no rename here
          // either — its title is renamed in place on the canvas.
          onRename: null,
          onDeleteDiagram: availability.entityEdits
            ? (diagramId) => {
                const result = authoring.complete({ kind: 'deleted-diagram', diagramId });
                setDiagramManagementRefusal(result.kind === 'refused' ? result.refusal : null);
                // Answered rather than swallowed: the refusal set above renders in
                // the shell's standing notice, and the answer is what tells a caller
                // whether the Delete had a canvas result at all.
                return result.kind === 'completed';
              }
            : null,
        }),
      // `authoring` is the composition's, closed over rather than rendered, so it
      // is not a dependency a render can move. `thingDeletion` says the same of
      // `spaceThings`.
      [renderedSpace.id, renderedSpace.title, copyProductDestination, availability.entityEdits],
    );

    /**
     * Deleting one Thing, answering a refusal in words rather than a code.
     *
     * Two paths, because deleting a Space Thing is a different Edit.
     *
     * An ordinary Thing is removed from one Space, which is Space Authoring's. A
     * Space Thing owns its target's lifetime together with every other reference
     * to it, so deleting one can delete that Space and every Space below it that
     * nothing else references — one atomic Edit over coordinated per-Space
     * sessions, which is the Space Thing lifecycle's and not a single-Space
     * update this seam could make (ADR 0074, ADR 0076). Space Authoring refuses
     * it on its own account, so the choice is made here rather than discovered
     * there.
     *
     * It answers the *operation* rather than performing the deletion, because
     * the two surfaces that spend it need different things from it: the Space's
     * command surface hands it to a confirmation that calls it later, and the
     * Thing's own rail runs it on the press. Which kind of Thing it is stays a
     * decision made once, here, for both.
     */
    const thingDeletion = useCallback(
      (thing: Thing): (() => string | null | Promise<string | null>) =>
        thing.kind === 'space'
          ? async () => {
              const result = await spaceThings.delete({
                containingSpaceId: renderedSpace.id,
                thingId: thing.id,
              });
              if (result.kind === 'refused') return describeSpaceThingRefusal(result.refusal);
              // The other Edit that changes the Meta Space's set: this deletion
              // can destroy the target Space and every Space below it that
              // nothing else references, so a list that was not told goes on
              // offering a Space that is gone. Announced by the lifecycle for the
              // same reason creation is — the Space it destroys was offered in
              // every open Space, not only in this one.
              return null;
            }
          : () => {
              const result = authoring.complete({ kind: 'deleted-thing', thingId: thing.id });
              return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
            },
      [renderedSpace.id],
    );

    /**
     * What a Thing's own rail offers (ADR 0073): the addresses every Thing has,
     * and the deletion that used to be reachable only from the Space's command
     * surface.
     *
     * The addresses are `spaceEntityActions`' answer and nothing else — the
     * same menu the Space's surface builds for the same entity, so the Thing's
     * two links cannot come to mean different things on the two surfaces. What
     * is appended here is the one command that is a Thing's own rather than an
     * address: a Thing's deletion belongs to the Thing, and the Space's surface is
     * where it was only because the Thing had no menu of its own.
     *
     * A Thing the drawing Diagram does not place still has commands — its own
     * permanent address — so nothing here reads `diagram.positions`; which
     * addresses exist is decided from the Diagram by the builder above.
     */
    const thingRailActions = useCallback(
      (thingId: ThingId): readonly EntityActionGroup[] => {
        const thing = renderedSpace.lookup.thing(thingId);
        // A node the projection is still drawing for a Thing the working Space no
        // longer has. No commands rather than commands that name nothing.
        if (thing === undefined) return [];
        const addresses = entityActions({ kind: 'thing', thing, diagram: selectedDiagram.diagram });
        if (!availability.deleteThing) return addresses;
        const remove = thingDeletion(thing);
        return [
          ...addresses,
          [
            {
              id: 'delete-thing',
              // "Delete Thing", not "Delete Thing <title>": the menu that draws
              // this item is already named for the Thing it belongs to, and the
              // Diagram menu's own destructive command is spelled the same way.
              label: 'Delete Thing',
              icon: <DeleteIcon />,
              variant: 'destructive',
              // **It asks, and the confirmation runs it.** Deleting a Thing is
              // not undoable in V1, and deleting a Space Thing can take the Space
              // it references and every Space below it that nothing else
              // references (ADR 0074) — so the command that used to sit behind
              // the Sidebar's own `AlertDialog` keeps one. The dialog is drawn
              // at the App root rather than in the menu that armed it, because
              // the menu closes on the press and would take the question with
              // it.
              //
              // **And it carries no `report`.** An item that names words has
              // its menu held open and its label swapped to the word its
              // outcome picks — machinery for a command that *runs* on the
              // press. This one raises a question, so `done` said "Thing deleted"
              // beside a dialog still asking whether to, and announced it to a
              // reader who might then press Cancel. What the deletion did is the
              // canvas's to report; why it did not is the confirmation's, which
              // prints it into the shell's standing notice.
              onSelect: (): EntityActionOutcome => {
                setThingDeletionRefusal(null);
                setPendingThingDeletion({ thing, remove });
                return 'done';
              },
            },
          ],
        ];
      },
      [
        renderedSpace,
        entityActions,
        selectedDiagram.diagram,
        availability.deleteThing,
        thingDeletion,
      ],
    );

    /**
     * Choosing a Diagram, including the one already drawing.
     *
     * One act now. Discarding the chrome title draft used to be paired with it,
     * because the draft was the application's and outlived the control it was
     * begun from; the Dock's editor is the control, so choosing another Diagram
     * unmounts it and there is nothing here to discard.
     */
    const selectDiagram = browserLocation.chooseDiagram;

    const present = navigation.present;
    const advance = navigation.advance;
    const retreat = navigation.retreat;
    const exitPresenting = navigation.exitPresenting;
    const activateGraph = browserLocation.activateGraph;

    // Leaving while persistence is not settled asks first. The handler is absent
    // in the normal durable state, preserving the browser's back/forward cache.
    useEffect(() => {
      if (sessionState.persistence.kind === 'settled') return;
      const onBeforeUnload = (event: BeforeUnloadEvent) => {
        // `preventDefault` alone. The old pairing with `event.returnValue = ''` is
        // deprecated — lint rejects it outright — and current Chromium, Firefox
        // and Safari all honour the spec'd call. Don't add it back for the sake of
        // a browser this prototype does not run in.
        event.preventDefault();
      };
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [sessionState.persistence.kind]);

    const activeGraphThingIds = useMemo(
      () => new Set(activeGraphId === null ? [] : graphThingIds(renderedSpace, activeGraphId)),
      [renderedSpace, activeGraphId],
    );

    // The two selection writes the canvas makes that are not React Flow's own —
    // continuing at a connected Thing, and the focus-to-selection bridge for an
    // Edge. Both are plain store writes with nothing to decide.
    const selectThing = useCallback((thingId: ThingId) => {
      useRenderAdapter.getState().selectThing(thingId);
    }, []);

    const selectEdge = useCallback((subject: EdgeSubject) => {
      useRenderAdapter.getState().selectEdge(subject);
    }, []);

    /**
     * The refusal goes back to the caller, and only the caller can place it.
     *
     * Both `added-thing-to-diagram` outcomes this can produce
     * (`thing-already-in-diagram`, `thing-not-found`) mean the Thing just left
     * `thingsOutsideSelectedDiagram`, so the row the reader activated is already
     * gone. The drawer is still on screen though, and it is the surface that
     * asked — so it keeps the sentence, in the `Alert` above its list.
     *
     * `dropExistingThing` below discards the same string on purpose: a drop
     * ends on the canvas, and by then the drawer that named the Thing may be
     * dismissed, leaving nowhere the sentence belongs.
     */
    const addExistingThing = useCallback(
      (thingId: ThingId, anchor: DiagramPosition, focus: boolean): string | null => {
        const result = authoring.complete({ kind: 'added-thing-to-diagram', thingId, anchor });
        if (result.kind === 'refused') return describeAuthoringRefusal(result.refusal);
        if (result.kind !== 'completed') return null;
        useRenderAdapter.getState().selectThing(thingId);
        // The Thing is not drawn yet — the projection carrying this Edit arrives
        // a strategy later — so the continuation waits for it rather than this
        // component polling the live projection, which is what it used to do.
        if (focus) {
          continuation.request({
            target: { kind: 'thing', thingId },
            select: false,
            then: 'focus',
          });
        }
        return null;
      },
      [],
    );

    const dropExistingThing = useCallback(
      (thingId: ThingId, anchor: DiagramPosition): void => {
        const drag = thingsDrag.current;
        thingsDrag.current = null;
        if (drag?.thingId !== thingId || drag.diagramId !== selectedDiagramId) return;
        addExistingThing(thingId, anchor, false);
      },
      [addExistingThing, selectedDiagramId],
    );

    /**
     * Add Thing: one completed Edit, and then the naming continuation.
     *
     * **This is the one operation whose refusal no surface shows, and that is a
     * decision rather than an oversight** — the asymmetry with `createAlias`
     * below is the thing to read, so here is why it stands. A refusal carries a
     * sentence for the author (ADR 0042), which is worth showing exactly where
     * the author can act on it: the Alias pane keeps its own open because both
     * of its refusals are about the Target just chosen, and the field that
     * answers them is on screen. Add Thing takes no input at all. It completes on
     * one activation, from a toolbar button and a keystroke, and leaves nothing
     * standing that a sentence could correct.
     *
     * The toolbar remains available for an empty authored Diagram: it is the
     * zero-Thing Space's way to create the first Thing. Canvas-local authoring is
     * still gated on a resolved placement — `hasThingsOnCanvas`, which reaches
     * the canvas as `availability.authorOnCanvas` — because there is no
     * projected node surface to receive its shortcut until that first Thing
     * exists.
     *
     * What that argument does *not* license is a catch-all, so each outcome is
     * named below. If Add Thing ever grows an input — a kind, a title, a
     * placement mode — it grows a surface with it, and the refusal goes there.
     */
    const addThing = useCallback(() => {
      const created = authoring.complete({ kind: 'created-thing', anchor: centreAnchor() });
      // Each outcome named rather than caught. `refused` is the paragraph
      // above. `queued` is an Edit that will still be performed, whose
      // projection draws the Thing without help from here. `unchanged` this
      // operation cannot answer — it mints unconditionally — but the shared
      // completion union carries it, so it is narrowed rather than asserted
      // away, and the day one of these grows an answer the compiler asks here.
      if (created.kind === 'refused') return;
      if (created.kind === 'queued') return;
      if (created.kind === 'unchanged') return;
      if (created.createdThingId === undefined) return;
      // Selected as well as named: the storyboard's created Thing is the selected
      // one, so continued authoring — a connection, a second Thing — carries on
      // from it. Both are the one continuation, spent when the projection that
      // draws the Thing arrives.
      continuation.request({
        target: { kind: 'thing', thingId: created.createdThingId },
        select: true,
        then: 'rename',
      });
    }, [centreAnchor]);

    /**
     * Presenting takes a creation pane away, creating nothing.
     *
     * Keyed on the fact rather than wrapped around the control, so a second way
     * into presenting cannot leave a pane open over a presentation. The one
     * thing it waits for is a coordinated Edit already in flight: the pane
     * withholds Cancel and Escape while one runs, because the Edit completes
     * whether or not the surface that began it is still mounted, and closing
     * here would make exactly that abandonment through a route the pane cannot
     * refuse. Presenting is reachable from under a modal pane in one way — Back
     * onto a presenting Thing URL is a browser navigation, and `popstate` does
     * not consult a focus trap. The completion leaves `submitting`, which runs
     * this again and takes the pane away then.
     */
    useEffect(() => {
      if (presenting) thingCreation.withdraw();
    }, [presenting, thingCreation]);
    /**
     * A replacement takes a creation pane away too (ADR 0042).
     *
     * Reachable under the modal: a conflict draws its `AlertDialog` over
     * everything, so Accept stored Space is pressable with the pane up. The
     * pane's choices are read once per opening, so one left standing would go
     * on offering Things from the Space that is gone and refuse every one of
     * them against a row still on screen.
     *
     * A transition read during render rather than an effect, the way
     * `canvas-thing-authoring.ts` reads `nameOnCreation`: `thingCreation` is a
     * new object on every dispatch, so an effect would need either the epoch
     * alone as its dependency — the one `exhaustive-deps` suppression in the
     * repository — or the operations, which would close the pane the render
     * after it opened.
     */
    const [replacedAt, setReplacedAt] = useState(authoringState.replacementEpoch);
    if (replacedAt !== authoringState.replacementEpoch) {
      setReplacedAt(authoringState.replacementEpoch);
      thingCreation.discard();
    }
    /**
     * The Thing whose inline Title editor a creation opens.
     *
     * `rename` reaches `CanvasThing` as a prop rather than through the module:
     * `@project/ui` owns that editor and depends only on `core`, so it cannot
     * import this — and it should not. A component refocusing its own control
     * after its own edit is genuine locality.
     */
    const pendingContinuation = useSyncExternalStore(
      continuation.subscribe,
      continuation.getState,
    ).pending;
    const nameOnCreation =
      pendingContinuation?.then === 'rename' && pendingContinuation.target.kind === 'thing'
        ? pendingContinuation.target.thingId
        : null;

    // Scans every title in the Space, so it must not re-run on every drag
    // frame — `projection` (and this component) re-renders on each
    // intermediate drag position, but `sessionState.working` only changes on
    // a completed Edit.
    const newThingTitle = useMemo(
      () => nextThingTitle(sessionState.working),
      [sessionState.working],
    );
    // One read per set of referenced Spaces, shared by the canvas and the Things
    // collection so a Space Thing names the same Space wherever it is drawn.
    const readSpaceThingTarget = useCallback((spaceId: UUID) => spaceThings.target(spaceId), []);
    const spaceThingTargets = useSpaceThingTargets(renderedSpace.things, readSpaceThingTarget);
    const spaceTitleById = useMemo(
      () => new Map([...spaceThingTargets].map(([id, target]) => [id, target.title])),
      [spaceThingTargets],
    );
    // Inactive Spaces keep their traversal mounted without receiving global keys.
    usePresentingKeys(active && presenting, {
      advance,
      retreat,
      selectBranch,
      exitPresenting,
    });

    /**
     * The Space the canvas draws, its open set, and the exit that leaves one.
     *
     * `openTree` derives presentation from the production Open Spaces state,
     * also used by the catalogue through the same application composition.
     *
     * Each row's persistence is read off that Space's **own** session, which is
     * the whole of ADR 0082's clause about naming which open Space is unwell: a
     * commit belongs to the Space it was made in (ADR 0076), and the reader is
     * only ever standing in one of the set.
     */
    const openSpaceRows = useMemo(
      () =>
        openTree(
          openSpacesState.entries.map((entry) => ({
            spaceId: entry.id,
            title: entry.session.getState().working.document.title,
            from: openSpacesState.openedFrom.get(entry.id) ?? null,
            persistence: entry.session.getState().persistence,
          })),
        ),
      [openSpacesState],
    );
    const openerId = openSpacesState.openedFrom.get(renderedSpace.id) ?? null;
    const parentSpace = useMemo(() => {
      if (openerId === null) return null;
      const entry = openSpacesState.entries.find((candidate) => candidate.id === openerId);
      return entry === undefined
        ? null
        : { spaceId: openerId, title: entry.session.getState().working.document.title };
    }, [openerId, openSpacesState]);

    /**
     * The one Diagram refusal there is anywhere to put, now that Add Diagram and
     * Delete Diagram report in the same place.
     *
     * Both were drawn under Add Diagram in the Sidebar and both are about the
     * Diagram that was selected when they were refused, which is why moving
     * between Diagrams already clears them together.
     */
    const diagramRefusal = createDiagramRefusal ?? diagramManagementRefusal;

    /**
     * Where a refused Graph Edit is drawn, which is the notice every other
     * refused chrome command is drawn in.
     *
     * One reporter for the cluster's three commands rather than three call
     * sites setting the same state: what the reader needs to know is which
     * Graph Edit did not happen and why, and all three answer that in the same
     * words.
     */
    const reportGraphEdit = (result: AuthoringResult): void => {
      setGraphRefusal(result.kind === 'refused' ? result.refusal : null);
    };

    const [exitReport, setExitReport] = useState<SpaceExitReport | null>(null);
    /** The Space an exit is in flight over, or `null` — see `exitSpace`. */
    const [exiting, setExiting] = useState<UUID | null>(null);
    /**
     * Exiting a Space, and the two ways it does not happen.
     *
     * The lifecycle is `openSpaces.exit`'s and this only draws it: `warning` is
     * the rejected-work question ADR 0068 makes Exit permit, answered by handing
     * the same `RejectedExitConfirmation` token back rather than by a second
     * command that means "and I mean it"; `refused` names the recovery the Space
     * already has. `exited` reports nothing — the Space is gone from the Open
     * Spaces menu and the canvas has moved, which is the whole of it.
     *
     * The title travels on the report because by the time it is drawn the Space
     * it names may no longer be the one on the canvas, and ADR 0082 binds the
     * surface to say *which* Space is unwell rather than to describe wherever
     * the reader has since ended up.
     */
    const exitSpace = useCallback(
      (spaceId: UUID, confirmation?: RejectedExitConfirmation): void => {
        if (spaces === null) return;
        // One attempt at a time, and the previous answer goes with the new
        // attempt. `exit` waits on an in-flight commit, so a second press
        // during that wait starts a second run over an entry the first has not
        // finished with — and the refusal the first produced stays on screen
        // reading as this attempt's. The deleted `ExitSpaceControl` disabled
        // its button while closing and cleared the report on each try; both
        // rules are here now, where the command is.
        if (exiting !== null) return;
        const title =
          spaces.entry(spaceId)?.session.getState().working.document.title ?? renderedSpace.title;
        setExiting(spaceId);
        setExitReport(null);
        setSpaceCommandBreak(null);
        void (async () => {
          try {
            const result = await spaces.exit(spaceId, confirmation);
            setExitReport(result.kind === 'exited' ? null : { spaceId, title, outcome: result });
          } catch (failure) {
            reportBreak(failure);
            setSpaceCommandBreak(`${title} could not be exited.`);
          } finally {
            setExiting(null);
          }
        })();
      },
      [spaces, renderedSpace.title, exiting],
    );

    /**
     * One command out of an entity's own menu, spent by a cluster that draws its
     * own.
     *
     * The Dock's Diagram, Graph and Space clusters are menus with a radio group in
     * them, so they cannot render an `EntityActionGroup[]` whole the way a Thing's
     * rail does — but *which* address each entity offers is a decision this
     * application makes once, in `entity-actions.tsx`. This reads that decision
     * out by id rather than rebuilding the destination beside it, so the two
     * surfaces cannot come to disagree about what a Graph's "Copy link" means.
     *
     * An id the entity does not offer is simply absent, which is the rule that
     * module states: a destination that does not exist is not a thing to offer
     * and refuse.
     */
    const runEntityCommand = (entity: SpaceEntity, id: EntityCommandId) => () => {
      void entityActions(entity)
        .flat()
        .find((action) => action.id === id)
        ?.onSelect();
    };

    /**
     * The Graph the Dock's cluster names, or nothing to name.
     *
     * A Diagram always owns at least one Graph — ADR 0079 mints one with every
     * Diagram and Authoring refuses the Edit that would empty it — but the type
     * does not say so, and a surface that asserted it would be asserting a
     * domain rule from the outside. `null` is drawn as no Dock at all, which is
     * the same answer the canvas gives for a Diagram it cannot resolve.
     *
     * **It is the Active Graph or it is nothing — there is no falling back to
     * the first visible one.** That fallback used to sit here, and what it
     * bought was a Dock that went on drawing while Navigation named a Graph the
     * Diagram no longer owned. The cost was not the label: `CommandDock` passes
     * `graph.active.id` to Delete, Rename and Recolor — the row list only
     * activates — so Delete Graph reached a Graph `SpaceCanvas`, handed the raw
     * `activeGraphId`, was not drawing as active, Present was enabled on the
     * fallback's Edges and did nothing on the real one, and the Dock's Copy link
     * answered a different URL from the presenting chrome's.
     *
     * So the Dock reads exactly what the canvas reads, and the two cannot come
     * to name different Graphs. The state this used to paper over is the
     * coordinated recovery's, and it is fixed where it was caused —
     * `space-authoring.ts`'s `reconcileNavigation` re-resolves the pair when a
     * snapshot is replaced under it, with a regression at the seam
     * (`active-graph-after-coordinated-recovery.test.ts`).
     */
    const activeGraph =
      projection.visibleGraphs.find((graph) => graph.id === activeGraphId) ?? null;

    const dockChrome: DockChrome | null =
      activeGraph === null
        ? null
        : {
            onRenamingChange: setEditingChromeTitle,
            // ADR 0042's epoch, handed down rather than acted on here: the
            // editor a replacement has to discard is a name control's own, and
            // `editingChromeTitle` below is the *report* of one running, not the
            // draft. Clearing the report while the Dock kept the editor is
            // precisely the half-invalidation this pair replaced.
            replacementEpoch: authoringState.replacementEpoch,
            space: {
              title: renderedSpace.title,
              currentSpaceId: renderedSpace.id,
              parent: parentSpace,
              openSpaces: openSpaceRows,
              // Behind `chromeTitleEdit` exactly as the Diagram and Graph names
              // are below, and for the one reason the guard exists: all three
              // names are withdrawn together while something else owns the caret
              // or the canvas has no placement to edit against. A Space rename
              // needs nothing else withheld from it — the meta Space renames like
              // any other, only its deletion being protected, and a Space with
              // rejected work is covered by this same guard.
              onRename: availability.chromeTitleEdit
                ? (title) => renameChromeTitle({ kind: 'space' }, title)
                : null,
              onCopyLink: runEntityCommand({ kind: 'space' }, COPY_LINK_ACTION_ID),
              onNewSpace: () => thingCreation.open('space'),
              onSwitchTo: (spaceId) => {
                if (spaces === null) return;
                const title =
                  spaces.entry(spaceId)?.session.getState().working.document.title ?? 'That Space';
                setSpaceCommandBreak(null);
                void (async () => {
                  try {
                    await spaces.switchTo(spaceId);
                  } catch (failure) {
                    reportBreak(failure);
                    setSpaceCommandBreak(`${title} could not be opened.`);
                  }
                })();
              },
              onExit: exitSpace,
              // `openSpaces.exit`'s own rule, asked of the same aggregate that
              // enforces it — not re-derived from the opener, which is a
              // different question. With no session at all there is nothing to
              // exit into, so the command is unavailable rather than absent.
              exitDisabled:
                spaces === null || renderedSpace.id === spaces.metaSpaceId || exiting !== null,
              exitReport,
              onDismissExitReport: () => setExitReport(null),
            },
            canvas: {
              diagrams: renderedSpace.diagrams,
              selected: selectedDiagram.diagram,
              onSelect: selectDiagram,
              onRename: availability.chromeTitleEdit
                ? (diagramId, title) => renameChromeTitle({ kind: 'diagram', id: diagramId }, title)
                : null,
              createDisabled: !availability.createDiagram,
              // The same answer `onDeleteDiagram` above is built from, said on
              // the row as well: when entity Edits are withdrawn the
              // `delete-diagram` action is not built at all, and a row that did
              // not know it dispatched into nothing.
              deleteDisabled: !availability.entityEdits,
              onCreate: () => {
                const result = authoring.complete({ kind: 'created-diagram' });
                setCreateDiagramRefusal(result.kind === 'refused' ? result.refusal : null);
                setDiagramManagementRefusal(null);
                if (result.kind === 'completed') setDiscloseThings({ thingId: null });
              },
              // The Dock's Delete names the Diagram its cluster is showing, which is
              // the drawing one — resolved from the id it hands back rather than
              // closed over, so the command and the name it carries cannot come apart.
              onDelete: (diagramId) => {
                const diagram = renderedSpace.diagrams.find(
                  (candidate) => candidate.id === diagramId,
                );
                if (diagram === undefined) return;
                runEntityCommand({ kind: 'diagram', diagram }, DELETE_DIAGRAM_ACTION_ID)();
              },
              onCopyLink: runEntityCommand(
                { kind: 'diagram', diagram: selectedDiagram.diagram },
                COPY_LINK_ACTION_ID,
              ),
            },
            graph: {
              graphs: projection.visibleGraphs,
              active: activeGraph,
              colorByGraphId: projection.colors,
              activeColor: projection.colors[activeGraph.id] ?? FALLBACK_GRAPH_COLOR,
              onActivate: activateGraph,
              onRename: availability.chromeTitleEdit
                ? (graphId, title) => renameChromeTitle({ kind: 'graph', id: graphId }, title)
                : null,
              // **Answered, not swallowed** — the same shape the Diagram arm
              // above spends, and for the same reason. A Graph Edit can be
              // refused for reasons no surface can see coming (`placement-pending`
              // before the canvas has reported, `graph-not-owned` for a Graph a
              // second Diagram owns), and a command that discards that answer
              // closes its menu having changed nothing, said nothing and logged
              // nothing.
              onRecolor: (graphId, color) => {
                reportGraphEdit(authoring.complete({ kind: 'recolored-graph', graphId, color }));
              },
              onCreate: () => {
                reportGraphEdit(authoring.complete({ kind: 'added-graph' }));
              },
              onDelete: (graphId) => {
                reportGraphEdit(authoring.complete({ kind: 'deleted-graph', graphId }));
              },
              editsDisabled: !availability.entityEdits,
              onCopyLink: runEntityCommand(
                { kind: 'graph', graph: activeGraph, diagram: selectedDiagram.diagram },
                COPY_LINK_ACTION_ID,
              ),
              onCopyPermanentLink: runEntityCommand(
                { kind: 'graph', graph: activeGraph, diagram: selectedDiagram.diagram },
                COPY_PERMANENT_LINK_ACTION_ID,
              ),
              presenting,
              onPresent: present,
              // **An empty Graph has nothing to traverse**, which is a fact
              // about the Graph rather than about authoring availability — so it
              // is stated here beside the Graph the cluster is naming, exactly
              // as the catalogue's fixture states it. `availability.present`
              // covers the other half: a live content edit or chrome rename owns
              // the keyboard a presentation would take.
              presentDisabled:
                !presenting && (!availability.present || activeGraph.edges.length === 0),
            },
            things: {
              /* The Dock draws this list and owns whether it is open, so what
                 crosses here is what the list shows and what a row does —
                 never an `open` flag the two could come to disagree about
                 (`DockThingsList`). */
              list: {
                things: thingsOutsideSelectedDiagram,
                allThings: renderedSpace.things,
                spaceTitleById,
                spaces: metaSpaces,
                onAddSpace: addSpaceThingFor,
                disabled: !availability.thingsView,
                disclose: discloseThings,
                revealedThingId: addressedThingId,
                /* **No focus continuation, and that is the surface's own
                   change.** The drawer this replaced took a keyboard Add to
                   the placed Thing on the canvas; an anchored list keeps the
                   reader in it, so adding several Things costs one disclosure
                   rather than one each, and the caret lands back in the filter
                   (`ThingsPopover`). Escape is the way out to the canvas, and
                   it returns focus to the trigger the list hangs off. */
                onAdd: (thing) => addExistingThing(thing.id, centreAnchor(), false),
                onDragStart: (thingId) => {
                  thingsDrag.current = { thingId, diagramId: selectedDiagramId };
                },
                onDragEnd: () => {
                  thingsDrag.current = null;
                },
              },
              onCreate: (kind) => {
                if (kind === 'markdown') addThing();
                else thingCreation.open(kind);
              },
              createDisabled: !availability.addThing,
            },
            persistence: {
              state: sessionState.persistence,
              active,
              onRetry: authoring.retryPersistence,
              onAcceptRemote: authoring.acceptStoredSpace,
              onKeepLocal: authoring.keepLocalWork,
            },
          };

    return (
      <AppShell
        // No inset. The Things list is a Popover anchored to its trigger and
        // floats over the canvas, so it yields no width — which is the
        // occlusion the surface comparison held against the drawer it replaced
        // (`.scratch/command-dock/issues/10-decide-the-cards-surface.md`).
        notice={
          <>
            {clipboardFailure === null ? null : (
              <ShellNotice title="Link not copied" onDismiss={() => setClipboardFailure(null)}>
                {clipboardFailure}
              </ShellNotice>
            )}
            {thingDeletionRefusal === null ? null : (
              <ShellNotice
                title="Thing not deleted"
                onDismiss={() => setThingDeletionRefusal(null)}
              >
                {thingDeletionRefusal}
              </ShellNotice>
            )}
            {diagramRefusal === null ? null : (
              <ShellNotice
                /* Named for the command that was refused rather than for the
                   Diagram, because a refused *creation* left no Diagram to be
                   unchanged — "Diagram unchanged" told the author an existing
                   Diagram had been left alone when none had been made. */
                title={createDiagramRefusal === null ? 'Diagram unchanged' : 'Diagram not created'}
                // Both, because the one that is standing is whichever was
                // written last and the reader is dismissing what they can see.
                onDismiss={() => {
                  setCreateDiagramRefusal(null);
                  setDiagramManagementRefusal(null);
                }}
              >
                {describeAuthoringRefusal(diagramRefusal)}
              </ShellNotice>
            )}
            {spaceCommandBreak === null ? null : (
              <ShellNotice
                title="Space command failed"
                onDismiss={() => setSpaceCommandBreak(null)}
              >
                {spaceCommandBreak}
              </ShellNotice>
            )}
            {graphRefusal === null ? null : (
              <ShellNotice title="Graph unchanged" onDismiss={() => setGraphRefusal(null)}>
                {describeAuthoringRefusal(graphRefusal)}
              </ShellNotice>
            )}
            {/* **The one report here with no dismissal, and it is not an
                oversight.** The others are about a press that is over, so
                putting one away changes nothing it is about. This one is about
                the address the reader is *on*: clearing it is what asks for the
                stale location to be corrected (`browser-location.ts`), so a
                dismissal would be a move dressed as an acknowledgement. It is
                answered by the first move the reader makes — including opening
                a Thing on the canvas, which the notice never covers. */}
            {destinationNotFound ? (
              <Alert variant="destructive">
                <AlertIcon />
                <AlertTitle>Destination not found</AlertTitle>
                <AlertDescription>
                  The requested address does not exist in this Space.
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        }
      >
        <ChromeContinuation continuation={continuation} within={graphArea} />
        {/* **How this Space's last commit went, for a test rather than a reader.**
            The Command Dock draws nothing at all while saving is working — a
            commit settles faster than a cue can be read, so a permanent slot
            reporting the expected outcome is a slot spent on nothing — and that
            decision is the surface's. This is not a cue: it is hidden, and what
            it carries is the revision, which is the *Space's* rather than any
            surface's. It sits beside the canvas for exactly that reason. */}
        <span
          hidden
          aria-hidden="true"
          data-testid="persistence-status"
          data-persistence-state={sessionState.persistence.kind}
          data-revision={String(sessionState.acknowledgedRevision)}
        >
          {sessionState.persistence.kind === 'settled'
            ? 'Persisted'
            : sessionState.persistence.kind}
        </span>
        {pendingThingDeletion === null ? null : (
          <DeleteThingConfirmation
            thing={pendingThingDeletion.thing}
            onDelete={pendingThingDeletion.remove}
            onDismiss={() => setPendingThingDeletion(null)}
            onRefused={setThingDeletionRefusal}
          />
        )}
        {/* One child, not a row: the Things list portals over this rather than
            sitting beside it, so a toggle that says nothing about the Diagram no
            longer re-flows the canvas and re-measures every Thing on it. */}
        <div ref={graphArea} className="graph-area size-full min-w-0" style={thingSizeVars}>
          {/* **The Space's one command surface, over the canvas rather than
              beside it** (ADR 0082). It docks to this element: the twelve slots
              are its edges and stops, and every measurement the drag makes is
              relative to it — which is why the frame is a prop rather than
              something the Dock reaches upward through the DOM to find.

              Inside the graph area and not the shell, so the surface a reader
              moves it around is the paper they are working on. It takes no
              layout space from that paper: it is absolutely positioned, and
              `.graph-area` is already the positioned box it resolves against. */}
          {dockChrome === null ? null : (
            <CommandDock chrome={dockChrome} container={graphArea} initialEdge="top" />
          )}
          {canvas.kind === 'failure' ? (
            <PlacementFailure error={canvas.error} />
          ) : canvas.kind === 'things' ? (
            <ReactFlowProvider>
              {/* Inside the provider and outside the canvas: it reads React
                  Flow's viewport for controls that live in the toolbar and in
                  the panes over the graph, and it is deliberately not keyed by
                  the replacement epoch — the getter it reports describes the
                  viewport, which a replaced Space does not invalidate. */}
              <CanvasCentre report={reportVisibleCentre} />
              {/* The canvas half of where an Edit continues. Inside the
                  provider because `reveal` moves the camera and because an Edge
                  subject becomes an element only through the projection React
                  Flow is drawing. Its chrome half is mounted at the root, since
                  this subtree is conditional on there being Things at all. */}
              <CanvasContinuation
                continuation={continuation}
                onSelectThing={selectThing}
                onSelectEdge={selectEdge}
              />
              <SpaceCanvas
                // Keyed on the replacement epoch, so accepting the stored Space
                // takes the canvas's local editing state with it. The render
                // adapter already drops the projection and drag bookkeeping, but
                // an open title editor is the graph's own: it names a Thing from
                // a Space that is gone, and its raised invalid guard would go on
                // swallowing clicks in the one that replaced it.
                key={authoringState.replacementEpoch}
                nodes={liveProjection?.nodes ?? []}
                edges={liveProjection?.edges ?? []}
                // Null while a replacement placement resolves. The canvas keeps
                // drawing the Things on screen through that window — deliberately, so
                // a gesture is never interrupted — so a connection is reachable
                // with no fresh projection to hand over, and the store keeps its
                // live nodes rather than reconciling against nothing.
                projectedNodes={projected?.nodes ?? null}
                activeThingId={activeThingId}
                presenting={presenting}
                placementReady={hasThingsOnCanvas}
                availability={availability}
                onNodesChange={changeNodes}
                onEdgesChange={changeEdges}
                edgeAuthoring={edgeAuthoring}
                selection={selection}
                onSelectThing={selectThing}
                onSelectEdge={selectEdge}
                placedThings={placedThings}
                newThingTitle={newThingTitle}
                onAddThing={addThing}
                onAddExistingThing={dropExistingThing}
                nameOnCreation={nameOnCreation}
                authoring={authoring}
                spaceSession={spaceSession}
                onBodyEditingChange={setEditingThingBody}
                onTitleEditingChange={setEditingThingTitle}
                thingResize={thingResize}
                reportEmbeddedDiagramEditing={reportEmbeddedDiagramEditing}
                graphs={projection.visibleGraphs}
                colorByGraphId={projection.colors}
                activeGraphId={activeGraphId}
                activeGraphThingIds={activeGraphThingIds}
                spaceThingTargets={spaceThingTargets}
                thingEntityActions={thingRailActions}
              />
            </ReactFlowProvider>
          ) : (
            <PlacementPending />
          )}

          {presenting && (
            <PresentingChrome
              moves={moves}
              canRetreat={canRetreat(navigationState)}
              onSelectBranch={selectBranch}
              onAdvance={advance}
              onRetreat={retreat}
              onExit={exitPresenting}
              onCopyLink={() => {
                if (activeGraphId === null || activeThingId === null) return;
                // `void`: presenting chrome's Copy link is a plain button with
                // no label to swap, so it has nothing to do with the outcome
                // beyond the alert `copyProductDestination` already renders.
                void copyProductDestination({
                  kind: 'presentation',
                  spaceId: renderedSpace.id,
                  diagramId: selectedDiagramId,
                  graphId: activeGraphId,
                  thingId: activeThingId,
                });
              }}
            />
          )}

          {creationPane.status !== 'closed' && creationPane.choices.kind === 'alias' && (
            <NewAlias
              targets={creationPane.choices.targets}
              refusal={creationRefusal}
              onCreate={(target, title) => thingCreation.submit({ kind: 'alias', target, title })}
              onCancel={thingCreation.cancel}
              onRefusalStale={thingCreation.refusalStale}
            />
          )}

          {creationPane.status !== 'closed' && creationPane.choices.kind === 'space' && (
            <NewSpaceThing
              targets={creationPane.choices.targets}
              refusal={creationRefusal}
              busy={creationPane.status === 'submitting'}
              onCreate={(targetSpaceId, title) =>
                thingCreation.submit({ kind: 'space', targetSpaceId, title })
              }
              onCancel={thingCreation.cancel}
              onRefusalStale={thingCreation.refusalStale}
            />
          )}
        </div>
      </AppShell>
    );
  }

  // One composition for the lifetime of the opened Space. Accepting the stored
  // Space replaces the working state through Authoring rather than mounting a
  // second app over the same session, so nothing here is ever handed back;
  // `authoring.dispose` remains the seam that would release it if that changed.
  return App;
};
