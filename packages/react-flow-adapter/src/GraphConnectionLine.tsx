import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';

const MARKER_ID = 'graph-authoring-connection-arrow';

/** The transient directed Edge preview used while authoring a Graph. */
export function GraphConnectionLine({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
  connectionLineStyle,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });
  const color = connectionLineStyle?.stroke ?? '#8a94a6';

  return (
    <g>
      <defs>
        <marker
          id={MARKER_ID}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
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
