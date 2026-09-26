import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GRAPH_HEAD_SHAPES } from '@project/core';
import { GRAPH_HEAD_SHAPE_LABELS, GraphHeadMarker, GraphHeadShapeGlyph } from '../src/index';

/** The one element a glyph draws, as markup, so two shapes can be compared. */
const glyphMarkup = (headShape: (typeof GRAPH_HEAD_SHAPES)[number]): string => {
  const { container } = render(
    <svg>
      <GraphHeadShapeGlyph headShape={headShape} color="#1f77b4" />
    </svg>,
  );
  const glyph = container.querySelector('[data-slot="graph-head-shape"]');
  expect(glyph).not.toBeNull();
  return glyph!.outerHTML;
};

describe('GraphHeadShapeGlyph', () => {
  it('draws each of the four head shapes differently', () => {
    const drawn = GRAPH_HEAD_SHAPES.map(glyphMarkup);
    expect(new Set(drawn).size).toBe(GRAPH_HEAD_SHAPES.length);
  });

  it('fills and outlines the head shape in the colour it is given', () => {
    for (const headShape of GRAPH_HEAD_SHAPES) {
      const { container } = render(
        <svg>
          <GraphHeadShapeGlyph headShape={headShape} color="#ff7f0e" />
        </svg>,
      );
      const glyph = container.querySelector('[data-slot="graph-head-shape"]');
      expect(glyph).toHaveAttribute('data-head-shape', headShape);
      expect(glyph).toHaveAttribute('fill', '#ff7f0e');
      expect(glyph).toHaveAttribute('stroke', '#ff7f0e');
    }
  });

  it('names every head shape for a person choosing one', () => {
    expect(GRAPH_HEAD_SHAPE_LABELS).toEqual({
      arrow: 'Arrow',
      vee: 'Vee',
      dot: 'Dot',
      diamond: 'Diamond',
    });
  });
});

describe('GraphHeadMarker', () => {
  it('draws the glyph as an SVG marker whose tip sits on the end of the line it ends', () => {
    const { container } = render(
      <svg>
        <defs>
          <GraphHeadMarker id="head-1" headShape="diamond" color="#2ca02c" />
        </defs>
      </svg>,
    );
    const marker = container.querySelector('marker#head-1');

    expect(marker).not.toBeNull();
    // The tip is the glyph frame's origin, so the reference point there puts it
    // on the path's end, and orienting along the path points it the Edge's way.
    expect(marker).toHaveAttribute('refX', '0');
    expect(marker).toHaveAttribute('refY', '0');
    expect(marker).toHaveAttribute('orient', 'auto-start-reverse');
    expect(marker?.querySelector('[data-head-shape="diamond"]')).toHaveAttribute('fill', '#2ca02c');
  });
});
