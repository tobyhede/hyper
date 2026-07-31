import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AppShell, Button, LayoutSelector, RouteSelector, ViewSelector } from '@project/ui';
import { uuidSchema, type BuiltInViewId, type CardId } from '@project/core';
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
  positionedStrategy,
  routeCardIds,
  resolveContentCard,
  type LayoutGraph,
  type LayoutPoint,
  type LayoutStrategy,
} from '@project/graph';
import type { OpenedSpace } from './space';
import { completePositionedConnection, createPlacementEditor } from './edit-completion';
import { routeColorMap } from './colors';
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

export function strategyForRendering(
  automaticStrategy: LayoutStrategy,
  authoredPositions: ReadonlyMap<string, LayoutPoint> | null,
): LayoutStrategy {
  if (authoredPositions === null) return automaticStrategy;
  const positions = new Map<CardId, LayoutPoint>();
  for (const [cardId, point] of authoredPositions) {
    positions.set(uuidSchema.parse(cardId), point);
  }
  return positionedStrategy(positions);
}

export function useLayoutRendering(
  graph: LayoutGraph,
  renderingStrategy: LayoutStrategy,
): { laidOut: LayoutGraph | null; adopt: (result: LayoutGraph) => void } {
  const [layoutResult, setLayoutResult] = useState<
    | {
        graph: LayoutGraph;
        source: 'computed';
        strategy: LayoutStrategy;
        result: LayoutGraph;
      }
    | {
        graph: LayoutGraph;
        source: 'adopted';
        result: LayoutGraph;
      }
    | null
  >(null);
  const adopted = useRef<{ graph: LayoutGraph; result: LayoutGraph } | null>(null);

  useEffect(() => {
    if (adopted.current?.graph === graph) return;
    adopted.current = null;
    let cancelled = false;
    void renderingStrategy(graph).then((result) => {
      if (!cancelled) {
        setLayoutResult({ graph, source: 'computed', strategy: renderingStrategy, result });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [graph, renderingStrategy]);

  const adopt = useCallback(
    (result: LayoutGraph) => {
      adopted.current = { graph, result };
      setLayoutResult({ graph, source: 'adopted', result });
    },
    [graph],
  );

  const matchesCurrentRendering =
    layoutResult?.source === 'adopted' || layoutResult?.strategy === renderingStrategy;
  return {
    laidOut: layoutResult?.graph === graph && matchesCurrentRendering ? layoutResult.result : null,
    adopt,
  };
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

  // The markdown a card shows, resolving an alias to its target's body (ADR 0009).
  // A card keeps its own title; only content is inherited.
  function markdownForCard(cardId: CardId): string {
    return resolveContentCard(space, cardId)?.body ?? '';
  }
  // Live nodes hold whichever arrangement is on screen. A positioned view also
  // supplies its already-authored, possibly sparse Layout map; an automatic view
  // starts null and is promoted only by a completed edit (ADR 0025).
  const initialPositions =
    initialView.layout === null ? null : layoutPositionMap(initialView.layout);
  const viewChoice = createViewChoice(initialRenderer);
  const useEditorStore = createPlacementEditor({
    initialPositions,
    viewChoice,
    currentActiveRoute: () => useSpaceStore.getState().activeRouteId,
    session: spaceSession,
  });

  function App() {
    const sessionState = useSyncExternalStore(spaceSession.subscribe, spaceSession.getState);
    const selectedRenderer = useSyncExternalStore(viewChoice.subscribe, viewChoice.current);
    const [selectedView, setSelectedView] = useState<BuiltInViewId>(
      initialRenderer.kind === 'view' ? initialRenderer.view : 'graph',
    );
    const layouts = useMemo(
      () => sessionState.working.document.layouts ?? [],
      [sessionState.working.document.layouts],
    );
    // Routes come from the same place Layouts do. Authoring an Edge submits the
    // whole next snapshot synchronously, so the session's working document is
    // already the authored truth by the time this renders — there is no second
    // copy to keep in step.
    const routes = useMemo(
      () => sessionState.working.document.routes,
      [sessionState.working.document.routes],
    );
    const rendererSpace = useMemo(
      () => ({
        ...space,
        routes,
        routesById: new Map(routes.map((route) => [route.id, route])),
        layouts,
        layoutsById: new Map(layouts.map((layout) => [layout.id, layout])),
      }),
      [routes, layouts],
    );
    const colors = useMemo(() => routeColorMap(rendererSpace), [rendererSpace]);
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
    const visibleCardIds = useMemo(() => space.cards.map((c) => c.id), []);
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
    const renderingStrategy = useMemo(
      () => strategyForRendering(view.strategy, authoredPositions),
      [view.strategy, authoredPositions],
    );

    const { laidOut } = useLayoutRendering(graph, renderingStrategy);

    // Selecting a route emphasises it; it never hides the rest of the space.
    const emphasis: RouteEmphasis = activeRouteId ? 'subtle' : 'equal';

    const projectedNodes = useMemo(
      () =>
        projectCardNodes(rendererSpace, visibleHandles, colors, {
          activeCardId,
          selectedCardId,
          showActiveCardContent: presenting,
          activeRouteId,
          ...(activeRouteId !== null && colors[activeRouteId] !== undefined
            ? { activeRouteColor: colors[activeRouteId] }
            : {}),
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
        // Issues 03 and 04 own Algorithmic View conversion and Route minting.
        // This increment completes only an existing Route in a selected Layout.
        if (selectedRenderer.kind !== 'layout' || activeRouteId === null) return;
        const completed = completePositionedConnection(spaceSession.getState().working, {
          layoutId: selectedRenderer.layoutId,
          routeId: activeRouteId,
          from: uuidSchema.parse(connection.source),
          to: uuidSchema.parse(connection.target),
        });
        if (completed === null) return;
        const accepted = loadSpaceSnapshot(completed);
        if (!accepted.ok) {
          throw new Error('A completed connection must produce a valid Space.');
        }
        completedConnectionTarget.current = connection.target;
        // `submit` installs the complete local working snapshot synchronously;
        // persistence acknowledgement remains asynchronous (ADR 0030). Routes and
        // Layouts are derived from that snapshot, so the render that follows is
        // already the authored truth — only the traversal aggregate, which is a
        // closure rather than React state, has to be told.
        spaceSession.submit(completed);
        updateSpace(accepted.space);
      },
      [activeRouteId, selectedRenderer],
    );

    const finishConnection = useCallback(() => {
      const target = completedConnectionTarget.current;
      completedConnectionTarget.current = null;
      if (target === null) return;
      requestAnimationFrame(() => {
        useEditorStore.getState().selectCard(uuidSchema.parse(target));
      });
    }, []);

    const openedCard = openedCardId ? getCard(space, openedCardId) : undefined;

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
          <ReactFlowProvider>
            <GraphView
              nodes={nodes}
              edges={edges}
              layoutReady={laidOut !== null}
              activeCardId={activeCardId}
              presenting={presenting}
              editable={editable}
              onNodesChange={changeNodes}
              onConnect={connectCards}
              onConnectEnd={finishConnection}
              onOpenCard={(cardId) => openCard(uuidSchema.parse(cardId))}
              routes={visibleRoutes}
              colorByRouteId={colors}
              activeRouteId={activeRouteId}
              activeRouteCardIds={activeRouteCardIds}
            />
          </ReactFlowProvider>

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
              markdown={markdownForCard(openedCard.id)}
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
