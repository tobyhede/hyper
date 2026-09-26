import type { GraphHeadShape } from '@project/core';

/**
 * The four head shapes a Graph's Edges end in (ADR 0105), drawn once here for
 * every surface that shows one; the canvas's Edges draw them through
 * `GraphHeadMarker`.
 *
 * Every glyph is drawn in one frame: the tip at the origin, pointing along +x,
 * and the shape lying within `GRAPH_HEAD_SHAPE_FRAME`.
 */

/** The box every glyph lies inside, as an SVG `viewBox`, with the tip at its centre. */
export const GRAPH_HEAD_SHAPE_FRAME = '-10 -10 20 20';

/** What a person choosing a head shape reads for each one. */
export const GRAPH_HEAD_SHAPE_LABELS = {
  arrow: 'Arrow',
  vee: 'Vee',
  dot: 'Dot',
  diamond: 'Diamond',
} as const satisfies Record<GraphHeadShape, string>;

export interface GraphHeadShapeGlyphProps {
  readonly headShape: GraphHeadShape;
  /** The Graph's resolved colour — the caller resolves it through `graphColor`. */
  readonly color: string;
}

/**
 * One head shape as an SVG element, filled and outlined in the Graph's colour.
 * It draws inside an `<svg>` or a `<marker>` whose coordinates are the frame
 * above; it sizes and places nothing itself.
 */
export function GraphHeadShapeGlyph({ headShape, color }: GraphHeadShapeGlyphProps) {
  const paint = {
    'data-slot': 'graph-head-shape',
    'data-head-shape': headShape,
    fill: color,
    stroke: color,
    strokeWidth: 1,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  switch (headShape) {
    case 'arrow':
      return <path {...paint} d="M -5 -4 L 0 0 L -5 4 Z" />;
    case 'vee':
      return <path {...paint} d="M -6.5 -4.5 L 0 0 L -6.5 4.5 L -4 0 Z" />;
    case 'dot':
      return <circle {...paint} cx={-3} cy={0} r={3} />;
    case 'diamond':
      return <path {...paint} d="M 0 0 L -3.75 -3.25 L -7.5 0 L -3.75 3.25 Z" />;
  }
}

export interface GraphHeadMarkerProps extends GraphHeadShapeGlyphProps {
  /** Unique in the document: every path that ends in it names it by `url('#id')`. */
  readonly id: string;
}

/**
 * A head shape as an SVG `<marker>`, for a path's `marker-end`.
 *
 * Its reference point is the tip, so the shape ends exactly where the line
 * does, and it turns with the line's direction there. Sized in stroke widths,
 * so a wider Edge carries a larger head. A
 * marker is drawn as part of the path that references it, so it takes that
 * path's opacity and clip.
 */
export function GraphHeadMarker({ id, headShape, color }: GraphHeadMarkerProps) {
  return (
    <marker
      id={id}
      viewBox={GRAPH_HEAD_SHAPE_FRAME}
      refX={0}
      refY={0}
      markerWidth={12.5}
      markerHeight={12.5}
      markerUnits="strokeWidth"
      orient="auto-start-reverse"
    >
      <GraphHeadShapeGlyph headShape={headShape} color={color} />
    </marker>
  );
}
