import { createContext, useContext, type ReactNode } from 'react';
import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';
import { DEFAULT_GRAPH_HEAD_SHAPE, type GraphHeadShape } from '@project/core';
import { FALLBACK_GRAPH_COLOR, GraphHeadMarker } from '@project/ui';

/** One connection is drawn at a time, so its marker needs no per-instance id. */
const MARKER_ID = 'graph-authoring-connection-head';

/** The part of React Flow's connection-line props the preview reads. */
export type GraphConnectionLineProps = Pick<
  ConnectionLineComponentProps,
  'fromX' | 'fromY' | 'fromPosition' | 'toX' | 'toY' | 'toPosition' | 'connectionLineStyle'
>;

/**
 * The head shape the preview ends in. React Flow hands a connection line only
 * its geometry and `connectionLineStyle`, so the Active Graph's head shape
 * reaches it through context rather than a prop; the colour rides on the
 * style's stroke, as it always has.
 */
const ConnectionHeadShape = createContext<GraphHeadShape>(DEFAULT_GRAPH_HEAD_SHAPE);

/**
 * Supplies the head shape of the Graph a drawn connection will join — the
 * Active Graph's, resolved through `graphHeadShape` — to the preview beneath.
 */
export function GraphConnectionLineHeadShape({
  headShape,
  children,
}: {
  readonly headShape: GraphHeadShape;
  readonly children: ReactNode;
}) {
  return <ConnectionHeadShape.Provider value={headShape}>{children}</ConnectionHeadShape.Provider>;
}

/**
 * The transient directed Edge preview used while authoring a Graph. It ends in
 * the head shape the Edge will be drawn with once it joins the Graph (ADR
 * 0105), through the same marker the canvas's Edges draw.
 */
export function GraphConnectionLine({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
  connectionLineStyle,
}: GraphConnectionLineProps) {
  const headShape = useContext(ConnectionHeadShape);
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });
  const color = connectionLineStyle?.stroke ?? FALLBACK_GRAPH_COLOR;

  return (
    <g>
      <defs>
        <GraphHeadMarker id={MARKER_ID} headShape={headShape} color={color} />
      </defs>
      <path
        d={path}
        fill="none"
        className="react-flow__connection-path"
        style={connectionLineStyle}
        markerEnd={`url(#${MARKER_ID})`}
      />
    </g>
  );
}
