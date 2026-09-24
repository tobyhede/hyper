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
  RemoveFromMapIcon,
  EnterSpaceIcon,
  ResourceKindIcon,
  type EntityActionGroup,
  type EntityActionOutcome,
} from '@project/ui';
import {
  titleName,
  type Resource,
  type ResourceId,
  type MapId,
  type MapPosition,
  type UUID,
} from '@project/core';
import type { ProductDestination } from '@project/http';
import { createNonThrowingReporter, type SpaceSummary } from '@project/persistence';
import { Placement } from '@project/graph';
import type { BrowserLocation } from './browser-location';
import type { OpenSpace, OpenSpacesState, RejectedExitConfirmation } from './open-spaces';
import type { AuthoringResult } from './space-authoring';
import { authoringAvailability } from './authoring-availability';
import { selectedResourceOf, type EdgeSubject } from './render-adapter';
import { canvasProjection } from './canvas-projection';
import { canvasContent } from './canvas-content';
import {
  describeAuthoringRefusal,
  describeSpaceResourceBreak,
  describeSpaceResourceRefusal,
} from './authoring-refusal';
import { coordinatedGraphDelete } from './coordinated-context-delete';
import { useSpaceResourceTargets } from './space-resource-targets';
import { usePlacementRendering } from './placement-rendering';
import { RESOURCE_HEIGHT, RESOURCE_WIDTH, resourceSizeVars } from './resource';
import { canRetreat } from './navigation';
import {
  completedResourceDrag,
  completedSpaceDrag,
  type ResourcesDrag,
  type ResourcesPopoverSpace,
} from './resources-drag';
import { copyLink } from './clipboard';
import { openIndependently } from './open-independently';
import {
  COPY_LINK_ACTION_ID,
  spaceEntityActions,
  type EntityCommandId,
  type SpaceChromeTitleSubject,
  type SpaceEntity,
} from './entity-actions';
import { usePresentingKeys } from './presenting-keys';
import { nextSpaceTitle, nextResourceTitle } from './titles';
import { mapResources, resolveMap, resourcesOutsideMap } from './map-resolution';
import type { DestinationOpening } from './destination-opening';
import { SpaceCanvas } from './components/SpaceCanvas';
import { CanvasCentre, type VisibleCentre } from './components/CanvasCentre';
import { CanvasContinuation } from './components/CanvasContinuation';
import { ChromeContinuation } from './components/ChromeContinuation';
import { DeleteResourceConfirmation } from './components/DeleteResourceConfirmation';
import {
  CommandDock,
  type DockChrome,
  type DockResourceKind,
  type SpaceExitReport,
} from './components/CommandDock';
import { PlacementFailure } from './components/PlacementFailure';
import { PlacementPending } from './components/PlacementPending';
import { PresentingChrome } from './components/PresentingChrome';
import { ShellNotice } from './components/ShellNotice';
import { COMMAND_CHANNELS } from './command-outcomes';
import { useOpenSpaces } from './open-spaces-context';
import { offered, renameDraftAnswer, topLevelMapAuthoringCommands } from './map-authoring-commands';

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

/**
 * How far a new Reference Resource steps from the Resource it was created from, as a fraction of
 * its collapsed size on both axes, plus any room its Open Target holds.
 *
 * Overlap is authored rather than avoided — a free-position search is a placement
 * algorithm, and ADR 0086 keeps those behind an Edit — so this is deliberately
 * less than a whole step. It is more than half a step because at exactly half the
 * new Reference Resource's centre lands on the Target's bottom-right corner, and the Target
 * takes the pointer there: three quarters leaves a quarter-Resource corner of
 * overlap and a centre the author can reach.
 */
const REFERENCE_OFFSET_RATIO = 0.75;

/** A request that the Dock disclose its Resources list, naming the addressed Resource that asked. */
interface ResourcesDisclosure {
  readonly resourceId: ResourceId;
}

/** The Map and Resource an address last revealed the Resources list for. */
interface RevealedAddress {
  readonly mapId: MapId;
  readonly resourceId: ResourceId;
}

export const createApp = (
  { app: composition, session: spaceSession, spaceResources }: OpenSpace,
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
    commandOutcomes,
    resourceDeletion,
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
  const openingGraphId = opening?.graphId ?? null;
  const openingPresentationResourceId = opening?.presentationResourceId ?? null;
  if (openingGraphId !== null && openingPresentationResourceId !== null) {
    navigation.openPresentation(
      navigation.getState().selectedMapId,
      openingGraphId,
      openingPresentationResourceId,
    );
  } else if (openingGraphId !== null) {
    navigation.openGraph(navigation.getState().selectedMapId, openingGraphId);
  }

  function App() {
    const authoringState = useSyncExternalStore(authoring.subscribe, authoring.getState);
    const sessionState = authoringState.session;
    /**
     * The session's open set, read through a subscription like every other
     * observable collaborator here.
     *
     * Both resources taken off it decide what a *hidden* Space does — `active`
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
    const selectedMapId = navigationState.selectedMapId;
    /**
     * The two facts the browser's location tells this component (ADR 0081).
     *
     * Read rather than owned: the location follows one Space, is answered by
     * `browser-location.ts`, and outlives any one mount. What is *not* here is
     * the position that module last synced to — publishing it would let this
     * decide about a position twice.
     */
    const { addressedResourceId, destinationNotFound } = useSyncExternalStore(
      browserLocation.subscribe,
      browserLocation.getState,
    );
    // Keyed on the Map as well as the Resource: a deliberate move clears the
    // published selection, and moving between two Maps that address
    // the *same* Resource leaves `addressedResourceId` untouched, so keying on the Resource
    // alone would let React bail out and never restore it. Clearing on `null` is
    // the other half — an address that stops naming a Resource must stop selecting
    // one, or the Resource's rail keeps offering copy commands for a Resource the URL
    // has left behind.
    useEffect(() => {
      const adapter = useRenderAdapter.getState();
      if (addressedResourceId === null) {
        adapter.clearSelection();
        return;
      }
      adapter.selectResource(addressedResourceId);
      // Centred and focused once its projection exists — the one member that
      // touches the camera, because a Resource arrived at by URL is somewhere the
      // reader has never been. The wait is the canvas adapter's, which is what
      // replaced the component that polled the live projection for it.
      continuation.request({
        target: { kind: 'resource', resourceId: addressedResourceId },
        select: false,
        then: 'reveal',
      });
    }, [addressedResourceId, selectedMapId]);
    /**
     * Whether a Resource's content edit is running, reported up by the canvas.
     *
     * Read by one control. Presenting draws the active Resource's content *instead
     * of* the Resource (`showActiveResourceContent`), so a live editor cannot survive it
     * and the draft would go without one of ADR 0064's four exits being spent.
     */
    const [editingResourceBody, setEditingResourceBody] = useState(false);
    const [editingResourceTitle, setEditingResourceTitle] = useState(false);
    const [clipboardFailure, setClipboardFailure] = useState<string | null>(null);
    const resourceDeletionState = useSyncExternalStore(
      resourceDeletion.subscribe,
      resourceDeletion.getState,
    );
    const { notices: commandNotices } = useSyncExternalStore(
      commandOutcomes.subscribe,
      commandOutcomes.getState,
    );
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
     * Open one address in a new browsing context, answering whether `open` ran.
     *
     * The URL is the browser location's (ADR 0081); opening it is this
     * surface's, the same split Copy link already takes. A Space Resource spends
     * this on the Space it shows, at that Space's own address. With
     * `noopener`, a tab that did open and a blocked popup both return `null`,
     * so the boolean is not a success signal — only a missing `open` or a throw
     * is an honest failure.
     */
    const openProductDestination = useCallback((destination: ProductDestination): boolean => {
      return openIndependently(browserLocation.href(destination));
    }, []);
    /**
     * The outstanding request that the Dock disclose its Resources list, if any.
     *
     * **A request, not the open state** — the Dock owns whether the list is
     * open, because it owns the one slot that keeps its disclosures exclusive
     * (`DockResourcesList`). A fresh object per request is the signal; an equal one
     * recomputed by an unrelated edit reopens nothing the reader has closed.
     */
    const [discloseResources, setDiscloseResources] = useState<ResourcesDisclosure | null>(null);
    const resourcesDrag = useRef<ResourcesDrag | null>(null);
    const renderedSpace = useMemo(
      () => readWorkingSpace(sessionState.working),
      [sessionState.working],
    );

    /**
     * Where a Resource created from a control rather than a pointer goes.
     *
     * Read at the gesture, never captured earlier: an author who pans between
     * opening the Reference Resource picker and choosing a Target is looking somewhere else
     * by the time the Resource is placed, and the whole point of the visible centre
     * is that it is where they are looking now.
     */
    /**
     * **State rather than a ref, and the difference is a lint rule with a point
     * behind it.** The reporter is installed once when the canvas's `resources`
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
     * `MapPosition` where a getter belongs.
     */
    const [visibleCentre, setVisibleCentre] = useState<VisibleCentre | null>(null);
    /**
     * The box the Command Dock docks to.
     *
     * The canvas's own element, so the twelve slots are measured against the
     * surface the Dock sits on. Nothing narrows that element now that the shell
     * yields no strip, so it coincides with the viewport; the ref is what keeps
     * the measurement the canvas's rather than the window's.
     */
    const graphArea = useRef<HTMLDivElement | null>(null);
    const reportVisibleCentre = useCallback((centre: VisibleCentre | null) => {
      setVisibleCentre(() => centre);
    }, []);
    // The origin is unreachable in practice — the control is withdrawn until Resources
    // are on the canvas, and the reporter is mounted with them — but a created
    // Resource must land *somewhere*, and a refusal would be the wrong answer to a
    // question about geometry.
    const centreAnchor = useCallback(
      (): MapPosition => visibleCentre?.() ?? { x: 0, y: 0 },
      [visibleCentre],
    );

    /**
     * The Spaces the Resources list offers, and when they are re-read.
     *
     * **A repository read rather than a derivation of this Space**, because the
     * Meta Space's Spaces are not this Space's Resources — ADR 0074 makes a Space
     * reachable through the Space Resources that reference it, and the list offers
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
     * that cannot be opened — a hidden Space's Resources trigger is not merely
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
        const epoch = spaceResources.spaceSet.getState();
        if (readSpacesEpoch.current === epoch) return;
        readSpacesEpoch.current = epoch;
        const token = latestSpacesRead.current + 1;
        latestSpacesRead.current = token;
        void (async () => {
          try {
            const spaces = await spaceResources.referenceableSpaces(currentSpace().id);
            if (latestSpacesRead.current === token) setMetaSpaces(spaces);
          } catch (failure) {
            // Reported rather than drawn: the list's own empty state says what
            // it has, and a Spaces read that failed is not a refusal of
            // anything the reader asked for.
            reportBreak(failure);
            // The epoch goes back, so this Space's next showing retries rather
            // than standing on an empty list until the Space set changes. While
            // it stays shown nothing retries; Meta's row does not depend on it
            // (`space-set-freshness.test.tsx`, "lists a closed Meta by its title
            // when the Space list read fails").
            readSpacesEpoch.current = null;
            if (latestSpacesRead.current === token) setMetaSpaces([]);
          }
        })();
      };
      read();
      return spaceResources.spaceSet.subscribe(read);
    }, [active]);

    /**
     * Placing a Space: the Space Resource that frames it, authored in this Map.
     *
     * Spent from the surface that offers the Space — so a reader who found it
     * in the list never meets a picker asking which Space they meant. The
     * Title defaults to the Space's own, which is the name they just read on
     * the row; renaming it afterwards is the ordinary inline Title edit every
     * Resource has (ADR 0083).
     *
     * The anchor is the caller's, as `addExistingResource`'s is: a press
     * passes the visible centre, read at the press, and a drop (`dropSpace`)
     * passes the anchor the canvas read from where it landed.
     */
    const addSpaceResourceFor = useCallback(
      async (space: ResourcesPopoverSpace, anchor: MapPosition): Promise<string | null> => {
        // Answers rather than rejects, for `readReferenceableSpaces`'s reason
        // and one more: the list spends this on a press or a drop of one of
        // its rows, so a rejection left to travel is a row that visibly does
        // nothing. `resolveMap` is inside the `try` because it is the
        // likeliest break on this path — the list has been open across renders
        // and the Map it resolves is the one drawing now.
        try {
          const resolved = resolveMap(currentSpace(), navigation.getState().selectedMapId);
          const result = await spaceResources.link({
            containingSpaceId: currentSpace().id,
            mapId: resolved.map.id,
            title: space.title,
            position: anchor,
            targetSpaceId: space.id,
          });
          return result.kind === 'refused' ? describeSpaceResourceRefusal(result.refusal) : null;
        } catch (failure) {
          // Both: the reader gets the sentence on the list that asked, and the
          // diagnostic still reaches the operational channel.
          reportBreak(failure);
          return describeSpaceResourceBreak(failure);
        }
      },
      [],
    );

    const [creatingSpaceResource, setCreatingSpaceResource] = useState(false);

    /**
     * Create Space Resource: one press, one Resource, one new Space (ADR 0089).
     *
     * **Optimistic, in the one sense the lifecycle leaves open.** The
     * coordination installs its local Edit and *then* commits two snapshots, and
     * the promise here resolves at the installation — so the Resource is drawn and
     * its Title editor takes the caret while the durable commit is still in
     * flight, which is the whole of what "before the commit settles" can mean
     * from out here. A refusal is delivered on that same resolution, before any
     * Resource is installed, so there is no half-made Resource to take away: what the
     * ticket calls removing a refused creation is the lifecycle leaving none
     * standing, and the "Space not created" notice command outcomes publishes
     * is the half the author can see.
     *
     * `Space N` is minted from this Space's own Resource titles and handed to both
     * the Space and the Resource that names it, so the two agree at creation
     * (`titles.ts`). Referencing an *existing* Space is not this command — it is
     * the Resources list's add-Space row, which lists real Spaces with search.
     */
    const createSpaceResource = useCallback((): void => {
      setCreatingSpaceResource(true);
      // An `async` thunk so a throw from the title minting or `resolveMap`
      // arrives at `run` as a rejection, as the lifecycle's own does.
      void commandOutcomes
        .run(
          'space-resource-create',
          async () => {
            const title = nextSpaceTitle(spaceSession.getState().working);
            // Resolved at the press rather than closed over, which is the rule
            // the pane needed for a surface open across renders and this keeps
            // for a gesture whose Edit lands one await later. `create` still
            // refuses `map-not-found` on its own account, against the Map the
            // coordinated Edit actually sees.
            const resolved = resolveMap(currentSpace(), navigation.getState().selectedMapId);
            return spaceResources.create({
              containingSpaceId: currentSpace().id,
              mapId: resolved.map.id,
              title,
              position: centreAnchor(),
            });
          },
          {
            // The id the lifecycle minted, not the Resource that appeared.
            // Nothing prevents a Markdown creation between this press and the
            // installed Edit — that creation lands synchronously — so "which
            // Resource is new" answers a different question from "which
            // Resource did this press make", and the two disagree exactly when
            // it matters. A refusal or an `unchanged` made no Resource, so
            // command outcomes requests nothing for either.
            //
            // Nothing bumps the Spaces epoch here: a created Space joins the
            // Meta Space for *every* open Space, so the lifecycle that made it
            // is what announces it (`space-resource-lifecycle.ts`).
            continueAt: ({ resourceId }) => ({
              target: { kind: 'resource', resourceId },
              select: true,
              then: 'rename',
            }),
          },
        )
        .finally(() => setCreatingSpaceResource(false));
    }, [centreAnchor]);

    const selectedMap = useMemo(
      () => resolveMap(renderedSpace, selectedMapId),
      [renderedSpace, selectedMapId],
    );
    // This Map's own placement, memoised on `selectedMap` alone. A drag
    // frame does not change `selectedMap`'s identity, so it does not change
    // this either, which is what keeps `usePlacementRendering` below from
    // rebuilding its strategy and re-running layout mid-drag.
    const mapPlacement = useMemo(() => Placement.fromMap(selectedMap.map), [selectedMap]);
    // The Resources this Map places. Memoized on the same two values the Map
    // is: it is the sole dependency of Edge Authoring's Resource-title map and its
    // endpoint choices, and a fresh array per render would rebuild both on every
    // intermediate drag frame — which is the identity churn
    // `edge-authoring-react.tsx` says its commands object must not have.
    const placedResources = useMemo(
      () => mapResources(renderedSpace, selectedMap.map),
      [renderedSpace, selectedMap],
    );
    // Everything the canvas draws, derived once from the Space and the Map.
    // Memoized on those two alone: the interaction state below changes far more
    // often, and it is `project` that reads it rather than this.
    const projection = useMemo(
      () => canvasProjection(renderedSpace, selectedMap),
      [renderedSpace, selectedMap],
    );

    const { activeGraphId } = navigationState;
    const presenting = navigationState.mode === 'presenting';
    useEffect(() => {
      resourcesDrag.current = null;
    }, [selectedMapId, presenting, authoringState.replacementEpoch]);
    // There is a Resource to go back to only once a traversal has left its first, and only
    // presenting has Traversal history at all — the same narrowing the alias above already
    // makes, spent here on the value behind it rather than on the mode.
    const selectBranch = navigation.selectBranch;
    const activeResourceId = navigation.activeResourceId();
    // Derived here rather than in a store selector: the array is rebuilt on every
    // call, so a selector would hand Zustand a new identity each render — a
    // re-render producing a new value producing a re-render, until React gives up.
    // That is still the rule; what is deliberate is that this is a plain render
    // computation and **not** memoized.
    //
    // Navigation reads the session's current working Space. Authoring an Edge from
    // the Resource being presented leaves the navigation values unchanged, so deriving
    // moves during render makes the newly authored Edge immediately traversable.
    // A render-time call is not the selector case above — nothing subscribes to
    // this identity, so a fresh array cannot feed a re-render — and the work is a
    // filter and a map over one Graph's Edges, or nothing at all outside presentation.
    const moves = navigation.moves();

    const resizeDraft = useRenderAdapter((s) => s.resizeDraft);
    const selection = useRenderAdapter((s) => s.selection);
    const selectedResourceId = selectedResourceOf(selection);

    const resourcesOutsideSelectedMap = useMemo(
      () => resourcesOutsideMap(renderedSpace, selectedMap.map),
      [selectedMap, renderedSpace],
    );
    const liveProjection = useRenderAdapter((s) => s.projection);
    // Reported by the canvas, which is the only place it can be seen: an
    // embedded Map publishes its live edits from inside the React Flow
    // subtree. Read back out of the store the canvas wrote it into, so the
    // answers derived from it reach the command surface and the canvas in one
    // render rather than an effect apart.
    const editingEmbeddedMap = useRenderAdapter((s) => s.editingEmbeddedMap);
    // There are Resources on the canvas to interact with once placement resolves
    // and the store has taken it.
    const hasResourcesOnCanvas = liveProjection !== null;
    /**
     * Whether a chrome name is being renamed in place.
     *
     * A boolean where this was a whole draft — subject, text, error and the
     * surface it began on. The draft existed because a Map's name was drawn
     * **twice**, in a Sidebar row and in the canvas header, and one rename had
     * to be live in both at once and return the caret to whichever began it.
     * The Command Dock draws each name once and `InlineTitleEditor` owns the
     * text, the refusal and the focus return, so all that is left for the
     * application to know is that one is open — which is what withdraws the
     * canvas's own title editing beside it (`authoring-availability.ts`).
     */
    const [editingChromeTitle, setEditingChromeTitle] = useState(false);
    /** Set when New Map's chrome rename continuation actually lands. */
    const createMapMovedCaret = useRef(false);
    const onChromeContinuationLand = useCallback(() => {
      createMapMovedCaret.current = true;
    }, []);
    const resourceIsOpen = Object.values(selectedMap.map.positions).some((at) => at?.open === true);
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
      editable: hasResourcesOnCanvas,
      presenting,
      editingResourceBody,
      editingResourceTitle,
      resourceIsOpen,
      editingChromeTitle,
      spaceOnCanvas: active,
      editingEmbeddedMap,
      creatingSpaceResource,
    });
    // A withdrawn list takes its outstanding request with it. Closing is the
    // Dock's, from the same `disabled` answer that withdraws the trigger; what
    // has to be dropped here is a request that would otherwise reopen the list
    // the moment authoring came back — presenting and creating a Reference Resource both
    // pass through here, and a list that reopened itself on the way back would
    // take focus with it, landing the reader in the Resources rather than on the
    // canvas they returned to.
    //
    // Read during render rather than in an effect, like the rename guards below:
    // an effect drops it one frame after the presentation has already started
    // drawing over it. `resourcesView` is `!presenting` and carries nothing derived
    // from this value, so clearing it here settles in one pass.
    if (discloseResources !== null && !availability.resourcesView) setDiscloseResources(null);
    // Reveals the list once per (Map, address) rather than on every
    // dependency change: an unrelated edit elsewhere in the Space still
    // recomputes `resourcesOutsideSelectedMap` with a fresh array identity, and
    // re-running on that alone would reopen a list the reader just closed.
    // The Map is part of the key, not just the Resource id — a canonical Resource
    // link addresses no Map of its own, so the same Resource can be
    // revealed once in one Map and then adopt a different default Map
    // that omits it, and that is a second reveal rather than a repeat.
    const [revealedAddress, setRevealedAddress] = useState<RevealedAddress | null>(null);
    if (addressedResourceId === null) {
      // Only a real navigation clears the address — choosing a Map,
      // activating a Graph, or restoring a destination that names no Resource — so
      // leaving it is the reader moving on rather than the incidental
      // recomputation this guard absorbs. Arriving back at the same address
      // afterwards is a fresh reveal, not the repeat being suppressed.
      if (revealedAddress !== null) setRevealedAddress(null);
    } else if (
      revealedAddress?.mapId !== selectedMapId ||
      revealedAddress.resourceId !== addressedResourceId
    ) {
      setRevealedAddress({ mapId: selectedMapId, resourceId: addressedResourceId });
      if (resourcesOutsideSelectedMap.some(({ id }) => id === addressedResourceId)) {
        setDiscloseResources({ resourceId: addressedResourceId });
      }
    }
    const placement = usePlacementRendering(
      projection.strategyGraph,
      resizeDraft?.placement ?? mapPlacement,
    );
    const laidOut = placement.kind === 'ready' ? placement.strategyGraph : null;

    // Nothing is worth projecting before a strategy resolves — every resource would
    // sit at the origin — and `project` will not take a null `LayoutStrategyGraph`,
    // so this is the whole of that gate rather than a rule the sync effect
    // remembers.
    const projected = useMemo(
      () =>
        laidOut === null
          ? null
          : projection.project(laidOut, {
              activeGraphId,
              activeResourceId,
              selectedResourceId,
              presenting,
            }),
      [projection, laidOut, activeGraphId, activeResourceId, selectedResourceId, presenting],
    );

    // Hand the complete projection to the render adapter as one state change.
    // A Resource keeps its live position, measured size and drag state, while an Edge
    // can never become visible before the endpoint nodes declare its handles.
    const syncProjection = useRenderAdapter((s) => s.syncProjection);
    useEffect(() => {
      if (projected) syncProjection(projected.nodes, projected.edges);
    }, [projected, syncProjection]);

    const changeNodes = useRenderAdapter((s) => s.changeNodes);
    const changeEdges = useRenderAdapter((s) => s.changeEdges);
    const resourceResize = useRenderAdapter((s) => s.resourceResize);
    const reportEmbeddedMapEditing = useRenderAdapter((s) => s.reportEmbeddedMapEditing);
    const canvas = canvasContent(placement, hasResourcesOnCanvas);
    /**
     * The two facts that end a chrome rename that is not the author ending it,
     * read as **render-time transitions rather than effects**.
     *
     * An effect runs after the render it reacts to, so each of these drew one
     * frame of a rename that had already stopped being available — an editor
     * over a Map the reader has left, or over a Space that was replaced under
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
     * resources and reading them as one is what left the defect. The editor is the
     * bar's own rename slot, so the epoch is *also* handed to the Dock
     * (`replacementEpoch` below) and the slot ends the rename on it. What
     * this branch still owes is that the withdrawal it drives — Create Resource,
     * Present, Delete Resource, the canvas's own title editing — comes back in the
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
     * Map Edits on the Space the canvas draws: rename while a chrome command
     * may run, creation while Add Map may, and deletion while entity Edits
     * may. Rebuilt when any answer moves, so the capability the Dock is drawn
     * from and the one it invokes read the same render — both answers are React
     * state, and nothing outside the render holds a later one.
     */
    const chromeTitleEdit = availability.chromeTitleEdit;
    const createMapAvailable = availability.createMap;
    const entityEdits = availability.entityEdits;
    const mapAuthoring = useMemo(
      () =>
        topLevelMapAuthoringCommands(
          { app: composition, spaceResources },
          {
            rename: () => chromeTitleEdit,
            create: () => createMapAvailable,
            delete: () => entityEdits,
          },
        ),
      [chromeTitleEdit, createMapAvailable, entityEdits],
    );
    /**
     * A Space or Graph rename from the Dock. A Map's is not here: the Dock
     * renames its Map through `mapAuthoring`, above.
     *
     * The editor is `InlineTitleEditor`, which holds a refused draft open and
     * editable, so this answers the refusal's sentence rather than swallowing
     * it, and `null` for an Edit that landed. `unchanged` is `null` too: a
     * title the subject already has is the value the author already authored,
     * and closing the editor is the right answer to it (`space-authoring.ts`).
     */
    const renameChromeTitle = useCallback(
      (
        subject: Exclude<SpaceChromeTitleSubject, { kind: 'map' }>,
        title: string,
      ): string | null => {
        const result =
          subject.kind === 'space'
            ? // No id: the Edit writes `document.title` on the session this
              // composition is closed over, which is the Space the Dock draws.
              authoring.complete({ kind: 'renamed-space', title })
            : authoring.complete({ kind: 'renamed-graph', graphId: subject.id, title });
        return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
      },
      [],
    );

    /**
     * **Stable, and the churn it replaced was paying for nothing.**
     *
     * `resourceRailActions` below hangs off this and is a dependency of the
     * node-decoration memo in `canvas-resource-authoring.ts`, so a fresh builder
     * rebuilt every node object, re-rendered every `ResourceNode` and ran
     * `spaceEntityActions` once per Resource on every render of this component.
     *
     * **What used to stand here was hearsay, and it did not reproduce.** The
     * comment claimed that memoizing these builders makes six embedded-Map
     * tests stop drawing their target at all, and that the decoration memo's
     * dependency list is therefore incomplete. Neither half survived being
     * checked (`.scratch/command-dock/issues/14`). The audit stabilised these
     * three builders two ways — exhaustive dependencies, and then `[]` with the
     * state read live, so the identities are constant for the component's whole
     * life — and ran the app suite serially both times: 895 tests pass, the
     * sixteen in `space-resource-embedded-map.test.tsx` among them. The six
     * failures were timeouts on a machine running several suites at once, where
     * the *unmodified* tree failed twelve.
     *
     * Two facts make the claim structurally impossible as well as unobserved.
     * Every identifier the decoration memo reads is in its dependency list, and
     * the one input whose contents can change behind a stable identity —
     * `spaceResourceTargets`, which reads another Space live — is refreshed at its
     * source, `open-spaces.ts` minting a fresh `entries` array on every session
     * change of every open Space. And an embedded Map never receives this
     * builder at all: `EmbeddedMapAuthoring` calls `useCanvasResourceAuthoring`
     * without `resourceEntityActions`, so the one arm of the decoration that reads
     * this identity is the one arm its nodes do not have. (It runs the rest of
     * that memo like any other canvas and publishes the decorated nodes — what
     * it lacks is the commands, not the decoration.)
     *
     * Halving is what was measured, at mount: with the identity stable, the
     * builder runs half as often, the decoration memo runs half as often and
     * half as many node objects are rebuilt, because most of those runs were
     * re-running over a `nodes` array whose identity had not moved. Selection
     * and drag are unchanged, `nodes` moving there anyway. The counts behind
     * that are in `.scratch/command-dock/issues/14` with the instrumentation
     * they came from, rather than frozen here where nothing can re-derive
     * them — which is the failure this comment's predecessor is an example of.
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
          onOpenIndependently: openProductDestination,
          // No Rename item: the Dock renames a Map and a Graph from Rename
          // in that identity's own list, so a row here would be a second path
          // to one command. The Resource rail is this builder's other consumer and
          // a Resource has no rename here either — its title is renamed in place
          // on the canvas.
          onRename: null,
        }),
      // `authoring` is the composition's, closed over rather than rendered, so it
      // is not a dependency a render can move. `resourceDeletion` says the same of
      // `spaceResources`.
      [renderedSpace.id, renderedSpace.title, copyProductDestination, openProductDestination],
    );

    /**
     * What a Resource's own rail offers (ADR 0073): the addresses every Resource has,
     * and the deletion that used to be reachable only from the Space's command
     * surface.
     *
     * The addresses are `spaceEntityActions`' answer and nothing else — the
     * same menu the Space's surface builds for the same entity, so the Resource's
     * two links cannot come to mean different resources on the two surfaces. What
     * is appended here is the one command that is a Resource's own rather than an
     * address: a Resource's deletion belongs to the Resource, and the Space's surface is
     * where it was only because the Resource had no menu of its own.
     *
     * A Resource the drawing Map does not place still has commands — its own
     * permanent address — so nothing here reads `map.positions`; which
     * addresses exist is decided from the Map by the builder above.
     */
    /**
     * Create Reference, from the Resource it points at (ADR 0089).
     *
     * **The gesture supplies the Target, so nothing is chosen first.** An author
     * creating a Reference Resource is looking at the Resource they want to reference, which is why
     * this is a row on that Resource's own command menu rather than a peer in the
     * Dock — a Target picker was answering a question the press had already
     * answered.
     *
     * **The Title is the Target's, copied once** and independent thereafter.
     * ADR 0083 keeps the Target's name off the Resource front, so without this the
     * author has no on-canvas indication of what the Reference Resource points at beyond the
     * dotted border; copying it once keeps the two the ordinary two stored
     * values that agree at creation and diverge freely, which is the rule the
     * Space and Space Resource pair already follows. Titles need not be unique.
     *
     * **Placement is a fixed offset from the source**, so the Reference Resource lands where
     * the author is looking. A free-position search would be a placement
     * algorithm, and ADR 0086 put automatic arrangement behind an Edit and out
     * of the render path deliberately — the overlap is authored and the author
     * drags it off. A Resource this Map does not place has no offset to take,
     * so its Reference Resource lands at the visible centre like any other creation.
     *
     * **The offset leaves the Reference Resource clear of the Target after Close.**
     * An Open Target holds room that Close reclaims from every Resource clear of it
     * (ADR 0084). Placement adds the growth to the collapsed offset and, when the
     * Target is Open, stays at or past the collapsed rect so Close reclaims the
     * width alone (ADR 0093). `resource-rail-actions.test.tsx` holds that the
     * Reference Resource stays separated after Close.
     */
    const createReferenceFrom = useCallback(
      (resource: Resource): EntityActionOutcome => {
        const at = selectedMap.map.positions[resource.id];
        const growth = at?.open === true ? Placement.growth(at.openSize) : { width: 0, height: 0 };
        const across = growth.width + Math.round(RESOURCE_WIDTH * REFERENCE_OFFSET_RATIO);
        const down = growth.height + Math.round(RESOURCE_HEIGHT * REFERENCE_OFFSET_RATIO);
        const anchor =
          at === undefined
            ? centreAnchor()
            : {
                x: at.x + (at.open ? Math.max(RESOURCE_WIDTH, across) : across),
                y: at.y + (at.open ? Math.max(RESOURCE_HEIGHT, down) : down),
              };
        // A refusal takes the standing notice rather than the menu it was
        // pressed in: this command closes its menu, because it moves the caret
        // onto the canvas, so by the time an answer exists there is no row left
        // to swap a word on. The rows that *can* refuse are drawn unavailable
        // above, so what reaches here is a Target that went between the draw and
        // the press — which is why it is worth a sentence rather than silence.
        const created = commandOutcomes.run(
          'reference-create',
          () =>
            authoring.complete({
              kind: 'created-reference',
              target: resource.id,
              title: resource.title,
              anchor,
            }),
          {
            continueAt: ({ createdResourceId }) =>
              createdResourceId === undefined
                ? null
                : {
                    target: { kind: 'resource', resourceId: createdResourceId },
                    select: true,
                    then: 'rename',
                  },
          },
        );
        switch (created.kind) {
          case 'refused':
          case 'broke':
            return 'failed';
          // A discarded creation has nothing to say.
          case 'completed':
          case 'unchanged':
          case 'queued':
          case 'discarded':
            return 'done';
        }
      },
      [selectedMap.map, centreAnchor],
    );

    const enterSpaceResource = useCallback(
      (resourceId: ResourceId) => {
        if (spaces === null) return;
        const resource = renderedSpace.lookup.resource(resourceId);
        if (resource?.kind !== 'space') return;
        void commandOutcomes.run(
          'space-enter',
          async () =>
            spaces.enter(resource.spaceId, resource.map, resource.graph, resource.framing),
          { subject: titleName(resource.title) },
        );
      },
      [spaces, renderedSpace],
    );

    const resourceRailActions = useCallback(
      (resourceId: ResourceId): readonly EntityActionGroup[] => {
        const resource = renderedSpace.lookup.resource(resourceId);
        // A node the projection is still drawing for a Resource the working Space no
        // longer has. No commands rather than commands that name nothing.
        if (resource === undefined) return [];
        const addresses = entityActions({ kind: 'resource', resource, map: selectedMap.map });
        const terminal =
          resource.kind === 'reference' ? 'A Reference Resource cannot be referenced.' : null;
        const reference: readonly EntityActionGroup[] = availability.addResource
          ? [
              [
                {
                  id: 'create-reference',
                  // "Create Reference", matching the vocabulary the other creations
                  // use. `Create Reference of <title>` is the shape `Delete Resource`
                  // already rejected, the menu being named for its Resource.
                  label: 'Create Reference',
                  disabled: terminal !== null,
                  description: terminal ?? undefined,
                  icon: <ResourceKindIcon kind="reference" decorative />,
                  // **No `report`, and that is what closes the menu.** A
                  // reporting item is held open to show its word
                  // (`EntityActionsMenu`), and this command puts the caret in
                  // the new Reference Resource's Title editor on the canvas — so the menu it
                  // was pressed in stayed up with its Base UI backdrop
                  // intercepting every pointer event, over an editor the author
                  // could not click into. The creation says itself: a Resource
                  // appears with the caret in it. A refusal has nowhere to
                  // report in a menu that has gone, so it takes the standing
                  // notice below, which is where ADR 0089 puts the outcome of a
                  // creation that completes on activation.
                  onSelect: () => createReferenceFrom(resource),
                },
              ],
            ]
          : [];
        /**
         * Remove from Map is the canvas key's availability, not Delete
         * Resource's. Delete is withdrawn while a Resource is Open so Open state
         * cannot outlive the Resource; Remove reclaims that room and stays
         * offered — `resource-rail-actions.test.tsx` (`still offers Remove from
         * Map while the Resource is Open`).
         */
        const canRemoveFromMap = availability.authorOnCanvas && !editingResourceBody;
        const leaving: EntityActionGroup = [
          ...(canRemoveFromMap
            ? [
                {
                  id: 'remove-from-map',
                  label: 'Remove from Map',
                  icon: <RemoveFromMapIcon />,
                  onSelect: (): EntityActionOutcome => {
                    commandOutcomes.run('resource-remove', () =>
                      authoring.complete({
                        kind: 'removed-resource-from-map',
                        resourceId: resource.id,
                      }),
                    );
                    return 'done';
                  },
                },
              ]
            : []),
          ...(availability.deleteResource
            ? [
                {
                  id: 'delete-resource',
                  // "Delete from Space", not "Delete from Space <title>": the menu
                  // that draws this item is already named for the Resource it belongs
                  // to, and the Map menu's own destructive command is spelled
                  // the same way.
                  label: 'Delete from Space',
                  icon: <DeleteIcon />,
                  variant: 'destructive' as const,
                  // **It asks, and the confirmation runs it.** Deleting a Resource is
                  // not undoable in V1, and deleting a Space Resource can take the Space
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
                  // press. This one raises a question, so `done` said "Resource deleted"
                  // beside a dialog still asking whether to, and announced it to a
                  // reader who might then press Cancel. What the deletion did is the
                  // canvas's to report; why it did not is the confirmation's, which
                  // prints it into the shell's standing notice.
                  onSelect: (): EntityActionOutcome => {
                    resourceDeletion.arm(resource);
                    return 'done';
                  },
                },
              ]
            : []),
        ];
        if (resource.kind === 'space') {
          // The Title edits in place on the Resource front; this menu authors
          // neither the Resource's name nor the target Space's.
          const links = addresses.flat();
          const enter: EntityActionGroup =
            spaces === null
              ? []
              : [
                  {
                    id: 'enter',
                    label: 'Enter',
                    icon: <EnterSpaceIcon />,
                    onSelect: () => {
                      enterSpaceResource(resource.id);
                      return 'done';
                    },
                  },
                ];
          return [
            reference.flat(),
            [...enter, ...links.filter((action) => action.id === 'open-independently')],
            links.filter((action) => action.id !== 'open-independently'),
            // `leaving` already holds only `remove-from-map` and
            // `delete-resource`, whichever of the two is available, so it is
            // passed through rather than filtered a second time.
            leaving,
          ];
        }
        // Create Reference leads (`.scratch/dock-menu-reorganisation/issues/03`):
        // creation, then its addresses together, then the two commands that
        // leave the Resource behind — Remove from Map and Delete from Space
        // sharing the trailing destructive group.
        return [...reference, ...addresses, ...(leaving.length > 0 ? [leaving] : [])];
      },
      [
        renderedSpace,
        entityActions,
        selectedMap.map,
        availability.addResource,
        availability.authorOnCanvas,
        availability.deleteResource,
        editingResourceBody,
        createReferenceFrom,
        spaces,
        enterSpaceResource,
      ],
    );

    /**
     * Choosing a Map, including the one already drawing.
     *
     * One act now. Discarding the chrome title draft used to be paired with it,
     * because the draft was the application's and outlived the control it was
     * begun from; the Dock's editor is the control, so choosing another Map
     * unmounts it and there is nothing here to discard.
     */
    const selectMap = browserLocation.chooseMap;

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

    // The two selection writes the canvas makes that are not React Flow's own —
    // continuing at a connected Resource, and the focus-to-selection bridge for an
    // Edge. Both are plain store writes with nothing to decide.
    const selectResource = useCallback((resourceId: ResourceId) => {
      useRenderAdapter.getState().selectResource(resourceId);
    }, []);

    const selectEdge = useCallback((subject: EdgeSubject) => {
      useRenderAdapter.getState().selectEdge(subject);
    }, []);

    /**
     * The refusal goes back to the caller, and only the caller can place it.
     *
     * Both `added-resource-to-map` outcomes this can produce
     * (`resource-already-in-map`, `resource-not-found`) mean the Resource just left
     * `resourcesOutsideSelectedMap`, so the row the reader activated is already
     * gone. The Resources list is still on screen though, and it is the surface
     * that asked — so it keeps the sentence, in the `Alert` above its list.
     */
    const addExistingResource = useCallback(
      (resourceId: ResourceId, anchor: MapPosition, focus: boolean): string | null => {
        const result = authoring.complete({ kind: 'added-resource-to-map', resourceId, anchor });
        if (result.kind === 'refused') return describeAuthoringRefusal(result.refusal);
        if (result.kind !== 'completed') return null;
        useRenderAdapter.getState().selectResource(resourceId);
        // The Resource is not drawn yet — the projection carrying this Edit arrives
        // a strategy later — so the continuation waits for it rather than this
        // component polling the live projection, which is what it used to do.
        if (focus) {
          continuation.request({
            target: { kind: 'resource', resourceId },
            select: false,
            then: 'focus',
          });
        }
        return null;
      },
      [],
    );

    const dropExistingResource = useCallback(
      (resourceId: ResourceId, anchor: MapPosition): void => {
        const drag = completedResourceDrag(resourcesDrag.current, resourceId, selectedMapId);
        resourcesDrag.current = null;
        if (drag === null) return;
        drag.settle(addExistingResource(resourceId, anchor, false));
      },
      [addExistingResource, selectedMapId],
    );

    /**
     * A Space dropped from the Resources list: the same placement a press
     * spends, at the drop point, with its answer settled on the list that
     * started the drag. `addSpaceResourceFor` answers rather than rejects and
     * reports a break on the operational channel itself, so the settlement is
     * all that is left to do here.
     */
    const dropSpace = useCallback(
      (spaceId: UUID, anchor: MapPosition): void => {
        const drag = completedSpaceDrag(resourcesDrag.current, spaceId, selectedMapId);
        resourcesDrag.current = null;
        if (drag === null) return;
        drag.settle(addSpaceResourceFor(drag.space, anchor));
      },
      [addSpaceResourceFor, selectedMapId],
    );

    /**
     * Add Resource: one completed Edit, and then the naming continuation.
     *
     * **This is the one operation whose refusal no surface shows, and that is a
     * decision rather than an oversight.** A refusal carries a sentence for the
     * author (ADR 0042), which is worth showing exactly where the author can act
     * on it. Every other creation has somewhere: `createReferenceFrom` and
     * `createSpaceResource` both complete on activation and both close or leave the
     * surface that ran them, so each reports through a standing notice on the
     * Space chrome. Add Resource takes no input at all, cannot refuse against a
     * choice the author made, and leaves nothing standing that a sentence could
     * correct — so it has nothing to say and no field to say it on.
     *
     * The toolbar remains available for an empty authored Map: it is the
     * zero-Resource Space's way to create the first Resource. Canvas-local authoring is
     * still gated on a resolved placement — `hasResourcesOnCanvas`, which reaches
     * the canvas as `availability.authorOnCanvas` — because there is no
     * projected node surface to receive its shortcut until that first Resource
     * exists.
     *
     * What that argument does *not* license is a catch-all, so each outcome is
     * named below. If Add Resource ever grows an input — a kind, a title, a
     * placement mode — it grows a surface with it, and the refusal goes there.
     */
    const addResource = useCallback(() => {
      const created = authoring.complete({ kind: 'created-resource', anchor: centreAnchor() });
      // Each outcome named rather than caught. `refused` is the paragraph
      // above. `queued` is an Edit that will still be performed, whose
      // projection draws the Resource without help from here. `unchanged` this
      // operation cannot answer — it mints unconditionally — but the shared
      // completion union carries it, so it is narrowed rather than asserted
      // away, and the day one of these grows an answer the compiler asks here.
      if (created.kind === 'refused') return;
      if (created.kind === 'queued') return;
      if (created.kind === 'unchanged') return;
      if (created.createdResourceId === undefined) return;
      // Selected as well as named: the storyboard's created Resource is the selected
      // one, so continued authoring — a connection, a second Resource — carries on
      // from it. Both are the one continuation, spent when the projection that
      // draws the Resource arrives.
      continuation.request({
        target: { kind: 'resource', resourceId: created.createdResourceId },
        select: true,
        then: 'rename',
      });
    }, [centreAnchor]);

    /**
     * The Resource whose inline Title editor a creation opens.
     *
     * `rename` reaches `CanvasResource` as a prop rather than through the module:
     * `@project/ui` owns that editor and depends only on `core`, so it cannot
     * import this — and it should not. A component refocusing its own control
     * after its own edit is genuine locality.
     */
    const pendingContinuation = useSyncExternalStore(
      continuation.subscribe,
      continuation.getState,
    ).pending;
    const nameOnCreation =
      pendingContinuation?.then === 'rename' && pendingContinuation.target.kind === 'resource'
        ? pendingContinuation.target.resourceId
        : null;

    // Scans every title in the Space, so it must not re-run on every drag
    // frame — `projection` (and this component) re-renders on each
    // intermediate drag position, but `sessionState.working` only changes on
    // a completed Edit.
    const newResourceTitle = useMemo(
      () => nextResourceTitle(sessionState.working),
      [sessionState.working],
    );
    // One read per set of referenced Spaces, shared by the canvas and the Resources
    // collection so a Space Resource names the same Space wherever it is drawn.
    const readSpaceResourceTarget = useCallback(
      (spaceId: UUID) => spaceResources.target(spaceId),
      [],
    );
    const spaceResourceTargets = useSpaceResourceTargets(
      renderedSpace.resources,
      readSpaceResourceTarget,
    );
    const spaceTitleById = useMemo(
      () => new Map([...spaceResourceTargets].map(([id, target]) => [id, target.title])),
      [spaceResourceTargets],
    );
    // Inactive Spaces keep their traversal mounted without receiving global keys.
    usePresentingKeys(active && presenting, {
      advance,
      retreat,
      selectBranch,
      exitPresenting,
    });

    /**
     * Every row the Open Spaces menu draws, and the Space this one was entered
     * from — both `OpenSpaces`'s own derivations (`open-spaces.ts`), which is
     * what lets App build no rows and read no session title for the Dock
     * (`.scratch/command-dock/issues/28`). Read after the `openSpacesState`
     * subscription above, so a publication that changes either re-renders this
     * component; `listing` is memoized inside `OpenSpaces` on that same state's
     * identity, so reading it here does no extra work.
     *
     * `spaces === null` only under `SpaceApp`'s isolated mount, which draws an
     * empty listing and no Opener.
     */
    const listing = spaces?.listing() ?? [];
    const opener = spaces?.opener(renderedSpace.id) ?? null;

    /**
     * A Graph Edit from the cluster, reported on `graph-edit`.
     *
     * One reporter for the cluster's commands rather than call sites each
     * naming the channel: what the reader needs to know is which Graph Edit
     * did not happen and why, and each answers that in the same words.
     */
    const runGraphEdit = (operation: () => AuthoringResult): void => {
      commandOutcomes.run('graph-edit', operation);
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
        void commandOutcomes
          .run('space-exit', async () => spaces.exit(spaceId, confirmation), { subject: title })
          .then((result) => {
            switch (result.kind) {
              case 'warning':
              case 'refused':
                setExitReport({ spaceId, title, outcome: result });
                return;
              // A discarded exit has nothing to say, and a broken one is the
              // standing notice's.
              case 'exited':
              case 'broke':
              case 'discarded':
                return;
            }
          })
          .finally(() => setExiting(null));
      },
      [spaces, renderedSpace.title, exiting],
    );

    /**
     * One command out of an entity's own menu, spent by a cluster that draws its
     * own.
     *
     * The Dock's Map, Graph and Space clusters are menus with a radio group in
     * them, so they cannot render an `EntityActionGroup[]` whole the way a Resource's
     * rail does — but *which* address each entity offers is a decision this
     * application makes once, in `entity-actions.tsx`. This reads that decision
     * out by id rather than rebuilding the destination beside it, so the two
     * surfaces cannot come to disagree about what a Graph's "Copy link" means.
     *
     * An id the entity does not offer is simply absent, which is the rule that
     * module states: a destination that does not exist is not an option to offer
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
     * A Map always owns at least one Graph — ADR 0079 mints one with every
     * Map and Authoring refuses the Edit that would empty it — but the type
     * does not say so, and a surface that asserted it would be asserting a
     * domain rule from the outside. `null` is drawn as no Dock at all, which is
     * the same answer the canvas gives for a Map it cannot resolve.
     *
     * **It is the Active Graph or it is nothing — there is no falling back to
     * the first visible one.** That fallback used to sit here, and what it
     * bought was a Dock that went on drawing while Navigation named a Graph the
     * Map no longer owned. The cost was not the label: `CommandDock` passes
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
              opener,
              listing,
              // Behind `chromeTitleEdit` exactly as the Map and Graph names
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
              /**
               * Choose a row from the Open Spaces menu, named by the title the
               * Dock drew for it — `select`'s own refusal carries none, being
               * only ever the race of a Space that closed between the listing
               * being drawn and the row being chosen, and a thrown load failure
               * carries none either. Both read the same, by the title the reader
               * chose rather than a placeholder (`.scratch/command-dock/issues/28`,
               * decision 10).
               */
              onSelect: (spaceId, title) => {
                if (spaces === null) return;
                void commandOutcomes.run('space-open', async () => spaces.select(spaceId), {
                  subject: title,
                });
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
              maps: renderedSpace.maps,
              selected: selectedMap.map,
              onSelect: selectMap,
              // Each Map command is the press built from the capability that
              // answers its availability (`offered`), so the Dock draws a row
              // unavailable exactly when invoking it would answer so — the last
              // Map included. The Dock names only the drawing Map, which is the
              // one the top-level capabilities address. Map authoring decides
              // availability and the report; command outcomes holds the report,
              // and the editor holds a refused draft open on its sentence.
              onRename: offered(
                mapAuthoring.map(selectedMap.map.id).rename,
                (rename) => (title: string) =>
                  renameDraftAnswer(commandOutcomes.run('map-manage', () => rename(title))),
              ),
              /**
               * **It opens nothing, and the author continues in the name.**
               *
               * One Edit creates and selects an empty Map with its one empty
               * Graph (ADR 0079); no list, no pane and no naming step in front of
               * it. What an author does with a brand-new Map is say what it
               * is for, and `Map 4` is a placeholder nobody wants — so the
               * caret lands in its name, which is also what makes a mis-press
               * self-announcing in a product with no undo
               * (`.scratch/command-dock/issues/13`).
               */
              onCreate: offered(mapAuthoring.create, (create) => () => {
                createMapMovedCaret.current = false;
                // Map authoring creates and selects the Map, and command
                // outcomes holds a refusal as "Map not created". Where the
                // caret continues is the Dock's; command outcomes requests it
                // only for a current completion. The creation selects the new
                // Map on this canvas, so its completion claims that move.
                void commandOutcomes.run('map-create', create, {
                  completionMovesMap: true,
                  continueAt: () => ({
                    target: { kind: 'control', name: 'map-name' },
                    select: false,
                    then: 'rename',
                  }),
                });
              }),
              didCreateMoveCaret: () => createMapMovedCaret.current,
              // Map authoring deletes the drawing Map, repoints every Space
              // Resource that selected it and leaves the canvas on the survivor;
              // command outcomes holds a refusal as "Map not deleted". Leaving
              // this canvas on the survivor is its completion's move.
              onDelete: offered(mapAuthoring.map(selectedMap.map.id).delete, (remove) => () => {
                void commandOutcomes.run('map-delete', remove, { completionMovesMap: true });
              }),
              onCopyLink: runEntityCommand(
                { kind: 'map', map: selectedMap.map },
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
              // **Answered, not swallowed** — the same shape the Map arm
              // above spends, and for the same reason. A Graph Edit can be
              // refused for reasons no surface can see coming (`graph-not-owned`
              // for a Graph a second Map owns), and a command that discards
              // that answer closes its menu having changed nothing, said nothing
              // and logged nothing.
              onRecolor: (graphId, color) => {
                runGraphEdit(() => authoring.complete({ kind: 'recolored-graph', graphId, color }));
              },
              onCreate: () => {
                runGraphEdit(() => authoring.complete({ kind: 'added-graph' }));
              },
              // The notice is command outcomes'; the Graph Navigation adopts
              // after a completed delete is this caller's.
              onDelete: (graphId) => {
                void commandOutcomes
                  .run('graph-delete', () =>
                    coordinatedGraphDelete(spaceResources.deleteGraph, {
                      targetSpaceId: renderedSpace.id,
                      mapId: selectedMap.map.id,
                      graphId,
                      preferredGraphId: null,
                    }),
                  )
                  .then((result) => {
                    if (result.kind === 'completed') {
                      navigation.activateGraph(result.graphId);
                    }
                  });
              },
              editsDisabled: !availability.entityEdits,
              onCopyLink: runEntityCommand(
                { kind: 'graph', graph: activeGraph, map: selectedMap.map },
                COPY_LINK_ACTION_ID,
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
            resources: {
              /* The Dock draws this list and owns whether it is open, so what
                 crosses here is what the list shows and what a row does —
                 never an `open` flag the two could come to disagree about
                 (`DockResourcesList`). */
              list: {
                resources: resourcesOutsideSelectedMap,
                allResources: renderedSpace.resources,
                spaceTitleById,
                spaces: metaSpaces,
                onAddSpace: (space) => addSpaceResourceFor(space, centreAnchor()),
                disabled: !availability.resourcesView,
                disclose: discloseResources,
                revealedResourceId: addressedResourceId,
                /* **No focus continuation, and that is the surface's own
                   change.** The drawer this replaced took a keyboard Add to
                   the placed Resource on the canvas; an anchored list keeps the
                   reader in it, so adding several Resources costs one disclosure
                   rather than one each, and the caret lands back in the filter
                   (`ResourcesPopover`). Escape is the way out to the canvas, and
                   it returns focus to the trigger the list hangs off. */
                onAdd: (resource) => addExistingResource(resource.id, centreAnchor(), false),
                onDragStart: (resourceId, settle) => {
                  resourcesDrag.current = {
                    kind: 'resource',
                    resourceId,
                    mapId: selectedMapId,
                    settle,
                  };
                },
                onSpaceDragStart: (space, settle) => {
                  resourcesDrag.current = { kind: 'space', space, mapId: selectedMapId, settle };
                },
                onDragEnd: () => {
                  resourcesDrag.current = null;
                },
              },
              // Both kinds complete their Edit on the press (ADR 0089): nothing
              // is chosen first, so there is no pane and nothing to cancel.
              //
              // **Each kind names its own press, rather than one arm and a
              // fall-through.** `RESOURCE_KINDS` is the list the cluster draws its
              // controls from, so a kind added there already has a control, a
              // glyph and an accessible name whatever this says; an exhaustive
              // record is what stops it inheriting the Space Resource's press in
              // silence. ADR 0089 records that a kind which genuinely cannot
              // complete on activation is a decision refining it — this is where
              // that decision is asked for.
              onCreate: (kind) => {
                const create = {
                  markdown: addResource,
                  space: createSpaceResource,
                } satisfies Record<DockResourceKind, () => void>;
                create[kind]();
              },
              createDisabled: {
                markdown: !availability.addResource,
                space: !availability.createSpaceResource,
              },
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
        // The shell yields nothing at its end edge, and there is no prop left
        // that could ask it to. The Resources list is a Popover anchored to its
        // trigger and floats over the canvas, so it yields no width — which is
        // the occlusion the surface comparison held against the drawer it replaced
        // (`.scratch/command-dock/issues/10-decide-the-cards-surface.md`), and
        // why `22-retire-the-registry-drawer-and-the-yielded-strip.md` deleted
        // `AppShell`'s `insetEnd` rather than leaving it unset here.
        notice={
          <>
            {clipboardFailure === null ? null : (
              <ShellNotice title="Link not copied" onDismiss={() => setClipboardFailure(null)}>
                {clipboardFailure}
              </ShellNotice>
            )}
            {COMMAND_CHANNELS.map((channel) => {
              const notice = commandNotices.get(channel);
              return notice === undefined ? null : (
                <ShellNotice
                  key={channel}
                  title={notice.title}
                  onDismiss={() => commandOutcomes.dismiss(channel)}
                >
                  {notice.message}
                </ShellNotice>
              );
            })}
            {/* **The one report here with no dismissal, and it is not an
                oversight.** The others are about a press that is over, so
                putting one away changes nothing it is about. This one is about
                the address the reader is *on*: clearing it is what asks for the
                stale location to be corrected (`browser-location.ts`), so a
                dismissal would be a move dressed as an acknowledgement. It is
                answered by the first move the reader makes — including opening
                a Resource on the canvas, which the notice never covers. */}
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
        <ChromeContinuation
          continuation={continuation}
          within={graphArea}
          chromeRenameReady={availability.chromeTitleEdit}
          onLand={onChromeContinuationLand}
        />
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
        {resourceDeletionState.pending === null ? null : (
          <DeleteResourceConfirmation
            resource={resourceDeletionState.pending}
            deleting={resourceDeletionState.deleting}
            onConfirm={resourceDeletion.confirm}
            onDismiss={resourceDeletion.cancel}
          />
        )}
        {/* One child, not a row: the Resources list portals over this rather than
            sitting beside it, so a toggle that says nothing about the Map no
            longer re-flows the canvas and re-measures every Resource on it. */}
        <div ref={graphArea} className="graph-area size-full min-w-0" style={resourceSizeVars}>
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
          ) : canvas.kind === 'resources' ? (
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
                  this subtree is conditional on there being Resources at all. */}
              <CanvasContinuation
                continuation={continuation}
                onSelectResource={selectResource}
                onSelectEdge={selectEdge}
              />
              <SpaceCanvas
                commandOutcomes={commandOutcomes}
                // Keyed on the replacement epoch, so accepting the stored Space
                // takes the canvas's local editing state with it. The render
                // adapter already drops the projection and drag bookkeeping, but
                // an open title editor is the graph's own: it names a Resource from
                // a Space that is gone, and its raised invalid guard would go on
                // swallowing clicks in the one that replaced it.
                key={authoringState.replacementEpoch}
                nodes={liveProjection?.nodes ?? []}
                edges={liveProjection?.edges ?? []}
                // Null while a replacement placement resolves. The canvas keeps
                // drawing the Resources on screen through that window — deliberately, so
                // a gesture is never interrupted — so a connection is reachable
                // with no fresh projection to hand over, and the store keeps its
                // live nodes rather than reconciling against nothing.
                projectedNodes={projected?.nodes ?? null}
                activeResourceId={activeResourceId}
                presenting={presenting}
                placementReady={hasResourcesOnCanvas}
                availability={availability}
                onNodesChange={changeNodes}
                onEdgesChange={changeEdges}
                edgeAuthoring={edgeAuthoring}
                selection={selection}
                onSelectResource={selectResource}
                onSelectEdge={selectEdge}
                placedResources={placedResources}
                newResourceTitle={newResourceTitle}
                onAddResource={addResource}
                onAddExistingResource={dropExistingResource}
                onPlaceSpace={dropSpace}
                nameOnCreation={nameOnCreation}
                authoring={authoring}
                spaceSession={spaceSession}
                onBodyEditingChange={setEditingResourceBody}
                onTitleEditingChange={setEditingResourceTitle}
                resourceResize={resourceResize}
                reportEmbeddedMapEditing={reportEmbeddedMapEditing}
                spaceTitle={renderedSpace.title}
                mapTitle={selectedMap.map.title}
                graphs={projection.visibleGraphs}
                colorByGraphId={projection.colors}
                activeGraphId={activeGraphId}
                spaceResourceTargets={spaceResourceTargets}
                resourceEntityActions={resourceRailActions}
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
                if (activeGraphId === null || activeResourceId === null) return;
                // `void`: presenting chrome's Copy link is a plain button with
                // no label to swap, so it has nothing to do with the outcome
                // beyond the alert `copyProductDestination` already renders.
                void copyProductDestination({
                  kind: 'presentation',
                  spaceId: renderedSpace.id,
                  mapId: selectedMapId,
                  graphId: activeGraphId,
                  resourceId: activeResourceId,
                });
              }}
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
