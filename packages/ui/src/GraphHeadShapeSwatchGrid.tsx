import { GRAPH_HEAD_SHAPES, type GraphHeadShape } from '@project/core';
import { GRAPH_HEAD_SHAPE_LABELS, GraphHeadShapeGlyph } from './GraphHeadShape';
import { SwatchGrid } from './SwatchGrid';
import { cn } from './lib/utils';

/**
 * The part of the glyph frame every head shape occupies, centred: the glyphs
 * lie behind their tip at the origin, so the full frame would draw each one in
 * its left half.
 */
const HEAD_SHAPE_ICON_VIEW_BOX = '-9 -5 10 10';

export interface GraphHeadShapeIconProps {
  readonly headShape: GraphHeadShape;
  /** The Graph's resolved colour. */
  readonly color: string;
  /** A Tailwind `size-*` class; the icon fills the box it is given. */
  readonly className?: string;
}

/** One head shape on its own, centred in a square box — a swatch or a menu glyph. */
export function GraphHeadShapeIcon({ headShape, color, className }: GraphHeadShapeIconProps) {
  return (
    <svg
      aria-hidden
      data-slot="graph-head-shape-icon"
      viewBox={HEAD_SHAPE_ICON_VIEW_BOX}
      className={cn('size-4', className)}
    >
      <GraphHeadShapeGlyph headShape={headShape} color={color} />
    </svg>
  );
}

const ENTRIES = GRAPH_HEAD_SHAPES.map((headShape) => ({
  value: headShape,
  label: GRAPH_HEAD_SHAPE_LABELS[headShape],
}));

export interface GraphHeadShapeSwatchGridProps {
  readonly value: GraphHeadShape;
  /** The Graph's resolved colour, which every swatch is drawn in. */
  readonly color: string;
  readonly onValueChange: (headShape: GraphHeadShape) => void;
  readonly disabled?: boolean;
  readonly 'aria-label'?: string;
}

/**
 * The four head shapes (ADR 0105) as a swatch grid, each drawn in the Graph's
 * colour at the size a colour swatch takes, so Shape… and Colour… open panels
 * of one size. The current head shape carries the grid's selected treatment.
 */
export function GraphHeadShapeSwatchGrid({
  value,
  color,
  onValueChange,
  disabled = false,
  'aria-label': ariaLabel = 'Graph head shape',
}: GraphHeadShapeSwatchGridProps) {
  return (
    <SwatchGrid
      entries={ENTRIES}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      aria-label={ariaLabel}
      renderSwatch={(headShape) => (
        <GraphHeadShapeIcon headShape={headShape} color={color} className="size-[1.35rem]" />
      )}
    />
  );
}
