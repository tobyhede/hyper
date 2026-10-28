import { describe, expect, it } from 'vitest';
import { graphPaint } from '../src/graph-color';

describe('graphPaint', () => {
  it("draws a hex colour through the theme's paint for it, falling back to the colour", () => {
    expect(graphPaint('#1F77B4')).toBe('var(--graph-paint-1f77b4, #1F77B4)');
  });

  it('draws anything that is not a six-digit hex as given', () => {
    expect(graphPaint('var(--accent)')).toBe('var(--accent)');
    expect(graphPaint(graphPaint('#1f77b4'))).toBe('var(--graph-paint-1f77b4, #1f77b4)');
    expect(graphPaint('#abc')).toBe('#abc');
  });
});
