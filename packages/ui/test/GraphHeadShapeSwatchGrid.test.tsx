import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphHeadShapeSwatchGrid } from '../src';

describe('GraphHeadShapeSwatchGrid', () => {
  it('offers exactly the four head shapes, in the Graph colour, with the current one marked', () => {
    render(
      <GraphHeadShapeSwatchGrid value="vee" color="#ff7f0e" onValueChange={() => undefined} />,
    );
    const grid = screen.getByRole('radiogroup', { name: 'Graph head shape' });
    const radios = within(grid).getAllByRole('radio');

    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Arrow',
      'Vee',
      'Dot',
      'Diamond',
    ]);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    for (const [index, headShape] of ['arrow', 'vee', 'dot', 'diamond'].entries()) {
      const glyph = radios[index]?.querySelector('[data-slot="graph-head-shape"]');
      expect(glyph).toHaveAttribute('data-head-shape', headShape);
      expect(glyph).toHaveAttribute('fill', '#ff7f0e');
    }
  });

  it('answers the chosen head shape', () => {
    const onValueChange = vi.fn();
    render(
      <GraphHeadShapeSwatchGrid value="arrow" color="#1f77b4" onValueChange={onValueChange} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Diamond' }));

    expect(onValueChange).toHaveBeenCalledWith('diamond');
  });

  it('offers nothing while disabled', () => {
    render(
      <GraphHeadShapeSwatchGrid
        value="arrow"
        color="#1f77b4"
        onValueChange={() => undefined}
        disabled
      />,
    );

    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });
});
