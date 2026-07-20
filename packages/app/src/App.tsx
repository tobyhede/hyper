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
  canGoNext,
  canGoPrev,
  cardIdsForRoutes,
  filterHandlesByRoutes,
  getCard,
  getRoute,
  stepCount,
  type CardHandleSet,
  type LayoutGraph,
} from '@project/graph';
import { manifest, markdownByCardId, referenceErrors } from './manifest';
import { routeColorMap } from './colors';
import { CARD_HEIGHT, CARD_SIZE, cardSizeVars } from './card';
import { selectActiveCardId, usePresentationStore } from './store';
import { GraphView } from './components/GraphView';
import { PresentationLayer } from './components/PresentationLayer';
import { OpenCard } from './components/OpenCard';

// Derived once from the (static) manifest.
const colors = routeColorMap(manifest);
const allHandles = buildCardHandles(manifest);
const allRouteEdges = buildRouteEdges(manifest);

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
  const next = usePresentationStore((s) => s.next);
  const prev = usePresentationStore((s) => s.prev);
  const openedCardId = usePresentationStore((s) => s.openedCardId);
  const openCard = usePresentationStore((s) => s.openCard);
  const closeCard = usePresentationStore((s) => s.closeCard);

  const activeCardId = usePresentationStore(selectActiveCardId);
  const presenting = mode === 'presenting';

  // Which routes the view shows. Every one, for now — but membership is the
  // view's decision (ADR 0005), so route visibility controls attach here rather
  // than inside the graph or layout packages.
  const visibleRouteIds = useMemo(() => manifest.routes.map((r) => r.id), []);

  const visibleCardIds = useMemo(
    () => cardIdsForRoutes(manifest, visibleRouteIds),
    [visibleRouteIds],
  );
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
  // Presenting pushes the others further back so the walked route stands alone.
  const emphasis: RouteEmphasis = presenting ? 'strong' : selectedRouteId ? 'subtle' : 'equal';

  const nodes = useMemo(
    () =>
      projectCardNodes(manifest, visibleHandles, colors, {
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

  const route = selectedRouteId ? getRoute(manifest, selectedRouteId) : undefined;
  const activeCard = activeCardId ? getCard(manifest, activeCardId) : undefined;
  const openedCard = openedCardId ? getCard(manifest, openedCardId) : undefined;

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

  // Keyboard navigation while presenting.
  useEffect(() => {
    if (!presenting || openedCardId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        prev();
      } else if (event.key === 'Escape') {
        exitPresentation();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [presenting, openedCardId, next, prev, exitPresentation]);

  const toolbar = (
    <>
      <RouteSelector
        routes={manifest.routes}
        selectedRouteId={selectedRouteId}
        onSelect={selectRoute}
      />
      <RouteLegend
        routes={manifest.routes}
        colorByRouteId={colors}
        activeRouteId={selectedRouteId}
      />
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

  return (
    <AppShell title={manifest.title} toolbar={toolbar}>
      {referenceErrors.length > 0 && (
        <div className="errors" role="alert">
          <strong>{referenceErrors.length} unresolved reference(s):</strong>
          <ul>
            {referenceErrors.map((err) => (
              <li key={`${err.kind}:${err.ref}`}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}

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
            markdown={markdownByCardId[openedCard.id] ?? ''}
            onClose={closeCard}
          />
        )}

        {presenting && route && activeCard && (
          <PresentationLayer
            title={activeCard.title}
            markdown={markdownByCardId[activeCard.id] ?? ''}
            stepIndex={stepIndex}
            stepCount={stepCount(route)}
            canPrev={canGoPrev(route, stepIndex)}
            canNext={canGoNext(route, stepIndex)}
            onPrev={prev}
            onNext={next}
            onExit={exitPresentation}
          />
        )}
      </div>
    </AppShell>
  );
}
