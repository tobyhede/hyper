import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RESOURCE_SHAPES } from '@project/core';
import { ResourceShapeIcon } from '../src';
import { resourceShapeOutline } from '../src/resource-shape-outline';

const drawnIn = (svg: SVGSVGElement | null) => svg?.firstElementChild ?? null;

describe('the glyph a Shape is named by', () => {
  it.each(RESOURCE_SHAPES)('draws %s as a Lucide-weight outline', (resourceShape) => {
    const { container } = render(<ResourceShapeIcon shape={resourceShape} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('stroke-width', '2');
    expect(svg).toHaveAttribute('stroke-linejoin', 'round');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-resource-shape', resourceShape);
  });

  /*
   * The glyph is the outline the canvas draws, answered for the glyph's own
   * box, so the two cannot come to disagree about what a Shape looks like.
   */
  it.each(RESOURCE_SHAPES)('draws %s from the outline the canvas draws it in', (resourceShape) => {
    const { container } = render(<ResourceShapeIcon shape={resourceShape} />);
    const drawn = drawnIn(container.querySelector('svg'));
    const outline = resourceShapeOutline(resourceShape, { width: 20, height: 12 });
    if (outline.kind === 'polygon') {
      expect(drawn?.tagName).toBe('polygon');
      expect(drawn?.getAttribute('points')).toBe(
        outline.points.map(({ x, y }) => `${x + 2},${y + 6}`).join(' '),
      );
    } else {
      expect(drawn?.tagName).toBe('rect');
      expect(drawn).toHaveAttribute('x', '2');
      expect(drawn).toHaveAttribute('y', '6');
      expect(drawn).toHaveAttribute('width', '20');
      expect(drawn).toHaveAttribute('height', '12');
      expect(drawn).toHaveAttribute('rx', String(outline.rx));
      expect(drawn).toHaveAttribute('ry', String(outline.ry));
    }
  });

  it('draws at the rail’s glyph size unless told otherwise', () => {
    const { container, rerender } = render(<ResourceShapeIcon shape="pill" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '14');
    rerender(<ResourceShapeIcon shape="pill" size={16} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
  });
});
