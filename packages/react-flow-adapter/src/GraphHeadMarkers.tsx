import { useMemo } from 'react';
import { useStore, type Edge, type EdgeMarkerType } from '@xyflow/react';
import { graphHeadShapeSchema, type GraphHeadShape, type GraphId } from '@project/core';
import { FALLBACK_GRAPH_COLOR, GraphHeadMarker } from '@project/ui';

/**
 * The id of the marker a Graph's Edges end in, which each Edge names as its
 * `markerEnd` (ADR 0105).
 *
 * One per Graph, because every Edge of a Graph ends in the same head shape in
 * the same colour. `flowId` is the React Flow `id` of the canvas the Edges are
 * drawn in, and prefixes the id the way React Flow prefixes its own markers, so
 * two canvases on one page never resolve each other's.
 */
export const graphHeadMarkerId = (graphId: GraphId, flowId?: string): string =>
  `${flowId === undefined ? '' : `${flowId}__`}graph-head-${graphId}`;

/** A marker named by id — the form a head marker takes — rather than one of React Flow's own. */
const isMarkerId = (marker: EdgeMarkerType | undefined): marker is string =>
  typeof marker === 'string';

interface DrawnHead {
  readonly id: string;
  readonly headShape: GraphHeadShape;
  readonly color: string;
}

/**
 * Each distinct head marker the canvas's Edges name, once, in the order first
 * named: React Flow's own `createMarkerIds` does the same for its built-in
 * markers. An Edge naming no marker, or carrying no head shape, adds none.
 */
function drawnHeads(edges: readonly Edge[]): DrawnHead[] {
  const heads = new Map<string, DrawnHead>();
  for (const edge of edges) {
    const { markerEnd } = edge;
    const headShape = graphHeadShapeSchema.safeParse(edge.data?.['headShape']);
    if (!isMarkerId(markerEnd) || !headShape.success || heads.has(markerEnd)) continue;
    heads.set(markerEnd, {
      id: markerEnd,
      headShape: headShape.data,
      color: edge.style?.stroke ?? FALLBACK_GRAPH_COLOR,
    });
  }
  return [...heads.values()];
}

/**
 * The head markers of every Edge on this canvas, each drawn once in one hidden
 * `<defs>`, as React Flow draws its own markers, rather than once per Edge.
 *
 * Mounted as a child of `<ReactFlow>`, it reads the Edges from that flow's
 * store, so Edges added to the canvas beside the projection's (an embedded
 * Map's) are covered too. A marker is painted as part of the path that names
 * it, so each Edge's head takes that Edge's opacity wherever the marker lives —
 * held by `a receding Graph's head is painted at its Edge's opacity` in
 * `packages/app/e2e/edge-attachment.spec.ts`.
 */
export function GraphHeadMarkers() {
  const edges = useStore((state) => state.edges);
  const heads = useMemo(() => drawnHeads(edges), [edges]);
  if (heads.length === 0) return null;
  return (
    <svg data-slot="graph-head-markers" aria-hidden="true" width={0} height={0}>
      <defs>
        {heads.map((head) => (
          <GraphHeadMarker key={head.id} {...head} />
        ))}
      </defs>
    </svg>
  );
}
