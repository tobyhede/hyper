import { useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider, type Node } from '@xyflow/react';
import { AppShell, Button, RouteLegend, RouteSelector } from '@project/ui';
import {
  getElkLayout,
  projectCardNodes,
  projectRouteEdges,
  type ElkLayoutResult,
  type ElkPortData,
} from '@project/react-flow-adapter';
import {
  buildCardHandles,
  buildRouteEdges,
  canGoNext,
  canGoPrev,
  filterHandlesByRoute,
  getCard,
  getRoute,
  routeCardIds,
  stepCount,
  type CardHandleSet,
} from '@project/graph';
import { manifest, markdownByCardId, referenceErrors } from './manifest';
import { routeColorMap } from './colors';
import { selectActiveCardId, usePresentationStore } from './store';
import { GraphView } from './components/GraphView';
import { PresentationLayer } from './components/PresentationLayer';

// Card nodes are pinned to a uniform size (see styles.css) so ELK can lay them
// out — and place ports — without measuring the DOM.
const CARD_WIDTH = 260;
const CARD_HEIGHT = 300;

// Derived once from the (static) manifest.
const colors = routeColorMap(manifest);
const allHandles = buildCardHandles(manifest);
const allRouteEdges = buildRouteEdges(manifest);

export function App() {
  const mode = usePresentationStore((s) => s.mode);
  const selectedRouteId = usePresentationStore((s) => s.selectedRouteId);
  const stepIndex = usePresentationStore((s) => s.stepIndex);
  const selectRoute = usePresentationStore((s) => s.selectRoute);
  const enterPresentation = usePresentationStore((s) => s.enterPresentation);
  const exitPresentation = usePresentationStore((s) => s.exitPresentation);
  const next = usePresentationStore((s) => s.next);
  const prev = usePresentationStore((s) => s.prev);

  const activeCardId = usePresentationStore(selectActiveCardId);
  const presenting = mode === 'presenting';

  // The graph shows one route at a time — a single linear flow ELK lays out cleanly.
  const visibleCardIds = useMemo(
    () => (selectedRouteId ? routeCardIds(manifest, selectedRouteId) : []),
    [selectedRouteId],
  );
  const routeHandles = useMemo<ReadonlyMap<string, CardHandleSet>>(
    () =>
      selectedRouteId
        ? filterHandlesByRoute(allHandles, selectedRouteId)
        : new Map<string, CardHandleSet>(),
    [selectedRouteId],
  );
  const routeEdges = useMemo(
    () => allRouteEdges.filter((edge) => edge.routeId === selectedRouteId),
    [selectedRouteId],
  );

  const layoutNodes = useMemo<Node<ElkPortData>[]>(
    () =>
      visibleCardIds.map((id) => {
        const handles = routeHandles.get(id) ?? { sourceHandles: [], targetHandles: [] };
        return {
          id,
          position: { x: 0, y: 0 },
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          data: { sourceHandles: handles.sourceHandles, targetHandles: handles.targetHandles },
        };
      }),
    [visibleCardIds, routeHandles],
  );

  const layoutEdges = useMemo(
    () =>
      routeEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    [routeEdges],
  );

  // Re-run ELK whenever the selected route (and therefore the visible graph) changes.
  const [layout, setLayout] = useState<ElkLayoutResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    void getElkLayout(layoutNodes, layoutEdges).then((result) => {
      if (!cancelled) setLayout(result);
    });
    return () => {
      cancelled = true;
    };
  }, [layoutNodes, layoutEdges]);

  const nodes = useMemo(
    () =>
      projectCardNodes(manifest, markdownByCardId, routeHandles, colors, {
        activeCardId,
        activeRouteId: selectedRouteId,
        layout: layout ?? undefined,
        nodeHeight: CARD_HEIGHT,
        cardIds: visibleCardIds,
      }),
    [activeCardId, selectedRouteId, layout, routeHandles, visibleCardIds],
  );

  const edges = useMemo(
    () => projectRouteEdges(routeEdges, colors, { activeRouteId: selectedRouteId }),
    [routeEdges, selectedRouteId],
  );

  const route = selectedRouteId ? getRoute(manifest, selectedRouteId) : undefined;
  const activeCard = activeCardId ? getCard(manifest, activeCardId) : undefined;

  // Keyboard navigation while presenting.
  useEffect(() => {
    if (!presenting) return;
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
  }, [presenting, next, prev, exitPresentation]);

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

      <div className="graph-area">
        <ReactFlowProvider>
          <GraphView
            nodes={nodes}
            edges={edges}
            activeCardId={activeCardId}
            layoutReady={layout !== null}
          />
        </ReactFlowProvider>

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
