import { useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AppShell, Button, RouteLegend, RouteSelector } from '@project/ui';
import {
  elkLayout,
  projectCardNodes,
  projectRouteEdges,
  type RouteEmphasis,
} from '@project/react-flow-adapter';
import {
  buildCardHandles,
  buildLayoutGraph,
  buildRouteEdges,
  cardIdsForRoutes,
  filterHandlesByRoutes,
  getCard,
  getRoute,
  resolveContentCard,
  type CardHandleSet,
  type LayoutGraph,
} from '@project/graph';
import { space, markdownByCardId } from './space';
import { routeColorMap } from './colors';
import { CARD_HEIGHT, CARD_SIZE, cardSizeVars } from './card';
import { createPresentationStore } from './store';
import { GraphView } from './components/GraphView';
import { OpenCard } from './components/OpenCard';
import { PresentationDeck, type DeckSlide } from './components/PresentationDeck';

// Derived once from the (static) space. The store is bound to it here — the one
// place the app's singleton space meets the store factory (ADR 0010).
const colors = routeColorMap(space);
const { useStore: usePresentationStore, selectActiveCardId } = createPresentationStore(space);

// The markdown a card shows, resolving an alias to its target's content (ADR
// 0009). A card keeps its own title; only content is inherited.
function markdownForCard(cardId: string): string {
  const contentId = resolveContentCard(space, cardId)?.id ?? cardId;
  return markdownByCardId[contentId] ?? '';
}
const allHandles = buildCardHandles(space);
const allRouteEdges = buildRouteEdges(space);

// The layout in use. A Layout is a named strategy, nothing more — swapping this
// line for `gridLayout()` from `@project/graph` is the whole change, and it drops
// the last ELK import out of this file.
const layout = elkLayout();

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

  const visibleCardIds = useMemo(() => cardIdsForRoutes(space, visibleRouteIds), [visibleRouteIds]);
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

  // Re-run the layout whenever the visible graph changes.
  const [laidOut, setLaidOut] = useState<LayoutGraph | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLaidOut(null);
    void Promise.resolve(layout(graph)).then((result) => {
      if (!cancelled) setLaidOut(result);
    });
    return () => {
      cancelled = true;
    };
  }, [graph]);

  // Selecting a route emphasises it; it never hides the rest of the space.
  const emphasis: RouteEmphasis = selectedRouteId ? 'subtle' : 'equal';

  const nodes = useMemo(
    () =>
      projectCardNodes(space, visibleHandles, colors, {
        activeCardId,
        activeRouteId: selectedRouteId,
        emphasis,
        layoutGraph: laidOut ?? undefined,
        nodeHeight: CARD_HEIGHT,
        cardIds: visibleCardIds,
      }),
    [activeCardId, selectedRouteId, emphasis, laidOut, visibleHandles, visibleCardIds],
  );

  const edges = useMemo(
    () =>
      projectRouteEdges(visibleEdges, colors, {
        activeRouteId: selectedRouteId,
        emphasis,
      }),
    [visibleEdges, selectedRouteId, emphasis],
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
      <RouteSelector
        routes={space.routes}
        selectedRouteId={selectedRouteId}
        onSelect={selectRoute}
      />
      <RouteLegend routes={space.routes} colorByRouteId={colors} activeRouteId={selectedRouteId} />
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
