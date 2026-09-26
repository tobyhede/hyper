import type { GraphHeadShape } from '@project/core';
import { GraphHeadShapeGlyph } from './GraphHeadShape';

export interface GraphLegendMarkProps {
  /** The Graph's resolved colour — the caller resolves it through `graphColor`. */
  readonly color: string;
  /** The Graph's resolved head shape — the caller resolves it through `graphHeadShape`. */
  readonly headShape: GraphHeadShape;
}

/**
 * The glyph's frame, scaled by 14/18 into the box below, so the mark keeps the
 * 14px width the HUD's identity glyphs are laid out in and the titles beside
 * both align.
 */
const MARK_VIEW_BOX = '-17 -6.5 18 13';
const LINE_START = -17;
/**
 * Where the line stops, inside every head shape: past it the shapes narrow to
 * the tip, and a line carried there would show its corners beside the point.
 */
const LINE_END = -4;
const LINE_WIDTH = 2.5;

/**
 * A miniature Edge beside a Graph's title: a short line in the Graph's colour
 * ending in its head shape (ADR 0105), pointing right.
 *
 * **One mark for every list that names every Graph on a Map** — the canvas
 * HUD's Graph key and the rows of each list offering a choice of Graph (the
 * Command Dock's and an Open Space Resource's). Those lists are where a viewer
 * matches a receding Edge to its Graph, so the mark carries both channels an
 * Edge is told apart by: colour, and the head shape where colour cannot be
 * seen. The surfaces that name what *kind* of entity a colour belongs to — the
 * Dock's Graph identity, the Colour… command — keep the coloured `GraphIcon`.
 *
 * The head is `GraphHeadShapeGlyph`, the glyph the canvas's own markers draw,
 * and the line runs into it as an Edge's path runs into its marker. It takes
 * a resolved colour and head shape rather than a Graph, so the rule for each
 * stays in `graphColor` and `graphHeadShape` and every caller reaches it
 * there. Decorative: the title beside it names the Graph.
 */
export function GraphLegendMark({ color, headShape }: GraphLegendMarkProps) {
  // The box is the span's rather than the svg's: a menu row sizes every svg
  // without a `size-` class to 16px, and `size-full` is that class here.
  return (
    <span
      data-slot="graph-legend-mark"
      data-head-shape={headShape}
      aria-hidden="true"
      className="inline-flex h-[10px] w-[14px] shrink-0"
    >
      <svg className="size-full" viewBox={MARK_VIEW_BOX}>
        <line
          data-slot="graph-legend-mark-line"
          x1={LINE_START}
          y1={0}
          x2={LINE_END}
          y2={0}
          stroke={color}
          strokeWidth={LINE_WIDTH}
        />
        <GraphHeadShapeGlyph headShape={headShape} color={color} />
      </svg>
    </span>
  );
}
