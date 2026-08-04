import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AppShell, Button, LayoutSelector, RouteSelector, ViewSelector } from '@project/ui';
import { cardDocumentSchema, uuidSchema } from '@project/core';
import {
  projectCardNodes,
  projectRouteEdges,
  type RouteEmphasis,
} from '@project/react-flow-adapter';
import {
  buildCardHandles,
  buildLayoutGraph,
  buildRouteEdges,
  filterHandlesByRoutes,
  getCard,
  Placement,
  routeCardIds,
  resolveContentCard,
  type LayoutPoint,
  type ResolvedContentCard,
} from '@project/graph';
import type { OpenedSpace } from './space';
import { createSpaceAuthoring, nextCardTitle } from './space-authoring';
import { createRenderAdapter } from './render-adapter';
import { canvasContent, usePlacementRendering } from './placement-rendering';
import { activeRouteColor, routeColorMap } from './colors';
import { CARD_HEIGHT, CARD_SIZE, cardSizeVars } from './card';
import { createNavigation } from './navigation';
import { createWorkingSpaceReader } from './snapshot';
import { defaultRenderer, resolveView, type RendererSelection } from './view';
import { GraphView } from './components/GraphView';
import { OpenCard } from './components/OpenCard';
import { PresentingChrome } from './components/PresentingChrome';

export const createApp = ({ space, spaceSession }: OpenedSpace) => {
  // One validated aggregate per working snapshot, shared by the render path and
  // by Navigation. Both read the same reader, so in the steady state a snapshot
  // is parsed and indexed once rather than once per render — and both see the
  // same `Space` identity, which is what the render memos below hang on.
  const readWorkingSpace = createWorkingSpaceReader();
  const currentSpace = () => readWorkingSpace(spaceSession.getState().working);
  // Which view this space opens in, and the strategy that arranges it. The fixture
  // declares no view, so this resolves to the route-driven ELK graph — exactly
  // what the hardcoded `elkStrategy()` here used to do. It also answers which
  // routes are shown and which of them opens active (ADR 0026), so it has to
  // resolve before the store is built.
  const initialRenderer = defaultRenderer(space);
  const initialView = resolveView(space, initialRenderer);
  const navigation = createNavigation(currentSpace, initialRenderer, space);

  // Live nodes hold whichever arrangement is on screen. A positioned view also
  // supplies its already-authored, possibly sparse Layout map; an automatic view
  // starts null and is promoted only by a completed edit (ADR 0025).
  const initialPlacement =
    initialView.layout === null ? null : Placement.fromLayout(initialView.layout);
  const authoring = createSpaceAuthoring({
    session: spaceSession,
    navigation,
    initialPlacement,
  });
  // React Flow knows node ids as plain strings, and asks this per pointer frame.
  // An id that is not a Card identity is not a connection to accept — answering
  // false is the honest reading, and a throw mid-drag would be the wrong one.
  const acceptsGraphConnection = (from: string, to: string): boolean => {
    const source = uuidSchema.safeParse(from);
    const target = uuidSchema.safeParse(to);
    return source.success && target.success && authoring.canConnect(source.data, target.data);
  };
  const acceptsNewCardTarget = (from: string): boolean => {
    const source = uuidSchema.safeParse(from);
    return source.success && authoring.canCreateConnectedCard(source.data);
  };
  const useRenderAdapter = createRenderAdapter(authoring);

  function App() {
    const authoringState = useSyncExternalStore(authoring.subscribe, authoring.getState);
    const sessionState = authoringState.session;
    const navigationState = authoringState.navigation;
    const selectedRenderer = navigationState.selectedRenderer;
    const selectedView = navigationState.selectedView;
    // Why the remote state was refused, reported beside the control that asked
    // for it. The workspace behind it still holds the local work and the
    // conflict, so this is a message, not a mode.
    //
    // Held against the revision it explains, and read back only while that is
    // still the revision in conflict. A refusal explains one remote snapshot, so
    // it dies with it: `resolveConflict` commits again without leaving the
    // conflicted state, so the next conflict can carry a different — and
    // loadable — remote, and holding the old sentence over it would say the
    // local work cannot be replaced when it now can. Derived rather than cleared
    // by an effect, which would render the stale sentence against the new
    // conflict for the commit before it ran.
    const [refusal, setRefusal] = useState<{ revision: bigint; message: string } | null>(null);
    const conflictRevision =
      sessionState.persistence.kind === 'conflicted'
        ? sessionState.persistence.current.revision
        : null;
    const remoteRefusal =
      refusal !== null && refusal.revision === conflictRevision ? refusal.message : null;
    const rendererSpace = useMemo(
      () => readWorkingSpace(sessionState.working),
      [sessionState.working],
    );
    const layouts = rendererSpace.layouts;
    const routes = rendererSpace.routes;
    const colors = useMemo(() => routeColorMap(rendererSpace), [rendererSpace]);
    const allHandles = useMemo(() => buildCardHandles(rendererSpace), [rendererSpace]);
    const allRouteEdges = useMemo(() => buildRouteEdges(rendererSpace), [rendererSpace]);
    const view = useMemo(
      () => resolveView(rendererSpace, selectedRenderer),
      [rendererSpace, selectedRenderer],
    );

    const { activeRouteId, openedCardId } = navigationState;
    const activateRoute = navigation.activateRoute;
    const openCard = navigation.openCard;
    const closeCard = navigation.closeCard;
    const presenting = navigationState.mode === 'presenting';
    const canRetreat = navigationState.walk.length > 1;
    const present = navigation.present;
    const exitPresenting = navigation.exitPresenting;
    const advance = navigation.advance;
    const retreat = navigation.retreat;
    const selectBranch = navigation.selectBranch;
    const activeCardId = navigation.activeCardId();
    // Derived here rather than in a store selector: the array is rebuilt on every
    // call, so a selector would hand Zustand a new identity each render — a
    // re-render producing a new value producing a re-render, until React gives up.
    // That is still the rule; what is deliberate is that this is a plain render
    // computation and **not** memoized.
    //
    // Navigation reads the session's current working Space. Authoring an Edge from
    // the Card being presented leaves the navigation values unchanged, so deriving
    // moves during render makes the newly authored Edge immediately traversable.
    // A render-time call is not the selector case above — nothing subscribes to
    // this identity, so a fresh array cannot feed a re-render — and the work is a
    // filter and a map over one Route's edges, or nothing at all outside a walk.
    const moves = navigation.moves();

    // Which routes the renderer shows, resolved from the Layout that filtered them
    // (ADR 0026). Membership is the view's decision (ADR 0005), which is why it
    // arrives from `resolveView` rather than being decided in the graph or layout
    // packages.
    const visibleRouteIds = view.visibleRouteIds;
    const visibleRouteIdSet = useMemo(() => new Set(visibleRouteIds), [visibleRouteIds]);
    const visibleRoutes = useMemo(
      () => routes.filter((route) => visibleRouteIdSet.has(route.id)),
      [routes, visibleRouteIdSet],
    );

    // Every card, not just the route-visited ones. A space may have cards and no
    // routes at all (ADR 0015) — deriving the card set from the routes would render
    // a new space as an empty canvas, which is the one thing it must not do. Which
    // cards a view draws was always the View's call, not the layout's (ADR 0005).
    const visibleCardIds = useMemo(
      () => rendererSpace.cards.map((card) => card.id),
      [rendererSpace.cards],
    );
    const visibleHandles = useMemo(
      () => filterHandlesByRoutes(allHandles, visibleRouteIds),
      [allHandles, visibleRouteIds],
    );
    const visibleEdges = useMemo(
      () => allRouteEdges.filter((edge) => visibleRouteIdSet.has(edge.routeId)),
      [allRouteEdges, visibleRouteIdSet],
    );

    const graph = useMemo(
      () => buildLayoutGraph(visibleCardIds, visibleHandles, visibleEdges, CARD_SIZE),
      [visibleCardIds, visibleHandles, visibleEdges],
    );
    // Read at the point of use, like `moves` above and for the same reason: the
    // placement is not published state, and subscribing to it through the
    // render adapter — a store that knows nothing about either the placement or
    // the selected renderer — only worked because every install happened to be
    // followed by an unrelated notification. This component already re-renders
    // on both stores, and a render-time read cannot be stale at the render that
    // uses it. `installPlacement` keeps the map's identity when the value is
    // unchanged, so this does not defeat the memo below.
    const authoredPositions = authoring.authoredPlacement();
    const selectedCardId = useRenderAdapter((s) => s.selectedCardId);
    const moved = useRenderAdapter((s) => s.moved);
    const placement = usePlacementRendering(graph, view.strategy, authoredPositions);
    const laidOut = placement.kind === 'ready' ? placement.graph : null;

    // Selecting a route emphasises it; it never hides the rest of the space.
    const emphasis: RouteEmphasis = activeRouteId ? 'subtle' : 'equal';

    const projectedNodes = useMemo(
      () =>
        projectCardNodes(rendererSpace, visibleHandles, colors, {
          activeCardId,
          selectedCardId,
          showActiveCardContent: presenting,
          activeRouteId,
          activeRouteColor: activeRouteColor(colors, activeRouteId),
          emphasis,
          ...(laidOut ? { layoutGraph: laidOut } : {}),
          nodeHeight: CARD_HEIGHT,
          cardIds: visibleCardIds,
        }),
      [
        rendererSpace,
        colors,
        activeCardId,
        selectedCardId,
        presenting,
        activeRouteId,
        emphasis,
        laidOut,
        visibleHandles,
        visibleCardIds,
      ],
    );

    const projectedEdges = useMemo(
      () =>
        projectRouteEdges(visibleEdges, colors, {
          activeRouteId,
          emphasis,
          // A layout's routed edge geometry describes the arrangement it computed,
          // so it stops being true once a card is dragged out of it. From then on
          // the edges fall back to plain curves between wherever the cards now are
          // — which is what a positioned view draws anyway, since it routes
          // nothing.
          ...(laidOut && !moved ? { layoutGraph: laidOut } : {}),
        }),
      [visibleEdges, colors, activeRouteId, emphasis, laidOut, moved],
    );

    // Hand the complete projection to the render adapter as one state change.
    // A Card keeps its live position, measured size and drag state, while an Edge
    // can never become visible before the endpoint nodes declare its handles.
    // Only once the layout has resolved: before that every card sits at the origin
    // and there is nothing worth preserving.
    const syncProjection = useRenderAdapter((s) => s.syncProjection);
    useEffect(() => {
      if (laidOut) syncProjection(projectedNodes, projectedEdges);
    }, [laidOut, projectedNodes, projectedEdges, syncProjection]);

    const liveProjection = useRenderAdapter((s) => s.projection);
    const changeNodes = useRenderAdapter((s) => s.changeNodes);
    const canvas = canvasContent(placement, liveProjection !== null);
    // There is an arrangement to drag once the layout has resolved and the store
    // has taken it. Not a permission — every view is editable (ADR 0025) — but it
    // is false for the frame before the first placement resolves, and again after
    // `selectRenderer` clears the projection until the next one is published.
    const editable = liveProjection !== null;
    const completedConnectionTarget = useRef<string | null>(null);

    // One decision resolved from one Space, applied in an order that cannot
    // leave the two collaborators disagreeing. Both steps that may refuse the
    // selection run first — the resolve here and Navigation's own — and the
    // render adapter update is a plain store write that cannot fail. Resolving
    // against the session's live Space rather than the rendered one matters
    // because Navigation resolves against the live one too: deciding from a
    // snapshot Navigation will not consult is one decision with two sources of
    // truth.
    const chooseRenderer = useCallback((selection: RendererSelection) => {
      const resolved = resolveView(currentSpace(), selection);
      navigation.selectRenderer(selection);
      useRenderAdapter
        .getState()
        .selectRenderer(resolved.layout === null ? null : Placement.fromLayout(resolved.layout));
    }, []);

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

    const activeRouteCardIds = useMemo(
      () => new Set(activeRouteId === null ? [] : routeCardIds(rendererSpace, activeRouteId)),
      [rendererSpace, activeRouteId],
    );

    const connectCards = useCallback(
      (connection: { source: string; target: string }) => {
        // Issue 04 owns Route minting. An existing Route can be edited from every
        // resolved renderer; an Algorithmic View converts using exactly the live
        // Card positions the author connected between (ADR 0025).
        const completed = useRenderAdapter
          .getState()
          .connectCards(
            uuidSchema.parse(connection.source),
            uuidSchema.parse(connection.target),
            projectedNodes,
          );
        if (completed) {
          completedConnectionTarget.current = connection.target;
        }
      },
      [projectedNodes],
    );

    const finishConnection = useCallback(() => {
      const target = completedConnectionTarget.current;
      completedConnectionTarget.current = null;
      if (target === null) return;
      requestAnimationFrame(() => {
        useRenderAdapter.getState().selectCard(uuidSchema.parse(target));
      });
    }, []);

    const createConnectedCard = useCallback((sourceId: string, position: LayoutPoint) => {
      const cardId = useRenderAdapter
        .getState()
        .createConnectedCard(uuidSchema.parse(sourceId), position);
      if (cardId !== null) completedConnectionTarget.current = cardId;
    }, []);

    const completeCardTitle = useCallback((cardIdInput: string, title: string): string | null => {
      const cardId = uuidSchema.safeParse(cardIdInput);
      if (!cardId.success) return 'This Card is no longer available.';
      const stored = spaceSession.getState().working.cards.find((card) => card.id === cardId.data);
      if (stored === undefined) return 'This Card is no longer available.';
      // Trimmed, because `z.string().min(1)` counts characters and a space is
      // one: the schema alone accepts a title that draws as nothing, leaving a
      // Card indistinguishable from its neighbours and an `Edit title of` label
      // naming nobody. Blank is the empty case wearing different bytes.
      const named = title.trim();
      const parsed = cardDocumentSchema.safeParse({ ...stored.document, title: named });
      if (!parsed.success) {
        return named.length === 0
          ? 'A Card title is required.'
          : (parsed.error.issues[0]?.message ?? 'The Card title is invalid.');
      }
      authoring.installCardDocument(cardId.data, parsed.data);
      // The result is deliberately not inspected, and that is not an oversight.
      // `no-edit` here means the title did not change, which is the editor's
      // ordinary close. Authoring's other refusals need a state no author can
      // reach from this control: `isSupportedCardEdit` only ever sees a title
      // change, and the two that turn on a missing placement or a vanished
      // Layout cannot coincide with a drawn Card, because the affordance is
      // rendered by the same projection that installs the placement. `queued`
      // is an Edit that will still be performed.
      authoring.complete({ kind: 'edited-card', cardId: cardId.data });
      return null;
    }, []);

    // An Alias owns a title and a pointer, not content. Opening a Card is
    // editing it (ADR 0037), so an Alias has nothing to open onto: it offers no
    // affordance and the keyboard cannot reach one either. Its title is renamed
    // on the graph. `card-authoring/03` would let an Alias delegate content
    // editing to its target; it is unbuilt, and reading through one went with
    // the reading surface.
    const editableCardIds = useMemo(
      () =>
        new Set(
          rendererSpace.cards.filter((card) => card.kind === 'markdown').map((card) => card.id),
        ),
      [rendererSpace],
    );
    const openCardForEditing = useCallback(
      (cardIdInput: string): void => {
        // An opened Card covers the graph, so a pointer cannot reach a second
        // one — but the pane traps no focus, and `Enter` on a node still behind
        // it asked to open that Card, swapping the pane's subject out from under
        // a draft in progress. Declining here matches what the pointer can do.
        if (openedCardId !== null) return;
        const cardId = uuidSchema.safeParse(cardIdInput);
        if (cardId.success && editableCardIds.has(cardId.data)) openCard(cardId.data);
      },
      [openCard, editableCardIds, openedCardId],
    );

    const openedCard = openedCardId ? getCard(rendererSpace, openedCardId) : undefined;
    const openedContent = openedCard ? resolveContentCard(rendererSpace, openedCard.id) : undefined;
    const completeOpenedCard = useCallback((completed: ResolvedContentCard): void => {
      const { id, ...document } = completed;
      authoring.installCardDocument(id, document);
      authoring.complete({ kind: 'edited-card', cardId: id });
    }, []);

    /**
     * Closing an opened Card returns focus to that Card.
     *
     * The pane cannot do this itself. The obvious target is the control that
     * opened it, and opening destroys that control — `titleEditingEnabled` goes
     * false while a Card is open, so every Card affordance is withdrawn — which
     * left a closed dialog dropping focus on `<body>`. The Card survives, is
     * focusable outside presenting, and is where the author was.
     *
     * Runs after the pane has unmounted and the graph has re-rendered, so the
     * node is back in the tree by the time it is asked for. Presenting is
     * excluded because it closes the opened Card on its way in and takes the
     * nodes out of the tab order behind it.
     */
    const lastOpenedCardId = useRef<string | null>(null);
    useEffect(() => {
      const closed = lastOpenedCardId.current;
      lastOpenedCardId.current = openedCardId;
      if (closed === null || openedCardId !== null || presenting) return;
      document
        .querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(closed)}"]`)
        ?.focus();
    }, [openedCardId, presenting]);

    // Escape closes an opened card. Registered ahead of the walk's keys and
    // returning early while a card is open, so the two never fight over Escape.
    useEffect(() => {
      if (!openedCardId) return;
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeCard();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [openedCardId, closeCard]);

    // Walking the route (ADR 0027). Right commits the selected edge, Left walks
    // back, Up and Down move the selection among a fork's outgoing edges without
    // moving the camera — the move a deck framework's per-key redirect cannot
    // express, and the reason there is no framework here.
    useEffect(() => {
      if (!presenting || openedCardId) return;
      const onKeyDown = (event: KeyboardEvent) => {
        const handler = {
          ArrowRight: advance,
          ' ': advance,
          ArrowLeft: retreat,
          ArrowUp: () => selectBranch(-1),
          ArrowDown: () => selectBranch(1),
          Escape: exitPresenting,
        }[event.key];
        if (!handler) return;
        event.preventDefault();
        handler();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [presenting, openedCardId, advance, retreat, selectBranch, exitPresenting]);

    const toolbar = (
      <>
        <ViewSelector
          value={selectedView}
          active={selectedRenderer.kind === 'view'}
          onValueChange={(selected) => chooseRenderer({ kind: 'view', view: selected })}
        />
        <LayoutSelector
          layouts={layouts}
          value={selectedRenderer.kind === 'layout' ? selectedRenderer.layoutId : null}
          active={selectedRenderer.kind === 'layout'}
          onValueChange={(layoutId) =>
            chooseRenderer({ kind: 'layout', layoutId: uuidSchema.parse(layoutId) })
          }
        />
        <RouteSelector
          routes={visibleRoutes}
          activeRouteId={activeRouteId}
          onActivate={(routeId) => activateRoute(uuidSchema.parse(routeId))}
          onPresent={present}
          presenting={presenting}
          onExitPresenting={exitPresenting}
        />
        {sessionState.persistence.kind === 'failed' ? (
          <Button
            variant="default"
            data-testid="persistence-retry"
            onClick={authoring.retryPersistence}
            title={sessionState.persistence.failure.message}
          >
            Retry persistence
          </Button>
        ) : sessionState.persistence.kind === 'conflicted' ? (
          <>
            <Button
              variant="default"
              data-testid="persistence-accept-remote"
              // The result of this attempt is the whole message: a success
              // clears whatever the last attempt on this same conflict said.
              onClick={() => {
                const message = authoring.acceptStoredSpace();
                setRefusal(
                  message === null || conflictRevision === null
                    ? null
                    : { revision: conflictRevision, message },
                );
              }}
            >
              Accept remote
            </Button>
            {remoteRefusal === null ? null : (
              <span
                role="alert"
                data-testid="persistence-remote-refused"
                className="persistence-refusal"
              >
                {remoteRefusal}
              </span>
            )}
          </>
        ) : (
          <span
            data-testid="persistence-status"
            data-revision={sessionState.acknowledgedRevision.toString()}
            title="Database persistence status"
          >
            {sessionState.persistence.kind === 'pending'
              ? 'Persisting…'
              : sessionState.persistence.kind === 'rejected'
                ? 'Persistence rejected'
                : 'Persisted'}
          </span>
        )}
      </>
    );

    return (
      <AppShell title={rendererSpace.title} toolbar={toolbar}>
        <div className="graph-area" style={cardSizeVars}>
          {canvas.kind === 'failure' ? (
            <div className="placement-status" role="alert" data-testid="placement-failure">
              <div className="placement-status__panel">
                <h2>Unable to arrange this view</h2>
                {/* The panel bounds this at 40vh and scrolls it, so it needs to
                    take focus or a keyboard-only reader cannot reach the rest
                    of a long failure. Focusable scroll regions need a name. */}
                <pre tabIndex={0} aria-label="Placement failure detail">
                  {canvas.error.message}
                </pre>
              </div>
            </div>
          ) : canvas.kind === 'arrangement' ? (
            <ReactFlowProvider>
              <GraphView
                // Keyed on the opening counter, so accepting the stored Space
                // takes the graph's local editing state with it. The render
                // adapter already drops the projection and drag bookkeeping, but
                // an open title editor is the graph's own: it names a Card from
                // a Space that is gone, and its raised invalid guard would go on
                // swallowing clicks in the one that replaced it.
                key={authoringState.opening}
                nodes={liveProjection?.nodes ?? []}
                edges={liveProjection?.edges ?? []}
                activeCardId={activeCardId}
                presenting={presenting}
                editable={editable}
                titleEditingEnabled={openedCardId === null}
                onNodesChange={changeNodes}
                onConnect={connectCards}
                acceptsConnection={acceptsGraphConnection}
                acceptsNewCardTarget={acceptsNewCardTarget}
                onConnectEnd={finishConnection}
                onCreateConnectedCard={createConnectedCard}
                newCardTitle={nextCardTitle(sessionState.working)}
                onOpenCard={openCardForEditing}
                onCompleteCardTitle={completeCardTitle}
                editableCardIds={editableCardIds}
                routes={visibleRoutes}
                colorByRouteId={colors}
                activeRouteId={activeRouteId}
                activeRouteCardIds={activeRouteCardIds}
              />
            </ReactFlowProvider>
          ) : (
            <div className="placement-status" role="status" data-testid="placement-pending">
              Arranging…
            </div>
          )}

          {presenting && (
            <PresentingChrome
              moves={moves}
              canRetreat={canRetreat}
              onSelect={(index) => selectBranch(index - moves.findIndex((m) => m.selected))}
              onAdvance={advance}
              onExit={exitPresenting}
            />
          )}

          {openedCard && openedContent && (
            <OpenCard
              content={openedContent}
              {...(openedCard.kind === 'markdown' ? { onComplete: completeOpenedCard } : {})}
              onCancel={closeCard}
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
