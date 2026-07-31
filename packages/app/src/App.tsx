import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AppShell, Button, LayoutSelector, RouteSelector, ViewSelector } from '@project/ui';
import { newUuid, uuidSchema, type BuiltInViewId } from '@project/core';
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
  loadSpaceSnapshot,
  routeCardIds,
  resolveContentCard,
  type LayoutPoint,
} from '@project/graph';
import type { OpenedSpace } from './space';
import { createPlacementEditor, nextCardTitle } from './edit-completion';
import { canvasContent, usePlacementRendering } from './placement-rendering';
import { activeRouteColor, ROUTE_PALETTE, routeColorMap } from './colors';
import { CARD_HEIGHT, CARD_SIZE, cardSizeVars } from './card';
import { createSpaceStore } from './store';
import {
  createViewChoice,
  defaultRenderer,
  layoutPositionMap,
  resolveView,
  type RendererSelection,
} from './view';
import { GraphView } from './components/GraphView';
import { OpenCard } from './components/OpenCard';
import { PresentingChrome } from './components/PresentingChrome';

export interface AppActions {
  acceptRemote: () => void;
}

export const createApp = ({ space, spaceSession }: OpenedSpace, { acceptRemote }: AppActions) => {
  // Which view this space opens in, and the strategy that arranges it. The fixture
  // declares no view, so this resolves to the route-driven ELK graph — exactly
  // what the hardcoded `elkStrategy()` here used to do. It also answers which
  // routes are shown and which of them opens active (ADR 0026), so it has to
  // resolve before the store is built.
  const initialRenderer = defaultRenderer(space);
  const initialView = resolveView(space, initialRenderer);

  // Derived once from the opened workspace. The store is bound to the validated
  // runtime aggregate at this composition boundary (ADR 0010).
  const {
    useStore: useSpaceStore,
    updateSpace,
    selectActiveCardId,
    movesFrom,
  } = createSpaceStore(space, initialView.activeRouteId);

  // Live nodes hold whichever arrangement is on screen. A positioned view also
  // supplies its already-authored, possibly sparse Layout map; an automatic view
  // starts null and is promoted only by a completed edit (ADR 0025).
  const initialPositions =
    initialView.layout === null ? null : layoutPositionMap(initialView.layout);
  const viewChoice = createViewChoice(initialRenderer);
  // Reserve the identity whose hidden overview handles must already be declared
  // when a route-less Space's first Edge and Route appear in the same render.
  // Until a successful connection uses it, this is runtime-only identity.
  const firstRouteId = space.routes.length === 0 ? newUuid() : null;
  const useEditorStore = createPlacementEditor({
    initialPositions,
    viewChoice,
    currentActiveRoute: () => useSpaceStore.getState().activeRouteId,
    session: spaceSession,
    installSpace: updateSpace,
    activateRoute: (routeId) => useSpaceStore.getState().activateRoute(routeId),
    ...(firstRouteId === null ? {} : { mintRouteId: () => firstRouteId }),
  });

  function App() {
    const sessionState = useSyncExternalStore(spaceSession.subscribe, spaceSession.getState);
    const selectedRenderer = useSyncExternalStore(viewChoice.subscribe, viewChoice.current);
    const [selectedView, setSelectedView] = useState<BuiltInViewId>(
      initialRenderer.kind === 'view' ? initialRenderer.view : 'graph',
    );
    const rendererSpace = useMemo(() => {
      const loaded = loadSpaceSnapshot(sessionState.working);
      if (!loaded.ok) {
        throw new Error(loaded.errors.map((error) => error.message).join('; '));
      }
      return loaded.space;
    }, [sessionState.working]);
    const layouts = rendererSpace.layouts;
    const routes = rendererSpace.routes;
    const colors = useMemo(() => routeColorMap(rendererSpace), [rendererSpace]);
    const projectionColors = useMemo(
      () =>
        firstRouteId !== null && routes.length === 0
          ? { ...colors, [firstRouteId]: ROUTE_PALETTE[0] }
          : colors,
      [colors, routes],
    );
    const allHandles = useMemo(() => buildCardHandles(rendererSpace), [rendererSpace]);
    const allRouteEdges = useMemo(() => buildRouteEdges(rendererSpace), [rendererSpace]);
    const view = useMemo(
      () => resolveView(rendererSpace, selectedRenderer),
      [rendererSpace, selectedRenderer],
    );

    const activeRouteId = useSpaceStore((s) => s.activeRouteId);
    const activateRoute = useSpaceStore((s) => s.activateRoute);
    const openRenderer = useSpaceStore((s) => s.openRenderer);
    const openedCardId = useSpaceStore((s) => s.openedCardId);
    const openCard = useSpaceStore((s) => s.openCard);
    const closeCard = useSpaceStore((s) => s.closeCard);

    const presenting = useSpaceStore((s) => s.mode === 'presenting');
    const canRetreat = useSpaceStore((s) => s.walk.length > 1);
    const present = useSpaceStore((s) => s.present);
    const exitPresenting = useSpaceStore((s) => s.exitPresenting);
    const advance = useSpaceStore((s) => s.advance);
    const retreat = useSpaceStore((s) => s.retreat);
    const selectBranch = useSpaceStore((s) => s.selectBranch);
    const activeCardId = useSpaceStore(selectActiveCardId);
    const branchIndex = useSpaceStore((s) => s.branchIndex);
    // Derived here rather than in a store selector: the array is rebuilt on every
    // call, so a selector would hand Zustand a new identity each render — a
    // re-render producing a new value producing a re-render, until React gives up.
    // That is still the rule; what is deliberate is that this is a plain render
    // computation and **not** memoized.
    //
    // `movesFrom` reads the aggregate the store holds, and `updateSpace` replaces
    // that by assignment — a mutation no dependency array can name. Authoring an
    // Edge from the Card being presented leaves all three arguments unchanged, so
    // a `useMemo` over them kept listing the moves the Route had before the Edge
    // was drawn. It also bought nothing: `moves` feeds no dependency array and no
    // memoized child, and `PresentingChrome` re-renders with `App` regardless.
    // A render-time call is not the selector case above — nothing subscribes to
    // this identity, so a fresh array cannot feed a re-render — and the work is a
    // filter and a map over one Route's edges, or nothing at all outside a walk.
    const moves = movesFrom(activeRouteId, activeCardId, branchIndex);

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
    const authoredPositions = useEditorStore((s) => s.positions);
    const selectedCardId = useEditorStore((s) => s.selectedCardId);
    const placement = usePlacementRendering(graph, view.strategy, authoredPositions);
    const laidOut = placement.kind === 'ready' ? placement.graph : null;

    // Selecting a route emphasises it; it never hides the rest of the space.
    const emphasis: RouteEmphasis = activeRouteId ? 'subtle' : 'equal';

    const projectedNodes = useMemo(
      () =>
        projectCardNodes(rendererSpace, visibleHandles, projectionColors, {
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
        projectionColors,
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

    // Hand the projection to the store, which folds it into the live array so a
    // card keeps its position, measured size and drag state across a re-render.
    // Only once the layout has resolved: before that every card sits at the origin
    // and there is nothing worth preserving.
    const syncNodes = useEditorStore((s) => s.syncNodes);
    useEffect(() => {
      if (laidOut) syncNodes(projectedNodes);
    }, [laidOut, projectedNodes, syncNodes]);

    const liveNodes = useEditorStore((s) => s.nodes);
    const moved = useEditorStore((s) => s.moved);
    const changeNodes = useEditorStore((s) => s.changeNodes);
    const nodes = liveNodes ?? projectedNodes;
    const canvas = canvasContent(placement, liveNodes !== null);
    // There is an arrangement to drag once the layout has resolved and the store
    // has taken it. Not a permission — every view is editable (ADR 0025) — and not
    // a state the space can go back to: nothing sets `nodes` back to null, so this
    // is false for one frame and true from then on.
    const editable = liveNodes !== null;
    const completedConnectionTarget = useRef<string | null>(null);

    const chooseRenderer = useCallback(
      (selection: RendererSelection) => {
        const resolved = resolveView(rendererSpace, selection);
        useEditorStore
          .getState()
          .selectRenderer(resolved.layout === null ? null : layoutPositionMap(resolved.layout));
        openRenderer(resolved.activeRouteId);
        viewChoice.select(selection);
        if (selection.kind === 'view') setSelectedView(selection.view);
      },
      [openRenderer, rendererSpace],
    );

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

    const edges = useMemo(
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
    const activeRouteCardIds = useMemo(
      () => new Set(activeRouteId === null ? [] : routeCardIds(rendererSpace, activeRouteId)),
      [rendererSpace, activeRouteId],
    );

    const connectCards = useCallback(
      (connection: { source: string; target: string }) => {
        // Issue 04 owns Route minting. An existing Route can be edited from every
        // resolved renderer; an Algorithmic View converts using exactly the live
        // Card positions the author connected between (ADR 0025).
        const completed = useEditorStore
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
        useEditorStore.getState().selectCard(uuidSchema.parse(target));
      });
    }, []);

    const createConnectedCard = useCallback((sourceId: string, position: LayoutPoint) => {
      const cardId = newUuid();
      const completed = useEditorStore
        .getState()
        .createConnectedCard(uuidSchema.parse(sourceId), cardId, position);
      if (completed) completedConnectionTarget.current = cardId;
    }, []);

    const openedCard = openedCardId ? getCard(rendererSpace, openedCardId) : undefined;

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
            onClick={spaceSession.retry}
            title={sessionState.persistence.failure.message}
          >
            Retry persistence
          </Button>
        ) : sessionState.persistence.kind === 'conflicted' ? (
          <Button variant="default" data-testid="persistence-accept-remote" onClick={acceptRemote}>
            Accept remote
          </Button>
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
      <AppShell title={space.title} toolbar={toolbar}>
        <div className="graph-area" style={cardSizeVars}>
          {canvas.kind === 'failure' ? (
            <div className="placement-status" role="alert" data-testid="placement-failure">
              <div className="placement-status__panel">
                <h2>Unable to arrange this view</h2>
                <pre>{canvas.error.message}</pre>
              </div>
            </div>
          ) : canvas.kind === 'arrangement' ? (
            <ReactFlowProvider>
              <GraphView
                nodes={nodes}
                edges={edges}
                activeCardId={activeCardId}
                presenting={presenting}
                editable={editable}
                onNodesChange={changeNodes}
                onConnect={connectCards}
                onConnectEnd={finishConnection}
                onCreateConnectedCard={createConnectedCard}
                newCardTitle={nextCardTitle(sessionState.working)}
                onOpenCard={(cardId) => openCard(uuidSchema.parse(cardId))}
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

          {openedCard && (
            <OpenCard
              title={openedCard.title}
              markdown={resolveContentCard(rendererSpace, openedCard.id)?.body ?? ''}
              footer={
                <Button variant="secondary" data-testid="close-card" onClick={closeCard}>
                  Close
                </Button>
              }
            />
          )}
        </div>
      </AppShell>
    );
  }

  return App;
};
