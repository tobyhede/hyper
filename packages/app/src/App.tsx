import { useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider, type Node } from '@xyflow/react';
import { AppShell, Button, PathLegend, PathSelector } from '@project/ui';
import {
  getElkLayout,
  projectCardNodes,
  projectPathEdges,
  type ElkLayoutResult,
  type ElkPortData,
} from '@project/react-flow-adapter';
import {
  buildNodeHandles,
  buildPathEdges,
  canGoNext,
  canGoPrev,
  filterHandlesByPath,
  getCardForNode,
  getPath,
  pathNodeIds,
  stepCount,
  type NodeHandleSet,
} from '@project/graph';
import { manifest, markdownByCardId, referenceErrors } from './manifest';
import { pathColorMap } from './colors';
import { selectActiveNodeId, usePresentationStore } from './store';
import { GraphView } from './components/GraphView';
import { PresentationLayer } from './components/PresentationLayer';

// Card nodes are pinned to a uniform size (see styles.css) so ELK can lay them
// out — and place ports — without measuring the DOM.
const CARD_WIDTH = 260;
const CARD_HEIGHT = 300;

// Derived once from the (static) manifest.
const colors = pathColorMap(manifest);
const allHandles = buildNodeHandles(manifest);
const allPathEdges = buildPathEdges(manifest);

export function App() {
  const mode = usePresentationStore((s) => s.mode);
  const selectedPathId = usePresentationStore((s) => s.selectedPathId);
  const stepIndex = usePresentationStore((s) => s.stepIndex);
  const selectPath = usePresentationStore((s) => s.selectPath);
  const enterPresentation = usePresentationStore((s) => s.enterPresentation);
  const exitPresentation = usePresentationStore((s) => s.exitPresentation);
  const next = usePresentationStore((s) => s.next);
  const prev = usePresentationStore((s) => s.prev);

  const activeNodeId = usePresentationStore(selectActiveNodeId);
  const presenting = mode === 'presenting';

  // The graph shows one path at a time — a single linear flow ELK lays out cleanly.
  const visibleNodeIds = useMemo(
    () => (selectedPathId ? pathNodeIds(manifest, selectedPathId) : []),
    [selectedPathId],
  );
  const pathHandles = useMemo<ReadonlyMap<string, NodeHandleSet>>(
    () =>
      selectedPathId
        ? filterHandlesByPath(allHandles, selectedPathId)
        : new Map<string, NodeHandleSet>(),
    [selectedPathId],
  );
  const pathEdges = useMemo(
    () => allPathEdges.filter((edge) => edge.pathId === selectedPathId),
    [selectedPathId],
  );

  const layoutNodes = useMemo<Node<ElkPortData>[]>(
    () =>
      visibleNodeIds.map((id) => {
        const handles = pathHandles.get(id) ?? { sourceHandles: [], targetHandles: [] };
        return {
          id,
          position: { x: 0, y: 0 },
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          data: { sourceHandles: handles.sourceHandles, targetHandles: handles.targetHandles },
        };
      }),
    [visibleNodeIds, pathHandles],
  );

  const layoutEdges = useMemo(
    () =>
      pathEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    [pathEdges],
  );

  // Re-run ELK whenever the selected path (and therefore the visible graph) changes.
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
      projectCardNodes(manifest, markdownByCardId, pathHandles, colors, {
        activeNodeId,
        activePathId: selectedPathId,
        layout: layout ?? undefined,
        nodeHeight: CARD_HEIGHT,
        nodeIds: visibleNodeIds,
      }),
    [activeNodeId, selectedPathId, layout, pathHandles, visibleNodeIds],
  );

  const edges = useMemo(
    () => projectPathEdges(pathEdges, colors, { activePathId: selectedPathId }),
    [pathEdges, selectedPathId],
  );

  const path = selectedPathId ? getPath(manifest, selectedPathId) : undefined;
  const activeCard = activeNodeId ? getCardForNode(manifest, activeNodeId) : undefined;

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
      <PathSelector paths={manifest.paths} selectedPathId={selectedPathId} onSelect={selectPath} />
      <PathLegend paths={manifest.paths} colorByPathId={colors} activePathId={selectedPathId} />
      {presenting ? (
        <Button variant="secondary" onClick={exitPresentation}>
          Overview
        </Button>
      ) : (
        <Button
          variant="default"
          data-testid="present-button"
          onClick={enterPresentation}
          disabled={!selectedPathId}
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
            activeNodeId={activeNodeId}
            layoutReady={layout !== null}
          />
        </ReactFlowProvider>

        {presenting && path && activeCard && (
          <PresentationLayer
            title={activeCard.title}
            markdown={markdownByCardId[activeCard.id] ?? ''}
            stepIndex={stepIndex}
            stepCount={stepCount(path)}
            canPrev={canGoPrev(path, stepIndex)}
            canNext={canGoNext(path, stepIndex)}
            onPrev={prev}
            onNext={next}
            onExit={exitPresentation}
          />
        )}
      </div>
    </AppShell>
  );
}
