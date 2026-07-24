import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AppShell, Button, RouteLegend, RouteSelector } from '@project/ui';
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
  getRoute,
  layoutPositions,
  resolveContentCard,
  type CardHandleSet,
  type LayoutGraph,
} from '@project/graph';
import { space, spaceFile } from './space';
import { CREATED_LAYOUT_ID, CREATED_LAYOUT_TITLE, saveSpaceFile, serializeLayout } from './persist';
import { routeColorMap } from './colors';
import { CARD_HEIGHT, CARD_SIZE, cardSizeVars } from './card';
import { createPresentationStore } from './store';
import { createEditorStore } from './editor';
import { resolveView } from './view';
import { GraphView } from './components/GraphView';
import { OpenCard } from './components/OpenCard';
import { PresentationDeck, type DeckSlide } from './components/PresentationDeck';

// Derived once from the (static) space. The store is bound to it here — the one
// place the app's singleton space meets the store factory (ADR 0010).
const colors = routeColorMap(space);
const { useStore: usePresentationStore, selectActiveCardId } = createPresentationStore(space);

// The markdown a card shows, resolving an alias to its target's body (ADR 0009).
// A card keeps its own title; only content is inherited.
function markdownForCard(cardId: string): string {
  return resolveContentCard(space, cardId)?.body ?? '';
}
const allHandles = buildCardHandles(space);
const allRouteEdges = buildRouteEdges(space);

// Which view this space opens in, and the strategy that arranges it. The fixture
// declares no view, so this resolves to the route-driven ELK graph — exactly
// what the hardcoded `elkStrategy()` here used to do.
const view = resolveView(space);

// Owns React Flow's node array and the Layout being edited. A space that
// declared no Layout gets one from the first resolved layout (ADR 0017), so this
// store is where placement lives from that moment on.
const useEditorStore = createEditorStore();

// Which Layout an edit writes to. An existing one keeps its authored id and
// title; a Layout the app created on open (ADR 0017) takes a minted id, because
// no author was there to type one.
const persistLayoutId = view.layout?.id ?? CREATED_LAYOUT_ID;
const persistLayoutTitle = view.layout?.title ?? CREATED_LAYOUT_TITLE;

export function App() {
  const mode = usePresentationStore((s) => s.mode);
  const selectedRouteId = usePresentationStore((s) => s.selectedRouteId);
  const stepIndex = usePresentationStore((s) => s.stepIndex);
  const selectRoute = usePresentationStore((s) => s.selectRoute);
  const enterPresentation = usePresentationStore((s) => s.enterPresentation);
  const exitPresentation = usePresentationStore((s) => s.exitPresentation);
  const goToStep = usePresentationStore((s) => s.goToStep);
  const openedCardId = usePresentationStore((s) => s.openedCardId);
  const openCard = usePresentationStore((s) => s.openCard);
  const closeCard = usePresentationStore((s) => s.closeCard);

  const activeCardId = usePresentationStore(selectActiveCardId);
  const presenting = mode === 'presenting';

  // Which routes the view shows. Every one, for now — but membership is the
  // view's decision (ADR 0005), so route visibility controls attach here rather
  // than inside the graph or layout packages.
  const visibleRouteIds = useMemo(() => space.routes.map((r) => r.id), []);

  // Every card, not just the route-visited ones. A space may have cards and no
  // routes at all (ADR 0015) — deriving the card set from the routes would render
  // a new space as an empty canvas, which is the one thing it must not do. Which
  // cards a view draws was always the View's call, not the layout's (ADR 0005).
  const visibleCardIds = useMemo(() => space.cards.map((c) => c.id), []);
  const visibleHandles = useMemo<ReadonlyMap<string, CardHandleSet>>(
    () => filterHandlesByRoutes(allHandles, visibleRouteIds),
    [visibleRouteIds],
  );
  const visibleEdges = useMemo(
    () => allRouteEdges.filter((edge) => visibleRouteIds.includes(edge.routeId)),
    [visibleRouteIds],
  );

  const graph = useMemo(
    () => buildLayoutGraph(visibleCardIds, visibleHandles, visibleEdges, CARD_SIZE),
    [visibleCardIds, visibleHandles, visibleEdges],
  );

  // Re-run the layout whenever the visible graph changes. The result is stored
  // alongside the graph it was computed from, so a stale result is derived away
  // during render rather than cleared by a synchronous setState in the effect.
  const [layoutResult, setLayoutResult] = useState<{
    graph: LayoutGraph;
    result: LayoutGraph;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void view.strategy(graph).then((result) => {
      if (!cancelled) setLayoutResult({ graph, result });
    });
    return () => {
      cancelled = true;
    };
  }, [graph]);
  const laidOut = layoutResult?.graph === graph ? layoutResult.result : null;

  // Selecting a route emphasises it; it never hides the rest of the space.
  const emphasis: RouteEmphasis = selectedRouteId ? 'subtle' : 'equal';

  const projectedNodes = useMemo(
    () =>
      projectCardNodes(space, visibleHandles, colors, {
        activeCardId,
        activeRouteId: selectedRouteId,
        emphasis,
        ...(laidOut ? { layoutGraph: laidOut } : {}),
        nodeHeight: CARD_HEIGHT,
        cardIds: visibleCardIds,
      }),
    [activeCardId, selectedRouteId, emphasis, laidOut, visibleHandles, visibleCardIds],
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
  const positions = useEditorStore((s) => s.positions);
  const revision = useEditorStore((s) => s.revision);
  const nodes = liveNodes ?? projectedNodes;
  // Having a Layout *is* the permission to edit (ADR 0013), and the store holds
  // nodes exactly when it has one.
  const editable = liveNodes !== null;

  // Auto-arrange: the one crossing from computed placement to authored placement.
  // Run the automatic strategy and take its result as the Layout — an edit, not a
  // cache, which is why it goes through the store rather than replacing what the
  // view arranges with.
  //
  // The result is also installed as the layout result, so the edges get the
  // routing that belongs to this arrangement back. Both updates land in one
  // batch, so the sync effect that follows reconciles onto positions the store
  // has already taken.
  const autoArrange = useCallback(() => {
    void view.automatic(graph).then((result) => {
      setLayoutResult({ graph, result });
      arrange(layoutPositions(result));
    });
  }, [graph, arrange]);

  // Persist on every real edit. `revision` counts only settled drags and
  // arranges — never the creation sync — so this saves what the author did and
  // stays silent on load. The write is debounced by nothing: a drag ends once,
  // and the saved space file is picked up on the next full page load, not live
  // (ticket 06). The saved file names this Layout as `defaultView`, so a reload
  // reopens in it rather than recomputing.
  useEffect(() => {
    if (revision === 0) return;
    const next = serializeLayout(spaceFile, persistLayoutId, persistLayoutTitle, positions);
    void saveSpaceFile(next);
  }, [revision, positions]);

  const edges = useMemo(
    () =>
      projectRouteEdges(visibleEdges, colors, {
        activeRouteId: selectedRouteId,
        emphasis,
        // A layout's routed edge geometry describes the arrangement it computed,
        // so it stops being true once a card is dragged out of it. From then on
        // the edges fall back to plain curves between wherever the cards now are
        // — which is what a positioned view draws anyway, since it routes
        // nothing.
        ...(laidOut && !moved ? { layoutGraph: laidOut } : {}),
      }),
    [visibleEdges, selectedRouteId, emphasis, laidOut, moved],
  );

  const route = selectedRouteId ? getRoute(space, selectedRouteId) : undefined;
  const openedCard = openedCardId ? getCard(space, openedCardId) : undefined;

  // Presenting is a deck, not an opened card (ADR 0008) — the route's steps in
  // order, each carrying its card's content.
  const deckSlides = useMemo<DeckSlide[]>(() => {
    if (!route) return [];
    return route.steps.map((step) => {
      const card = getCard(space, step.target);
      return {
        id: step.target,
        title: card?.title ?? step.target,
        markdown: markdownForCard(step.target),
      };
    });
  }, [route]);

  // Escape closes an opened card before it exits a presentation, so the two
  // never fight over the key.
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

  const toolbar = (
    <>
      {/* A space with no routes has nothing to select or legend, and cannot be
          presented (ADR 0015) — the Present button stays, disabled, so the
          capability is visible rather than absent. */}
      {space.routes.length > 0 && (
        <>
          <RouteSelector
            routes={space.routes}
            selectedRouteId={selectedRouteId}
            onSelect={selectRoute}
          />
          <RouteLegend
            routes={space.routes}
            colorByRouteId={colors}
            activeRouteId={selectedRouteId}
          />
        </>
      )}
      {/* Disabled until the layout resolves, which is also when there is a
          Layout to arrange (ADR 0017) — the same one-frame window `editable`
          gates dragging on. */}
      <Button
        variant="secondary"
        data-testid="auto-arrange-button"
        onClick={autoArrange}
        disabled={!editable}
      >
        Auto-arrange
      </Button>
      {presenting ? (
        <Button variant="secondary" onClick={exitPresentation}>
          Overview
        </Button>
      ) : (
        <Button
          variant="default"
          data-testid="present-button"
          onClick={enterPresentation}
          disabled={!selectedRouteId}
        >
          Present
        </Button>
      )}
    </>
  );

  if (presenting && route) {
    return (
      <PresentationDeck
        slides={deckSlides}
        stepIndex={stepIndex}
        onStepChange={goToStep}
        onExit={exitPresentation}
      />
    );
  }

  return (
    <AppShell title={space.title} toolbar={toolbar}>
      <div className="graph-area" style={cardSizeVars}>
        <ReactFlowProvider>
          <GraphView
            nodes={nodes}
            edges={edges}
            activeCardId={activeCardId}
            layoutReady={laidOut !== null}
            editable={editable}
            onNodesChange={changeNodes}
            onOpenCard={openCard}
          />
        </ReactFlowProvider>

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
