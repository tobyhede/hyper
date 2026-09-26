import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GRAPH_HEAD_SHAPES } from '@project/core';
import { GraphLegendMark } from '../src/index';

const markOf = (container: HTMLElement, index = 0) => {
  const mark = container.querySelectorAll('[data-slot="graph-legend-mark"]')[index];
  if (mark === undefined) throw new Error('No Graph legend mark was drawn.');
  return {
    mark,
    line: mark.querySelector('[data-slot="graph-legend-mark-line"]'),
    head: mark.querySelector('[data-slot="graph-head-shape"]'),
  };
};

describe('GraphLegendMark', () => {
  /**
   * A key, never a name: whatever it sits beside carries the Graph's title, so
   * the mark is hidden from assistive technology rather than read as an
   * unlabelled image.
   */
  it('draws a decorative line in the colour it is given', () => {
    const { container } = render(<GraphLegendMark color="#35d6c3" headShape="arrow" />);
    const { mark, line } = markOf(container);

    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(line).toHaveAttribute('stroke', '#35d6c3');
  });

  it('ends the line in the head shape it is given, in the same colour', () => {
    for (const headShape of GRAPH_HEAD_SHAPES) {
      const { container, unmount } = render(
        <GraphLegendMark color="#ff7f0e" headShape={headShape} />,
      );
      const { mark, head } = markOf(container);

      expect(mark).toHaveAttribute('data-head-shape', headShape);
      expect(head).toHaveAttribute('data-head-shape', headShape);
      expect(head).toHaveAttribute('fill', '#ff7f0e');
      unmount();
    }
  });

  it('draws one mark per Graph, each in its own colour and head shape', () => {
    const { container } = render(
      <>
        <GraphLegendMark color="#1f77b4" headShape="arrow" />
        <GraphLegendMark color="#ff7f0e" headShape="diamond" />
      </>,
    );

    expect(container.querySelectorAll('[data-slot="graph-legend-mark"]')).toHaveLength(2);
    expect(markOf(container, 0).line).toHaveAttribute('stroke', '#1f77b4');
    expect(markOf(container, 0).head).toHaveAttribute('data-head-shape', 'arrow');
    expect(markOf(container, 1).line).toHaveAttribute('stroke', '#ff7f0e');
    expect(markOf(container, 1).head).toHaveAttribute('data-head-shape', 'diamond');
  });
});
