import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COLLAPSED_RESOURCE_SIZE, RESOURCE_SHAPES } from '@project/core';
import { ResourceShapeIcon } from '../src';
import { RESOURCE_SHAPE_ICON_BOX } from '../src/ResourceShape';
import { resourceShapeOutline } from '../src/resource-shape-outline';

const drawnIn = (svg: SVGSVGElement | null) => svg?.firstElementChild ?? null;

describe('the glyph a Shape is named by', () => {
  it.each(RESOURCE_SHAPES)('draws %s as a Lucide-weight outline', (resourceShape) => {
    const { container } = render(<ResourceShapeIcon shape={resourceShape} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('stroke-width', '2');
    expect(svg).toHaveAttribute('stroke-linecap', 'round');
    expect(svg).toHaveAttribute('stroke-linejoin', 'round');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-slot', 'resource-shape-icon');
    expect(svg).toHaveAttribute('data-resource-shape', resourceShape);
  });

  it('draws in a centred box with the Closed Size’s proportions', () => {
    const { x, y, width, height } = RESOURCE_SHAPE_ICON_BOX;
    expect(width / height).toBeCloseTo(
      COLLAPSED_RESOURCE_SIZE.width / COLLAPSED_RESOURCE_SIZE.height,
    );
    expect(x + width / 2).toBe(12);
    expect(y + height / 2).toBeCloseTo(12);
  });

  /*
   * Every Shape but the rectangle is the outline the canvas draws, answered for
   * the glyph's own box, so the two cannot come to disagree about what a Shape
   * looks like.
   */
  it.each(RESOURCE_SHAPES.filter((resourceShape) => resourceShape !== 'rectangle'))(
    'draws %s from the outline the canvas draws it in',
    (resourceShape) => {
      const { container } = render(<ResourceShapeIcon shape={resourceShape} />);
      const drawn = drawnIn(container.querySelector('svg'));
      const { x, y, width, height } = RESOURCE_SHAPE_ICON_BOX;
      const outline = resourceShapeOutline(resourceShape, { width, height });
      if (outline.kind === 'polygon') {
        expect(drawn?.tagName).toBe('polygon');
        expect(drawn?.getAttribute('points')).toBe(
          outline.points.map((point) => `${point.x + x},${point.y + y}`).join(' '),
        );
      } else {
        expect(drawn?.tagName).toBe('rect');
        expect(drawn).toHaveAttribute('x', String(x));
        expect(drawn).toHaveAttribute('y', String(y));
        expect(drawn).toHaveAttribute('width', String(width));
        expect(drawn).toHaveAttribute('height', String(height));
        expect(drawn).toHaveAttribute('rx', String(outline.rx));
        expect(drawn).toHaveAttribute('ry', String(outline.ry));
      }
    },
  );

  it('rounds the rectangle by Lucide’s corner radius, though the canvas draws it square', () => {
    const { container } = render(<ResourceShapeIcon shape="rectangle" />);
    const drawn = drawnIn(container.querySelector('svg'));
    expect(drawn?.tagName).toBe('rect');
    expect(drawn).toHaveAttribute('rx', '2');
    expect(drawn).toHaveAttribute('ry', '2');
  });

  it('draws at the rail’s glyph size unless given another', () => {
    const { container, rerender } = render(<ResourceShapeIcon shape="pill" />);
    expect(container.querySelector('svg')).toHaveClass('size-[14px]');
    rerender(<ResourceShapeIcon shape="pill" className="size-4" />);
    expect(container.querySelector('svg')).toHaveClass('size-4');
    expect(container.querySelector('svg')).not.toHaveClass('size-[14px]');
  });
});
