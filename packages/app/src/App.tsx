import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AppShell, Button, RouteLegend, RouteSelector } from '@project/ui';
import { uuidSchema, type CardId } from '@project/core';
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
  layoutPositions,
  positionedStrategy,
  resolveContentCard,
  type LayoutGraph,
  type LayoutPoint,
  type LayoutStrategy,
} from '@project/graph';
import type { OpenedSpace } from './space';
import { preparePlacementSubmission } from './completed-edit';
import { routeColorMap } from './colors';
import { CARD_HEIGHT, CARD_SIZE, cardSizeVars } from './card';
import { createSpaceStore } from './store';
import { createEditorStore } from './editor';
import { layoutPositionMap, resolveView } from './view';
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
  const view = resolveView(space);

  // The routes this view draws. A Layout's filter is authored view scope, so the
  // legend and the route control list these and not every route in the space —
  // activating only ever moves emphasis within what is visible.
  const visibleRoutes = space.routes.filter((route) => view.visibleRouteIds.includes(route.id));

  // Derived once from the opened workspace. The store is bound to the validated
  // runtime aggregate at this composition boundary (ADR 0010).
  const colors = routeColorMap(space);
  const {
    useStore: useSpaceStore,
    selectActiveCardId,
    movesFrom,
  } = createSpaceStore(space, view.activeRouteId);

  // The markdown a card shows, resolving an alias to its target's body (ADR 0009).
  // A card keeps its own title; only content is inherited.
  function markdownForCard(cardId: CardId): string {
    return resolveContentCard(space, cardId)?.body ?? '';
  }
  const allHandles = buildCardHandles(space);
  const allRouteEdges = buildRouteEdges(space);

  // Live nodes hold whichever arrangement is on screen. A positioned view also
  // supplies its already-authored, possibly sparse Layout map; an automatic view
  // starts null and is promoted only by a completed edit (ADR 0025).
  const initialPositions = view.layout === null ? null : layoutPositionMap(view.layout);
  const useEditorStore = createEditorStore(initialPositions);

  // Which Layout an edit writes to. An existing one keeps its authored id and
  // title; converting an automatic arrangement mints both because no author was
  // there to type them (ADR 0025).
  const persistLayoutId = view.layout?.id ?? uuidSchema.parse(crypto.randomUUID());
  const persistLayoutTitle = view.layout?.title ?? 'Layout';

  function App() {
    const activeRouteId = useSpaceStore((s) => s.activeRouteId);
    const activateRoute = useSpaceStore((s) => s.activateRoute);
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
    const moves = useMemo(
      () => movesFrom(activeRouteId, activeCardId, branchIndex),
      [activeRouteId, activeCardId, branchIndex],
    );

    // Which routes the view shows, resolved from the Layout that filtered them
    // (ADR 0026). Membership is the view's decision (ADR 0005), which is why it
    // arrives from `resolveView` rather than being decided in the graph or layout
    // packages.
    const visibleRouteIds = view.visibleRouteIds;
    const visibleRouteIdSet = useMemo(() => new Set(visibleRouteIds), [visibleRouteIds]);

    // Every card, not just the route-visited ones. A space may have cards and no
    // routes at all (ADR 0015) — deriving the card set from the routes would render
    // a new space as an empty canvas, which is the one thing it must not do. Which
    // cards a view draws was always the View's call, not the layout's (ADR 0005).
    const visibleCardIds = useMemo(() => space.cards.map((c) => c.id), []);
    const visibleHandles = useMemo(
      () => filterHandlesByRoutes(allHandles, visibleRouteIds),
      [visibleRouteIds],
    );
    const visibleEdges = useMemo(
      () => allRouteEdges.filter((edge) => visibleRouteIdSet.has(edge.routeId)),
      [visibleRouteIdSet],
    );

    const graph = useMemo(
      () => buildLayoutGraph(visibleCardIds, visibleHandles, visibleEdges, CARD_SIZE),
      [visibleCardIds, visibleHandles, visibleEdges],
    );
    const authoredPositions = useEditorStore((s) => s.positions);
    const renderingStrategy = useMemo(
      () => strategyForRendering(view.strategy, authoredPositions),
      [authoredPositions],
    );

    const { laidOut, adopt: adoptLayoutResult } = useLayoutRendering(graph, renderingStrategy);

    // Selecting a route emphasises it; it never hides the rest of the space.
    const emphasis: RouteEmphasis = activeRouteId ? 'subtle' : 'equal';

    const projectedNodes = useMemo(
      () =>
        projectCardNodes(space, visibleHandles, colors, {
          activeCardId,
          showActiveCardContent: presenting,
          activeRouteId,
          emphasis,
          ...(laidOut ? { layoutGraph: laidOut } : {}),
          nodeHeight: CARD_HEIGHT,
          cardIds: visibleCardIds,
        }),
      [activeCardId, presenting, activeRouteId, emphasis, laidOut, visibleHandles, visibleCardIds],
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
    const arrange = useEditorStore((s) => s.arrange);
    const revision = useEditorStore((s) => s.revision);
    const sessionState = useSyncExternalStore(spaceSession.subscribe, spaceSession.getState);
    const nodes = liveNodes ?? projectedNodes;
    // There is an arrangement to drag once the layout has resolved and the store
    // has taken it. Not a permission — every view is editable (ADR 0025) — and not
    // a state the space can go back to: nothing sets `nodes` back to null, so this
    // is false for one frame and true from then on.
    const editable = liveNodes !== null;
    const submittedRevision = useRef(0);

    // Auto-arrange: the one crossing from computed placement to authored placement.
    // Run the automatic strategy and take its result as the Layout — an edit, not a
    // cache, which is why it goes through the store rather than replacing what the
    // view arranges with.
    //
    // Keep this result's routed geometry while this exact graph remains visible.
    // Taking its positions authors the Layout, so any later graph identity renders
    // through the positioned strategy instead of re-running the former View.
    const autoArrange = useCallback(() => {
      void view.automatic(graph).then((result) => {
        adoptLayoutResult(result);
        arrange(layoutPositions(result));
      });
    }, [graph, arrange, adoptLayoutResult]);

    // A completed edit prepares one complete snapshot. Preparation narrows nullable
    // authored placement before the local watermark advances; an invariant failure
    // therefore cannot mark an unsubmitted revision as submitted. Route activation
    // does not increment the editor revision and remains outside persistence.
    useEffect(() => {
      const prepared = preparePlacementSubmission(
        spaceSession.getState().working,
        submittedRevision.current,
        { revision, positions: useEditorStore.getState().positions },
        {
          layoutId: persistLayoutId,
          layoutTitle: persistLayoutTitle,
          activeRouteId: useSpaceStore.getState().activeRouteId,
        },
      );
      if (prepared === null) return;
      submittedRevision.current = prepared.revision;
      spaceSession.submit(prepared.snapshot);
    }, [revision]);

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
      [visibleEdges, activeRouteId, emphasis, laidOut, moved],
    );

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
        {/* A space with no routes has nothing to activate or legend (ADR 0015),
          and neither has a view that shows none. Both list the *visible* routes:
          activating moves emphasis within that set and never widens it. */}
        {visibleRoutes.length > 0 && (
          <>
            <RouteSelector
              routes={visibleRoutes}
              activeRouteId={activeRouteId}
              onActivate={(routeId) => activateRoute(uuidSchema.parse(routeId))}
            />
            <RouteLegend
              routes={visibleRoutes}
              colorByRouteId={colors}
              activeRouteId={activeRouteId}
            />
          </>
        )}
        {/* Disabled until the live arrangement resolves. That is when runtime nodes
          are available to drag or replace; an automatic view still has no authored
          placement until either action completes (ADR 0025). */}
        <Button
          variant="secondary"
          data-testid="auto-arrange-button"
          onClick={autoArrange}
          disabled={!editable}
        >
          Auto-arrange
        </Button>
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
        {/* Presenting is this same canvas drawn closer in (ADR 0027), so this
          changes the camera rather than the surface. A space with no routes has
          nothing to walk (ADR 0015) — the button stays, disabled, so the
          capability is visible rather than absent. */}
        {presenting ? (
          <Button variant="secondary" data-testid="exit-presenting-button" onClick={exitPresenting}>
            Overview
          </Button>
        ) : (
          <Button
            variant="default"
            data-testid="present-button"
            onClick={present}
            disabled={!activeRouteId}
          >
            Present
          </Button>
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
              onOpenCard={(cardId) => openCard(uuidSchema.parse(cardId))}
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
