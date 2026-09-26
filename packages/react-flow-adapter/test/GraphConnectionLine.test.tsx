import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { GRAPH_HEAD_SHAPES, type GraphHeadShape } from '@project/core';
import {
  GraphConnectionLine,
  GraphConnectionLineHeadShape,
  type GraphConnectionLineProps,
} from '../src/GraphConnectionLine';

/** The part of React Flow's connection-line props the preview reads. */
const previewProps = (stroke: string): GraphConnectionLineProps => ({
  fromX: 0,
  fromY: 0,
  fromPosition: Position.Right,
  toX: 120,
  toY: 40,
  toPosition: Position.Left,
  connectionLineStyle: { stroke, strokeWidth: 3 },
});

const drawPreview = (stroke: string, headShape?: GraphHeadShape) => {
  const line = <GraphConnectionLine {...previewProps(stroke)} />;
  const { container } = render(
    <svg>
      {headShape === undefined ? (
        line
      ) : (
        <GraphConnectionLineHeadShape headShape={headShape}>{line}</GraphConnectionLineHeadShape>
      )}
    </svg>,
  );
  const path = container.querySelector('.react-flow__connection-path');
  const marker = container.querySelector('marker');
  return { path, marker, head: marker?.querySelector('[data-slot="graph-head-shape"]') };
};

describe('GraphConnectionLine', () => {
  /**
   * The preview is the Edge about to join the Active Graph, so it ends as that
   * Graph's Edges end: in its head shape, in its colour, through the one
   * marker the canvas's Edges draw.
   */
  it('ends the preview in the head shape it is given, in the stroke’s colour', () => {
    for (const headShape of GRAPH_HEAD_SHAPES) {
      const { path, marker, head } = drawPreview('#ff7f0e', headShape);

      expect(head).toHaveAttribute('data-head-shape', headShape);
      expect(head).toHaveAttribute('fill', '#ff7f0e');
      expect(path).toHaveAttribute('marker-end', `url(#${marker?.id ?? ''})`);
    }
  });

  it('previews the arrow where no head shape is supplied', () => {
    expect(drawPreview('#1f77b4').head).toHaveAttribute('data-head-shape', 'arrow');
  });
});
