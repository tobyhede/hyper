import { useRef, useSyncExternalStore } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Alert, AlertDescription, AlertIcon, AlertTitle, AppShell } from '@project/ui';
import { createNonThrowingReporter } from '@project/persistence';
import type { BrowserLocation } from './browser-location';
import type { OpenSpace } from './open-spaces';
import { resourceSizeVars } from './resource';
import { canRetreat } from './navigation';
import { usePresentingKeys } from './presenting-keys';
import type { DestinationOpening } from './destination-opening';
import { useOpenSpacesStanding } from './open-spaces-context';
import { useAddressedResource } from './addressed-resource';
import { useMapView } from './map-view';
import { useResourcePlacement } from './resource-placement';
import { useCanvasRendering } from './canvas-rendering';
import { useAuthoringAvailability } from './use-authoring-availability';
import { useResourcesDisclosure } from './resources-disclosure';
import { useSpaceAddresses } from './space-addresses';
import { useResourceRailActions } from './resource-rail-actions';
import { useUnsettledLeaveGuard } from './leave-guard';
import { useSpaceResourceTargetTitles } from './space-resource-targets';
import { useNameOnCreation } from './name-on-creation';
import { useDockChrome } from './dock-chrome';
import { SpaceCanvas } from './components/SpaceCanvas';
import { CanvasCentre } from './components/CanvasCentre';
import { CanvasContinuation } from './components/CanvasContinuation';
import { ChromeContinuation } from './components/ChromeContinuation';
import { ArmedResourceDeletion } from './components/DeleteResourceConfirmation';
import { CommandDock } from './components/CommandDock';
import { PlacementFailure } from './components/PlacementFailure';
import { PlacementPending } from './components/PlacementPending';
import { PresentingChrome } from './components/PresentingChrome';
import { CommandNotices, ShellNotice } from './components/ShellNotice';

export const createApp = (
  opened: OpenSpace,
  browserLocation: BrowserLocation,
  opening?: DestinationOpening,
) => {
  const { app: composition, session: spaceSession, spaceResources } = opened;
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
   * A Spaces read and a Space placement both report and *then* answer, so a
   * sink that threw would leave the list on an answer that never arrives. The
   * repository wraps where it consumes rather than where it publishes —
   * `createObservableState` does the same with the sink it is handed — so the
   * guard is here rather than on `ComposedApp`.
   */
  const reportBreak = createNonThrowingReporter(reportObserverError);
  const currentSpaceId = () => currentSpace().id;
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
    const { session: sessionState, navigation: navigationState, replacementEpoch } = authoringState;
    const { selectedMapId, activeGraphId } = navigationState;
    const presenting = navigationState.mode === 'presenting';
    const { spaces, active } = useOpenSpacesStanding(sessionState.working.id);
    const { addressedResourceId, destinationNotFound } = useAddressedResource(
      browserLocation,
      useRenderAdapter,
      continuation,
      selectedMapId,
    );
    const view = useMapView(readWorkingSpace, sessionState.working, selectedMapId);
    const { renderedSpace, selectedMap, projection } = view;
    const placement = useResourcePlacement(opened, {
      map: selectedMap.map,
      presenting,
      replacementEpoch,
      reportBreak,
    });
    const activeResourceId = navigation.activeResourceId();
    // A plain render computation and deliberately not memoized: Navigation reads
    // the session's current working Space, so an Edge authored from the Resource
    // being presented is traversable at once, and nothing subscribes to the
    // array's identity.
    const moves = navigation.moves();
    const canvasRendering = useCanvasRendering(useRenderAdapter, {
      projection,
      mapPlacement: view.mapPlacement,
      activeGraphId,
      activeResourceId,
      presenting,
    });
    const { hasResourcesOnCanvas, liveProjection, projected, canvas } = canvasRendering;
    const {
      availability,
      editingResourceBody,
      setEditingResourceBody,
      setEditingResourceTitle,
      setEditingChromeTitle,
    } = useAuthoringAvailability(
      {
        editable: hasResourcesOnCanvas,
        presenting,
        resourceIsOpen: view.resourceIsOpen,
        spaceOnCanvas: active,
        editingEmbeddedMap: canvasRendering.editingEmbeddedMap,
        creatingSpaceResource: placement.creatingSpaceResource,
      },
      replacementEpoch,
    );
    const discloseResources = useResourcesDisclosure(availability.resourcesView, {
      addressedResourceId,
      mapId: selectedMapId,
      resourcesOutsideMap: view.resourcesOutsideMap,
    });
    const { entityActions, copyProductDestination, clipboardFailure, dismissClipboardFailure } =
      useSpaceAddresses(browserLocation, renderedSpace);
    const resourceRailActions = useResourceRailActions(composition, {
      space: renderedSpace,
      map: selectedMap.map,
      entityActions,
      availability,
      editingResourceBody,
      createReferenceFrom: placement.createReferenceFrom,
      spaces,
    });
    useUnsettledLeaveGuard(sessionState.persistence.kind);
    const spaceResourceTargets = useSpaceResourceTargetTitles(
      spaceResources,
      renderedSpace.resources,
    );
    const nameOnCreation = useNameOnCreation(continuation);
    // Inactive Spaces keep their traversal mounted without receiving global keys.
    usePresentingKeys(active && presenting, {
      advance: navigation.advance,
      retreat: navigation.retreat,
      selectBranch: navigation.selectBranch,
      exitPresenting: navigation.exitPresenting,
    });
    const { chrome: dockChrome, onChromeContinuationLand } = useDockChrome(
      opened,
      browserLocation,
      {
        space: renderedSpace,
        map: selectedMap.map,
        projection,
        activeGraphId,
        presenting,
        active,
        persistence: sessionState.persistence,
        replacementEpoch,
        availability,
        onRenamingChange: setEditingChromeTitle,
        entityActions,
        spaces,
        resources: {
          outside: view.resourcesOutsideMap,
          memberships: view.membershipsOutsideMap,
          spaceTitleById: spaceResourceTargets.titleById,
          disclose: discloseResources,
          addressedResourceId,
          placement,
        },
        containingSpaceId: currentSpaceId,
        reportBreak,
      },
    );
    /**
     * The box the Command Dock docks to: the canvas's own element, so the twelve
     * slots are measured against the surface the Dock sits on rather than the
     * window.
     */
    const graphArea = useRef<HTMLDivElement | null>(null);

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
              <ShellNotice title="Link not copied" onDismiss={dismissClipboardFailure}>
                {clipboardFailure}
              </ShellNotice>
            )}
            <CommandNotices commandOutcomes={commandOutcomes} />
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
        <ArmedResourceDeletion resourceDeletion={resourceDeletion} />
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
              <CanvasCentre report={placement.reportVisibleCentre} />
              {/* The canvas half of where an Edit continues. Inside the
                  provider because `reveal` moves the camera and because an Edge
                  subject becomes an element only through the projection React
                  Flow is drawing. Its chrome half is mounted at the root, since
                  this subtree is conditional on there being Resources at all. */}
              <CanvasContinuation
                continuation={continuation}
                onSelectResource={canvasRendering.selectResource}
                onSelectEdge={canvasRendering.selectEdge}
              />
              <SpaceCanvas
                commandOutcomes={commandOutcomes}
                // Keyed on the replacement epoch, so accepting the stored Space
                // takes the canvas's local editing state with it. The render
                // adapter already drops the projection and drag bookkeeping, but
                // an open title editor is the graph's own: it names a Resource from
                // a Space that is gone, and its raised invalid guard would go on
                // swallowing clicks in the one that replaced it.
                key={replacementEpoch}
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
                onNodesChange={canvasRendering.changeNodes}
                onEdgesChange={canvasRendering.changeEdges}
                edgeAuthoring={edgeAuthoring}
                selection={canvasRendering.selection}
                onSelectResource={canvasRendering.selectResource}
                onSelectEdge={canvasRendering.selectEdge}
                placedResources={view.placedResources}
                newResourceTitle={view.newResourceTitle}
                onAddResource={placement.addResource}
                onAddExistingResource={placement.dropExistingResource}
                onPlaceSpace={placement.dropSpace}
                nameOnCreation={nameOnCreation}
                authoring={authoring}
                spaceSession={spaceSession}
                onBodyEditingChange={setEditingResourceBody}
                onTitleEditingChange={setEditingResourceTitle}
                resourceResize={canvasRendering.resourceResize}
                reportEmbeddedMapEditing={canvasRendering.reportEmbeddedMapEditing}
                spaceTitle={renderedSpace.title}
                mapTitle={selectedMap.map.title}
                graphs={projection.visibleGraphs}
                colorByGraphId={projection.colors}
                activeGraphId={activeGraphId}
                spaceResourceTargets={spaceResourceTargets.targets}
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
              onSelectBranch={navigation.selectBranch}
              onAdvance={navigation.advance}
              onRetreat={navigation.retreat}
              onExit={navigation.exitPresenting}
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
